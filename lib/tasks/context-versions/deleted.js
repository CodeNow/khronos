/**
 * Takes a context version and verifies it's not been on a build in two weeks,
 * or is attached to an instance. If not, it creates the next job
 * @module lib/tasks/context-versions/check-recent-usage
 */
'use strict'

// external
const Promise = require('bluebird')
const TaskFatalError = require('ponos').TaskFatalError
const rabbitmqHelper = require('tasks/utils/rabbitmq')
const joi = require('utils/joi')

// internal
const log = require('logger').getChild(__filename)
const logger = log.logger

module.exports = ContextVersionDeleted

function ContextVersionDeleted (job) {
  var log = logger.log.child({
    tx: true,
    data: job
  })
  log.info('ContextVersionDeleted')

  var schema = joi.object({
    contextVersion: joi.object({
      build: joi.object({
        dockerContainer: joi.string().required()
      }).required()
    }).required(),
    dockerHost: joi.string().uri({ scheme: 'http' }).required()
  }).required().label('job')

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'khronos.contest-version.deleted',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      let containerId = job.contextVersion.build.dockerContainer
      let dockerHost = job.dockerHost
      let targetQueue = 'khronos:images:remove'
      return Promise.using(rabbitmqHelper([targetQueue]))
        .then(function (rabbitmq) {
          // this job is identical for the remove job!
          rabbitmq.publish(targetQueue, {
            dockerHost: dockerHost,
            containerId: containerId
          })
        })
    })
}
