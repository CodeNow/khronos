/**
 * Exports a singleton instance of the Mongodb class. Wrapper methods for
 * database operations.
 * @module lib/models/mongodb
 */
'use strict'

require('loadenv')({ debugName: 'khronos:mongodb' })

// external
const Promise = require('bluebird')
const assign = require('101/assign')
const fs = require('fs')
const MongoClient = require('mongodb').MongoClient
const ObjectID = require('mongodb').ObjectID

// internal
const datadog = require('models/datadog')('mongodb')
const log = require('logger').getChild(__filename)
const isFunction = require('101/is-function')

module.exports = Mongodb

var ca
var key
var cert

/**
 * @class
 */
function Mongodb () {
  this.host = process.env.KHRONOS_MONGO
  this.db = null

  if (process.env.MONGO_CACERT &&
      process.env.MONGO_CERT &&
      process.env.MONGO_KEY
  ) {
    try {
      log.info('loading mongodb certificates')
      ca = ca || fs.readFileSync(process.env.MONGO_CACERT, 'utf-8')
      key = key || fs.readFileSync(process.env.MONGO_KEY, 'utf-8')
      cert = cert || fs.readFileSync(process.env.MONGO_CERT, 'utf-8')
      this.ssl = {
        ssl: true,
        sslValidate: true,
        sslCA: ca,
        sslKey: key,
        sslCert: cert
      }
    } catch (err) {
      log.fatal({
        err: err
      }, 'could not read provided mongo certificates')
    }
  }
}

Mongodb.isObjectId = function (str) {
  if (!str) {
    return false
  }
  str = str.toString()
  return Boolean(str.match(/^[0-9a-fA-F]{24}$/))
}

Mongodb.prototype.connect = function (cb) {
  log.info({ mongodbHost: this.host }, 'Mongodb.prototype.connect')
  var opts = {}
  if (this.ssl) {
    opts = assign(opts, { server: this.ssl })
    log.trace('mongodb connecting with ssl')
  } else {
    log.warn('mongdb connecting without ssl')
  }
  var timer = datadog.timer('connect')
  MongoClient.connect(this.host, opts, function (err, db) {
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

Mongodb.prototype.instancesAggregate = function (query) {
  const instancesDb = this.db.collection('instances')
  return Promise.fromCallback((cb) => {
    log.trace('querying mongo')
    instancesDb.aggregate(query, cb)
  })
}

/**
 * initialize wrapped collection fetch, count, remove methods
 */
;[
  'Builds',
  'ContextVersions',
  'Instances'
].forEach(function collectionFind (collectionName) {
  var functionName = 'fetch' + collectionName
  Mongodb.prototype[functionName] = function (query, projection, cb) {
    if (isFunction(projection)) {
      cb = projection
      projection = {}
    }
    var collection = this.db.collection(collectionName.toLowerCase())
    var timer = datadog.timer(functionName)
    collection
      .find(query, projection)
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
