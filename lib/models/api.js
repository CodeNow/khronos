'use strict'

var Promise = require('bluebird')
var User = require('@runnable/api-client')

/**
 * Convience wrapper for the runnable api client.
 * @module khronos:models
 */
module.exports = {
  /**
   * Creates a new API client and connects to the API.
   * @param {string} token Token to use to connect to the API.
   * @return {Promise} Resolves with the newly connected API client.
   */
  connect: function (token) {
    if (!token) {
      return Promise.reject(new Error('API Token is required'))
    }
    return Promise.resolve()
      .then(function () {
        var client = Promise.promisifyAll(new User(process.env.API_URL))
        return client.githubLoginAsync(token)
          .then(function () { return client })
      })
  }
}
