/**
 * Get all the context-versions that started two weeks ago, are completed, and
 * have a docker tag. Enqueue a job to check against recent usage.
 * @module lib/tasks/context-versions/prune-expired
 */
'use strict'

// external
const Promise = require('bluebird')

// internal
const mongodbHelper = require('tasks/utils/mongodb')
const rabbitmq = require('models/rabbitmq')

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
      var nextTask = 'context-versions.check-recent-usage'
      var job = {
        contextVersionId: '' + contextVersion._id,
        twoWeeksAgo: twoWeeksAgo.getTime()
      }
      rabbitmq.publishTask(nextTask, job)
      return job
    })
    .then(function returnNumberOfJobs (jobs) {
      return { numJobsEnqueued: jobs.length }
    })
}
