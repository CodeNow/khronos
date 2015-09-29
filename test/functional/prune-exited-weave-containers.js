'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = require('chai').expect;
var it = lab.it;

// external
var async = require('async');
var Container = require('dockerode/lib/container');
var Docker = require('dockerode');
var dockerMock = require('docker-mock');
var Hermes = require('runnable-hermes');
var ponos = require('ponos');
var sinon = require('sinon');

// internal
var dockerFactory = require('../factories/docker');

var docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
});

describe('Prune Exited Weave Containers', function () {
  var tasks = {
    'khronos:containers:delete': require('../../lib/tasks/containers/delete'),
    'khronos:weave:prune-dock': require('../../lib/tasks/weave/prune-dock'),
    'khronos:weave:prune': require('../../lib/tasks/weave/prune')
  };
  var hermes = new Hermes({
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    queues: Object.keys(tasks)
  });
  var dockerMockServer;
  var workerServer;

  before(function (done) {
    dockerMockServer = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
    done();
  });
  beforeEach(function (done) {
    process.env.KHRONOS_DOCKS =
      'http://localhost:' + process.env.KHRONOS_DOCKER_PORT;
    sinon.spy(Container.prototype, 'remove');
    sinon.spy(tasks, 'khronos:weave:prune-dock');
    sinon.spy(tasks, 'khronos:containers:delete');
    workerServer = new ponos.Server({ hermes: hermes });
    workerServer.setAllTasks(tasks)
      .then(workerServer.start())
      .then(function () { done(); })
      .catch(done);
  });
  afterEach(function (done) {
    workerServer.stop()
      .then(function () { done(); })
      .catch(done);
  });
  afterEach(function (done) {
    process.env.KHRONOS_DOCKS = null;
    Container.prototype.remove.restore();
    tasks['khronos:weave:prune-dock'].restore();
    tasks['khronos:containers:delete'].restore();
    dockerFactory.deleteAllImagesAndContainers(docker, done);
  });
  after(function (done) {
    dockerMockServer.close(done);
  });

  describe('unpopulated dock', function () {
    it('should run successfully', function (done) {
      workerServer.hermes.publish('khronos:weave:prune', {});
      async.until(
        function () {
          return tasks['khronos:weave:prune-dock'].callCount === 1;
        },
        function (cb) { setTimeout(cb, 50); },
        function (err) {
          if (err) { return done(err); }
          expect(Container.prototype.remove.callCount).to.equal(0);
          setTimeout(done, 100);
        });
    });
  });

  describe('on a populated dock', function () {
    beforeEach(dockerFactory.createRandomContainers.bind(null, docker, 5));

    it('should run successfully with no weave containers', function (done) {
      workerServer.hermes.publish('khronos:weave:prune', {});
      async.until(
        function () {
          return tasks['khronos:weave:prune-dock'].callCount === 1;
        },
        function (cb) { setTimeout(cb, 50); },
        function (err) {
          if (err) { return done(err); }
          expect(Container.prototype.remove.callCount).to.equal(0);
          docker.listContainers(function (err, containers) {
            if (err) { return done(err); }
            expect(containers).to.have.length(5);
            setTimeout(done, 100);
          });
        });
    });
    it('should run successfully on multiple docks', function (done) {
      process.env.KHRONOS_DOCKS =
        process.env.KHRONOS_DOCKS + ',' + process.env.KHRONOS_DOCKS;
      workerServer.hermes.publish('khronos:weave:prune', {});
      async.until(
        function () {
          return tasks['khronos:weave:prune-dock'].callCount === 2;
        },
        function (cb) { setTimeout(cb, 50); },
        function (err) {
          if (err) { return done(err); }
          expect(Container.prototype.remove.callCount).to.equal(0);
          docker.listContainers(function (err, containers) {
            if (err) { return done(err); }
            expect(containers).to.have.length(5);
            setTimeout(done, 100);
          });
        });
    });

    describe('where weave containers are present', function () {
      beforeEach(dockerFactory.createWeaveContainers.bind(null, docker, 2));

      it('should only remove dead weave containers', function (done) {
        workerServer.hermes.publish('khronos:weave:prune', {});
        async.until(
          function () {
            return tasks['khronos:containers:delete'].callCount === 2;
          },
          function (cb) { setTimeout(cb, 10); },
          function (err) {
            if (err) { return done(err); }
            expect(tasks['khronos:weave:prune-dock'].callCount).to.equal(1);
            expect(Container.prototype.remove.callCount).to.equal(2);
            docker.listContainers(function (err, containers) {
              if (err) { return done(err); }
              expect(containers).to.have.length(5);
              setTimeout(done, 100);
            });
          });
      });
    });
  });
});
