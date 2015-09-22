'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;
var assert = require('chai').assert;

var Bunyan = require('bunyan');
var Mavis = require('../../../../lib/models/mavis');
var sinon = require('sinon');
var rabbitmq = require('runnable-hermes');

var weavePrune = require('../../../../lib/tasks/weave/prune');

describe('prune exited weave containers', function () {
  describe('task', function () {
    beforeEach(function (done) {
      sinon.stub(Bunyan.prototype, 'error');
      sinon.stub(Mavis.prototype, 'getDocks').returns(['http://example.com']);
      sinon.stub(rabbitmq.prototype, 'close').yieldsAsync();
      sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync();
      sinon.stub(rabbitmq.prototype, 'publish').returns();
      done();
    });
    afterEach(function (done) {
      Bunyan.prototype.error.restore();
      Mavis.prototype.getDocks.restore();
      rabbitmq.prototype.connect.restore();
      rabbitmq.prototype.publish.restore();
      rabbitmq.prototype.close.restore();
      done();
    });

    describe('success', function () {
      describe('with no docks', function () {
        it('should enqueue no tasks in rabbit', function (done) {
          Mavis.prototype.getDocks.returns([]);
          weavePrune()
            .then(function (result) {
              assert.equal(result, 0, 'should have published 0 tasks');
              assert.notOk(rabbitmq.prototype.publish.called, 'no publish');
              assert.ok(rabbitmq.prototype.connect.called);
              assert.ok(rabbitmq.prototype.close.called);
              done();
            })
            .catch(done);
        });
      });

      describe('with one dock', function () {
        it('should enqueue a task in rabbit', function (done) {
          // this is set above, fwiw
          // Mavis.prototype.getDocks.returns(['http://example.com']);
          weavePrune()
            .then(function (result) {
              assert.equal(result, 1, 'should have published 1 task');
              assert.ok(rabbitmq.prototype.publish.calledOnce, '1 publish');
              assert.equal(
                rabbitmq.prototype.publish.firstCall.args[0],
                'khronos:weave:prune-dock',
                'publish to the correct queue');
              assert.deepEqual(
                rabbitmq.prototype.publish.firstCall.args[1],
                { dockerHost: 'http://example.com' },
                'enqueued a valid job');
              done();
            })
            .catch(done);
        });
      });

      describe('with many docks', function () {
        it('should enqueue many task in rabbit', function (done) {
          Mavis.prototype.getDocks.returns([
            'http://example1.com',
            'http://example2.com'
          ]);
          weavePrune()
            .then(function (result) {
              assert.equal(result, 2, 'should have published 1 task');
              assert.ok(rabbitmq.prototype.publish.calledTwice, '2 publishes');
              assert.equal(
                rabbitmq.prototype.publish.firstCall.args[0],
                'khronos:weave:prune-dock',
                'publish to the correct queue');
              assert.deepEqual(
                rabbitmq.prototype.publish.firstCall.args[1],
                { dockerHost: 'http://example1.com' },
                'enqueued a valid job');
              assert.equal(
                rabbitmq.prototype.publish.secondCall.args[0],
                'khronos:weave:prune-dock',
                'publish to the correct queue');
              assert.deepEqual(
                rabbitmq.prototype.publish.secondCall.args[1],
                { dockerHost: 'http://example2.com' },
                'enqueued a valid job');
              done();
            })
            .catch(done);
        });
      });
    });

    describe('failure', function () {
      describe('of mavis', function () {
        it('should throw an error', function (done) {
          Mavis.prototype.getDocks.throws(new Error('foobar'));
          weavePrune()
            .then(function () {
              throw new Error('task should have failed');
            })
            .catch(function (err) {
              assert.equal(err.message, 'foobar');
              assert.notOk(rabbitmq.prototype.publish.called, 'no publish');
              assert.ok(rabbitmq.prototype.close.called, 'rabbitmq close');
              assert.ok(Bunyan.prototype.error.called, 'error logged');
              done();
            })
            .catch(done);
        });
      });

      describe('of rabbit connecting', function () {
        it('should throw an error', function (done) {
          rabbitmq.prototype.connect.throws(new Error('foobar'));
          weavePrune()
            .then(function () {
              throw new Error('task should have failed');
            })
            .catch(function (err) {
              assert.equal(err.message, 'foobar');
              assert.notOk(Mavis.prototype.getDocks.called, 'no mavis calls');
              done();
            })
            .catch(done);
        });
      });

      describe('of rabbit publishing', function () {
        it('should throw an error', function (done) {
          rabbitmq.prototype.publish.throws(new Error('foobar'));
          weavePrune()
            .then(function () {
              throw new Error('task should have failed');
            })
            .catch(function (err) {
              assert.equal(err.message, 'foobar');
              assert.ok(rabbitmq.prototype.connect.called, 'rabbitmq connect');
              assert.ok(Mavis.prototype.getDocks.called, 'mavis called');
              assert.ok(rabbitmq.prototype.close.called, 'rabbitmq close');
              done();
            })
            .catch(done);
        });
      });

      describe('of rabbit closing', function () {
        it('should not throw an error, but simply log', function (done) {
          rabbitmq.prototype.close.throws(new Error('foobar'));
          weavePrune()
            .then(function () {
              assert.ok(rabbitmq.prototype.connect.called, 'rabbitmq connect');
              assert.ok(Mavis.prototype.getDocks.called, 'mavis called');
              assert.ok(rabbitmq.prototype.publish.called, 'rabbitmq publish');
              assert.ok(Bunyan.prototype.error.called, 'error logged');
              assert.equal(
                Bunyan.prototype.error.firstCall.args[0].err.message,
                'foobar');
              done();
            })
            .catch(done);
        });
      });
    });
  });
});
