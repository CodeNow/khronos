'use strict';

// internal
var exists = require('101/exists');
var Promise = require('bluebird');
var TaskFatalError = require('ponos').TaskFatalError;

// external
var Docker = require('models/docker');
var log = require('logger').getChild(__filename);

/**
 * Task handler that removes a single container from a dock. This does not
 * assume the container is stopped and will attempt to stop it.
 * @param {object} job Job parameters.
 * @param {string} job.dockerHost Docker host to find the container.
 * @param {string} job.containerId ID of the Docker container to remove.
 * @return {promise} Resolved when the container is removed.
 */
module.exports = function (job) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!exists(job.dockerHost)) {
        throw new TaskFatalError('dockerHost is required');
      }
      if (!exists(job.containerId)) {
        throw new TaskFatalError('containerId is required');
      }
    })
    .then(function deleteContainerFromDock () {
      var docker = Promise.promisifyAll(new Docker(job.dockerHost));
      return docker.removeContainerAsync(job.containerId);
    })
    .then(function returnResults () {
      return {
        dockerHost: job.dockerHost,
        removedContainer: job.containerId
      };
    })
    .catch(function (err) {
      log.error({ err: err }, 'remove container task error');
      throw err;
    });
};
