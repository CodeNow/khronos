'use strict'

// external
var async = require('async')

// internal
var MongoDB = require('models/mongodb')

module.exports = {
  createContextVersions: function (opts, cb) {
    async.each(
      opts,
      function (opt, cb) {
        module.exports.createContextVersion(opt, cb)
      },
      cb
    )
  },
  createContextVersion: function (opts, cb) {
    module.exports._createInCollection('contextversions', opts, cb)
  },
  removeAllContextVersions: function (cb) {
    module.exports._removeAllInCollection('contextversions', cb)
  },
  createBuild: function (opts, cb) {
    module.exports._createInCollection('builds', opts, cb)
  },
  removeAllBuilds: function (cb) {
    module.exports._removeAllInCollection('builds', cb)
  },
  getContextVersions: function (cb) {
    var client = new MongoDB()
    async.series([
      client.connect.bind(client),
      function (cb) {
        client.db.collection('contextversions')
          .find({})
          .toArray(cb)
      }
    ], function (err, results) {
      if (err) { return cb(err) }
      cb(null, results[1])
    })
  },
  createInstance: function (opts, cb) {
    module.exports._createInCollection('instances', opts, cb)
  },
  createInstanceWithContainers: function (containers, cb) {
    async.each(
      containers,
      function (container, cb) {
        module.exports.createInstanceWithContainer(container.id, cb)
      },
      cb)
  },
  createInstanceWithContainer: function (containerId, cb) {
    var data = { container: { dockerContainer: containerId } }
    module.exports._createInCollection('instances', data, cb)
  },
  removeInstaceByQuery: function (query, cb) {
    var client = new MongoDB()
    async.series([
      client.connect.bind(client),
      function (cb) {
        client.db.collection('instances').remove(query, cb)
      }
    ], cb)
  },
  removeAllInstances: function (cb) {
    module.exports._removeAllInCollection('instances', cb)
  },

  _createInCollection: function (collectionName, opts, cb) {
    var client = new MongoDB()
    async.series([
      client.connect.bind(client),
      function (cb) {
        client.db.collection(collectionName).insert([opts], cb)
      }
    ], cb)
  },
  _removeAllInCollection: function (collectionName, cb) {
    var client = new MongoDB()
    async.series([
      client.connect.bind(client),
      function (cb) {
        client.db.collection(collectionName).drop(cb)
      }
    ], function (err) {
      if (err && err.message === 'ns not found') {
        return cb()
      }
      cb(err)
    })
  }
}
