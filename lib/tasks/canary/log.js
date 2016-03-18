'use strict'

require('loadenv')()

var api = require('../../models/api')
var CanaryFailedError = require('../../errors/canary-failed-error')
var monitor = require('monitor-dog')
var Promise = require('bluebird')
var logger = require('../../logger').getChild('khronos:canary:log')
var TaskFatalError = require('ponos').TaskFatalError
var PrimusClient = require('@runnable/api-client/lib/external/primus-client')
var uuid = require('uuid')
var dockerStreamCleanser = require('docker-stream-cleanser')

/**
 * Runs a canary test against the production API to ensure we can get
 * logs from a specific container
 * @param {object} job The canary job to exectute.
 * @return {Promise} Resolves when we have fetched all the logs we needed.
 */
module.exports = function logCanary (job) {
  var log = logger.child({ job: job })
  var instanceId = process.env.CANARY_LOGS_INSTANCE_ID

  log.info('Canary Testing Production Logs')

  return api.connect(process.env.CANARY_API_TOKEN).then(function (client) {
    return Promise.resolve()
      .then(function testContainerRunning () {
        log.debug('Testing canary project rebuild')
        return client.fetchInstanceAsync(instanceId)
      })
      .then(function (rawInstanceData) {
        var instance = client.newInstance(rawInstanceData)
        var status = instance.status()
        if (status !== 'running') {
          throw new CanaryFailedError('Instance not running')
        }
        return instance
      })
      .then(function testLogs (instance) {
        var socket = new PrimusClient(process.env.API_SOCKET_SERVER, {
          transport: {
            headers: {
              cookie: 'connect.sid=' + client.connectSid + ''
            }
          }
        })
        var container = instance.attrs.container

        var failureHandler = new Promise(function (resolve, reject) {
          socket.on('data', function (data) {
            if (data.error) {
              reject(new CanaryFailedError('Socket Error', {err: data.error}))
            }
          })
        })

        var testCmdLogs = Promise.method(function () {
          var substream = socket.substream(container.dockerContainer)
          return new Promise(function (resolve) {
            var streamCleanser = dockerStreamCleanser('hex', true)
            substream.pipe(streamCleanser)

            // Handle data!
            streamCleanser.on('data', function (data) {
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
        var testBuildLogs = Promise.method(function () {
          var uniqueId = uuid.v4()
          var buildStream = socket.substream(uniqueId)
          return new Promise(function (resolve) {
            buildStream.on('data', function (data) {
              if (!Array.isArray(data)) {
                data = [ data ]
              }
              data.forEach(function (message) {
                if (message.type === 'log' && message.content.indexOf('Build completed') > -1) {
                  resolve()
                }
              })
            })
            socket.write({
              id: 1,
              event: 'build-stream',
              data: {
                id: instance.attrs.contextVersion.id,
                streamId: uniqueId
              }
            })
          })
        })
        var testTerminal = Promise.method(function () {
          var uniqueId = uuid.v4()
          var terminalStream = socket.substream(uniqueId)

          return new Promise(function (resolve) {
            socket.on('data', function (data) {
              if (data.event === 'TERMINAL_STREAM_CREATED') {
                terminalStream.write('sleep ' + process.env.CANARY_LOG_TERMINAL_SLEEP + ' && ping localhost\n')
              }
            })
            terminalStream.on('data', function (data) {
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
      .then(function publishSuccess () {
        log.info('Canary success')
        monitor.gauge('canary.logs', 1)
      })
      .catch(CanaryFailedError, function publishFailed (err) {
        log.error(err.data, err.message)
        monitor.gauge('canary.logs', 0)
        monitor.event({ title: 'Canary Logs Failed', text: err.message })
      })
      .catch(function stopOnError (err) {
        log.error(err.data || {}, err.message)
        monitor.gauge('canary.log', 0)
        monitor.event({
          title: 'Canary Logs Unexpected Failure',
          text: err.message
        })
        throw new TaskFatalError(
          'khronos:canary:logs',
          'Canary failed due to an unexpected error',
          { err: err }
        )
      })
  })
}
