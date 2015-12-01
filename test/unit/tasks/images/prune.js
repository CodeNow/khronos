'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var Bunyan = require('bunyan')
var sinon = require('sinon')
var rabbitmq = require('runnable-hermes')

// internal
var Mavis = require('models/mavis')

// internal (being tested)
var imagePruneTask = require('tasks/images/prune')

describe('image prune task', function () {
  describe('task', function () {
    beforeEach(function (done) {
      sinon.stub(Bunyan.prototype, 'error').returns()
      sinon.stub(Mavis.prototype, 'getDocks').returns(['http://example.com'])
      sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
      sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
      sinon.stub(rabbitmq.prototype, 'publish').returns()
      done()
    })
    afterEach(function (done) {
      Bunyan.prototype.error.restore()
      Mavis.prototype.getDocks.restore()
      rabbitmq.prototype.connect.restore()
      rabbitmq.prototype.publish.restore()
      rabbitmq.prototype.close.restore()
      done()
    })

    describe('success', function () {
      describe('with no docks', function () {
        it('should enqueue no tasks in rabbit', function (done) {
          Mavis.prototype.getDocks.returns([])
          imagePruneTask()
            .then(function (result) {
              assert.equal(result, 0, 'should have published 0 tasks')
              assert.notOk(rabbitmq.prototype.publish.called, 'no publish')
              assert.ok(rabbitmq.prototype.connect.called)
              assert.ok(rabbitmq.prototype.close.called)
              done()
            })
            .catch(done)
        })
      })

      describe('with one dock', function () {
        it('should enqueue a task in rabbit', function (done) {
          // this is set above, fwiw
          // Mavis.prototype.getDocks.returns(['http://example.com'])
          imagePruneTask()
            .then(function (result) {
              assert.equal(result, 1, 'should have published 1 task')
              assert.ok(rabbitmq.prototype.publish.calledOnce, '1 publish')
              assert.equal(
                rabbitmq.prototype.publish.firstCall.args[0],
                'khronos:images:prune-dock',
                'publish to the correct queue')
              assert.deepEqual(
                rabbitmq.prototype.publish.firstCall.args[1],
                { dockerHost: 'http://example.com' },
                'enqueued a valid job')
              done()
            })
            .catch(done)
        })
      })

      describe('with many docks', function () {
        it('should enqueue many task in rabbit', function (done) {
          Mavis.prototype.getDocks.returns([
            'http://example1.com',
            'http://example2.com'
          ])
          imagePruneTask()
            .then(function (result) {
              assert.equal(result, 2, 'should have published 1 task')
              assert.ok(rabbitmq.prototype.publish.calledTwice, '2 publishes')
              assert.equal(
                rabbitmq.prototype.publish.firstCall.args[0],
                'khronos:images:prune-dock',
                'publish to the correct queue')
              assert.deepEqual(
                rabbitmq.prototype.publish.firstCall.args[1],
                { dockerHost: 'http://example1.com' },
                'enqueued a valid job')
              assert.equal(
                rabbitmq.prototype.publish.secondCall.args[0],
                'khronos:images:prune-dock',
                'publish to the correct queue')
              assert.deepEqual(
                rabbitmq.prototype.publish.secondCall.args[1],
                { dockerHost: 'http://example2.com' },
                'enqueued a valid job')
              done()
            })
            .catch(done)
        })
      })
    })

    describe('failure', function () {
      describe('of mavis', function () {
        it('should throw an error', function (done) {
          Mavis.prototype.getDocks.throws(new Error('foobar'))
          imagePruneTask()
            .then(function () {
              throw new Error('task should have failed')
            })
            .catch(function (err) {
              assert.equal(err.message, 'foobar')
              assert.notOk(rabbitmq.prototype.publish.called, 'no publish')
              assert.ok(rabbitmq.prototype.close.called, 'rabbitmq closed')
              done()
            })
            .catch(done)
        })
      })

      /*
       * Only need one rabbit test - comprehensive "rabbit failure" tests for
       * connecting and disconnecting are defined
       * in test/unit/tasks/utils/rabbitmq.js.
       */
      describe('of rabbit publishing', function () {
        it('should throw an error', function (done) {
          rabbitmq.prototype.publish.throws(new Error('foobar'))
          imagePruneTask()
            .then(function () {
              throw new Error('task should have failed')
            })
            .catch(function (err) {
              assert.equal(err.message, 'foobar')
              assert.ok(rabbitmq.prototype.connect.called, 'rabbitmq connect')
              assert.ok(Mavis.prototype.getDocks.called, 'mavis called')
              assert.ok(rabbitmq.prototype.close.called, 'rabbitmq close')
              done()
            })
            .catch(done)
        })
      })
    })
  })
})