var Lab = require('lab');
var MongoClient = require('mongodb').MongoClient;
var async = require('async');
var chai = require('chai');
var dockerMock = require('docker-mock');
var rewire = require('rewire');
var sinon = require('sinon');

var lab = exports.lab = Lab.script();

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
//var beforeEach = lab.beforeEach;
//var after = lab.after;
var afterEach = lab.afterEach;
var expect = chai.expect;

require('../lib/loadenv');

dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);

// set non-default port for testing
var Docker = require('dockerode');
var docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
});

// replace private variables for testing
var pruneOrphanImages = rewire('../scripts/prune-orphan-images');

var Image = require('dockerode/lib/image');
sinon.spy(Image.prototype, 'remove');

describe('prune-orphan-images', function() {

  var db;

  before(function (done) {
    MongoClient.connect(process.env.KHRONOS_MONGO, function (err, _db) {
      if (err) { throw err; }
      db = _db;
      done();
    });
  });

  afterEach(function (done) {
    Image.prototype.remove.reset();
    docker.listImages(function (err, images) {
      console.log('images', images);
      if (err) { throw err; }
      async.forEach(images, function (image, cb) {
        docker.getImage(image.Id).remove(function () {
          console.log('p1', arguments);
          cb();
        });
      }, done);
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
      it('should run successfully with no orphaned images on dock', function (done) {
        var images;
        var cv;
        async.series([
          function createCVs (cb) {
            var contextVersions = db.collection('contextversions');
            contextVersions.insert({}, function (err, _cv) {
              cv = _cv[0];
              cb();
            });
          },
          function createImages (cb) {
            docker.createImage({
              fromImage: 'ubuntu',
              tag: (cv['_id']+'') // must cast to string
            }, function (err) {
              if (err) { throw err; }
              docker.listImages(function (err, _images) {
                images = _images;
                cb();
              });
            });
          }
        ], function (err) {
          if (err) { throw err; }
          done();
        });
        // add images to dock
      });

      it('should only remove orphaned images from dock', function (done) {
        done();
      });
    });
  });
});
