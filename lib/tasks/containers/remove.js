/**
 * Stops and deletes containers.
 * @module lib/tasks/containers/remove
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
 * Task handler that removes a single container from a dock. This does not
 * assume the container is stopped and will attempt to stop it.
 * @param {object} job Job parameters.
 * @param {string} job.dockerHost Docker host to find the container.
 * @param {string} job.containerId ID of the Docker container to remove.
 * @return {promise} Resolved when the container is removed.
 */
module.exports = (job) => {
  return Promise
    .try(() => {
      if (!exists(job.dockerHost)) {
        throw new TaskFatalError('khronos:containers:remove', 'dockerHost is required')
      }
      if (!exists(job.containerId)) {
        throw new TaskFatalError('khronos:containers:remove', 'containerId is required')
      }
    })
    .then(() => {
      var swarm = new Swarm()
      return swarm.checkHostExists(job.dockerHost)
    })
    .then(() => {
      var docker = new Docker(job.dockerHost)
      return docker.removeContainer(job.containerId)
    })
    .catch((err) => {
      log.error({ err: err }, 'remove container task error, ignore')
    })
    .return(null)
}
