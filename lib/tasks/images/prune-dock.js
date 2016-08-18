/**
 * Gets all the images off a dock. If it's not tagged, we enqueue a job to
 * delete it. If it is named, we enqueue a job to do more checking on it.
 * @module lib/tasks/images/prune-dock
 */
'use strict'

// external
const assign = require('101/assign')
const exists = require('101/exists')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const Docker = require('models/docker')
const log = require('logger').getChild(__filename)
const rabbitmq = require('models/rabbitmq')
const Swarm = require('models/swarm')

/**
 * Prune Dock of old and un-tagged Images
 * @param {object} job Job parameters
 * @param {string} job.dockerHost Docker host to search for containers.
 * @return {promise} Resolved when all tasks enqueued to remove containers.
 */
module.exports = function (job) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!exists(job.dockerHost)) {
        throw new WorkerStopError('dockerHost is required')
      }
    })
    .then(function validateDockerHost () {
      const swarm = new Swarm()
      return swarm.checkHostExists(job.dockerHost)
    })
    .then(function fetchImages () {
      return Promise.resolve()
        .then(function () {
          const docker = new Docker(job.dockerHost)
          const maxImageAge = parseInt(process.env.KHRONOS_MIN_IMAGE_AGE, 10)
          return docker.getImages(maxImageAge)
        })
    })
    .spread(function enqueueJobs (images, taglessImages) {
      // `images` is a list of strings (tags)
      // `taglessImages` is a list of Image objects from docker
      var targetQueues = [
        'khronos:images:check-against-context-versions',
        'khronos:images:remove'
      ]
      return Promise.all([
        // enqueue all jobs for tagless images
        Promise.each(
          taglessImages,
          function (image) {
            var newJob = assign({}, job, { imageId: image.Id })
            return rabbitmq.publishTask('khronos:images:remove', newJob)
          }
        ),
        // enqueue tasks for each image for more checking
        Promise.each(
          images,
          function (image) {
            var newJob = assign({}, job, { imageId: image })
            return rabbitmq.publishTask('khronos:images:check-against-context-versions', newJob)
          }
        )
      ])
    })
    .spread(function reportJobsEnqueued (taglessJobs, taggedJobs) {
      return {
        dockerHost: job.dockerHost,
        taglessJobsEnqueued: taglessJobs.length,
        taggedJobsEnqueued: taggedJobs.length
      }
    })
    .catch(Swarm.InvalidHostError, function (err) {
      // If we get this type of error from Mavis, we cannot retry, but it's not
      // a fatal error, there's just nothing more to do.
      log.warn({ err: err, job: job }, 'Prune Dock of Images Invalid Dock')
      return {
        dockerHost: job.dockerHost,
        taglessJobsEnqueued: -1,
        taggedJobsEnqueued: -1
      }
    })
}
