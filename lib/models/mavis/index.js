'use strict';

var request = require('request');

function Mavis () {
  this.host = process.env.KHRONOS_MAVIS;
}

/**
 * fetches list of docks from mavis server
 * @param {Fucntion} cb
 * @return {null}
 */
Mavis.prototype.getDocks = function (cb) {
  request(this.host, function (err, http, response) {
    if (err) {
      return (err);
    }
    var docks;
    try {
      docks = JSON.parse(response);
    }
    catch (err) {
      return cb(err);
    }
    cb(err, docks);
  });
};

module.exports = new Mavis();
