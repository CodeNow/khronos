'use strict'

require('loadenv')()

var api = require('../../models/api')
var keypather = require('keypather')()
var CanaryFailedError = require('../../errors/canary-failed-error')
var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))
const rabbitmqHelper = require('tasks/utils/rabbitmq')
var http = require('http')

var Instance = require('@runnable/api-client/lib/models/instance')

var CanaryBase = require('./canary-base')

var DOCK_UNHEALTHY_QUEUE_NAME = 'on-dock-unhealthy'
var RUNNABLE_FAILOVER_TEST_GITHUB_ID = '19616978'
/**
 * Runs a canary test against the production API to ensure we can rebuild a
 * specific container. The results of the test are reported to datadog.
 * @param {object} job The canary job to exectute.
 * @return {Promise} Resolves when the rebuild has been successfully completed.
 */
module.exports = (job) => {
  return new FailOverCanary(job).executeTest()
}

class FailOverCanary extends CanaryBase {
  constructor (job) {
    super(job)
    this.orgId = RUNNABLE_FAILOVER_TEST_GITHUB_ID
    this.queue = 'khronos:canary:failover'
    this.name = 'FailOver Canary'
    this.gauge = 'canary.failover'

    this.log = this.log.child({
      task: this.queue
    })
  }

  setup () {
    return api.connect(process.env.CANARY_API_FAILOVER_TOKEN)
      .then((client) => {
        this.client = client
      })
      .catch((err) => {
        throw new CanaryFailedError('Error connecting to Runnable client', {err: err})
      })
  }

  test () {
    var dockerHosts = {}
    return this.setup()
      .then(() => {
        this.log.debug('First, fetch the instances to get the docks')
        return this.client.fetchInstancesAsync({
            owner: {
              github: RUNNABLE_FAILOVER_TEST_GITHUB_ID
            }
          })
          .map((rawInstanceData) => {
            this.log.debug('Validate that all of the instances are running')
            var instance = this.client.newInstance(rawInstanceData)
            var status = instance.status()
            if (status !== 'running') {
              throw new CanaryFailedError('Instance not running')
            }

            var dockerHost = keypather.get(rawInstanceData, 'container.dockerHost')
            if (!dockerHosts[dockerHost]) {
              dockerHosts[dockerHost] = 0
            }
            dockerHosts[dockerHost]++
            keypather.set(instance, 'opts.user.opts.userContentDomain', process.env.USER_CONTENT_DOMAIN)
            return Promise.fromCallback((cb) => {
              http.get('http://' + instance.getContainerHostname(), (res) => {
                this.log.debug(`Got response: ${res.statusCode}`);
                // consume response body
                res.resume();
                cb()
              }).on('error', (e) => {
                this.log.error({
                  error: each,
                  url: instance.getContainerHostname()
                }, 'instance ' + rawInstanceData.name + ' failed the get request')
                cb(e)
              });
            })
          })
          .then(() => {
            var largestDock = Object.keys(dockerHosts).sort((a, b) => {
              return dockerHosts[a] >= dockerHosts[b]
            })[0]
            this.log.debug('The Dock at ' + largestDock + ' contains ' + dockerHosts[largestDock] +
              ' containers, and is about to be marked unhealthy')
            return largestDock
          })
          .then((largestDock) => {
            var log = this.log
            return Promise.using(
              rabbitmqHelper([DOCK_UNHEALTHY_QUEUE_NAME]),
              function (rabbitmq) {
                var data = { host: largestDock, githubId: RUNNABLE_FAILOVER_TEST_GITHUB_ID }
                log.debug('Killing the Dock at ' + largestDock)
                rabbitmq.publish(DOCK_UNHEALTHY_QUEUE_NAME, data)
              })
          })
          .delay(process.env.CANARY_FAILOVER_DELAY)
      })
  }
}
