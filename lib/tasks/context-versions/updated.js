/**
 * Takes a context version and verifies it's not been on a build in two weeks,
 * or is attached to an instance. If not, it creates the next job
 * @module lib/tasks/context-versions/check-recent-usage
 */
'use strict'

// external
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var log = require('logger').getChild(__filename)

module.exports = function (job) {
  return Promise.resolve()
    .then(function validateArguments () {
      log.trace({ job: job }, 'context version udpate')
      throw new TaskFatalError(
        'khronos:context-versions:check-recent-usage',
        'twoWeeksAgo is required'
      )
    })
}
