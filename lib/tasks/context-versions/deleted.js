/**
 * Takes a deleted context version and removes the container for that CV (since
 * we don't need it once the CV is deleted)
 * @module lib/tasks/context-versions/check-recent-usage
 */
'use strict'

// external
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const rabbitmq = require('models/rabbitmq')
const joi = require('joi')

// internal
const logger = require('logger').getChild(__filename)

module.exports = ContextVersionDeleted

function ContextVersionDeleted (job) {
  var log = logger.child({
    tx: true,
    data: job
  })
  log.info('ContextVersionDeleted')

  var schema = joi.object({
    contextVersion: joi.object({
      build: joi.object({
        dockerContainer: joi.string().required()
      }).unknown().required(),
      dockerHost: joi.string().uri({ scheme: 'http' }).required()
    }).unknown().required(),
    tid: joi.string()
  }).required().label('job')

  return Promise.fromCallback(function (cb) {
    joi.validate(job, schema, cb)
  })
    .catch(function (err) {
      throw new WorkerStopError(
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      let containerId = job.contextVersion.build.dockerContainer
      let dockerHost = job.contextVersion.dockerHost
      let targetQueue = 'containers.remove'
      rabbitmq.publishTask(targetQueue, {
        dockerHost: dockerHost,
        containerId: containerId
      })
    })
}
