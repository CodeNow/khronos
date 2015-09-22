/**
 * Mavis API requests
 * @module lib/models/mavis/mavis
 */
'use strict';

var log = require('../logger').getChild(__filename);
var pluck = require('101/pluck');
var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));

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
  var docks = [];
  return Promise.resolve().bind(this)
    .then(function getDocks () {
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
 * Model for interacting with Mavis
 * @module khronos:mavis
 */
module.exports = Mavis;
