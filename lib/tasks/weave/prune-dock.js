/**
 * Gets all the docks and enqueues a job for each.
 * @module lib/tasks/weave/prune-dock
 */
'use strict'

// internal
const enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')

const WEAVE_CONTAINER_NAMES = [
  /zettio\/weavetools/,
  /weaveworks\/weave/,
  /weaveworks\/weaveexec/
]

/**
 * Task that gets all weave containers on a dock and enqueues tasks to remove
 * each container individually from the docks.
 * @param {object} job Job parameters
 * @param {object} job.dockerHost Docker host to search for weave containers.
 * @return {promise} Resolved when the containers have all been found and jobs
 *   have been enqueued for them.
 */
module.exports = function (job) {
  const options = {
    job: job,
    targetQueue: 'containers.delete',
    imageBlacklist: WEAVE_CONTAINER_NAMES
  }
  return enqueueContainerJobsHelper(options)
}
