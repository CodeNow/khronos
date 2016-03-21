'use strict'

var monitor = require('monitor-dog')
var TaskFatalError = require('ponos').TaskFatalError
var CanaryFailedError = require('../../errors/canary-failed-error')

module.exports.wrapCanaryPromise = function (options) {
  var canaryName = options.canaryName
  var monitorName = options.monitorName
  var logger = options.logger
  var taskName = options.taskName
  var promise = options.promise
  return promise
    .then(function publishSuccess () {
      logger.info(canaryName + ' success')
      monitor.gauge(monitorName, 1)
    })
    .catch(CanaryFailedError, function publishFailed (err) {
      logger.error(err.data, err.message)
      monitor.gauge(monitorName, 0)
      monitor.event({ title: canaryName + ' Failed', text: err.message })
    })
    .catch(function stopOnError (err) {
      logger.error(err.data || {}, err.message)
      monitor.gauge(monitorName, 0)
      monitor.event({
        title: canaryName + ' Unexpected Failure',
        text: err.message
      })
      throw new TaskFatalError(
        taskName,
        'Canary failed due to an unexpected error',
        { err: err }
      )
    })
}
