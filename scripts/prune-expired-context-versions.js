/**
 * Query for context versions that are built and older than 2 weeks.
 * Delete CVs and restore if they were attached to an instance between the
 * GET and the DELETE operations
 * @module scripts/prune-expired-context-versions
 */
'use strict';

var async = require('async');

var debug = require('models/debug/debug')(__filename);
var mongodb = require('models/mongodb/mongodb');

module.exports = function(finalCB) {
  debug.log('process-expired-context-versions...');
  /**
   * query for contextversion documents
   * meeting expired criteria
   */
  var today = new Date();
  var twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(today.getDate() -
                      parseInt(process.env.KHRONOS_MAX_CV_AGE_DAYS));
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
    if (err) {
      debug.log('failed to fetch context versions', err);
      return finalCB(err);
    }
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
        notUsedInTwoWeeks,
        notCurrentlyAttachedToInstance
      ], function (err) {
        if (err) {
          return cb(false);
        }
        cb(true);
      });
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
      }
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
        removeContextVersions,
        restoreContextVersion
      ], function () {
        if (err) {
          debug.log(err);
        }
        debug.log('-----------------------------------------------------------------------');
        debug.log('finished pruneExpiredContextVersions');
        finalCB();
      });
      function removeContextVersions (removeCB) {
        mongodb.removeContextVersions(query, function (err) {
          if (err) {
            debug.log(err);
          }
          else {
            debug.log('removed '+cvblIds.length+' context versions');
          }
          removeCB();
        });
      }
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
    });
  });
};
