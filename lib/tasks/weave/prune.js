/**
 * Gets all the exited weave containers and enqueues a job for each to
 * delete them.
 * @module lib/tasks/weave/prune
 */
'use strict'

// internal
var enqueueDockJobsHelper = require('tasks/utils/enqueue-dock-jobs')
var log = require('logger').getChild(__filename)

/**
 * Task that enqueues a prune-dock job for every dock in Swarm.
 * @return {promise} Resolved when all jobs have been enqueued.
 */
module.exports = function () {
  return enqueueDockJobsHelper('khronos:weave:prune-dock')
    .catch(function (err) {
      log.error({ err: err }, '.task error')
      throw err
    })
}
