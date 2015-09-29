'use strict';

// external
var exists = require('101/exists');
var Promise = require('bluebird');
var TaskFatalError = require('ponos').TaskFatalError;

// internal
var Docker = require('models/docker');
var log = require('logger').getChild(__filename);

/**
 * Task handler that deletes a single container off a specific dock. This
 * assumes that the container has been stopped.
 * @param {object} job Job parameters.
 * @param {string} job.dockerHost Docker host to find the container.
 * @param {string} job.containerId ID of the Docker container to delete.
 * @return {promise} Resolved when the container is deleted.
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
      return docker.removeStoppedContainerAsync(job.containerId);
    })
    .then(function returnResults () {
      return {
        dockerHost: job.dockerHost,
        removedContainer: job.containerId
      };
    })
    .catch(function (err) {
      log.error({ err: err }, 'delete container task error');
      throw err;
    });
};
