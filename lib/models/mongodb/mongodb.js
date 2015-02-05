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
  debug('connect');
  var timingKey = 'connect';
  datadog.startTiming(timingKey);
  MongoClient.connect(this.host, function (err, db) {
    datadog.endTiming(timingKey, 'connectionStatus'+((err) ? 'failure' : 'success'));
    this.db = db;
    cb(err);
  }.bind(this));
};

Mongodb.prototype.fetchContextVersionsForImages = function (images, cb) {
  debug('fetchContextVersions');
  var contextVersionsCollection = this.db.collection('contextversions');
  var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
  var cvIds = images.map(function (image) {
    var regexExecResult = regexImageTagCV.exec(image.RepoTags[0]);
    return new ObjectID(regexExecResult[2]);
  });
  var timingKey = 'fetchContextVersionsForImages';
  datadog.startTiming(timingKey);
  contextVersionsCollection.find({
    "_id": {
      "$in": cvIds
    }
  }).toArray(function (err, results) {
    datadog.endTiming(timingKey, 'fetchContextVersions: '+results.length+'/'+cvIds.length);
    cb(err, results);
  });
};

module.exports = function () {
  return new Mongodb();
};
