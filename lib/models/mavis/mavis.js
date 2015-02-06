'use strict';

var request = require('request');

function Mavis () {
  this.host = process.env.KHRONOS_MAVIS;
  this.docks = [];
}

/**
 * fetches list of docks from mavis server
 * @param {Fucntion} cb
 * @return {null}
 */
Mavis.prototype.getDocks = function (cb) {
  this.docks = [];
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
    this.docks = docks;
    cb(err);
  }.bind(this));
};

module.exports = function () {
  return new Mavis();
};
