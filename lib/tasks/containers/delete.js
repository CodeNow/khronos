/**
 * Deletes individual containers.
 * @module lib/tasks/containers/delete
 */
'use strict'

// external
const exists = require('101/exists')
const Promise = require('bluebird')
const TaskFatalError = require('ponos').TaskFatalError

// internal
const Docker = require('models/docker')
const log = require('logger').getChild(__filename)
const Swarm = require('models/swarm')

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
      const swarm = new Swarm()
      return swarm.checkHostExists(job.dockerHost)
    })
    .then(function deleteContainerFromDock () {
      var docker = new Docker(job.dockerHost)
      return docker.removeStoppedContainer(job.containerId)
    })
    .then(function returnResults () {
      return {
        dockerHost: job.dockerHost,
        removedContainer: job.containerId
      }
    })
    .catch(function (err) {
      log.error({ err: err }, 'delete container task error, ignore')
    })
}
