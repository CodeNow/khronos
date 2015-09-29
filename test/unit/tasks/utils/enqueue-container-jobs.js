'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;
var assert = require('chai').assert;

// external
var Hermes = require('runnable-hermes');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;

// internal
var Docker = require('models/docker');

// internal (being tested)
var enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs');

describe('Enqueue Container Jobs Helper', function () {
  var testJob = { dockerHost: 'http://example.com' };

  beforeEach(function (done) {
    sinon.stub(Docker.prototype, 'getContainers').yieldsAsync(null, []);
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync();
    sinon.stub(Hermes.prototype, 'publish').returns();
    done();
  });
  afterEach(function (done) {
    Docker.prototype.getContainers.restore();
    Hermes.prototype.connect.restore();
    Hermes.prototype.publish.restore();
    done();
  });

  describe('failures', function () {
    it('should enforce all three parameters for Ryan', function (done) {
      enqueueContainerJobsHelper()
        .then(function () { throw new Error('should have rejected'); })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError);
          done();
        })
        .catch(done);
    });
    it('should enfore all three parameters', function (done) {
      enqueueContainerJobsHelper({})
        .then(function () { throw new Error('should have rejected'); })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError);
          done();
        })
        .catch(done);
    });
    it('should enfore all three parameters', function (done) {
      enqueueContainerJobsHelper({}, 'queue:one')
        .then(function () { throw new Error('should have rejected'); })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError);
          done();
        })
        .catch(done);
    });
    it('should enfore all three parameters', function (done) {
      enqueueContainerJobsHelper({}, 'queue:one', '')
        .then(function () { throw new Error('should have rejected'); })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError);
          done();
        })
        .catch(done);
    });
    it('should enfore all three parameters', function (done) {
      enqueueContainerJobsHelper({}, 'queue:one', {})
        .then(function () { throw new Error('should have rejected'); })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError);
          done();
        })
        .catch(done);
    });
    it('should enfore all three parameters', function (done) {
      enqueueContainerJobsHelper('', 'queue:one', [])
        .then(function () { throw new Error('should have rejected'); })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError);
          done();
        })
        .catch(done);
    });
    it('should throw if Docker errors', function (done) {
      Docker.prototype.getContainers.yieldsAsync(new Error('foobar'));
      enqueueContainerJobsHelper(testJob, 'queue:four', ['philter'])
        .then(function () {
          throw new Error('helper should have thrown an error');
        })
        .catch(function (err) {
          assert.instanceOf(err, Error);
          assert.notOk(Hermes.prototype.publish.called,
            'no publishing of jobs');
          assert.equal(err.message, 'foobar');
          done();
        })
        .catch(done);
    });
    it('should throw if rabbitmq errors', function (done) {
      Hermes.prototype.connect.throws(new Error('foobar'));
      enqueueContainerJobsHelper(testJob, 'queue:four', ['philter'])
        .then(function () {
          throw new Error('helper should have thrown an error');
        })
        .catch(function (err) {
          assert.instanceOf(err, Error);
          assert.notOk(Docker.prototype.getContainers.called,
            'no getContainers');
          assert.notOk(Hermes.prototype.publish.called,
            'no publishing of jobs');
          assert.equal(err.message, 'foobar');
          done();
        })
        .catch(done);
    });
  });

  describe('successes', function () {
    it('should not enqueue jobs if there are no containers', function (done) {
      Docker.prototype.getContainers.yieldsAsync(null, []);
      enqueueContainerJobsHelper(testJob, 'queue:four', ['philter'])
        .then(function (result) {
          assert.equal(result, 0, 'no jobs enqueued');
          assert.ok(Docker.prototype.getContainers.calledOnce, 'gotContainers');
          assert.notOk(Hermes.prototype.publish.called, 'one job published');
          done();
        })
        .catch(done);
    });
    it('should return a promise resolving the number of jobs', function (done) {
      Docker.prototype.getContainers.yieldsAsync(null, [{ Id: 4 }]);
      enqueueContainerJobsHelper(testJob, 'queue:four', ['philter'])
        .then(function (result) {
          assert.equal(result, 1, 'had 1 container');
          assert.deepEqual(
            Docker.prototype.getContainers.firstCall.args[1],
            ['philter'],
            'passes filters to getContainers');
          assert.ok(Hermes.prototype.publish.calledOnce, 'one job published');
          assert.equal(
            Hermes.prototype.publish.firstCall.args[0],
            'queue:four',
            'publishes to the correct queue');
          assert.deepEqual(
            Hermes.prototype.publish.firstCall.args[1],
            {
              dockerHost: 'http://example.com',
              containerId: 4
            },
            'publishes a vaild job');
          done();
        })
        .catch(done);
    });
  });
});
