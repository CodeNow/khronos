var async = require('async');
var chai = require('chai');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var rewire = require('rewire');
var sinon = require('sinon');
var mocks = require('./mocks');

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var expect = chai.expect;


// set non-default port for testing
var Docker = require('dockerode');
var docker = Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
});

var dockerMock = require('docker-mock');
dockerMock.listen(process.env.KHRONOS_DOCKER_HOST);

// replace private variables for testing
var pruneOrphanImages = rewire('../scripts/prune-orpahn-images');

var Image = require('dockerode/lib/image');
sinon.spy(Image.prototype, 'remove');

describe('prune-orphan-images', function() {
  beforeEach(function (done) {
    docker.createImage({}, done);
  });

  afterEach(function (done) {
    Image.prototype.remove.reset();
    docker.listImages(function (err, images) {
      if (err) throw err;
      async.forEach(images, function (image, cb) {
        image.remove(cb);
      }, done);
    });
  });

  describe('success scenarios', function () {
    it('should run successfully if no images on dock', function (done) {
      done();
    });

    it('should run successfully with no orphaned images on dock', function (done) {
    });

    it('should only remove orphaned images from dock', function (done) {

    });
  });

}
