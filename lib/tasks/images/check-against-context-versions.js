/**
 * Check image against mongo to see
 * @module lib/tasks/images/check-against-context-versions
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
        throw new TaskFatalError(
          'khronos:images/check-against-context-versions',
          'dockerHost is required'
        )
      }
      if (!exists(job.imageId)) {
        throw new TaskFatalError(
          'khronos:images/check-against-context-versions',
          'imageId is required'
        )
      }
    })
    .then(function queryMongoForMatchingContextVersions () {
      return Promise.using(mongodbHelper(), function (mongoClient) {
        var regexImageTagCV = new RegExp(
          '^' +
          process.env.KHRONOS_DOCKER_REGISTRY +
          '\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)'
        )
        var regexExecResult = regexImageTagCV.exec(job.imageId)
        var contextVersionId = mongoClient.newObjectID(regexExecResult[2])
        var query = {
          '_id': mongoClient.newObjectID(contextVersionId)
        }
        return mongoClient.fetchContextVersionsAsync(query)
      })
    })
    .then(function removeIfNonExistant (result) {
      var targetQueue = 'khronos:images:remove'
      if (!result) {
        return Promise.using(rabbitmqHelper([targetQueue]),
          function (rabbitmq) {
            // this job is identical for the remove job!
            rabbitmq.publish(targetQueue, job)
          })
          .then(function () {
            return assign({}, job, { imageRemoveTaskQueued: true })
          })
      } else {
        // it exists in mongo on an Instance, don't remove it
        return assign({}, job, { imageRemoveTaskQueued: false })
      }
    })
    .catch(function (err) {
      log.error({ err: err }, 'delete image task error')
      throw err
    })
}
