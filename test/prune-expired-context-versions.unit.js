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
      //pruneExpiredContextVersions
      done();
    });

    it('should properly restore deleted contextversions when cv '+
       'restored after initial blacklist fetch', function (done) {
      done();
    });
  });
});




/*
    describe('no images', function () {
      it('should run successfully if no images on dock', {timeout: 100000}, function (done) {
        pruneOrphanImages(function () {
          expect(Image.prototype.remove.called).to.equal(false);
          done();
        });
      });
    });

    describe('dock with images', function () {
      it('should run successfully with no orphaned images on dock', function (done) {
        var cvs = [];
        async.series([
          function createCVs (cb) {
            var contextVersions = db.collection('contextversions');
            async.times(4, function (n, cb) {
              contextVersions.insert({}, function (err, _cv) {
                cvs.push(_cv[0]);
                cb();
              });
            }, cb);
          },
          function createImages (cb) {
            async.eachLimit(cvs, 1, function (cv, cb) { // bit of a concurrency bug in tests
              var cvId = cv['_id']+''; // must cast to string
              docker.createImage({
                fromImage: 'registry.runnable.com/1616464/'+cvId,
                tag: cvId
              }, function (err) {
                if (err) { throw err; }
                cb();
              });
            }, cb);
          }
        ], function (err) {
          if (err) { throw err; }
          pruneOrphanImages(function () {
            expect(Image.prototype.remove.called).to.equal(false);
            done();
          });
        });
      });

      it('should only remove orphaned images from dock', {timeout: 1000*5}, function (done) {
        var cvs = [];
        var orphans = [];
        async.series([
          function createCVs (cb) {
            var contextVersions = db.collection('contextversions');
            async.times(1, function (n, cb) {
              contextVersions.insert({}, function (err, _cv) {
                cvs.push(_cv[0]);
                cb();
              });
            }, cb);
          },
          function createImages (cb) {
            // creating orphans
            orphans.push({'_id': new ObjectID('999017345affa9400d894407')});
            orphans.push({'_id': new ObjectID('999015ac341e8eb10b4a0328')});
            orphans.push({'_id': new ObjectID('999015ac341e8eb10b4a0329')});
            cvs = cvs.concat(orphans);
            async.eachLimit(cvs, 1, function (cv, cb) { // bit of a concurrency bug in tests
              var cvId = cv['_id']+''; // must cast to string
              docker.createImage({
                fromImage: 'registry.runnable.com/1616464/'+cvId,
                tag: cvId
              }, function (err) {
                if (err) { throw err; }
                cb();
              });
            }, cb);
          }
        ], function (err) {
          if (err) { throw err; }
          pruneOrphanImages(function () {
            expect(Image.prototype.remove.callCount).to.equal(orphans.length);
            console.log('last test!');
            done();
          });
        });
      });
    });
  });
*/
