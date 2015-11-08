/**
 * Check container against mongo and if it doesn't exist, enqueue a job to
 * delete it.
 * @module lib/tasks/container/check-against-mongo
 */
'use strict'

// external
var assign = require('101/assign')
var exists = require('101/exists')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var mongodbHelper = require('tasks/utils/mongodb')
var rabbitmqHelper = require('tasks/utils/rabbitmq')
var log = require('logger').getChild(__filename)

module.exports = function (job) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!exists(job.dockerHost)) {
        throw new TaskFatalError('dockerHost is required')
      }
      if (!exists(job.containerId)) {
        throw new TaskFatalError('containerId is required')
      }
    })
    .then(function queryMongoForContainer () {
      return Promise.using(mongodbHelper(),
        function (mongoClient) {
          var query = {
            'container.dockerContainer': job.containerId
          }
          return mongoClient.fetchInstancesAsync(query)
        })
    })
    .then(function queryIfNonExistant (result) {
      if (!result || (Array.isArray(result) && result.length === 0)) {
        // TODO(bryan): remove the container.
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
        return assign({}, job, {
          containerRemoveTaskQueued: false,
          instanceId: '' + result[0]._id
        })
      }
    })
    .catch(function (err) {
      log.error({ err: err }, 'delete container task error')
      throw err
    })
}
