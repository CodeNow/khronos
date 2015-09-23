'use strict';

var enqueueContainerJobsHelper = require('../utils/enqueue-container-jobs');
var log = require('../../logger').getChild(__filename);

var IMAGE_FILTERS = [
  new RegExp('^' + process.env.KHRONOS_DOCKER_REGISTRY +
    '\/[0-9]+\/[A-z0-9]+:[A-z0-9]+'),
  /^[A-z0-9]{12}$/ // TODO(bryan): was this initially for build containers?
];

/**
 * Enqueue jobs to check the container against mongodb.
 * @param {object} job Job parameters
 * @param {string} job.dockerHost Docker host to search for containers.
 * @return {promise} Resolved when all tasks enqueued to verify containers.
 */
module.exports = function (job) {
  var targetQueue = 'khronos:containers:orphan:check-against-mongo';
  return enqueueContainerJobsHelper(job, targetQueue, IMAGE_FILTERS)
    .catch(function (err) {
      log.error({ err: err }, '.dockTask error');
      throw err;
    });
};
