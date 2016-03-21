/**
 * Gets all the exited image-builder containers and enqueues a job for each to
 * delete them.
 * @module lib/tasks/image-builder/prune-dock
 */
'use strict'

var Promise = require('bluebird')

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
    targetQueue: 'khronos:containers:delete'
  }
  return Promise.using(mongodbHelper(), function (mongoClient) {
    var instanceQuery = {
      'contextVersion.dockerHost': job.dockerHost,
      'contextVersion.build.started': {
        '$gte': new Date(Date.now() - process.env.KHRONOS_IMAGE_BUILDER_BEFORE_MS)
      }
    }
    return mongoClient.fetchInstancesAsync(instanceQuery)
      .then(function (instances) {
        return instances.map(pluck('contextVersion.build.dockerImage'))
      })
      .then(function (arrayOfDockerImagesToNotDelete) {
        arrayOfDockerImagesToNotDelete.forEach(function (dockerImage) {
          options.imageFilters.push(new RegExp(dockerImage))
        })
        return enqueueContainerJobsHelper(options)
          .catch(function (err) {
            log.error({ err: err }, '.dockTask error')
            throw err
          })
      })
  })
}
