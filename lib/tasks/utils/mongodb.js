'use strict'

// external
const Promise = require('bluebird')

// internal
const log = require('logger').getChild(__filename)
const MongoDB = require('models/mongodb')

let mongodbClient = new MongoDB()
mongodbClient = Promise.promisifyAll(mongodbClient)

/**
 * MongoDB Promise.using helper.
 * @return {promise} Resolved when the MongoDB client is created.
 */
module.exports = function () {
  return Promise.resolve(mongodbClient)
    .disposer(() => {
      log.info('mongodb disposer')
    })
}
module.exports.client = mongodbClient