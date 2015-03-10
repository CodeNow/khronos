'use strict';

require('../lib/loadenv');
require('colors');

var Lab = require('lab');
var MongoClient = require('mongodb').MongoClient;
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

var debug = require('../lib/models/debug/debug')(__filename);
var mongodb = require('../lib/models/mongodb/mongodb');
var pruneImageBuilderContainers = rewire('../scripts/prune-image-builder-containers');

var Container = require('dockerode/lib/container');

describe('prune-image-builder-containers'.bold.underline.green, function() {
  var server;

  after(function (done) {
    server.close(done);
    Container.prototype.remove.restore();
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
      debug.log('finished afterEach');
      done();
    });
  });

  it('should run successfully if no containers on dock', function (done) {
    pruneImageBuilderContainers(function () {
      expect(Container.prototype.remove.called).to.equal(false);
      done();
    });
  });

  it('should run successfully if no image builder containers on dock', function (done) {
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
      },
    ], function () {
      pruneImageBuilderContainers(function () {
        docker.listContainers({all: true}, function (err, containers) {
          if (err) { throw err; }
          expect(containers.length).to.equal(numContainers);
          done();
        });
      });
    });
  });
/*
  it('should only remove orphaned containers from dock', function (done) {
    var numContainers = 5;
    var numOrphans = 3;
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
      function createInstances (cb) {
        var instances = db.collection('instances');
        docker.listContainers({all: true}, function (err, containers) {
          async.eachSeries(
            containers.slice(0, numContainers-numOrphans), function (container, cb) {
            // insert standard instances
            instances.insert({
              container: {
                dockerContainer: container.Id
              }
            }, function (err) {
              if (err) { throw err; }
              cb();
            });
          }, cb);
        });
      },
    ], function () {
      pruneOrphanContainers(function () {
        expect(Container.prototype.remove.callCount).to.equal(numOrphans);
        docker.listContainers({all: true}, function (err, containers) {
          if (err) { throw err; }
          expect(containers.length).to.equal(numContainers-numOrphans);
          done();
        });
      });
    });
  });
*/

});
