/**
 * Exports a singleton instance of the Mongodb
 * class. Wrapper methods for database operations.
 * @module lib/models/mongodb/mongodb
 */
'use strict';

var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;

var datadog = require('models/datadog/datadog')(__filename);
var log = require('logger').getChild(__filename);

module.exports = new Mongodb();

/**
 * @class
 */
function Mongodb () {
  this.host = process.env.KHRONOS_MONGO;
  this.db = null;
}

Mongodb.prototype.connect = function (cb) {
  log.info({
    mongodbHost: process.env.KHRONOS_MONGO
  }, 'Mongodb.prototype.connect');
  var timingKey = 'connect';
  datadog.startTiming(timingKey);
  MongoClient.connect(this.host, function (err, db) {
    if (err) {
      log.error({
        host: this.host,
        err: err
      }, 'Mongodb.prototype.connect connect error');
    }
    else {
      log.trace({
        host: this.host,
      }, 'Mongodb.prototype.connect connect success');
    }
    datadog.endTiming(timingKey, 'connectionStatus'+((err) ? 'failure' : 'success'));
    this.db = db;
    cb(err);
  }.bind(this));
};

Mongodb.prototype.newObjectID = function (id) {
  return new ObjectID(id);
};

/**
 * initialize wrapped collection fetch, count, remove methods
 */
[
  'Builds',
  'ContextVersions',
  'Instances'
].forEach(function collectionFind (collectionName) {
  var functionName = 'fetch'+collectionName;
  Mongodb.prototype[functionName] = function (query, cb) {
    var collection = this.db.collection(collectionName.toLowerCase());
    var timingKey = functionName;  //_'+JSON.stringify(query); <-- too long?
    datadog.startTiming(timingKey);
    collection
      .find(query)
      .toArray(function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] fetch failed');
        }
        datadog.endTiming(timingKey);
        cb.apply(this, arguments);
    });
  };
});

[
  'Builds',
  'Instances'
].forEach(function collectionCount (collectionName) {
  var functionName = 'count'+collectionName;
  Mongodb.prototype[functionName] = function (query, cb) {
    var collection = this.db.collection(collectionName.toLowerCase());
    var timingKey = functionName;
    datadog.startTiming(timingKey);
    collection
      .count(query, function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] count failed');
        }
        datadog.endTiming(timingKey);
        cb.apply(this, arguments);
      });
  };
});

[
  'ContextVersions'
].forEach(function collectionRemove (collectionName) {
  var functionName = 'remove'+collectionName;
  Mongodb.prototype[functionName] = function (query, cb) {
    var collection = this.db.collection(collectionName.toLowerCase());
    var timingKey = functionName;
    datadog.startTiming(timingKey);
    collection
      .remove(query, function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] remove failed');
        }
        datadog.endTiming(timingKey);
        cb.apply(this, arguments);
      });
  };
});

[
  'ContextVersions'
].forEach(function collectionInsert (collectionName) {
  var functionName = 'insert'+collectionName;
  Mongodb.prototype[functionName] = function (models, cb) {
    if (!Array.isArray(models)) {
      models = [models];
    }
    var collection = this.db.collection(collectionName.toLowerCase());
    var timingKey = functionName;
    datadog.startTiming(timingKey);
    collection
      .insert(models, function (err) {
        if (err) {
          log.error({
            collection: collectionName,
            err: err
          }, 'Monogodb.prototype[functionName] insert failed');
        }
        datadog.endTiming(timingKey);
        cb.apply(this, arguments);
      });
  };
});
