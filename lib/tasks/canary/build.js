'use strict'

require('loadenv')()

var api = require('../../models/api')
var CanaryFailedError = require('../../errors/canary-failed-error')
var monitor = require('monitor-dog')
var Promise = require('bluebird')
var logger = require('../../logger').getChild('khronos:canary:rebuild')

var request = Promise.promisifyAll(require('request'))

/**
 * Runs a canary test against the production API to ensure we can rebuild a
 * specific container. The results of the test are reported to datadog.
 * @param {object} job The canary job to exectute.
 * @return {Promise} Resolves when the rebuild has been successfully completed.
 */
module.exports = function buildCanary (job) {
  var log = logger.child({ job: job })
  var instanceId = process.env.CANARY_REBUILD_INSTANCE_ID

  log.info('Canary Testing Production Builds')

  return api.connect(process.env.CANARY_API_TOKEN).then(function (client) {
    return Promise.resolve()
      .then(function issueRebuild () {
        log.debug('Rebuilding canary test repository')
        return client.fetchInstanceAsync(instanceId)
          .then(function deepCopy (instance) {
            return client.deepCopyBuildAsync(instance.build.id)
          })
          .then(function buildBuild (build) {
            return client.buildBuildAsync(build.id)
              .then(function updateInstanceWithBuild () {
                return client.updateInstanceAsync(instanceId, {
                  build: build.id
                })
              })
          })
      })
      .then(function testBuildCompletes () {
        log.debug('Testing canary project rebuild')
        return client.fetchInstanceAsync(instanceId)
          .then(function (data) {
            var status = client.newInstance(data).status()
            if (status !== 'building' && status !== 'starting') {
              log.warn('Invalid status: ' + status)
              throw new CanaryFailedError('Build did not appear to start')
            }
          })
          .delay(process.env.CANARY_REBUILD_START_DELAY)
          .then(function () {
            return client.fetchInstanceAsync(instanceId)
          })
          .then(function (data) {
            var status = client.newInstance(data).status()
            if (status !== 'running') {
              throw new CanaryFailedError('Instance did not start in time', {
                timeout: process.env.CANARY_REBUILD_START_DELAY
              })
            }
          })
      })
      .then(function testNaviURL () {
        log.debug('Fetching container response via navi')
        return request
          .getAsync({
            url: process.env.CANARY_REBUILD_NAVI_URL,
            json: true
          })
          .catch(function (err) {
            throw new CanaryFailedError('Could not reach container via navi', {
              originalError: err
            })
          })
      })
      .then(function checkNaviResult (data) {
        log.debug('Checking validity of response from container')
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
      .then(function publishSuccess () {
        log.info('Canary success')
        monitor.gauge('canary.build', 1)
      })
      .catch(CanaryFailedError, function publishFailed (err) {
        log.error(err.data, err.message)
        monitor.gauge('canary.build', 0)
        monitor.event({ title: 'Build Canary Failed', text: err.message })
      })
  })
}
