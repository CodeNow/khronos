'use strict'

// external
const Promise = require('bluebird')

// internal
const log = require('logger').getChild(__filename)
const MongoDB = require('models/mongodb')

/**
 * MongoDB Promise.using helper.
 * @return {promise} Resolved when the MongoDB client is created.
 */
module.exports = function () {
  return Promise.resolve()
    .then(function newMongoDBConnection () {
      var mongodbClient = new MongoDB()
      mongodbClient = Promise.promisifyAll(mongodbClient)
      return mongodbClient.connectAsync()
        .then(function () { return mongodbClient })
    })
    .disposer(function destroyRabbitConnection (mongodbClient) {
      return mongodbClient.closeAsync()
        .catch(function (err) {
          log.error({ err: err }, 'mongodb cannot close')
          return true
        })
    })
}
