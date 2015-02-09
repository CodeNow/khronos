'use strict';

/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var Stats = require('models/datadog');
var async = require('async');
var fs = require('fs');
var isFunction = require('101/is-function');
var mavis = require('models/mavis');
var noop = require('101/noop');
var stats = new Stats('prune-expired-images');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var docker = require('models/docker/docker')();
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb')();

module.exports = function(finalCB) {
  var contextVersionBlackList = [];

  async.parallel([
    mongodb.connect.bind(mongodb),
    mavis.getDocks.bind(mavis)
  ], function (err) {
    if (err) {
      return finalCB(err);
    }
    processBlackListImages();
  });

  function processBlackListImages (cb) {
    debug.log('processBlackListImages...');
    var today = new Date();
    var twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 7*2);
    var expiredQuery = {
      'build.started': {
        '$lte': twoWeeksAgo
      },
      'build.completed': {
        '$exists': true
      },
      'build.dockerTag': {
        '$exists': true
      }
    };
    var contextVersionsCollection = db.collection('contextversions');
    contextVersionsCollection.find(expiredQuery).toArray(function (err, results) {
      console.log('context-versions fetch complete', results.length);

      async.filter(results, function (cv, cb) {
        async.series([ //could use parallel for speed, but increased load against mongo
          function notUsedInTwoWeeks (cb) {
            console.log('determine if cv used in last two weeks: '+cv['_id']);
            var query = {
              'build.created': {
                '$gte': twoWeeksAgo
              },
              'contextVersions': cv['_id']
            };
            db.collection('builds').count(query, function (err, count) {
              if (err) { return cb(err); }
              if (count === 0) {
                return cb();
              }
              cb(new Error());
            });
          },
          function notCurrentlyAttachedToInstance (cb) {
            var query = {
              'contextVersion._id': cv['_id']
            };
            db.collection('instances').count(query, function (err, count) {
              if (err) { return cb(err); }
              if (count === 0) {
                return cb();
              }
              cb(new Error());
            });
          }
        ], function (err) {
          if (err) {
            return cb(false);
          }
          cb(true);
        });
      },
      function (filteredResults) {
        contextVersionBlackList = filteredResults;
        // temporary contingency
        // preserve JSON backup of whatever images I delete
        fs.writeFilySync(__dirname + '/../logs/removed_cvs_'+(new Date()).toISOString(),
                         JSON.stringify(contextVersionBlackList, null, ' '));
        console.log('contextVersionBlackList.length', contextVersionBlackList.length);
        console.log('results.length', results.length);

        var cvblIds = contextVersionBlackList.map(function (contextVersion) {
          return new ObjectID(contextVersion._id);
        });
        //remove em'
        db.collection('contextversions').remove({
          '$in': cvblIds
        }, function () {
          console.log('removed ' + cvblIds.length + ' context versions');
          cb();
        });
      });

    });
  }
};
