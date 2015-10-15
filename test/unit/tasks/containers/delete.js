'use strict';

require('loadenv')('khronos:test');

var chai = require('chai');
var assert = chai.assert;

// external
var Bunyan = require('bunyan');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;

// internal
var Docker = require('models/docker');

// internal (being tested)
var deleteContainer = require('tasks/containers/delete');

describe('Delete Container Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  };

  beforeEach(function (done) {
    sinon.stub(Bunyan.prototype, 'error').returns();
    sinon.stub(Docker.prototype, 'removeStoppedContainer').yieldsAsync();
    done();
  });
  afterEach(function (done) {
    Bunyan.prototype.error.restore();
    Docker.prototype.removeStoppedContainer.restore();
    done();
  });

  describe('errors', function () {
    it('should throw an error on missing dockerHost', function (done) {
      deleteContainer({ dockerHost: 'http://example.com' })
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
      deleteContainer({ containerId: 'deadbeef' })
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

    describe('Docker Error', function () {
      it('should thrown the error', function (done) {
        Docker.prototype.removeStoppedContainer
          .yieldsAsync(new Error('foobar'));
        deleteContainer(testJob)
          .then(function () {
            throw new Error('task should have thrown an error');
          })
          .catch(function (err) {
            assert.instanceOf(err, Error, 'normal error');
            assert.equal(err.message, 'foobar');
            done();
          })
          .catch(done);
      });
    });
  });

  it('should remove a container', function (done) {
    deleteContainer(testJob)
      .then(function (result) {
        var removeStub = Docker.prototype.removeStoppedContainer;
        assert.ok(removeStub.calledOnce, 'remove called once');
        var removedId = removeStub.firstCall.args[0];
        assert.equal(removedId, 4, 'removed the correct container');
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          removedContainer: 4
        });
        done();
      })
      .catch(done);
  });
});
