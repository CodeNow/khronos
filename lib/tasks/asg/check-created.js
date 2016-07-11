/**
 * Gets the docks for a certain org to validate that the were created successfully
 */
'use strict'

// external
const joi = require('joi')
const monitor = require('monitor-dog')
const Promise = require('bluebird')
const TaskError = require('ponos').TaskError
const TaskFatalError = require('ponos').TaskFatalError

// internal
const logger = require('logger').getChild(__filename)
const Swarm = require('models/swarm')

const schema = joi.object({
  orgName: joi.string().required(),
  githubId: joi.number().required(),
  createdAt: joi.date().timestamp('unix').required() // CreatedAt is in seconds
}).required().label('job')

/**
 * Validates that an org's asg was created successfully by checking that at least 1 dock exists
 *
 * @param {Object} job           - job model
 * @param {Number} job.createdAt - Date time, in seconds of when this asg was created
 * @param {Number} job.githubId  - Organization's github id
 * @param {Number} job.orgName   - Organization's github login name
 *
 * @returns {Promise}   That resolves when the job is complete, or needs to wait some more
 */
module.exports = function CheckASGWasCreated (job) {
  var log = logger.child({
    tx: true,
    data: job,
    method: 'CheckASGWasCreated'
  })
  log.info('CheckASGWasCreated called')

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
      // Check if this job is ready
      // Using the `createdAt`, we can see if it's been enough time to check on the dock
      var now = Math.floor(new Date().getTime() / 1000)
      var timeLeft = (job.createdAt + process.env.CHECK_ASG_CREATED_DELAY_IN_SEC) - now
      if (timeLeft > 0) {
        // It hasn't been long enough, so let the exponential backoff handle repeating this job
        throw new TaskError(
          'khronos:asg.check-created',
          `Org \`'${job.githubId}'\` still needs to wait \`${timeLeft}'\` seconds`
        )
      }
    })
    .then(() => {
      const swarm = new Swarm()
      return swarm.getHostsWithOrgs()
    })
    .then((docks) => {
      var dockExists = docks.find(function (dock) {
        return dock.org === job.githubId.toString()
      })
      if (!dockExists) {
        monitor.event({
          title: 'ASG Create Failed',
          text: `No docks were created for ${job.orgName}`
        })
        throw new TaskFatalError('CheckASGWasCreated', 'No Docks exist!')
      }
    })
    .catch((err) => {
      log.error({ err: err }, 'Error in `CheckASGWasCreated`')
      throw err
    })
}
