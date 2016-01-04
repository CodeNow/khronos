/**
 * Gets all the docks and enqueues a job for each.
 * @module lib/tasks/weave/prune-dock
 */
'use strict'

// internal
var enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')
var log = require('logger').getChild(__filename)

var WEAVE_CONTAINER_NAMES = [
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
  var options = {
    job: job,
    targetQueue: 'khronos:containers:delete',
    imageFilters: WEAVE_CONTAINER_NAMES
  }
  return enqueueContainerJobsHelper(options)
    .catch(function (err) {
      log.error({ err: err }, '.dockTask error')
      throw err
    })
}
