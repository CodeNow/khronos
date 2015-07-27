/**
 * @module test/prune-exited-weave-containers.unit.js
 */
'use strict';

require('loadenv')('khronos:test');
require('colors');

var Lab = require('lab');
var async = require('async');
var chai = require('chai');
var dockerMock = require('docker-mock');
var fixtures = require('./fixtures');
var mavisMock = require('./mocks/mavis');
var rewire = require('rewire');
var sinon = require('sinon');

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

var pruneExitedWeaveContainers = rewire('../scripts/prune-exited-weave-containers');

var Container = require('dockerode/lib/container');

describe('prune-exited-weave-containers'.bold.underline.green, function() {
  var server;

  after(function (done) {
    Container.prototype.remove.restore();
    server.close(done);
  });

  before(function (done) {
    sinon.spy(Container.prototype, 'remove');
    server = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
    done();
  });

  beforeEach(function (done) {
    mavisMock();
    done();
  });

  afterEach(function(done) {
    async.series([
      function deleteImages (cb) {
        docker.listImages(function (err, images) {
          if (err) {
            console.log(err);
            cb();
          }
          async.forEach(images, function (image, eachCB) {
            docker.getImage(image.Id).remove(function (err) {
              if (err) {
                console.log('err', err);
              }
              eachCB();
            });
          }, function () {
            cb();
          });
        });
      },
      function deleteContainers (cb) {
        docker.listContainers({all: true}, function (err, containers) {
          if (err) { throw err; }
          async.eachSeries(containers, function (container, cb) {
            docker.getContainer(container.Id).remove(cb);
          }, cb);
        });
      }
    ], function () {
      if (Container.prototype.remove.reset) {
        Container.prototype.remove.reset();
      }
      console.log('finished afterEach');
      done();
    });
  });

  it('should run successfully if no containers on dock', function (done) {
    pruneExitedWeaveContainers(function () {
      expect(Container.prototype.remove.called).to.equal(false);
      done();
    });
  });

  it('should run successfully if no weave containers on dock', function (done) {
    var numContainers = 5;
    async.series([
      function createContainers (cb) {
        async.times(numContainers, function (n, cb) {
          docker.createContainer({
            Image: fixtures.getRandomImageName()
          }, function (err) {
            if (err) { throw err; }
            cb();
          });
        }, cb);
      }
    ], function () {
      pruneExitedWeaveContainers(function () {
        docker.listContainers({all: true}, function (err, containers) {
          if (err) { throw err; }
          expect(containers.length).to.equal(numContainers);
          done();
        });
      });
    });
  });

  it('should only remove dead weave containers', function (done) {
    var numContainers = 5;
    var numWeaveContainers = 2;
    async.series([
      function createContainers (cb) {
        async.times(numContainers, function (n, cb) {
          docker.createContainer({
            Image: fixtures.getRandomImageName()
          }, function (err) {
            if (err) { throw err; }
            cb();
          });
        }, cb);
      },
      function createWeaveContainers (cb) {
        async.times(numWeaveContainers, function (n, cb) {
          docker.createContainer({
            Image: 'zettio/weavetools:0.9.0'
          }, function (err) {
            if (err) { throw err; }
            cb();
          });
        }, cb);
      }
    ], function () {
      async.series([
        function (cb) {
          docker.listContainers({all: true}, function (err, containers) {
            expect(containers.length).to.equal(numContainers + numWeaveContainers);
            cb();
          });
        },
        function (cb) {
          pruneExitedWeaveContainers(function () {
            docker.listContainers({all: true}, function (err, containers) {
              if (err) { throw err; }
              expect(containers.length).to.equal(numContainers);
              cb();
            });
          });
        }
      ], done);
    });
  });

});
