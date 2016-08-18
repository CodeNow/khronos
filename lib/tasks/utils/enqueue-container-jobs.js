'use strict'

// external
var isObject = require('101/is-object')
var isString = require('101/is-string')
var Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
var Docker = require('models/docker')
var log = require('logger').getChild(__filename)
var rabbitmqHelper = require('tasks/utils/rabbitmq')
var Swarm = require('models/swarm')

/**
 * Enqueue Container Jobs Helper enqueues jobs for containers to a specified
 * queue. The jobs are of the format:
 * {
 * 	 dockerHost: job.dockerHost,
 * 	 containerId: [someID]
 * }
 * @param {object} options Helper Options.
 * @param {object} options.job              - Job parameters.
 * @param {string} options.job.dockerHost   - Docker host to search for containers.
 * @param {string} options.targetQueue      - Queue to place new jobs.
 * @param {array} options.imageFilters      - Array of regular expressions to check the
 *                                              container's source image and return matching
 *                                              containers.
 * @param {array} options.containerIdFilter - Array of docker container ids that SHOULD NOT be
 *                                              included
 * @return {promise} Resolved when all tasks for containers are enqueued.
 */
module.exports = function (options) {
  var job
  var targetQueue
  var imageFilters
  return Promise.resolve()
    .then(function validateArguments () {
      if (!isObject(options)) {
        throw new WorkerStopError('options must be an object')
      }
      job = options.job
      targetQueue = options.targetQueue
      imageFilters = options.imageBlacklist
      if (!isObject(job)) {
        throw new WorkerStopError('job must be an object')
      }
      if (!isString(targetQueue)) {
        throw new WorkerStopError('targetQueue must be a string')
      }
      if (!Array.isArray(imageFilters)) {
        throw new WorkerStopError('imageBlacklist must be an array')
      }
      return true
    })
    .then(function validateJobArguments () {
      if (!job.dockerHost) {
        throw new WorkerStopError('dockerHost is required')
      }
      log.trace({ job: job }, 'khronos:* enqueue container jobs')
    })
    .then(function validateDockerHost () {
      var swarm = new Swarm()
      return swarm.checkHostExists(job.dockerHost.split('//').pop())
    })
    .then(function () {
      return Promise.using(rabbitmqHelper([targetQueue]),
        function (rabbitmq) {
          // NOTE: rabbitmq is already connected from rabbitmqHelper
          return Promise.try(function getContainers () {
            var docker = new Docker(job.dockerHost)
            var dockerOpts = {
              filters: JSON.stringify({ status: ['exited'] })
            }
            return docker.getContainers(dockerOpts, imageFilters, options.containerIdWhitelist)
          })
            .each(function createNewJobsForEachContainer (container) {
              var data = {
                dockerHost: job.dockerHost,
                containerId: container.Id
              }
              rabbitmq.publish(targetQueue, data)
              return data
            })
            .then(function returnNumberOfContainers (jobs) {
              return jobs.length
            })
        })
    // NOTE: this doesn't catch - that is left up to the task definition
    })
    .catch(Swarm.InvalidHostError, function (err) {
      // If we get this type of error from Mavis, we cannot retry, but it's not
      // a fatal error, there's just nothing more to do.
      log.warn({ err: err, job: job }, 'Enqueue Container Jobs Invalid Host')
      return 0
    })
}
