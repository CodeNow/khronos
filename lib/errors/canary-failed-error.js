'use strict'

var ErrorSubclass = require('error-subclass')
var util = require('util')

/**
 * Class uses by canary workers to indicate that the test has failed from
 * anywhere in the promise chain.
 * @param {[type]} message [description]
 */
function CanaryFailedError (message, data) {
  ErrorSubclass.call(this, message)
  this.data = data || {}
}
util.inherits(CanaryFailedError, ErrorSubclass)

module.exports = CanaryFailedError
