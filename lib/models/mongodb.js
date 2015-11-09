/**
 * Exports a singleton instance of the Mongodb class. Wrapper methods for
 * database operations.
 * @module lib/models/mongodb
 */
'use strict'

// external
var MongoClient = require('mongodb').MongoClient
var ObjectID = require('mongodb').ObjectID

// internal
var datadog = require('models/datadog')('mongodb')
var log = require('logger').getChild(__filename)

module.exports = Mongodb

/**
 * @class
 */
function Mongodb () {
  this.host = process.env.KHRONOS_MONGO
  this.db = null
}

Mongodb.prototype.connect = function (cb) {
  log.info({ mongodbHost: this.host }, 'Mongodb.prototype.connect')
  var timer = datadog.timer('connect')
  MongoClient.connect(this.host, function (err, db) {
    if (err) {
      log.error({
        host: this.host,
        err: err
      }, 'Mongodb.prototype.connect connect error')
      return cb(err)
    }
    log.trace({ host: this.host }, 'Mongodb.prototype.connect connect success')
    timer.stop()
    this.db = db
    cb()
  }.bind(this))
}

Mongodb.prototype.close = function (cb) {
  this.db.close(cb)
}

Mongodb.prototype.newObjectID = function (id) { return new ObjectID(id) }

/**
 * initialize wrapped collection fetch, count, remove methods
 */
;[
  'Builds',
  'ContextVersions',
  'Instances'
].forEach(function collectionFind (collectionName) {
  var functionName = 'fetch' + collectionName
  Mongodb.prototype[functionName] = function (query, cb) {
    var collection = this.db.collection(collectionName.toLowerCase())
    var timer = datadog.timer(functionName)
    collection
      .find(query)
      .toArray(function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] fetch failed')
        }
        timer.stop()
        cb.apply(this, arguments)
      })
  }
})

;[
  'Builds',
  'ContextVersions',
  'Instances'
].forEach(function collectionCount (collectionName) {
  var functionName = 'count' + collectionName
  Mongodb.prototype[functionName] = function (query, cb) {
    var collection = this.db.collection(collectionName.toLowerCase())
    var timer = datadog.timer(functionName)
    collection
      .count(query, function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] count failed')
        }
        timer.stop()
        cb.apply(this, arguments)
      })
  }
})

;[
  'ContextVersions'
].forEach(function collectionRemove (collectionName) {
  var functionName = 'remove' + collectionName
  Mongodb.prototype[functionName] = function (query, cb) {
    var collection = this.db.collection(collectionName.toLowerCase())
    var timer = datadog.timer(functionName)
    collection
      .remove(query, function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] remove failed')
        }
        timer.stop()
        cb.apply(this, arguments)
      })
  }
})

;[
  'ContextVersions'
].forEach(function collectionInsert (collectionName) {
  var functionName = 'insert' + collectionName
  Mongodb.prototype[functionName] = function (models, cb) {
    if (!Array.isArray(models)) {
      models = [models]
    }
    var collection = this.db.collection(collectionName.toLowerCase())
    var timer = datadog.timer(functionName)
    collection
      .insert(models, function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] insert failed')
        }
        timer.stop()
        cb.apply(this, arguments)
      })
  }
})
