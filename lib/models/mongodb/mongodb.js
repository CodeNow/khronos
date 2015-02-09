'use strict';

var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);

function Mongodb () {
  this.host = process.env.KHRONOS_MONGO;
  this.db = null;
}

Mongodb.prototype.connect = function (cb) {
  debug.log('connect');
  var timingKey = 'connect';
  datadog.startTiming(timingKey);
  MongoClient.connect(this.host, function (err, db) {
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
  'ContextVersions'
].forEach(function (collectionName) {
  var functionName = 'fetch'+collectionName;
  Mongodb.prototype[functionName] = function (query, cb) {
    debug.log(functionName);
    var collection = this.db.collection(collectionName.toLowerCase());
    var timingKey = functionName;  //_'+JSON.stringify(query); <-- too long?
    datadog.startTiming(timingKey);
    collection
      .find(query)
      .toArray(function () {
        datadog.endTiming(timingKey);
        cb.apply(this, arguments);
    });
  };
});

[
  'Builds',
  'Instances'
].forEach(function (collectionName) {
  var functionName = 'count'+collectionName;
  Mongodb.prototype[functionName] = function (query, cb) {
    debug.log(functionName);
    var collection = this.db.collection(collectionName.toLowerCase());
    var timingKey = functionName;
    datadog.startTiming(timingKey);
    collection
      .count(query, function () {
        datadog.endTiming(timingKey);
        cb.apply(this, arguments);
      });
  };
});

[
  'ContextVersions'
].forEach(function (collectionName) {
  var functionName = 'remove'+collectionName;
  Mongodb.prototype[functionName] = function (query, cb) {
    debug.log(functionName);
    var collection = this.db.collection(collectionName.toLowerCase());
    var timingKey = functionName;
    datadog.startTiming(timingKey);
    collection
      .remove(query, function () {
        datadog.endTiming(timingKey);
        cb.apply(this, arguments);
      });
  };
});

module.exports = function () {
  return new Mongodb();
};
