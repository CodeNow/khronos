'use strict';

require('loadenv')('khronos:test');

var chai = require('chai');
var assert = chai.assert;

// external
var Bunyan = require('bunyan');
var Hermes = require('runnable-hermes');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;

// internal
var MongoDB = require('models/mongodb');

// internal (being tested)
var verifyContainer = require('tasks/containers/check-against-mongo');

describe('Check Container Against Mongo Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  };

  beforeEach(function (done) {
    sinon.stub(Bunyan.prototype, 'error').returns();
    sinon.stub(Hermes.prototype, 'close').yieldsAsync();
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync();
    sinon.stub(Hermes.prototype, 'publish').returns();
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync();
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync();
    sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync();
    done();
  });
  afterEach(function (done) {
    Bunyan.prototype.error.restore();
    Hermes.prototype.close.restore();
    Hermes.prototype.connect.restore();
    Hermes.prototype.publish.restore();
    MongoDB.prototype.close.restore();
    MongoDB.prototype.connect.restore();
    MongoDB.prototype.fetchInstances.restore();
    done();
  });

  describe('Parameter Errors', function () {
    it('should throw an error on missing dockerHost', function (done) {
      verifyContainer({ dockerHost: 'http://example.com' })
        .then(function () {
          throw new Error('task should have thrown an error');
        })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError, 'task fatally errors');
          assert.match(err.message, /containerId.+required/, 'task errors');
          done();
        })
        .catch(done);
    });
    it('should throw an error on missing containerId', function (done) {
      verifyContainer({ containerId: 'deadbeef' })
        .then(function () {
          throw new Error('task should have thrown an error');
        })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError, 'task fatally errors');
          assert.match(err.message, /dockerHost.+required/, 'task errors');
          done();
        })
        .catch(done);
    });
  });

  describe('MongoDB Error', function () {
    it('should thrown the error', function (done) {
      MongoDB.prototype.fetchInstances.yieldsAsync(new Error('foobar'));
      verifyContainer(testJob)
        .then(function () {
          throw new Error('task should have thrown an error');
        })
        .catch(function (err) {
          assert.instanceOf(err, Error, 'normal error');
          assert.equal(err.message, 'foobar');
          assert.notOk(Hermes.prototype.publish.called, 'no published jobs');
          done();
        })
        .catch(done);
    });
  });

  describe('Rabbitmq Error', function () {
    it('should thrown the error', function (done) {
      Hermes.prototype.connect.yieldsAsync(new Error('foobar'));
      verifyContainer(testJob)
        .then(function () {
          throw new Error('task should have thrown an error');
        })
        .catch(function (err) {
          assert.instanceOf(err, Error, 'normal error');
          assert.equal(err.message, 'foobar');
          assert.notOk(Hermes.prototype.publish.called, 'no published jobs');
          done();
        })
        .catch(done);
    });
  });

  it('should not remove the container if it is in mongo', function (done) {
    MongoDB.prototype.fetchInstances.yieldsAsync(null, [{ _id: 7 }]);
    verifyContainer(testJob)
      .then(function (result) {
        assert.notOk(Hermes.prototype.publish.called, 'no published jobs');
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          containerId: 4,
          containerRemoveTaskQueued: false,
          instanceId: '7'
        });
        done();
      })
      .catch(done);
  });
  it('should enqueue a job to remove the container', function (done) {
    MongoDB.prototype.fetchInstances.yieldsAsync(null, []);
    verifyContainer(testJob)
      .then(function (result) {
        assert.ok(Hermes.prototype.publish.calledOnce, 'published job');
        assert.equal(
          Hermes.prototype.publish.firstCall.args[0],
          'khronos:containers:remove');
        assert.deepEqual(Hermes.prototype.publish.firstCall.args[1], testJob);
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          containerId: 4,
          containerRemoveTaskQueued: true
        });
        done();
      })
      .catch(done);
  });
});
