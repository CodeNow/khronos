/**
 * Removes Docker Images
 * @module lib/tasks/images/remove
 */
'use strict'

// internal
var exists = require('101/exists')
var Mavis = require('models/mavis')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// external
var Docker = require('models/docker')
var log = require('logger').getChild(__filename)

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
        throw new TaskFatalError('khronos:images:remove', 'dockerHost is required')
      }
      if (!exists(job.imageId)) {
        throw new TaskFatalError('khronos:images:remove', 'imageId is required')
      }
    })
    .then(function validateDockerHost () {
      var mavis = new Mavis()
      return mavis.verifyHost(job.dockerHost)
    })
    .then(function deleteImageFromDock () {
      var docker = Promise.promisifyAll(new Docker(job.dockerHost))
      return docker.removeImageAsync(job.imageId)
    })
    .then(function returnResults () {
      return {
        dockerHost: job.dockerHost,
        removedImage: job.imageId
      }
    })
    .catch(Mavis.InvalidHostError, function (err) {
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
        throw new TaskFatalError('khronos:images:remove', '409 Conflict: image is in use')
      } else if (err.statusCode === 404) {
        throw new TaskFatalError('khronos:images:remove', '404 Not Found: image not found')
      }
      throw err
    })
    .catch(function (err) {
      log.error({ err: err }, 'remove image task error')
      throw err
    })
}
