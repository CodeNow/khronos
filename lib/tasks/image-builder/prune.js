'use strict';

// internal
var enqueueDockJobsHelper = require('tasks/utils/enqueue-dock-jobs');
var log = require('logger').getChild(__filename);

/**
 * image-builder prune task enqueues a job for each dock to clean the
 * image-builder containers from it.
 * @return {promise} Resolved when all jobs have been enqueued.
 */
module.exports = function (/* job */) {
  return enqueueDockJobsHelper('khronos:containers:image-builder:prune-dock')
    .catch(function (err) {
      log.error({ err: err }, '.task error');
      throw err;
    });
};
