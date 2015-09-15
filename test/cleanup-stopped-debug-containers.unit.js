/**
 * @module test/prune-image-builder-containers.unit
 */
'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var async = require('async');
var chai = require('chai');
var dockerMock = require('docker-mock');
var fixtures = require('./fixtures');
var mavisMock = require('./mocks/mavis');
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

var cleanupStoppedDebugContainers = require('../scripts/cleanup-stopped-debug-containers');

var Container = require('dockerode/lib/container');

describe('cleanup stopped debug containers', function() {
  var server;

  before(function (done) {
    sinon.spy(Container.prototype, 'remove');
    server = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
    done();
  });

  beforeEach(function (done) {
    mavisMock();
    done();
  });

  after(function (done) {
    Container.prototype.remove.restore();
    server.close(done);
  });

  afterEach(function(done) {
    async.series([
      function deleteContainers (cb) {
        docker.listContainers({ all: true }, function (err, containers) {
          if (err) { return cb(err); }
          async.eachSeries(containers, function (container, eachCb) {
            docker.getContainer(container.Id).remove(eachCb);
          }, cb);
        });
      }
    ], function (err) {
      if (err) { return cb(err); }
      Container.prototype.remove.reset();
      console.log('finished afterEach');
      done();
    });
  });

  describe('on an empty dock', function () {
    it('should run successfully if no containers on dock', function (done) {
      cleanupStoppedDebugContainers(function () {
        expect(Container.prototype.remove.called).to.equal(false);
        done();
      });
    });
  });

  describe('on a populated dock with no debug containers', function () {
    beforeEach(function (done) {
      var numContainers = 5;
      async.series([
        function createContainers (cb) {
          async.times(numContainers, function (n, timesCb) {
            docker.createContainer({
              Image: fixtures.getRandomImageName()
            }, timesCb);
          }, cb);
        },
      ], done);
    });

    it('not remove any containers', function (done) {
      cleanupStoppedDebugContainers(function () {
        docker.listContainers({ all: true }, function (err, containers) {
          if (err) { return done(err); }
          expect(containers.length).to.equal(5);
          done();
        });
      });
    });
  });

  describe('on a populated dock with debug containers', function () {
    beforeEach(function createRegularContainers (done) {
      var numRegularContainers = 5;
      async.times(numRegularContainers, function (n, cb) {
        docker.createContainer({
          Image: fixtures.getRandomImageName()
        }, cb);
      }, done);
    });
    beforeEach(function createDebugContainers (done) {
      var numImageBuilderContainers = 2;
      async.times(numImageBuilderContainers, function (n, cb) {
        docker.createContainer({
          Image: 'deadbeef',
          Labels: { type: 'debug-container' }
        }, cb);
      }, done);
    });

    it('should only remove debug containers from dock', function (done) {
      docker.listContainers({ all: true }, function (err, containers) {
        if (err) { return done(err); }
        expect(containers.length).to.equal(7);
        cleanupStoppedDebugContainers(function () {
          expect(Container.prototype.remove.callCount).to.equal(2);
          docker.listContainers({ all: true }, function (err, containers) {
            if (err) { return done(err); }
            expect(containers.length).to.equal(5);
            done();
          });
        });
      });
    });
  });
});
