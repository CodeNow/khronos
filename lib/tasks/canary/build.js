'use strict'

require('loadenv')()

var api = require('../../models/api')
var CanaryFailedError = require('../../errors/canary-failed-error')
var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))

var CanaryBase = require('./canary-base')

/**
 * Runs a canary test against the production API to ensure we can rebuild a
 * specific container. The results of the test are reported to datadog.
 * @param {object} job The canary job to exectute.
 * @return {Promise} Resolves when the rebuild has been successfully completed.
 */
module.exports = (job) => {
  return new BuildCanary(job).executeTest()
}

class BuildCanary extends CanaryBase {
  constructor (job) {
    super(job)
    this.instanceId = process.env.CANARY_REBUILD_INSTANCE_ID
    this.queue = 'canary.build.run'
    this.name = 'Build Canary'
    this.gauge = 'canary.build'

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
  }

  test () {
    return this.setup()
      .then(() => {
        this.log.debug('Rebuilding canary test repository')
        return this.client.fetchInstanceAsync(this.instanceId)
          .then((instance) => {
            return this.client.deepCopyBuildAsync(instance.build.id)
          })
          .then((build) => {
            return this.client.buildBuildAsync(build.id)
              .then(() => {
                return this.client.updateInstanceAsync(this.instanceId, {
                  build: build.id
                })
              })
          })
      })
      .then(() => {
        this.log.debug('Testing canary project rebuild')
        return this.client.fetchInstanceAsync(this.instanceId)
          .then((data) => {
            var status = this.client.newInstance(data).status()
            if (status !== 'building' && status !== 'starting') {
              this.log.warn('Invalid status: ' + status)
              throw new CanaryFailedError('Build did not appear to start')
            }
          })
          .delay(process.env.CANARY_REBUILD_START_DELAY)
          .then(() => {
            return this.client.fetchInstanceAsync(this.instanceId)
          })
          .then((data) => {
            var status = this.client.newInstance(data).status()
            if (status !== 'running') {
              throw new CanaryFailedError('Instance did not start in time', {
                timeout: process.env.CANARY_REBUILD_START_DELAY
              })
            }
          })
      })
      .then(() => {
        this.log.debug('Fetching container response via navi')
        return request
          .getAsync({
            url: process.env.CANARY_REBUILD_NAVI_URL,
            json: true
          })
          .catch((err) => {
            throw new CanaryFailedError('Could not reach container via navi', {
              originalError: err
            })
          })
      })
      .then((data) => {
        this.log.debug('Checking validity of response from container')
        if (Array.isArray(data)) {
          data = data[0]
        }

        // NOTE The RunnableTest/canary-build project is coded to return the
        // request number as its response from GET /. This means if the
        // build _actually_ succeeded it will always return 1 after it
        // finishes a rebuild without cache
        if (!data || !data.body || data.body.count !== 1) {
          throw new CanaryFailedError(
            'Navi URL did not return the expected result',
            { data: data }
          )
        }
      })
  }
}
