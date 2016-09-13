'use strict'

require('loadenv')()

var api = require('../../models/api')
var CanaryFailedError = require('../../errors/canary-failed-error')
var dockerStreamCleanser = require('docker-stream-cleanser')
var Promise = require('bluebird')
var PrimusClient = require('@runnable/api-client/lib/external/primus-client')
var uuid = require('uuid')

var CanaryBase = require('./canary-base')

/**
 * Runs a canary test against the production API to ensure we can get
 * logs from a specific container
 * @param {object} job The canary job to exectute.
 * @return {Promise} Resolves when we have fetched all the logs we needed.
 */
module.exports = (job) => {
  return new LogCanary(job).executeTest()
}

/**
 * Class for testing the logs
 */
class LogCanary extends CanaryBase {
  constructor (job) {
    super(job)
    this.instanceId = process.env.CANARY_LOG_INSTANCE_ID
    this.queue = 'canary.log.run'
    this.name = 'Log Canary'
    this.gauge = 'canary.log'
    this.jobTimeout = 1000 * 60

    this.log = this.log.child({
      task: this.queue,
      instanceId: this.instanceId
    })
  }

  setup () {
    return api.connect(process.env.CANARY_API_TOKEN)
      .then((client) => {
        this.client = client
      })
      .then(() => {
        return this.client.fetchInstanceAsync(this.instanceId)
      })
      .then((rawInstanceData) => {
        var instance = this.client.newInstance(rawInstanceData)
        var status = instance.status()
        if (status !== 'running') {
          throw new CanaryFailedError('Instance not running')
        }
        this.instance = instance
      })
  }

  teardown () {
    return Promise.fromCallback(this.instance.restart.bind(this.instance))
  }

  test () {
    return this.setup()
      .bind(this)
      .then(() => {
        var socket = new PrimusClient(process.env.API_SOCKET_SERVER, {
          transport: {
            headers: {
              cookie: 'connect.sid=' + this.client.connectSid + ''
            }
          }
        })
        var container = this.instance.attrs.container

        var failureHandler = new Promise((resolve, reject) => {
          socket.on('data', (data) => {
            if (data.error) {
              reject(new CanaryFailedError('Socket Error', {err: data.error}))
            }
          })
          socket.on('disconnection', () => {
            reject(new CanaryFailedError('Socket disconnected'))
          })
          socket.on('error', (err) => {
            reject(new CanaryFailedError('Socket Error', {err: err}))
          })
        })

        var testCmdLogs = Promise.method(() => {
          var substream = socket.substream(container.dockerContainer)
          return new Promise((resolve) => {
            var streamCleanser = dockerStreamCleanser('hex', true)
            substream.pipe(streamCleanser)

            // Handle data!
            streamCleanser.on('data', (data) => {
              var stringData = data.toString()
              if (stringData.indexOf('Server running') > -1) {
                resolve()
              }
            })
            // Initialize the log-stream
            socket.write({
              id: 1,
              event: 'log-stream',
              data: {
                substreamId: container.dockerContainer,
                dockHost: container.dockerHost,
                containerId: container.dockerContainer
              }
            })
          })
        })
        var testBuildLogs = Promise.method(() => {
          var uniqueId = uuid.v4()
          var buildStream = socket.substream(uniqueId)
          return new Promise((resolve) => {
            buildStream.on('data', (data) => {
              if (!Array.isArray(data)) {
                data = [ data ]
              }
              data.forEach((message) => {
                if (message.type === 'log' && message.content.indexOf('Build completed') > -1) {
                  resolve()
                }
              })
            })
            socket.write({
              id: 1,
              event: 'build-stream',
              data: {
                id: this.instance.attrs.contextVersion.id,
                streamId: uniqueId
              }
            })
          })
        })
        var testTerminal = Promise.method(() => {
          var uniqueId = uuid.v4()
          var terminalStream = socket.substream(uniqueId)

          return new Promise((resolve, reject) => {
            socket.on('data', (data) => {
              if (data.event === 'TERMINAL_STREAM_CREATED') {
                terminalStream.write('sleep ' + process.env.CANARY_LOG_TERMINAL_SLEEP + ' && ping -c 1 localhost\n')
              }
            })
            terminalStream.on('end', () => {
              reject(new CanaryFailedError('Terminal substream killed'))
            })
            terminalStream.on('data', (data) => {
              if (data.indexOf('from 127.0.0.1') > -1) {
                resolve()
              }
            })
            socket.write({
              id: 1,
              event: 'terminal-stream',
              data: {
                dockHost: container.dockerHost,
                type: 'filibuster',
                isDebugContainer: false,
                containerId: container.dockerContainer,
                terminalStreamId: uniqueId,
                eventStreamId: uniqueId + 'events'
              }
            })
          })
        })
        var testSuccessPromise = Promise.all([ testBuildLogs(), testCmdLogs(), testTerminal() ])
        // Create a race so the failure handler can short-circuit everything
        return Promise.race([failureHandler, testSuccessPromise])
      })
      .then(this.teardown)
  }
}
