/**
 * Gets all the exited image-builder containers and enqueues a job for each to
 * delete them.
 * @module lib/tasks/image-builder/prune-dock
 */
'use strict'

// internal
var enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')
var log = require('logger').getChild(__filename)

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
  var targetQueue = 'khronos:containers:delete'
  return enqueueContainerJobsHelper(job, targetQueue, IMAGE_FILTERS)
    .catch(function (err) {
      log.error({ err: err }, '.dockTask error')
      throw err
    })
}
