/* eslint-disable */
/**
 * Query for context versions that are built and older than 2 weeks.
 * Delete CVs and restore if they were attached to an instance between the
 * GET and the DELETE operations
 * @module scripts/prune-expired-context-versions
 */
'use strict'

var async = require('async')

var log = require('logger').getChild(__filename)
var mongodb = require('models/mongodb')

module.exports = function (finalCB) {
  log.info('process-expired-context-versions start')
  /**
   * query for contextversion documents
   * meeting expired criteria
   */
  var today = new Date()
  var twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(today.getDate() -
    parseInt(process.env.KHRONOS_MAX_CV_AGE_DAYS))
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
  }
  mongodb.fetchContextVersions(expiredQuery, function (err, results) {
    if (err) {
      log.error({
        expiredQuery: expiredQuery,
        err: err
      }, 'mongodb.fetchContextVersions fetch error')
      return finalCB(err)
    }
    log.trace({
      resultsLength: results.length
    }, 'context-versions fetch complete')
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
          return cb(false)
        }
        cb(true)
      })
      function notUsedInTwoWeeks (cb) {
        log.trace({
          cvId: cv._id
        }, 'notUsedInTwoWeeks')
        var query = {
          'build.created': {
            '$gte': twoWeeksAgo
          },
          'contextVersions': cv._id
        }
        mongodb.countBuilds(query, function (err, count) {
          if (err) {
            log.error({
              query: query
            }, 'notUsedInTwoWeeks mongodb.countBuilds error')
            return cb(err)
          }
          if (!count) {
            log.trace('notUsedInTwoWeeks mongodb.countBuilds !count')
            return cb()
          }
          log.trace({
            cvId: cv._id,
            count: count
          }, 'notUsedInTwoWeeks mongodb.countBuilds success')
          cb(new Error())
        })
      }
      function notCurrentlyAttachedToInstance (cb) {
        log.trace({
          cvId: cv._id
        }, 'notCurrentlyAttachedToInstance')
        var query = {
          'contextVersion._id': cv._id
        }
        mongodb.countInstances(query, function (err, count) {
          if (err) {
            log.error({
              cvId: cv._id,
              err: err
            }, 'notCurrentlyAttachedToInstance mongodb.countInstances error')
            return cb(err)
          }
          if (!count) {
            log.trace({
              cvId: cv._id
            }, 'notCurrentlyAttachedToInstance mongodb.countInstances !count')
            return cb()
          }
          log.trace({
            cvId: cv._id,
            count: count
          }, 'notCurrentlyAttachedToInstance mongodb.countInstances success')
          cb(new Error())
        })
      }
    },
      function (contextVersionBlackList) {
        var cvblIds = contextVersionBlackList.map(function (contextVersion) {
          return mongodb.newObjectID(contextVersion._id)
        })
        var query = {
          '_id': {
            '$in': cvblIds
          }
        }
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
            log.error({
              err: err
            }, 'prune-expired-context-versions error')
          }
          log.info('prune-expired-context-versions success')
          finalCB()
        })
        function removeContextVersions (removeCB) {
          log.trace({
            query: query
          }, 'removeContextVersions')
          mongodb.removeContextVersions(query, function (err) {
            if (err) {
              log.error({
                query: query,
                err: err
              }, 'removeContextVersions error')
            } else {
              log.trace({
                contextVersionsRemovedLength: cvblIds.length
              }, 'removeContextVersions success')
            }
            removeCB()
          })
        }
        function restoreContextVersion (restoreCB) {
          log.trace({
            contextVersionBlackListLength: contextVersionBlackList.length
          }, 'restoreContextVersion')
          async.eachSeries(contextVersionBlackList, function (contextVersion, cb) {
            var query = {
              'contextVersion._id': mongodb.newObjectID(contextVersion._id)
            }
            log.trace({
              cvId: contextVersion._id
            }, 'restoreContextVersion async.eachSeries(contextVersionBlackList) pre-count-instances')
            mongodb.countInstances(query, function (err, count) {
              if (err) {
                log.error({
                  cvId: contextVersion._id,
                  err: err
                }, 'restoreContextVersion mongodb.countInstances error')
              }
              if (!count) {
                return cb()
              }
              // we have an instance that the contextVersion has been attached to,
              // must restore contextVersion
              log.trace({
                cvId: contextVersion._id
              }, 'restoreContextVersion')
              mongodb.insertContextVersion(contextVersion, function (err) {
                if (err) {
                  log.error({
                    cvId: contextVersion._id,
                    err: err
                  }, 'restoreContextVersion mongodb.insertContextVersion error')
                } else {
                  log.trace({
                    cvId: contextVersion._id
                  }, 'restoreContextVersion mongodb.insertContextVersion success')
                }
                cb()
              })
            })
          }, restoreCB)
        }
      })
  })
}
