/**
 * Stops and deletes containers.
 * @module lib/tasks/containers/remove
 */
'use strict'

// internal
var exists = require('101/exists')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// external
var Docker = require('models/docker')
var log = require('logger').getChild(__filename)

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
        throw new TaskFatalError('khronos:containers:remove', 'dockerHost is required')
      }
      if (!exists(job.containerId)) {
        throw new TaskFatalError('khronos:containers:remove', 'containerId is required')
      }
    })
    .then(function deleteContainerFromDock () {
      var docker = Promise.promisifyAll(new Docker(job.dockerHost))
      return docker.removeContainerAsync(job.containerId)
    })
    .then(function returnResults () {
      return {
        dockerHost: job.dockerHost,
        removedContainer: job.containerId
      }
    })
    .catch(function (err) {
      if (err.statusCode === 404) {
        // the container wasn't found. we don't have to worry about much.
        log.warn({ job: job }, 'remove container 404 for container')
        return {
          dockerHost: job.dockerHost,
          removedContainer: ''
        }
      }
      throw err
    })
    .catch(function (err) {
      log.error({ err: err }, 'remove container task error')
      throw err
    })
}
