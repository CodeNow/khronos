/**
 * Gets every container on the dock and enqueues a job to check it
 * against mongo.
 * @module lib/tasks/containers/prune-orphans-dock
 */
'use strict'

const enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')

const IMAGE_FILTERS = [
  new RegExp('^' + process.env.KHRONOS_DOCKER_REGISTRY_REGEX +
    '\/[0-9]+\/[A-z0-9]+:[A-z0-9]+'),
  /^[A-z0-9]{12}$/ // TODO(bryan): was this initially for build containers?
]

/**
 * Enqueue jobs to check the container against mongodb.
 * @param {object} job Job parameters
 * @param {string} job.dockerHost Docker host to search for containers.
 * @return {promise} Resolved when all tasks enqueued to verify containers.
 */
module.exports = function (job) {
  const options = {
    job: job,
    targetQueue: 'containers.orphan.check-against-mongo',
    imageBlacklist: IMAGE_FILTERS
  }
  return enqueueContainerJobsHelper(options)
}
