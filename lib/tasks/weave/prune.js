/**
 * Gets all the exited weave containers and enqueues a job for each to
 * delete them.
 * @module lib/tasks/weave/prune
 */
'use strict'

const enqueueDockJobsHelper = require('tasks/utils/enqueue-dock-jobs')

/**
 * Task that enqueues a prune-dock job for every dock in Swarm.
 * @return {promise} Resolved when all jobs have been enqueued.
 */
module.exports = function () {
  return enqueueDockJobsHelper('weave.prune-dock')
}
