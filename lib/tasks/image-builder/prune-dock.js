/**
 * Gets image-builder containers that are not attached to the instance
 * and enqueues a job for each to delete them.
 * @module lib/tasks/image-builder/prune-dock
 */
'use strict'

var Promise = require('bluebird')
var pluck = require('101/pluck')
// internal
var enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')
var log = require('logger').getChild(__filename)
var mongodbHelper = require('tasks/utils/mongodb')

var IMAGE_FILTERS = [
  new RegExp(process.env.KHRONOS_IMAGE_BUILDER_CONTAINER_TAG)
]

/**
 * Prune Dock of image-builder containers that have stopped.
 * @param {object} job Job parameters
 * @param {string} job.dockerHost Docker host to search for containers.
 * @return {promise} Resolved when all tasks enqueued to remove containers.
 */
module.exports = function (job) {
  var options = {
    imageFilters: IMAGE_FILTERS.slice(), // clones the array
    job: job,
    targetQueue: 'khronos:containers:delete',
    containerIdFilter: []
  }
  return Promise.using(mongodbHelper(), function (mongoClient) {
    var instanceQuery = {
      'contextVersion.dockerHost': job.dockerHost
    }
    return mongoClient.fetchInstancesAsync(instanceQuery)
      .map(pluck('contextVersion.build.dockerContainer'))
      .each(function (dockerContainer) {
        options.containerIdFilter.push(dockerContainer)
      })
      .then(function () {
        return enqueueContainerJobsHelper(options)
      })
      .catch(function (err) {
        log.error({ err: err }, '.dockTask error')
        throw err
      })
  })
}
