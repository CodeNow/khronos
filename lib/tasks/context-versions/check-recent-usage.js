/**
 * Takes a context version and verifies it's not been on a build in two weeks,
 * or is attached to an instance. If not, it creates the next job
 * @module lib/tasks/context-versions/check-recent-usage
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
      if (!exists(job.contextVersionId)) {
        throw new TaskFatalError(
          'khronos:context-versions:check-recent-usage',
          'contextVersionId is required'
        )
      }
      if (!exists(job.twoWeeksAgo)) {
        throw new TaskFatalError(
          'khronos:context-versions:check-recent-usage',
          'twoWeeksAgo is required'
        )
      }
    })
    .then(function queryMongoForRecentUsage () {
      return Promise.using(mongodbHelper(), function (mongoClient) {
        var twoWeeksAgo = new Date()
        twoWeeksAgo.setTime(job.twoWeeksAgo)
        var buildQuery = {
          'build.created': { $gte: twoWeeksAgo },
          contextVersions: '' + job.contextVersionId
        }
        var instanceQuery = {
          'contextVersion._id': '' + job.contextVersionId
        }
        return Promise.all([
          mongoClient.countBuildsAsync(buildQuery),
          mongoClient.countInstancesAsync(instanceQuery)
        ])
      })
    })
    .spread(function makeDecisionAboutUsage (buildCount, instanceCount) {
      var counts = {
        buildCount: buildCount,
        instanceCount: instanceCount
      }
      if (!buildCount && !instanceCount) {
        var nextTask = 'khronos:context-versions:remove-and-protect-instances'
        return Promise.using(rabbitmqHelper([nextTask]), function (rabbitmq) {
          var newJob = {
            contextVersionId: '' + job.contextVersionId
          }
          rabbitmq.publish(nextTask, newJob)
          return assign({}, job, counts, { toBeRemoved: true })
        })
      } else {
        return assign({}, job, counts, { toBeRemoved: false })
      }
    })
    .catch(function (err) {
      log.error({ err: err }, 'context version check recent usage error')
      throw err
    })
}
