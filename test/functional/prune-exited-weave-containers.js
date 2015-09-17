/**
 * @module test/prune-exited-weave-containers.unit.js
 */
'use strict';

require('loadenv')('khronos:test');
require('colors');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = require('chai').expect;
var it = lab.it;

var Container = require('dockerode/lib/container');
var dockerFactory = require('../factories/docker');
var dockerMock = require('docker-mock');
var mavisMock = require('../mocks/mavis');
var sinon = require('sinon');

var Docker = require('dockerode');
var docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
});

var pruneExitedWeaveContainers = require('../../scripts/prune-exited-weave-containers');

describe('prune-exited-weave-containers'.bold.underline.green, function () {
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
  afterEach(function (done) {
    dockerFactory.deleteAllImagesAndContainers(docker, done);
  });
  afterEach(function (done) {
    // reset the spy to a clean state after every test
    Container.prototype.remove.reset();
    done();
  });
  after(function (done) {
    Container.prototype.remove.restore();
    server.close(done);
  });

  it('should run successfully if no containers on dock', function (done) {
    sinon.spy(pruneExitedWeaveContainers, '_removeDeadWeaveContainersOnDock');
    pruneExitedWeaveContainers.run(function (err) {
      if (err) { return done(err); }
      expect(Container.prototype.remove.called).to.equal(false);
      // the final function should have been called once for each dock (1 total)
      expect(pruneExitedWeaveContainers._removeDeadWeaveContainersOnDock.calledOnce)
        .to.be.true();
      pruneExitedWeaveContainers._removeDeadWeaveContainersOnDock.restore();
      done();
    });
  });

  describe('on a populated dock', function () {
    beforeEach(dockerFactory.createRandomContainers.bind(null, docker, 5));

    it('should run successfully if no weave containers on dock', function (done) {
      sinon.spy(pruneExitedWeaveContainers, '_removeDeadWeaveContainersOnDock');
      pruneExitedWeaveContainers.run(function (err) {
        if (err) { return done(err); }
        docker.listContainers({ all: true }, function (err, containers) {
          if (err) { return done(err); }
          // the final function should have been called once for each dock (1 total)
          expect(pruneExitedWeaveContainers._removeDeadWeaveContainersOnDock.calledOnce)
            .to.be.true();
          expect(containers.length).to.equal(5);
          expect(Container.prototype.remove.called).to.equal(false);
          done();
        });
      });
    });

    describe('where weave containers are present', function () {
      beforeEach(dockerFactory.createWeaveContainers.bind(null, docker, 2));

      it('should only remove dead weave containers', function (done) {
        pruneExitedWeaveContainers.run(function (err) {
          if (err) { return done(err); }
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
