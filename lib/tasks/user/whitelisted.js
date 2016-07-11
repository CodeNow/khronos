'use strict'

const joi = require('joi')
const Promise = require('bluebird')
const TaskFatalError = require('ponos').TaskFatalError

const logger = require('logger').getChild(__filename)
const rabbitmqHelper = require('tasks/utils/rabbitmq')

const schema = joi.object({
  orgName: joi.string().required(),
  githubId: joi.number().required(),
  createdAt: joi.date().timestamp('unix').required() // CreatedAt is in seconds
}).required().label('job')

/**
 * Enqueue an `asg.check-created` job when an user (always an organization) is whiteliasted
 *
 * @param {Object} job           - job model
 * @param {Number} job.createdAt - Date time, in seconds of when this asg was created
 * @param {Number} job.githubId  - Organization's github id
 * @param {Number} job.orgName   - Organization's github login name
 *
 * @returns {Promise}            - That resolves when the job is complete and the other job is enqueued
 */
module.exports = function UserWhitelisted (job) {
  var log = logger.child({
    tx: true,
    data: job,
    method: 'UserWhitelisted'
  })
  log.info('UserWhitelisted called')

  return Promise
    .fromCallback((cb) => {
      joi.validate(job, schema, cb)
    })
    .catch((err) => {
      throw new TaskFatalError(
        'khronos:asg.check-created',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(() => {
      const queueName = 'khronos:asg:check-created'
      return Promise.using(rabbitmqHelper([queueName]), (rabbitmq) => {
        rabbitmq.publish(queueName, job)
      })
    })
}
