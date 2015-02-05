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
  var noop = require('101/noop');
  var request = require('request');
  var stats = new Stats('prune-expired-images');

  module.exports = function(finalCB) {

    if (!isFunction(finalCB)) {
      finalCB = noop;
    }

    // for datadog statsd timing
    var startPrune = new Date();
    var activeDocks;
    var db;
    var contextVersionBlackList = [];

    var initializationFunctions = [connectToMongoDB];

    if (process.env.KHRONOS_DOCKER_HOST) {
      initializationFunctions.push(fetchActiveDocksFromConfiguration);
    }
    else {
      initializationFunctions.push(fetchActiveDocksFromMavis);
    }

    async.parallel(initializationFunctions, function (err) {
      if (err) { throw err; }
      async.series([
        fetchImagesBlacklist
      ], function (err) {
        console.log('prune expired images complete');
        if (err) { throw err; }
        finalCB();
      });
    });

    function connectToMongoDB (cb) {
      console.log('connecting to mongodb', process.env.KHRONOS_MONGO);
      MongoClient.connect(process.env.KHRONOS_MONGO, function (err, _db) {
        console.log('connected to mongodb');
        db = _db;
        cb(err);
      });
    }

    function fetchActiveDocksFromConfiguration (cb) {
      console.log('fetching docks from configuration');
      activeDocks = [{
        host: ('http://'+
          process.env.KHRONOS_DOCKER_HOST+
          ':'+
          process.env.KHRONOS_DOCKER_PORT)
      }];
      cb();
    }

    function fetchActiveDocksFromMavis (cb) {
      console.log('fetching docks from mavis');
      request(process.env.KHRONOS_MAVIS, function (err, http, response) {
        try {
          activeDocks = JSON.parse(response);
        }
        catch (e) {
          return cb(e);
        }
        cb(err);
      });
    }

    function fetchImagesBlacklist (cb) {
      console.log('fetching images black list');
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
