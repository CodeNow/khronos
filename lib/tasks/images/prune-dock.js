/**
 * Gets all the images off a dock. If it's not tagged, we enqueue a job to
 * delete it. If it is named, we enqueue a job to do more checking on it.
 * @module lib/tasks/images/prune-dock
 */
'use strict'

// external
var assign = require('101/assign')
var exists = require('101/exists')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var rabbitmqHelper = require('tasks/utils/rabbitmq')

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
        throw new TaskFatalError('khronos:images:prune-dock', 'dockerHost is required')
      }
    })
    .then(function fetchImages () {
      return Promise.resolve()
        .then(function () {
          var docker = Promise.promisifyAll(new Docker(job.dockerHost))
          var maxImageAge = parseInt(process.env.KHRONOS_MIN_IMAGE_AGE, 10)
          return docker.getImagesAsync(maxImageAge)
        })
    })
    .spread(function enqueueJobs (images, taglessImages) {
      // `images` is a list of strings (tags)
      // `taglessImages` is a list of Image objects from docker
      var targetQueues = [
        'khronos:images:check-against-context-versions',
        'khronos:images:remove'
      ]
      return Promise.using(rabbitmqHelper(targetQueues), function (rabbitmq) {
        return Promise.all([
          // enqueue all jobs for tagless images
          Promise.each(
            taglessImages,
            function (image) {
              var newJob = assign({}, job, { imageId: image.Id })
              return rabbitmq.publish('khronos:images:remove', newJob)
            }
          ),
          // enqueue tasks for each image for more checking
          Promise.each(
            images,
            function (image) {
              var newJob = assign({}, job, { imageId: image })
              return rabbitmq.publish('khronos:images:check-against-context-versions', newJob)
            }
          )
        ])
      })
    })
    .spread(function reportJobsEnqueued (taglessJobs, taggedJobs) {
      return {
        taglessJobsEnqueued: taglessJobs.length,
        taggedJobsEnqueued: taggedJobs.length
      }
    })
}
