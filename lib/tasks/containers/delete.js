/**
 * Deletes individual containers.
 * @module lib/tasks/containers/delete
 */
'use strict'

// external
const exists = require('101/exists')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

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
module.exports = (job) => {
  return Promise
    .try(() => {
      if (!exists(job.dockerHost)) {
        throw new WorkerStopError('dockerHost is required')
      }
      if (!exists(job.containerId)) {
        throw new WorkerStopError('containerId is required')
      }
    })
    .then(() => {
      const swarm = new Swarm()
      return swarm.checkHostExists(job.dockerHost)
    })
    .then(() => {
      var docker = new Docker(job.dockerHost)
      return docker.removeStoppedContainer(job.containerId)
    })
    .catch((err) => {
      log.error({ err: err }, 'delete container task error, ignore')
    })
    .return(null)
}
