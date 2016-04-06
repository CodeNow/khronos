'use strict'

// external
var isObject = require('101/is-object')
var isString = require('101/is-string')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

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
 * @param {object} options.job Job parameters.
 * @param {string} options.job.dockerHost Docker host to search for containers.
 * @param {string} options.targetQueue Queue to place new jobs.
 * @param {array} options.imageFilters Array of regular expressions to check the
 *   container's source image and return matching containers.
 * @return {promise} Resolved when all tasks for containers are enqueued.
 */
module.exports = function (options) {
  var job
  var targetQueue
  var imageFilters
  return Promise.resolve()
    .then(function validateArguments () {
      if (!isObject(options)) {
        throw new TaskFatalError('khronos:*', 'options must be an object')
      }
      job = options.job
      targetQueue = options.targetQueue
      imageFilters = options.imageFilters
      if (!isObject(job)) {
        throw new TaskFatalError('khronos:*', 'job must be an object')
      }
      if (!isString(targetQueue)) {
        throw new TaskFatalError('khronos:*', 'targetQueue must be a string')
      }
      if (!Array.isArray(imageFilters)) {
        throw new TaskFatalError('khronos:*', 'imageFilters must be an array')
      }
      return true
    })
    .then(function validateJobArguments () {
      if (!job.dockerHost) {
        throw new TaskFatalError('dockerHost is required')
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
          return Promise.resolve()
            // NOTE: rabbitmq is already connected from rabbitmqHelper
            .then(function getContainers () {
              var docker = Promise.promisifyAll(new Docker(job.dockerHost))
              var dockerOpts = {
                filters: JSON.stringify({ status: ['exited'] })
              }
              return docker.getContainersAsync(dockerOpts, imageFilters)
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
