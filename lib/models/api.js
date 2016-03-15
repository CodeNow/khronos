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
    return Promise
      .try(function () {
        if (!token) {
          throw new Error('API Token is required')
        }
        var client = Promise.promisifyAll(new User(process.env.API_URL))
        return client.githubLoginAsync(token).return(client)
      })
  }
}
