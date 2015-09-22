'use strict';

var Docker = require('../../models/docker');
var log = require('../../logger').getChild(__filename);
var Promise = require('bluebird');
var rabbitmqHelper = require('../utils/rabbitmq');
var TaskFatalError = require('ponos').TaskFatalError;

var WEAVE_CONTAINER_NAMES = [
  /zettio\/weavetools/,
  /weaveworks\/weave/,
  /weaveworks\/weaveexec/
];

/**
 * Task that gets all weave containers on a dock and enqueues tasks to remove
 * each container individually from the docks.
 * @param {object} job Job parameters
 * @param {object} job.dockerHost Docker host to search for weave containers.
 * @return {promise} Resolved when the containers have all been found and jobs
 *   have been enqueued for them.
 */
module.exports = function (job) {
  return Promise.using(rabbitmqHelper(['khronos:containers:delete']),
    function (rabbitmq) {
      return Promise.resolve()
        .then(function validateArguments () {
          if (!job.dockerHost) {
            throw new TaskFatalError('dockerHost is required');
          }
          log.trace({ job: job }, 'prune-dock job');
        })
        .then(function connectToRabbitMQ () {
          return rabbitmq.connectAsync();
        })
        .then(function getContainers () {
          var docker = Promise.promisifyAll(new Docker(job.dockerHost));
          var dockerOpts = {
            filters: JSON.stringify({ status: ['exited'] })
          };
          return docker.getContainersAsync(dockerOpts, WEAVE_CONTAINER_NAMES);
        })
        .each(function createNewJobsForEachContainer (container) {
          var data = {
            dockerHost: job.dockerHost,
            containerId: container.Id
          };
          rabbitmq.publish('khronos:containers:delete', data);
          return data;
        })
        .then(function returnNumberOfContainers (jobs) {
          return jobs.length;
        });
    })
    .catch(function (err) {
      log.error({ err: err }, '.dockTask error');
      throw err;
    });
};
