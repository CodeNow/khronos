'use strict';

var enqueueDockJobsHelper = require('../utils/enqueue-dock-jobs');
var log = require('../../logger').getChild(__filename);

/**
 * Task that enqueues a prune-dock job for every dock in Mavis.
 * @return {promise} Resolved when all jobs have been enqueued.
 */
module.exports = function (/* job */) {
  return enqueueDockJobsHelper('khronos:containers:orphan:prune-dock')
    .catch(function (err) {
      log.error({ err: err }, '.task error');
      throw err;
    });
};
