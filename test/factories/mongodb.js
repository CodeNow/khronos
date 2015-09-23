'use strict';

var async = require('async');
var MongoDB = require('../../lib/models/mongodb');

module.exports = {
  createInstanceWithContainers: function (containers, cb) {
    async.each(
      containers,
      function (container, cb) {
        module.exports.createInstanceWithContainer(container.id, cb);
      },
      cb);
  },
  createInstanceWithContainer: function (containerId, cb) {
    var client = new MongoDB();
    async.series([
      client.connect.bind(client),
      function (cb) {
        var data = { container: { dockerContainer: containerId } };
        client.db.collection('instances').insert([data], cb);
      }
    ], cb);
  },
  removeInstaceByQuery: function (query, cb) {
    var client = new MongoDB();
    async.series([
      client.connect.bind(client),
      function (cb) {
        client.db.collection('instances').remove(query, cb);
      }
    ], cb);
  },
  removeAllInstances: function (cb) {
    var client = new MongoDB();
    async.series([
      client.connect.bind(client),
      function (cb) {
        client.db.collection('instances').drop(cb);
      }
    ], function (err) {
      if (err && err.message === 'ns not found') {
        // this is fine, just means no instances
        return cb();
      }
      cb(err);
    });
  }
};
