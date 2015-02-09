'use strict';

/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

var async = require('async');
var fs = require('fs');

var debug = require('models/debug/debug')(__filename);
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb')();

module.exports = function(finalCB) {
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
    /**
     * query for contextversion documents
     * meeting expired criteria
     */
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
    mongodb.fetchContextVersions(expiredQuery, function (err, results) {
      debug.log('context-versions fetch complete', results.length);
      async.filter(results, function (cv, cb) {
        /**
         * could use async.parallel but would result in increased load against mongo
         */
        async.series([
          function notUsedInTwoWeeks (cb) {
            debug.log('determine if cv used in last two weeks: '+cv['_id']);
            var query = {
              'build.created': {
                '$gte': twoWeeksAgo
              },
              'contextVersions': cv['_id']
            };
            mongodb.countBuilds(query, function (err, count) {
              if (err) { return cb(err); }
              if (!count) {
                return cb();
              }
              cb(new Error());
            });
          },
          function notCurrentlyAttachedToInstance (cb) {
            var query = {
              'contextVersion._id': cv['_id']
            };
            mongodb.countInstances(query, function (err, count) {
              if (err) { return cb(err); }
              if (!count) {
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
      function (contextVersionBlackList) {
        // temporary contingency
        // preserve JSON backup of whatever images I delete
        try {
          fs.writeFilySync(__dirname + '/../logs/removed_cvs_'+(new Date()).toISOString(),
                           JSON.stringify(contextVersionBlackList, null, ' '));
          debug.log('contextVersionBlackList.length', contextVersionBlackList.length);
          debug.log('results.length', results.length);
        } catch (err) {
          debug.log('error saving backup', err);
        }
        var cvblIds = contextVersionBlackList.map(function (contextVersion) {
          return mongodb.newObjectID(contextVersion._id);
        });
        var query = {
          '$in': cvblIds
        };
        //remove em'
        mongodb.removeContextVersions(query, function (err) {
          if (err) {
            debug.log(err);
          }
          debug.log('removed ' + cvblIds.length + ' context versions');
          cb();
        });
      });

    });
  }
};
