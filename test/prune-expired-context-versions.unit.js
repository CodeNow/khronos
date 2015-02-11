var Lab = require('lab');
var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var async = require('async');
var chai = require('chai');
var dockerMock = require('docker-mock');
var rewire = require('rewire');
var sinon = require('sinon');
var createCounter = require('callback-count');

var lab = exports.lab = Lab.script();

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
//var after = lab.after;
var afterEach = lab.afterEach;
var expect = chai.expect;

require('../lib/loadenv');

// replace private variables for testing
var pruneExpiredContextVersions = rewire('../scripts/prune-expired-context-versions');
var mongodb = pruneExpiredContextVersions.__get__('mongodb');

sinon.spy(mongodb, 'fetchContextVersions');

describe('prune-expired-context-versions', function() {

  var db;

  before(function (done) {
    MongoClient.connect(process.env.KHRONOS_MONGO, function (err, _db) {
      if (err) { throw err; }
      db = _db;
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
