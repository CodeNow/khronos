/**
 * Get all the context-versions that started two weeks ago, are completed, and
 * have a docker tag. Enqueue a job to check against recent usage.
 * @module lib/tasks/context-versions/prune-expired
 */
'use strict'

// external
var Promise = require('bluebird')

// internal
var mongodbHelper = require('tasks/utils/mongodb')
var rabbitmqHelper = require('tasks/utils/rabbitmq')
var log = require('logger').getChild(__filename)

module.exports = function () {
  var today = new Date()
  var twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(today.getDate() - parseInt(process.env.KHRONOS_MAX_CV_AGE_DAYS, 10))
  var expiredQuery = {
    'build.started': {
      '$lte': twoWeeksAgo
    },
    'build.completed': {
      '$exists': true
    },
    'build.dockerTag': {
      '$exists': true
    }
  }
  return Promise.resolve()
    .then(function queryMongoForExpiredContextVersions () {
      return Promise.using(mongodbHelper(), function (mongoClient) {
        return mongoClient.fetchContextVersionsAsync(expiredQuery)
      })
    })
    .each(function enqueueJobToCheckRecentUsage (contextVersion) {
      var nextTask = 'khronos:context-versions:check-recent-usage'
      return Promise.using(rabbitmqHelper([nextTask]), function (rabbitmq) {
        var job = {
          contextVersionId: '' + contextVersion._id,
          twoWeeksAgo: twoWeeksAgo.getTime()
        }
        rabbitmq.publish(nextTask, job)
        return job
      })
    })
    .then(function returnNumberOfJobs (jobs) {
      return { numJobsEnqueued: jobs.length }
    })
    .catch(function (err) {
      log.error({ err: err }, 'context version prune expired error')
      throw err
    })
}
