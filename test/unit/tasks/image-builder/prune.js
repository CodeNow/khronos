'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Bunyan = require('bunyan')
var sinon = require('sinon')
var rabbitmq = require('runnable-hermes')

// internal
var Mavis = require('models/mavis')

// internal (being tested)
var imageBuilderPruneTask = require('tasks/image-builder/prune')

describe('image-builder prune task', function () {
  describe('task', function () {
    beforeEach(function () {
      sinon.stub(Bunyan.prototype, 'error').returns()
      sinon.stub(Mavis.prototype, 'getDocks').returns(['http://example.com'])
      sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
      sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
      sinon.stub(rabbitmq.prototype, 'publish').returns()
    })
    afterEach(function () {
      Bunyan.prototype.error.restore()
      Mavis.prototype.getDocks.restore()
      rabbitmq.prototype.connect.restore()
      rabbitmq.prototype.publish.restore()
      rabbitmq.prototype.close.restore()
    })

    describe('success', function () {
      describe('with no docks', function () {
        beforeEach(function () {
          Mavis.prototype.getDocks.returns([])
        })

        it('should enqueue no tasks in rabbit', function () {
          return assert.isFulfilled(imageBuilderPruneTask())
            .then(function (result) {
              assert.equal(result, 0, 'should have published 0 tasks')
              sinon.assert.notCalled(rabbitmq.prototype.publish)
              sinon.assert.calledOnce(rabbitmq.prototype.connect)
              sinon.assert.calledOnce(rabbitmq.prototype.close)
            })
        })
      })

      describe('with one dock', function () {
        it('should enqueue a task in rabbit', function () {
          return assert.isFulfilled(imageBuilderPruneTask())
            .then(function (result) {
              assert.equal(result, 1, 'should have published 1 task')
              sinon.assert.calledOnce(rabbitmq.prototype.publish)
              sinon.assert.calledWithExactly(
                rabbitmq.prototype.publish,
                'khronos:containers:image-builder:prune-dock',
                { dockerHost: 'http://example.com' }
              )
            })
        })
      })

      describe('with many docks', function () {
        beforeEach(function () {
          Mavis.prototype.getDocks.returns([
            'http://example1.com',
            'http://example2.com'
          ])
        })

        it('should enqueue many task in rabbit', function () {
          return assert.isFulfilled(imageBuilderPruneTask())
            .then(function (result) {
              assert.equal(result, 2, 'should have published 1 task')
              sinon.assert.calledTwice(rabbitmq.prototype.publish)
              sinon.assert.calledWithExactly(
                rabbitmq.prototype.publish,
                'khronos:containers:image-builder:prune-dock',
                { dockerHost: 'http://example1.com' }
              )
              sinon.assert.calledWithExactly(
                rabbitmq.prototype.publish,
                'khronos:containers:image-builder:prune-dock',
                { dockerHost: 'http://example1.com' }
              )
              assert.equal(
                rabbitmq.prototype.publish.secondCall.args[0],
                'khronos:containers:image-builder:prune-dock',
                { dockerHost: 'http://example2.com' }
              )
            })
        })
      })
    })

    describe('failure', function () {
      describe('of mavis', function () {
        beforeEach(function () {
          Mavis.prototype.getDocks.throws(new Error('foobar'))
        })

        it('should throw an error', function () {
          return assert.isRejected(
            imageBuilderPruneTask(),
            Error,
            'foobar'
          )
            .then(function () {
              sinon.assert.notCalled(rabbitmq.prototype.publish)
              sinon.assert.calledOnce(rabbitmq.prototype.close)
            })
        })
      })

      /*
       * Only need one rabbit test - comprehensive "rabbit failure" tests for
       * connecting and disconnecting are defined
       * in test/unit/tasks/utils/rabbitmq.js.
       */
      describe('of rabbit publishing', function () {
        beforeEach(function () {
          rabbitmq.prototype.publish.throws(new Error('foobar'))
        })

        it('should throw an error', function () {
          return assert.isRejected(
            imageBuilderPruneTask(),
            Error,
            'foobar'
          )
            .then(function () {
              sinon.assert.calledOnce(rabbitmq.prototype.connect)
              sinon.assert.calledOnce(Mavis.prototype.getDocks)
              sinon.assert.calledOnce(rabbitmq.prototype.close)
            })
        })
      })
    })
  })
})
