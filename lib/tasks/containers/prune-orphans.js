/**
 * Gets all the docks and enqueues a job for each.
 * @module lib/tasks/containers/prune-orphans
 */
'use strict'

const enqueueDockJobsHelper = require('tasks/utils/enqueue-dock-jobs')

/**
 * Task that enqueues a prune-dock job for every dock in Swarm.
 * @return {promise} Resolved when all jobs have been enqueued.
 */
module.exports = function () {
  return enqueueDockJobsHelper('containers.orphan.prune-dock')
}
