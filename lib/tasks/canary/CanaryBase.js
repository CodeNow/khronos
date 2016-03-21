'use strict'

var monitor = require('monitor-dog')
var TaskFatalError = require('ponos').TaskFatalError
var CanaryFailedError = require('../../errors/canary-failed-error')
var logger = require('../../logger')
var exists = require('101/exists')
var Promise = require('bluebird')

module.exports = class CanaryBase {
  constructor (job) {
    this.job = job
    this.log = logger.child({
      job: this.job
    })
  }

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

  test () {
    throw new Error('Canary test not implemented')
  }

  handleSuccess () {
    this.log.info(this.name + ' Success')
    monitor.gauge(this.gauge, 1)
  }

  handleCanaryError (err) {
    this.log.error(err.data, err.message)
    monitor.gauge(this.gauge, 0)
    monitor.event({ title: this.name + ' Failed', text: err.message })
  }

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
