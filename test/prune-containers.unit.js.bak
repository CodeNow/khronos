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
dockerMock.listen(config.network.port);

// replace private variables for testing
var pruneContainers = rewire('../scripts/prune-containers');

var Container = require('dockerode/lib/container');
sinon.spy(Container.prototype, 'remove');

describe('prune-containers', function() {
  describe('multiple running containers', function() {

    beforeEach(function(done) {
      async.forEach(mocks.containers, function(container, cb) {
        docker.createContainer(container, cb);
      }, done);
    });

    afterEach(function(done) {
      Container.prototype.remove.reset();
      docker.listContainers(function(err, containers) {
        if (err) throw err;
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

    it('should delete containers older than 12 hours + from image "docker-image-builder"', function(done) {
      /**
       * Seed data == 2 containers
       */
      pruneContainers(function() {
        // two containers were found and removed
        expect(Container.prototype.remove.calledTwice).to.be.ok;
        done();
      });
    });

    it('should delete containers older than 12 hours + from image "docker-image-builder"', function(done) {
      /**
       * Seed data == 2 containers
       */
      pruneContainers(function() {
        // two containers were found and removed
        expect(Container.prototype.remove.calledTwice).to.be.ok;
        done();
      });
    });

    /*
    it('should not delete containers younger than 12 hours', function(done) {
      pruneContainers(done);
    });
    */

  });
});
