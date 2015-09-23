'use strict';

var Docker = require('../../models/docker');
var isObject = require('101/is-object');
var isString = require('101/is-string');
var log = require('../../logger').getChild(__filename);
var Promise = require('bluebird');
var rabbitmqHelper = require('../utils/rabbitmq');
var TaskFatalError = require('ponos').TaskFatalError;

/**
 * Enqueue Container Jobs Helper enqueues jobs for containers to a specified
 * queue. The jobs are of the format:
 * {
 * 	 dockerHost: job.dockerHost,
 * 	 containerId: [someID]
 * }
 * @param {object} job Job parameters.
 * @param {string} job.dockerHost Docker host to search for containers.
 * @param {string} targetQueue Queue to place new jobs.
 * @param {array} imageFilters Array of regular expressions to check the
 *   container's source image and return matching containers.
 * @return {promise} Resolved when all tasks for containers are enqueued.
 */
module.exports = function (job, targetQueue, imageFilters) {
  return Promise.resolve()
    .then(function validateArguments () {
      // if (!isObject(job)) { throw new TaskFatalError('job must be an object'); }
      if (!isString(targetQueue)) {
        throw new TaskFatalError('targetQueue must be a string');
      }
      if (!Array.isArray(imageFilters)) {
        throw new TaskFatalError('imageFilters must be an array');
      }
    })
    .then(function () {
      return Promise.using(rabbitmqHelper([targetQueue]),
        function (rabbitmq) {
          return Promise.resolve()
            .then(function validateArguments () {
              if (!job.dockerHost) {
                throw new TaskFatalError('dockerHost is required');
              }
              log.trace({ job: job }, 'prune-dock job');
            })
            // NOTE: rabbitmq is already connected from rabbitmqHelper
            .then(function getContainers () {
              var docker = Promise.promisifyAll(new Docker(job.dockerHost));
              var dockerOpts = {
                filters: JSON.stringify({ status: ['exited'] })
              };
              return docker.getContainersAsync(dockerOpts, imageFilters);
            })
            .each(function createNewJobsForEachContainer (container) {
              var data = {
                dockerHost: job.dockerHost,
                containerId: container.Id
              };
              rabbitmq.publish(targetQueue, data);
              return data;
            })
            .then(function returnNumberOfContainers (jobs) {
              return jobs.length;
            });
        });
        // NOTE: this doesn't catch - that is left up to the task definition
    });
};
