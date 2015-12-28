'use strict'

// external
var equals = require('101/equals')
var find = require('101/find')
var pluck = require('101/pluck')
var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'), { multiArgs: true })
var util = require('util')

// internal
var log = require('logger').getChild(__filename)

/**
 * Model for interacting with Mavis
 * @class
 */
function Mavis () {
  this.host = process.env.KHRONOS_MAVIS + '/docks'
}

/**
 * Fetch the list of dock hosts from Mavis.
 * @return {promise} Resolved with available docks
 */
Mavis.prototype.getDocks = function () {
  log.info('Mavis.prototype.getDocks')
  return this.getRawDocks()
    .then(function (docks) {
      docks = docks.map(pluck('host'))
      log.trace({ docks: docks }, 'getDocks: available docks')
      return docks
    })
}

/**
 * Fetch the list of docks from Mavis.
 * @return {promise} Resolved with available docks
 */
Mavis.prototype.getRawDocks = function () {
  log.info('Mavis.prototype.getRawDocks')
  return Promise.resolve().bind(this)
    .then(function getDocks () {
      var docks = []
      return request.getAsync(this.host)
        .spread(function (res, body) {
          docks = JSON.parse(body)
          log.trace({ body: body }, 'getRawDocks: available docks')
          return docks
        })
    })
    .catch(function (err) {
      log.error({ err: err }, 'Error in getRawDocks')
      throw err
    })
}

/**
 * Verify a given host address against Mavis. Useful for checking if a host
 * originally from Mavis is still valid.
 * @param  {string} host Host URL to check, e.g. 'http://10.20.139.246:4242'.
 * @return {promise} Resolves with the host if it is valid, throws an error if
 *   the host is no longer in Mavis.
 */
Mavis.prototype.verifyHost = function (host) {
  return this.getDocks()
    .then(function (docks) {
      var dock = find(docks, equals(host))
      if (!dock) {
        throw new InvalidHostError('Host no longer exists in Mavis')
      }
      return host
    })
}

function InvalidHostError (message) {
  Error.apply(this)
  this.message = message
}
util.inherits(InvalidHostError, Error)

Mavis.InvalidHostError = InvalidHostError

/**
 * Model for interacting with Mavis
 * @module khronos:mavis
 */
module.exports = Mavis
