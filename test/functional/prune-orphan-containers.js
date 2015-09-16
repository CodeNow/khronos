/**
 * @module test/prune-orphan-containers.unit
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
var MongoClient = require('mongodb').MongoClient;
var async = require('async');
var dockerMock = require('docker-mock');
var fixtures = require('../fixtures');
var mavisMock = require('../mocks/mavis');
var mongodb = require('models/mongodb');
var rewire = require('rewire');
var sinon = require('sinon');

// set non-default port for testing
var Docker = require('dockerode');
var docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
});

var pruneOrphanContainers = rewire('../../scripts/prune-orphan-containers');

describe('prune-orphan-containers'.bold.underline.green, function() {
  var db;
  var server;

  after(function (done) {
    Container.prototype.remove.restore();
    server.close(done);
  });

  before(function (done) {
    sinon.spy(Container.prototype, 'remove');
    server = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
    async.parallel([
      /* mongodb.connect to initialize connection of mongodb instance shared by script modules */
      mongodb.connect.bind(mongodb),
      MongoClient.connect.bind(MongoClient, process.env.KHRONOS_MONGO)
    ], function (err, results) {
      if (err) {
        console.log(err);
      }
      db = results[1];
      done();
    });
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
      function deleteContextVersions (cb) {
        db.collection('contextversions').drop(function () {
          cb();
        });
      },
      function deleteInstances (cb) {
        db.collection('instances').drop(function () {
          cb();
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
    pruneOrphanContainers(function () {
      expect(Container.prototype.remove.called).to.equal(false);
      done();
    });
  });

  it('should run successfully if no orphaned containers on dock', function (done) {
    var instanceDocuments = [];
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
      function createInstances (cb) {
        var instances = db.collection('instances');
        docker.listContainers({all: true}, function (err, containers) {
          async.eachSeries(containers, function (container, cb) {
            // insert standard instances
            instances.insert({
              container: {
                dockerContainer: container.Id
              }
            }, function (err, _instance) {
              if (err) { throw err; }
              instanceDocuments.push(_instance[0]);
              cb();
            });
          }, cb);
        });
      }
    ], function () {
      pruneOrphanContainers(function () {
        //expect(Container.prototype.remove.called).to.equal(false);
        docker.listContainers({all: true}, function (err, containers) {
          if (err) { throw err; }
          expect(containers.length).to.equal(numContainers);
          done();
        });
      });
    });
  });

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
});
