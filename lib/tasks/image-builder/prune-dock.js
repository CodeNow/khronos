/**
 * Gets image-builder containers that are not attached to the instance
 * and enqueues a job for each to delete them.
 * @module lib/tasks/image-builder/prune-dock
 */
'use strict'

const Promise = require('bluebird')
const pluck = require('101/pluck')
// internal
const enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')
const mongodbHelper = require('tasks/utils/mongodb')

const IMAGE_FILTERS = [
  new RegExp(process.env.KHRONOS_IMAGE_BUILDER_CONTAINER_TAG)
]

/**
 * Prune Dock of image-builder containers that have stopped.
 * @param {object} job Job parameters
 * @param {string} job.dockerHost Docker host to search for containers.
 * @return {promise} Resolved when all tasks enqueued to remove containers.
 */
module.exports = function (job) {
  const options = {
    imageBlacklist: IMAGE_FILTERS.slice(), // clones the array
    job: job,
    targetQueue: 'containers.delete',
    containerIdWhitelist: []
  }
  return Promise.using(mongodbHelper(), function (mongoClient) {
    const instanceQuery = {
      'contextVersion.dockerHost': job.dockerHost
    }
    return mongoClient.fetchInstancesAsync(
      instanceQuery,
      { 'contextVersion.build.dockerContainer': true }
    )
      .map(pluck('contextVersion.build.dockerContainer'))
      .then(function (dockerContainerIds) {
        options.containerIdWhitelist = dockerContainerIds
        return enqueueContainerJobsHelper(options)
      })
  })
}
