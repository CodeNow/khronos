/**
 * @module test/prune-orphan-images.unit
 */
'use strict';

require('loadenv')('khronos:test');
require('colors');

var Lab = require('lab');
var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var async = require('async');
var chai = require('chai');
var dockerMock = require('docker-mock');
var sinon = require('sinon');

var dockerNockMock = require('./mocks/docker');
var mavisMock = require('./mocks/mavis');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = chai.expect;
var it = lab.it;

// set non-default port for testing
var Docker = require('dockerode');
var docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
});

// replace private variables for testing
var debug = require('../lib/models/debug/debug')(__filename);
var mongodb = require('../lib/models/mongodb/mongodb');
var pruneOrphanImages = require('../scripts/prune-orphan-images');

var Image = require('dockerode/lib/image');
describe('prune-orphan-images'.bold.underline.green, function() {
  var db;
  var server;

  after(function (done) {
    Image.prototype.remove.restore();
    server.close(done);
  });

  before(function (done) {
    sinon.spy(Image.prototype, 'remove');
    server = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
    async.parallel([
      /* mongodb.connect to initialize connection of mongodb instance shared by script modules */
      mongodb.connect.bind(mongodb),
      MongoClient.connect.bind(MongoClient, process.env.KHRONOS_MONGO)
    ], function (err, results) {
      if (err) { debug.log(err); }
      db = results[1];
      done();
    });
  });

  beforeEach(function (done) {
    mavisMock();
    done();
  });

  afterEach(function (done) {
    if (Image.prototype.remove.reset) {
      Image.prototype.remove.reset();
    }
    async.series([
      function deleteImages (cb) {
        docker.listImages(function (err, images) {
          if (err) {
            debug.log('error list images', err);
            return cb();
          }
          async.forEach(images, function (image, eachCB) {
            docker.getImage(image.Id).remove(function (err) {
              if (err) {
                debug.log('err', err);
              }
              eachCB();
            });
          }, cb);
        });
      },
      function deleteContextVersions (cb) {
        db.collection('contextversions').drop(function () {
          debug.log('dropped contextversions collection');
          cb();
        });
      }
    ], function () {
      debug.log('finished afterEach');
      done();
    });
  });

  describe('success scenarios', function () {
    describe('no images', function () {
      it('should run successfully if no images on dock', {timeout: 100000}, function (done) {
        pruneOrphanImages(function () {
          expect(Image.prototype.remove.called).to.equal(false);
          done();
        });
      });
    });

    describe('dock with images', function () {
      beforeEach(function (done) {
        if (Image.prototype.remove.reset) {
          Image.prototype.remove.reset();
        }
        done();
      });

      it('should run successfully with no orphaned images on dock', function (done) {
        var cvs = [];
        async.series([
          function createCVs (cb) {
            var contextVersions = db.collection('contextversions');
            async.times(4, function (n, cb) {
              contextVersions.insert({}, function (err, _cv) {
                if (err) { throw err; }
                cvs.push(_cv[0]);
                cb();
              });
            }, cb);
          },
          function createImages (cb) {
            async.eachLimit(cvs, 1, function (cv, cb) { // bit of a concurrency bug in tests
              var cvId = cv._id+''; // must cast to string
              docker.createImage({
                fromImage: 'registry.runnable.com/1616464/'+cvId,
                tag: cvId
              }, function (err, data) {
                data.on('data', function () {});
                if (err) { throw err; }
                cb();
              });
            }, cb);
          }
        ], function (err) {
          if (err) { throw err; }
          pruneOrphanImages(function () {
            docker.listImages({}, function (err, images) {
              if (err) {
                throw err;
              }
              expect(images.length).to.equal(cvs.length);
              expect(Image.prototype.remove.called).to.equal(false);
              done();
            });
          });
        });
      });

      it('should only remove orphaned images from dock that are older than 1 day',
         {timeout: 5000}, function (done) {
        var cvs = [];
        var orphans = [];
        var youngOrphans = [];
        async.series([
          function createCVs (cb) {
            var contextVersions = db.collection('contextversions');
            async.times(10, function (n, cb) {
              contextVersions.insert({}, function (err, _cv) {
                if (err) { throw err; }
                cvs.push(_cv[0]);
                cb();
              });
            }, cb);
          },
          function createImages (cb) {
            // creating orphans (images without associated context versions)
            orphans.push({'_id': new ObjectID('999017345affa9400d894407')});
            orphans.push({'_id': new ObjectID('999015ac341e8eb10b4a0328')});
            orphans.push({'_id': new ObjectID('999015ac341e8eb10b4a0329')});
            youngOrphans.push({'_id': new ObjectID('999015ac341e8eb10b4a0344'), 'brandNew': true});
            cvs = cvs.concat(orphans).concat(youngOrphans);
            // will make 13 images, 3 of which will be orphans
            async.eachLimit(cvs, 1, function (cv, cb) {
              var cvId = cv._id+''; // must cast to string
              docker.createImage({
                fromImage: 'registry.runnable.com/1616464/'+cvId,
                // Docker Mock ONLY
                Created: (cv.brandNew) ? (new Date() / 1000 | 0) : 100,
                tag: cvId
              }, function (err, data) {
                data.on('data', function () {});
                if (err) { throw err; }
                cb();
              });
            }, cb);
          }
        ], function (err) {
          if (err) { throw err; }
          docker.listImages({}, function (err, images) {
            if (err) { throw err; }
            expect(images.length).to.equal(cvs.length);
            pruneOrphanImages(function () {
              docker.listImages({}, function (err, images) {
                if (err) { throw err; }
                expect(images.length).to.equal(cvs.length - orphans.length);
                expect(Image.prototype.remove.callCount).to.equal(orphans.length);
                done();
              });
            });
          });
        });
      });

      describe('special situations', function () {
        it('should also remove malformed repository name images from dock', function (done) {
          // hijack docker response, don't use docker-listener just mock docker for this request
          var scope = dockerNockMock();
          // spy on remove method and verify called
          pruneOrphanImages(function () {
            expect(scope.isDone()).to.equal(true);
            dockerNockMock.removeNock();
            done();
          });
        });
      });
    });
  });
});
