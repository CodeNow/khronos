/**
 * Gets the entire context version model, removes it, and rechecks to make sure
 * it didn't get added to an Instance again (which would break things). If it
 * did get re-added to an Instance, re-insert it back into the database.
 * @module lib/tasks/context-versions/remove-and-protect-instances
 */
'use strict'

// external
var assign = require('101/assign')
var exists = require('101/exists')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var mongodbHelper = require('tasks/utils/mongodb')
var log = require('logger').getChild(__filename)

module.exports = function (job) {
  return Promise.using(mongodbHelper(), function (mongoClient) {
    return Promise.resolve()
      .then(function validateArguments () {
        if (!exists(job.contextVersionId)) {
          throw new TaskFatalError('contextVersionId is required')
        }
      })
      .then(function getEntireContextVersionDocument () {
        return mongoClient.fetchContextVersionsAsync({ _id: job.contextVersionId })
          .then(function (docs) {
            if (!exists(docs) || !(Array.isArray(docs) && docs.length)) {
              throw new TaskFatalError('could not find context version')
            }
            // return first (and only) context version
            return docs[0]
          })
      })
      .then(function removeContextVersionFromDatabase (contextVersion) {
        return mongoClient.removeContextVersionsAsync({ _id: job.contextVersionId })
          .then(function () {
            return contextVersion
          })
      })
      .then(function verifyItIsStillNotInUse (contextVersion) {
        var instanceCountQuery = {
          'contextVersion._id': mongoClient.newObjectID(contextVersion._id)
        }
        return mongoClient.countInstancesAsync(instanceCountQuery)
          .then(function (instanceCount) {
            if (instanceCount) {
              return mongoClient.insertContextVersionsAsync(contextVersion)
                .then(function () {
                  return assign({}, job, { removed: true, restored: true })
                })
            } else {
              return assign({}, job, { removed: true })
            }
          })
      })
      .catch(function (err) {
        log.error({ err: err }, 'context version check recent usage error')
        throw err
      })
  })
}
