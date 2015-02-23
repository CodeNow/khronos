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
var pruneOrphanContainers = rewire('../scripts/prune-orphan-containers');

var Container = require('dockerode/lib/container');
sinon.spy(Container.prototype, 'remove');

describe('prune-orphan-containers'.bold.underline.green, function() {
  var db;
  var server;

  after(function (done) {
    server.close(done);
  });

  before(function (done) {
    server = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
    async.parallel([
      /* mongodb.connect to initialize connection of mongodb instance shared by script modules */
      mongodb.connect.bind(mongodb),
      MongoClient.connect.bind(MongoClient, process.env.KHRONOS_MONGO)
    ], function (err, results) {
      if (err) {
        debug.log(err);
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
    Container.prototype.remove.reset();
    docker.listContainers(function(err, containers) {
      if (err) { throw err; }
      async.forEach(containers, function(containerObj, cb) {
        var container = docker.getContainer(containerObj.Id);
        container.remove(function() {
          cb();
        });
      }, function(){
        done();
      });
    });
  });

  it('should run successfully if no containers on dock', function (done) {
    pruneOrphanContainers(function () {
      expect(Container.prototype.remove.called).to.equal(false);
      done();
    });
  });

  it('should run successfully if no orphaned containers on dock', function (done) {
    var containers = [];
    var instanceDocuments = [];
    async.series([
      function createContainers (cb) {
        async.times(5, function (n, cb) {
          docker.createContainer({
            Image: fixtures.getRandomImageName()
          }, function (err, container) {
            if (err) { throw err; }
            containers.push(container);
            cb();
          });
        }, cb);
      },
      function createInstances (cb) {
        var instances = db.collection('instances');
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
      },
    ], function () {
      pruneOrphanContainers(function () {
        expect(Container.prototype.remove.called).to.equal(false);
        done();
      });
    });
  });

  it('should only remove orphaned containers from dock', function (done) {

    done();
  });
});
