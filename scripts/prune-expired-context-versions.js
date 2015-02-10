'use strict';

/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

var async = require('async');

var debug = require('models/debug/debug')(__filename);
var mongodb = require('models/mongodb/mongodb')();

module.exports = function(finalCB) {
  async.parallel([
    mongodb.connect.bind(mongodb)
  ], function (err) {
    if (err) {
      return finalCB(err);
    }
    processExpiredContextVersions();
  });
  function processExpiredContextVersions () {
    debug.log('processExpiredContextVersions...');
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
         * For every contextversion document that matches expired critera
         * we must perform 2 additional verifications:
         *  (1) the cv has not been attached to a build in two weeks
         *  (2) the cv is not currently attached to an instance
         * NOTE: could use async.parallel but would result in increased load against mongo
         */
        async.series([
          function notUsedInTwoWeeks (cb) {
            debug.log('determine if cv used in last two weeks: '+cv._id);
            var query = {
              'build.created': {
                '$gte': twoWeeksAgo
              },
              'contextVersions': cv._id
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
              'contextVersion._id': cv._id
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
        var cvblIds = contextVersionBlackList.map(function (contextVersion) {
          return mongodb.newObjectID(contextVersion._id);
        });
        var query = {
          '_id': {
            '$in': cvblIds
          }
        };
        /**
         * First remove all contextversion documents that matched
         * the selected criterias. Then, if any of those documents
         * where attached to an instance after our initial query,
         * reinsert them into the database.
         */
        async.series([
          function removeContextVersions (removeCB) {
            mongodb.removeContextVersions(query, function (err) {
              if (err) {
                debug.log(err);
              }
              debug.log('removed '+cvblIds.length+' context versions');
              removeCB();
            });
          },
          function restoreContextVersion (restoreCB) {
            async.eachSeries(contextVersionBlackList, function (contextVersion, cb) {
              var query = {
                'contextVersion._id': mongodb.newObjectID(contextVersion._id)
              };
              mongodb.countInstances(query, function (err, count) {
                if (err) {
                  debug.log(err);
                }
                if (!count) {
                  return cb();
                }
                // we have an instance that the contextVersion has been attached to,
                // must restore contextVersion
                debug.log('restoring contextversion id: '+contextVersion._id);
                mongodb.insertContextVersion(contextVersion, function (err) {
                  if (err) {
                    debug.log(err);
                  }
                  cb();
                });
              });
            }, restoreCB);
          }
        ], function () {
          debug.log('finished pruneExpiredContextVersions');
          finalCB();
        });
      });
    });
  }
};
