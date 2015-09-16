/**
 * @module test/prune-expired-context-versions.unit
 */
'use strict';

require('loadenv')('khronos:test');
require('colors');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = require('chai').expect;
var it = lab.it;

var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var async = require('async');
var mongodb = require('models/mongodb');
var sinon = require('sinon');

var pruneExpiredContextVersions = require('../../scripts/prune-expired-context-versions');

describe('prune-expired-context-versions'.bold.underline.green, function () {
  var db;
  before(function (done) {
    sinon.spy(mongodb, 'fetchContextVersions');
    async.parallel([
      /* mongodb.connect to initialize connection of mongodb instance shared by script modules */
      mongodb.connect.bind(mongodb),
      MongoClient.connect.bind(MongoClient, process.env.KHRONOS_MONGO)
    ], function (err, results) {
      if (err) {
        console.log(err);
      }
      db = results[1];
      done();
    });
  });

  afterEach(function (done) {
    if (mongodb.fetchContextVersions.reset) {
      mongodb.fetchContextVersions.reset();
    }
    done();
  });

  beforeEach({timeout: 1000*10}, function (done) {
    var collections = [
      'builds',
      'contextversions',
      'instances'
    ];
    async.eachSeries(collections, function (collectionName, cb) {
      db.collection(collectionName).drop(function () { cb(); });
    }, done);
  });

  describe('success scenarios', function () {
    it('should successfully run if no contextversions', function (done) {
      pruneExpiredContextVersions(function () {
        expect(mongodb.fetchContextVersions.callCount).to.equal(1);
        done();
      });
    });

    it('should only remove contextversions that fit selection criteria', function (done) {
      var testData = [{
        _id: new ObjectID('54da9cb6ed4383c43fb1504a'),
        build: {
          started: new Date(1980, 1, 1),
          completed: true,
          dockerTag: true
        }
      }, {
        _id: new ObjectID('54da9cb6ed4383c43fb1504e'),
        build: {
          started: new Date(),
          complete: true,
          dockerTag: true
        }
      }, {
        _id: new ObjectID('54da9cb6ed4383c43fb15049'),
        build: {
          started: new Date(2015, 1, 1),
          complete: true,
          dockerTag: true
        }
      }];
      var cv = db.collection('contextversions');
      cv.insert(testData, function (err) {
        if (err) { throw err; }
        pruneExpiredContextVersions(function () {
          cv.find({}).toArray(function (err, results) {
            expect(results.length).to.equal(2);
            /**
             * 2nd cv removed b/c started > cutoff datetime
             */
            expect(results[0]._id.toString()).to.equal('54da9cb6ed4383c43fb1504e');
            expect(results[1]._id.toString()).to.equal('54da9cb6ed4383c43fb15049');
            done();
          });
        });
      });
    });

    /*
    it('should properly restore deleted contextversions when cv '+
       'restored after initial blacklist fetch', function (done) {
      var testData = [{
        _id: ObjectID('54da9cb6ed4383c43fb1504a'),
        build: {
          started: new Date(1980, 1, 1),
          completed: true,
          dockerTag: true
        }
      }, {
        _id: ObjectID('54da9cb6ed4383c43fb1504e'),
        build: {
          started: new Date(),
          complete: true,
          dockerTag: true
        }
      }];
      var cv = db.collection('contextversions');
      cv.insert(testData, function (err) {
        if (err) { throw err; }
        pruneExpiredContextVersions(function () {
          cv.find({}).toArray(function (err, results) {
            expect(results.length).to.equal(1);
            expect(results[0]._id.toString()).to.equal('54da9cb6ed4383c43fb1504e');
            done();
          });
        });
      });
      done();
    });
    */

  });
});
