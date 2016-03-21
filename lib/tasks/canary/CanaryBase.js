'use strict'

var monitor = require('monitor-dog')
var TaskFatalError = require('ponos').TaskFatalError
var CanaryFailedError = require('../../errors/canary-failed-error')
var logger = require('../../logger')
var exists = require('101/exists')
var Promise = require('bluebird')

/**
 * Base class for all the canaries to work off of.
 * Adds logging and a few other helpers.
 * @type {CanaryBase}
 */
module.exports = class CanaryBase {
  /**
   * Creates logger on the object
   * @param {Object} job - The job object from rabbit
   */
  constructor (job) {
    this.job = job
    this.log = logger.child({
      job: this.job
    })
  }

  /**
   * Executes the tests
   * @returns {Promise}
   */
  executeTest () {
    var requiredProperties = ['queue', 'name', 'gauge']
    requiredProperties.forEach((key) => {
      if (!exists(this[key])) {
        throw new Error('Required property not set: ' + key)
      }
    })
    this.log.info('Canary Testing ' + this.name)

    return Promise.resolve()
      .bind(this)
      .then(this.test)
      .then(this.handleSuccess)
      .catch(CanaryFailedError, this.handleCanaryError)
      .catch(this.handleGenericError)
  }

  /**
   * Override with your testing code
   */
  test () {
    throw new Error('Canary test not implemented')
  }

  /**
   * Handle the successful state
   */
  handleSuccess () {
    this.log.info(this.name + ' Success')
    monitor.gauge(this.gauge, 1)
  }

  /**
   * Deal with canary errors
   * @param {CanaryFailedError} err
   */
  handleCanaryError (err) {
    this.log.error(err.data, err.message)
    monitor.gauge(this.gauge, 0)
    monitor.event({ title: this.name + ' Failed', text: err.message })
  }

  /**
   * Deal with generic errors
   * @param {Error} err
   */
  handleGenericError (err) {
    this.log.error(err.data || {}, err.message)
    monitor.gauge(this.gauge, 0)
    monitor.event({
      title: this.name + ' Unexpected Failure',
      text: err.message
    })
    throw new TaskFatalError(
      this.queue,
      'Canary failed due to an unexpected error',
      { err: err }
    )
  }
}
