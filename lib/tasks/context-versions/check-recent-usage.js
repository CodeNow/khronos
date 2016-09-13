/**
 * Takes a context version and verifies it's not been on a build in two weeks,
 * or is attached to an instance. If not, it creates the next job
 * @module lib/tasks/context-versions/check-recent-usage
 */
'use strict'

// external
const assign = require('101/assign')
const exists = require('101/exists')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const mongodbHelper = require('tasks/utils/mongodb')
const rabbitmq = require('models/rabbitmq')

module.exports = function (job) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!exists(job.contextVersionId)) {
        throw new WorkerStopError(
          'contextVersionId is required'
        )
      }
      if (!exists(job.twoWeeksAgo)) {
        throw new WorkerStopError(
          'twoWeeksAgo is required'
        )
      }
    })
    .then(function queryMongoForRecentUsage () {
      return Promise.using(mongodbHelper(), function (mongoClient) {
        const twoWeeksAgo = new Date()
        twoWeeksAgo.setTime(job.twoWeeksAgo)
        const buildQuery = {
          'build.created': { $gte: twoWeeksAgo },
          contextVersions: mongoClient.newObjectID('' + job.contextVersionId)
        }
        const instanceQuery = {
          'contextVersion._id': mongoClient.newObjectID('' + job.contextVersionId)
        }
        return Promise.all([
          mongoClient.countBuildsAsync(buildQuery),
          mongoClient.countInstancesAsync(instanceQuery)
        ])
      })
    })
    .spread(function makeDecisionAboutUsage (buildCount, instanceCount) {
      const counts = {
        buildCount: buildCount,
        instanceCount: instanceCount
      }
      if (!buildCount && !instanceCount) {
        const nextTask = 'context-versions.remove-and-protect-instances'
        const newJob = {
          contextVersionId: '' + job.contextVersionId
        }
        rabbitmq.publishTask(nextTask, newJob)
        return assign({}, job, counts, { toBeRemoved: true })
      } else {
        return assign({}, job, counts, { toBeRemoved: false })
      }
    })
}
