/**
 * Mavis API requests
 * @module lib/models/mavis/mavis
 */
'use strict';

var request = require('request');

module.exports = function () {
  return new Mavis();
};

/**
 * @class
 */
function Mavis () {
  this.host = process.env.KHRONOS_MAVIS;
  this.docks = [];
}

/**
 * fetches list of docks from mavis server
 * @param {Fucntion} cb
 */
Mavis.prototype.getDocks = function (cb) {
  this.docks = [];
  if (process.env.KHRONOS_DOCKS) {
    this.docks = process.env.KHRONOS_DOCKS.split(',');
    return cb();
  }
  request(this.host, function (err, http, response) {
    if (err) {
      return cb(err);
    }
    var docks;
    try {
      docks = JSON.parse(response);
    }
    catch (err) {
      return cb(err);
    }
    this.docks = docks.map(function (dock) {
      return dock.host;
    });
    cb(err);
  }.bind(this));
};
