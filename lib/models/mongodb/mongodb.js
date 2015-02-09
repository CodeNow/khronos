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

Mongodb.prototype.fetchContextVersions = function (query, cb) {
  debug.log('fetchContextVersions');
  var contextVersionsCollection = this.db.collection('contextversions');
  var timingKey = 'fetchContextVersions';  //_'+JSON.stringify(query); <-- too long?
  datadog.startTiming(timingKey);
  contextVersionsCollection
    .find(query)
    .toArray(function () {
      datadog.endTiming(timingKey);
      cb.apply(this, arguments);
  });
};

module.exports = function () {
  return new Mongodb();
};
