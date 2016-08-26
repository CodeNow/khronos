'use strict'

require('loadenv')()
const keypather = require('keypather')()
const Promise = require('bluebird')
const request = Promise.promisifyAll(require('request'))

const api = require('../../models/api')
const CanaryBase = require('./canary-base')
const CanaryFailedError = require('../../errors/canary-failed-error')
const rabbitmq = require('models/rabbitmq')

const RUNNABLE_FAILOVER_TEST_GITHUB_ID = '19616978'

/**
 * Runs a canary test against the production API to ensure we can Fail Over a
 * specific container. The results of the test are reported to datadog.
 *
 * For instructions on setting up this canary, refer to
 * https://github.com/CodeNow/devops-scripts/wiki/Setup-FailOver-Canary
 *
 *
 * @param {object} job The canary job to exectute.
 * @return {Promise} Resolves when the rebuild has been successfully completed.
 */
module.exports = (job) => {
  return new FailOverCanary(job).executeTest()
}

class FailOverCanary extends CanaryBase {
  constructor (job) {
    super(job)
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
    const dockerHosts = {}
    return this.setup()
      .then(() => {
        this.log.debug('First, fetch the instances to get the docks')
        return this.client.fetchInstancesAsync({
          owner: {
            github: RUNNABLE_FAILOVER_TEST_GITHUB_ID
          }
        })
      })
      .tap((instances) => {
        this.log.debug('Found ' + instances.length + ' non-isolated instances')
      })
      .then((instances) => {
        return Promise.filter(instances, (instance) => {
          return instance.isIsolationGroupMaster
        })
          .map((instance) => {
            var qs = {
              isIsolationGroupMaster: false,
              isolated: instance.isolated,
              githubUsername: instance.owner.username
            }
            return this.client.fetchInstancesAsync(qs)
              .map((isolatedInstances) => {
                if (!isolatedInstances.isIsolationGroupMaster) {
                  instances.push(isolatedInstances)
                }
              })
          })
          .return(instances)
      })
      .tap((instances) => {
        this.log.debug('Found ' + instances.length + ' total instances')
      })
      .map((rawInstanceData) => {
        this.log.debug('Validate that all of the instances are running')
        const instance = this.client.newInstance(rawInstanceData)
        const status = instance.status()
        if (status !== 'running') {
          throw new CanaryFailedError('Instance ' + rawInstanceData.name + ' not running', rawInstanceData)
        }

        const dockerHost = keypather.get(rawInstanceData, 'container.dockerHost')
        if (!dockerHosts[dockerHost]) {
          dockerHosts[dockerHost] = 0
        }
        dockerHosts[dockerHost]++
        keypather.set(instance, 'opts.user.opts.userContentDomain', process.env.USER_CONTENT_DOMAIN)
        return request.getAsync('http://' + instance.getContainerHostname())
          .timeout(process.env.CANARY_FAILOVER_TEST_REQUEST_TIMEOUT)
          .catch((e) => {
            const errorData = {
              error: e,
              url: instance.getContainerHostname()
            }
            this.log.error(errorData, 'Instance ' + rawInstanceData.name + ' failed the get request')
            throw new CanaryFailedError('Instance endpoint not accessible', errorData)
          })
      })
      .then(() => {
        const largestDock = Object
          .keys(dockerHosts)
          .sort((a, b) => {
            // Sorting from large to small
            if (dockerHosts[a] < dockerHosts[b]) {
              return 1
            } else if ((dockerHosts[a] > dockerHosts[b])) {
              return -1
            } else {
              return 0
            }
          })[0] // Grab 0, since it should be the largest
        this.log.debug('The Dock at ' + largestDock + ' contains ' + dockerHosts[largestDock] +
          ' containers, and is about to be marked unhealthy')
        return largestDock
      })
      .then((largestDock) => {
        var data = { host: largestDock }
        this.log.debug('Killing the Dock at ' + largestDock)
        rabbitmq.publishEvent('dock.lost', data)
      })
  }
}
