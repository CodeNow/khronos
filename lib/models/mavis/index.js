/**
 * Mavis API requests
 * @module lib/models/mavis/mavis
 */
'use strict';

var log = require('logger').getChild(__filename);
var pluck = require('101/pluck');
var request = require('request');

module.exports = Mavis;

/**
 * @class
 */
function Mavis () {
  this.host = process.env.KHRONOS_MAVIS;
}

/**
 * fetches list of docks from mavis server
 * @param {Fucntion} cb
 */
Mavis.prototype.getDocks = function (cb) {
  var docks = [];
  // check if we are overriding the docks being used
  if (process.env.KHRONOS_DOCKS) {
    docks = process.env.KHRONOS_DOCKS.split(',');
    cb(null, docks);
  } else {
    request.get(this.host, function (err, res, body) {
      if (err) {
        log.error({ err: err }, 'Mavis.getDocks error');
        return cb(err);
      }
      try {
        docks = JSON.parse(body);
      } catch (err) {
        return cb(err);
      }
      docks = docks.map(pluck('host'));
      cb(null, docks);
    });
  }
};
