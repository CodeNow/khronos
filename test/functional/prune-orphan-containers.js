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

var async = require('async');
var Container = require('dockerode/lib/container');
var Docker = require('dockerode');
var dockerMock = require('docker-mock');
var Hermes = require('runnable-hermes');
var ponos = require('ponos');
var sinon = require('sinon');

// internal
var dockerFactory = require('../factories/docker');
var mongodbFactory = require('../factories/mongodb');

var docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
});

describe('Prune Orphaned Containers', function () {
  var tasks = {
    'khronos:containers:orphan:prune':
      require('../../lib/tasks/containers/prune-orphans'),
    'khronos:containers:orphan:prune-dock':
      require('../../lib/tasks/containers/prune-orphans-dock'),
    'khronos:containers:orphan:check-against-mongo':
      require('../../lib/tasks/containers/check-against-mongo'),
    'khronos:containers:remove': require('../../lib/tasks/containers/remove')
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
  var prevMongo;

  before(function (done) {
    prevMongo = process.env.KHRONOS_MONGO;
    process.env.KHRONOS_MONGO = 'mongodb://localhost/khronos-test';
    dockerMockServer = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
    done();
  });
  beforeEach(function (done) {
    process.env.KHRONOS_DOCKS =
      'http://localhost:' + process.env.KHRONOS_DOCKER_PORT;
    sinon.spy(Container.prototype, 'remove');
    sinon.spy(tasks, 'khronos:containers:orphan:prune-dock');
    sinon.spy(tasks, 'khronos:containers:orphan:check-against-mongo');
    sinon.spy(tasks, 'khronos:containers:remove');
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
    tasks['khronos:containers:orphan:prune-dock'].restore();
    tasks['khronos:containers:orphan:check-against-mongo'].restore();
    tasks['khronos:containers:remove'].restore();
    async.parallel([
      dockerFactory.deleteAllImagesAndContainers.bind(dockerFactory, docker),
      mongodbFactory.removeAllInstances.bind(mongodbFactory)
    ], done);
  });
  after(function (done) {
    process.env.KHRONOS_MONGO = prevMongo;
    dockerMockServer.close(done);
  });

  describe('unpopulated dock', function () {
    it('should run successfully', function (done) {
      workerServer.hermes.publish('khronos:containers:orphan:prune', {});
      async.until(
        function () {
          return tasks['khronos:containers:orphan:prune-dock'].callCount === 1;
        },
        function (cb) { setTimeout(cb, 50); },
        function (err) {
          if (err) { return done(err); }
          expect(Container.prototype.remove.callCount).to.equal(0);
          setTimeout(done, 50);
        });
    });
  });

  describe('on a populated dock', function () {
    var containers = [];
    beforeEach(function (done) {
      dockerFactory.createRandomContainers(docker, 5, function (err, data) {
        if (err) { return done(err); }
        containers = data;
        done();
      });
    });
    beforeEach(function (done) {
      mongodbFactory.createInstanceWithContainers(containers, done);
    });

    it('should run successfully with no orphans', function (done) {
      workerServer.hermes.publish('khronos:containers:orphan:prune', {});
      async.until(
        function () {
          var mongoCheckCount =
            tasks['khronos:containers:orphan:check-against-mongo'].callCount;
          return mongoCheckCount === 5;
        },
        function (cb) { setTimeout(cb, 50); },
        function (err) {
          if (err) { return done(err); }
          var pruneDockCount =
            tasks['khronos:containers:orphan:prune-dock'].callCount;
          expect(pruneDockCount).to.equal(1);
          expect(Container.prototype.remove.callCount).to.equal(0);
          docker.listContainers(function (err, containers) {
            if (err) { return done(err); }
            expect(containers).to.have.length(5);
            setTimeout(done, 50);
          });
        });
    });
    it('should run successfully with orphans', function (done) {
      var rmQuery = { 'container.dockerContainer': containers[0].id };
      async.series([
        function (cb) {
          mongodbFactory.removeInstaceByQuery(rmQuery, cb);
        },
        function (cb) {
          workerServer.hermes.publish('khronos:containers:orphan:prune', {});
          async.until(
            function () {
              var removeContainerCount =
                tasks['khronos:containers:remove'].callCount;
              return removeContainerCount === 1;
            },
            function (cb) { setTimeout(cb, 50); },
            function (err) {
              if (err) { return cb(err); }
              expect(tasks['khronos:containers:orphan:prune-dock'].calledOnce)
                .to.equal(true);
              expect(Container.prototype.remove.callCount).to.equal(1);
              docker.listContainers(function (err, containers) {
                if (err) { return cb(err); }
                expect(containers).to.have.length(4);
                setTimeout(cb, 100);
              });
            });
        }
      ], done);
    });
  });
});
