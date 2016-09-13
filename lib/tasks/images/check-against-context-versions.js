/**
 * Check image against mongo to see
 * @module lib/tasks/images/check-against-context-versions
 */
'use strict'

// external
var assign = require('101/assign')
var exists = require('101/exists')
var Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
var mongodbHelper = require('tasks/utils/mongodb')
var MongoDB = require('models/mongodb')
const rabbitmq = require('models/rabbitmq')
var log = require('logger').getChild(__filename)

module.exports = function (job) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!exists(job.dockerHost)) {
        throw new WorkerStopError(
          'dockerHost is required'
        )
      }
      if (!exists(job.imageId)) {
        throw new WorkerStopError(
          'imageId is required'
        )
      }
    })
    .then(function queryMongoForMatchingContextVersions () {
      return Promise.using(mongodbHelper(), function (mongoClient) {
        var regexImageTagCV = new RegExp(
          '^' +
          process.env.KHRONOS_DOCKER_REGISTRY_REGEX +
          '\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)'
        )
        var regexExecResult = regexImageTagCV.exec(job.imageId)
        if (!regexExecResult || !regexExecResult.length > 1) {
          // if it doesn't match our regex, we shouldn't delete it
          throw new WorkerStopError(
            'imageId did not match our scheme',
            { imageId: job.imageId }
          )
        }
        var contextVersionId = regexExecResult[2]
        if (MongoDB.isObjectId(contextVersionId)) {
          var query = {
            '_id': mongoClient.newObjectID(contextVersionId)
          }
          return mongoClient.countContextVersionsAsync(query)
        }
        return 0
      })
    })
    .then(function removeIfNonExistant (contextVersionCount) {
      var targetQueue = 'images.remove'
      if (!contextVersionCount) {
        rabbitmq.publishTask(targetQueue, job)
        return assign({}, job, { imageRemoveTaskQueued: true })
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
