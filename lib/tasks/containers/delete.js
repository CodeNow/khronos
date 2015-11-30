/**
 * Deletes individual containers.
 * @module lib/tasks/containers/delete
 */
'use strict'

// external
var exists = require('101/exists')
var Mavis = require('models/mavis')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var log = require('logger').getChild(__filename)

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
        throw new TaskFatalError('khronos:containers:delete', 'dockerHost is required')
      }
      if (!exists(job.containerId)) {
        throw new TaskFatalError('khronos:containers:delete', 'containerId is required')
      }
    })
    .then(function validateDockerHost () {
      var mavis = new Mavis()
      return mavis.verifyHost(job.dockerHost)
    })
    .then(function deleteContainerFromDock () {
      var docker = Promise.promisifyAll(new Docker(job.dockerHost))
      return docker.removeStoppedContainerAsync(job.containerId)
    })
    .then(function returnResults () {
      return {
        dockerHost: job.dockerHost,
        removedContainer: job.containerId
      }
    })
    .catch(Mavis.InvalidHostError, function (err) {
      // If we get this type of error from Mavis, we cannot retry, but it's not
      // a fatal error, there's just nothing more to do.
      log.warn({ err: err, job: job }, 'Remove Image Job Invalid Host')
      return {
        dockerHost: job.dockerHost,
        removedContainer: ''
      }
    })
    .catch(function (err) {
      log.error({ err: err }, 'delete container task error')
      throw err
    })
}
