/**
 * Gets all the docks and enqueues a job for each.
 * @module lib/tasks/images/prune
 */
'use strict'

const enqueueDockJobsHelper = require('tasks/utils/enqueue-dock-jobs')

/**
 * Enqueues a task for each dock to clean orphan images off of it.
 * @return {promise} Resolved when all jobs have been enqueued.
 */
module.exports = function () {
  return enqueueDockJobsHelper('images.prune-dock')
}
