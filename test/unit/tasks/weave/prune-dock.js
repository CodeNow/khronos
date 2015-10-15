'use strict';

require('loadenv')('khronos:test');

var chai = require('chai');
var assert = chai.assert;

// external
var Bunyan = require('bunyan');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;
var rabbitmq = require('runnable-hermes');

// internal
var Docker = require('models/docker');

// internal (being tested)
var weavePruneDock = require('tasks/weave/prune-dock');

describe('Delete Weave Container Dock Task', function () {
  beforeEach(function (done) {
    sinon.stub(Bunyan.prototype, 'error').returns();
    sinon.stub(Docker.prototype, 'getContainers').yieldsAsync(null, []);
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync();
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync();
    sinon.stub(rabbitmq.prototype, 'publish').returns();
    done();
  });
  afterEach(function (done) {
    Bunyan.prototype.error.restore();
    Docker.prototype.getContainers.restore();
    rabbitmq.prototype.connect.restore();
    rabbitmq.prototype.publish.restore();
    rabbitmq.prototype.close.restore();
    done();
  });

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function (done) {
        weavePruneDock({})
          .then(function () {
            throw new Error('task should have thrown an error');
          })
          .catch(function (err) {
            assert.instanceOf(err, TaskFatalError, 'fatal task error');
            assert.match(err.message, /dockerHost.+required/);
            done();
          })
          .catch(done);
      });
    });

    describe('if rabbitmq throws an error', function () {
      it('should throw the error', function (done) {
        rabbitmq.prototype.connect.yieldsAsync(new Error('foobar'));
        weavePruneDock({ dockerHost: 'http://example.com' })
          .then(function () {
            throw new Error('task should have thrown an error');
          })
          .catch(function (err) {
            assert.instanceOf(err, Error, 'fatal task error');
            assert.equal(err.message, 'foobar');
            done();
          })
          .catch(done);
      });
    });

    describe('if docker throws an error', function () {
      it('should throw the error', function (done) {
        Docker.prototype.getContainers.yieldsAsync(new Error('foobar'));
        weavePruneDock({ dockerHost: 'http://example.com' })
          .then(function () {
            throw new Error('task should have thrown an error');
          })
          .catch(function (err) {
            assert.instanceOf(err, Error, 'fatal task error');
            assert.equal(err.message, 'foobar');
            done();
          })
          .catch(done);
      });
    });
  });

  describe('with a no containers on a host', function () {
    it('should not enqueue any task', function (done) {
      weavePruneDock({ dockerHost: 'http://example.com' })
        .then(function (result) {
          var getStub = Docker.prototype.getContainers;
          assert.ok(getStub.calledOnce, 'get containers called');
          assert.equal(
            getStub.firstCall.args[0].filters,
            '{"status":["exited"]}',
            'get called with exited filter');
          assert.equal(result, 0, 'result is 0');
          done();
        })
        .catch(done);
    });
  });

  describe('with a single container on a host', function () {
    beforeEach(function (done) {
      var containers = [{
        Id: 4
      }];
      Docker.prototype.getContainers.yieldsAsync(null, containers);
      done();
    });

    it('should enqueue a job to remove the container', function (done) {
      weavePruneDock({ dockerHost: 'http://example.com' })
        .then(function (result) {
          var getStub = Docker.prototype.getContainers;
          assert.ok(getStub.calledOnce, 'get containers called');
          assert.equal(
            getStub.firstCall.args[0].filters,
            '{"status":["exited"]}',
            'get called with exited filter');
          assert.equal(result, 1, 'result is 1');
          done();
        })
        .catch(done);
    });
  });


  describe('with multiple containers on a host', function () {
    beforeEach(function (done) {
      var containers = [{
        Id: 4
      }, {
        Id: 5
      }];
      Docker.prototype.getContainers.yieldsAsync(null, containers);
      done();
    });

    it('should remove all the containers', function (done) {
      weavePruneDock({ dockerHost: 'http://example.com' })
        .then(function (result) {
          var getStub = Docker.prototype.getContainers;
          assert.ok(getStub.calledOnce, 'get containers called');
          assert.equal(
            getStub.firstCall.args[0].filters,
            '{"status":["exited"]}',
            'get called with exited filter');
          assert.equal(result, 2, 'result is 2');
          done();
        })
        .catch(done);
    });
  });
});
