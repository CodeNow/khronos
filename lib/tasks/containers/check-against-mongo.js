/**
 * Check container against mongo and if it doesn't exist, enqueue a job to
 * delete it.
 * @module lib/tasks/container/check-against-mongo
 */
'use strict'

// external
const assign = require('101/assign')
const exists = require('101/exists')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const mongodbHelper = require('tasks/utils/mongodb')
const rabbitmqHelper = require('tasks/utils/rabbitmq')

module.exports = function (job) {
  const log = require('logger').getChild(__filename).child({ job: job })
  return Promise.resolve()
    .then(function validateArguments () {
      if (!exists(job.dockerHost)) {
        throw new WorkerStopError(
          'dockerHost is required'
        )
      }
      if (!exists(job.containerId)) {
        throw new WorkerStopError(
          'containerId is required'
        )
      }
    })
    .then(function queryMongoForContainer () {
      return Promise.using(mongodbHelper(),
        function (mongoClient) {
          const query = {
            'container.dockerContainer': job.containerId
          }
          return mongoClient.fetchInstancesAsync(query)
        })
    })
    .then(function queryIfNonExistant (result) {
      if (!result || (Array.isArray(result) && result.length === 0)) {
        // TODO(bryan): remove the container.
        log.debug('Removing container')
        return Promise.using(rabbitmqHelper(['khronos:containers:remove']),
          function (rabbitmq) {
            // this job is identical for the remove job!
            rabbitmq.publish('khronos:containers:remove', job)
          })
          .then(function () {
            return assign({}, job, { containerRemoveTaskQueued: true })
          })
      } else {
        // it exists in mongo on an Instance, don't remove it
        log.debug('Container exists in mongo, skipping.')
        return assign({}, job, {
          containerRemoveTaskQueued: false,
          instanceId: '' + result[0]._id
        })
      }
    })
    .catch(function (err) {
      log.error({ err: err }, 'Error deleting container')
      throw err
    })
}
