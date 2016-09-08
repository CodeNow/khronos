/**
 * Removes Docker Images
 * @module lib/tasks/images/remove
 */
'use strict'

// internal
const exists = require('101/exists')
const Promise = require('bluebird')
const Swarm = require('models/swarm')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// external
const Docker = require('models/docker')
const log = require('logger').getChild(__filename)

/**
 * Task handler that removes a simple image from a Docker host.
 * @param {object} job Job parameters.
 * @param {string} job.dockerHost Docker host to find the container.
 * @param {string} job.imageId ID of the Docker image to remove.
 * @return {promise} Resolved when the image is removed.
 */
module.exports = function (job) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!exists(job.dockerHost)) {
        throw new WorkerStopError('dockerHost is required')
      }
      if (!exists(job.imageId)) {
        throw new WorkerStopError('imageId is required')
      }
    })
    .then(function validateDockerHost () {
      const swarm = new Swarm()
      return swarm.checkHostExists(job.dockerHost)
    })
    .then(function deleteImageFromDock () {
      const docker = new Docker(job.dockerHost)
      return docker.removeImage(job.imageId)
    })
    .then(function returnResults () {
      log.trace({ job: job }, 'Remove Image Job Successful')
      return {
        dockerHost: job.dockerHost,
        removedImage: job.imageId
      }
    })
    .catch(Swarm.InvalidHostError, function (err) {
      // If we get this type of error from Mavis, we cannot retry, but it's not
      // a fatal error, there's just nothing more to do.
      log.warn({ err: err, job: job }, 'Remove Image Job Invalid Host')
      return {
        dockerHost: job.dockerHost,
        removedImage: ''
      }
    })
    .catch(function (err) {
      if (err.statusCode === 409) {
        throw new WorkerStopError('409 Conflict: image is in use')
      } else if (err.statusCode === 404) {
        throw new WorkerStopError('404 Not Found: image not found')
      }
      throw err
    })
    .catch(function (err) {
      log.error({
        err: err,
        dockerHost: job.dockerHost,
        removedImage: job.imageId
      }, 'remove image task error')
      throw err
    })
}
