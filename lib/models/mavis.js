'use strict';

// external
var equals = require('101/equals');
var find = require('101/find');
var pluck = require('101/pluck');
var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var util = require('util');

// internal
var log = require('logger').getChild(__filename);

/**
 * Model for interacting with Mavis
 * @class
 */
function Mavis () {
  this.host = process.env.KHRONOS_MAVIS;
}

/**
 * Fetch the list of docks from Mavis.
 * Allows the overriding of this behavior via the environment variable
 * `KHRONOS_DOCKS`, which should be a comma-seperated list of hosts
 * (e.g., `'http://example1.com,http://example2.com'`)
 * @return {promise} Resolved with available docks
 */
Mavis.prototype.getDocks = function () {
  return Promise.resolve().bind(this)
    .then(function getDocks () {
      var docks = [];
      // check if we are overriding the docks being used
      if (process.env.KHRONOS_DOCKS) {
        docks = process.env.KHRONOS_DOCKS.split(',');
        return docks;
      } else {
        return request.getAsync(this.host)
          .spread(function (res, body) {
            docks = JSON.parse(body);
            docks = docks.map(pluck('host'));
            log.info({ docks: docks }, 'Mavis.getDocks available docks');
            return docks;
          });
      }
    })
    .catch(function (err) {
      log.error({ err: err }, 'Error in Mavis.getDocks');
      throw err;
    });
};

/**
 * Verify a given host address against Mavis. Useful for checking if a host
 * origionally from Mavis is still valid.
 * @param  {string} host Host URL to check, e.g. 'http://10.20.139.246:4242'.
 * @return {promise} Resolves with the host if it is valid, throws an error if
 *   the host is no longer in Mavis.
 */
Mavis.prototype.verifyHost = function (host) {
  return this.getDocks()
    .then(function (docks) {
      var dock = find(docks, equals(host));
      if (!dock) {
        throw new InvalidHostError('Host no longer exists in Mavis');
      }
      return host;
    });
};

function InvalidHostError (message) {
  Error.apply(this);
  this.message = message;
}
util.inherits(InvalidHostError, Error);

Mavis.InvalidHostError = InvalidHostError;

/**
 * Model for interacting with Mavis
 * @module khronos:mavis
 */
module.exports = Mavis;
