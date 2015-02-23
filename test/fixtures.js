/**
 * Helper methods for tests
 * @module fixtures.js
 */
'use strict';

var crypto = require('crypto');

/**
 * Generates a single hex-encoded sha256 digest string
 * @return String
 */
function randomHash () {
  var shasum = crypto
    .createHash('sha256')
    .update(Math.random()+'');
  return shasum.digest('hex');
}

module.exports = {
  /**
   * Generates a random, valid docker image name string
   * @return String
   */
  getRandomImageName: function () {
    return process.env.KHRONOS_DOCKER_REGISTRY+
      randomHash().substr(0, 6)+
      '/'+
      randomHash().substr(0, 24)+
      ':'+
      randomHash().substr(0, 24);
  }
};
