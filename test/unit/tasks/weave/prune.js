'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
var Bunyan = require('bunyan')
var chai = require('chai')
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')

// internal
const Swarm = require('models/swarm')

// internal (being tested)
var weavePrune = require('tasks/weave/prune')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('prune exited weave containers', function () {
  describe('task', function () {
    beforeEach(function () {
      sinon.stub(Bunyan.prototype, 'error')
      sinon.stub(Swarm.prototype, 'getSwarmHosts').resolves(['http://example.com'])
      sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
      sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
      sinon.stub(rabbitmq.prototype, 'publish').returns()
    })
    afterEach(function () {
      Bunyan.prototype.error.restore()
      Swarm.prototype.getSwarmHosts.restore()
      rabbitmq.prototype.connect.restore()
      rabbitmq.prototype.publish.restore()
      rabbitmq.prototype.close.restore()
    })

    describe('success', function () {
      describe('with no docks', function () {
        beforeEach(function () {
          Swarm.prototype.getSwarmHosts.returns([])
        })

        it('should enqueue no tasks in rabbit', function () {
          return assert.isFulfilled(weavePrune())
            .then(function (result) {
              assert.equal(result, 0, 'should have published 0 tasks')
              sinon.assert.notCalled(rabbitmq.prototype.publish)
              sinon.assert.called(rabbitmq.prototype.connect)
              sinon.assert.called(rabbitmq.prototype.close)
            })
        })
      })

      describe('with one dock', function () {
        it('should enqueue a task in rabbit', function () {
          return assert.isFulfilled(weavePrune())
            .then(function (result) {
              assert.equal(result, 1, 'should have published 1 task')
              sinon.assert.calledOnce(rabbitmq.prototype.publish)
              sinon.assert.calledWithExactly(
                rabbitmq.prototype.publish,
                'khronos:weave:prune-dock',
                { dockerHost: 'http://example.com' }
              )
            })
        })
      })

      describe('with many docks', function () {
        beforeEach(function () {
          Swarm.prototype.getSwarmHosts.returns([
            'http://example1.com',
            'http://example2.com'
          ])
        })

        it('should enqueue many task in rabbit', function () {
          return assert.isFulfilled(weavePrune())
            .then(function (result) {
              assert.equal(result, 2, 'should have published 1 task')
              sinon.assert.calledTwice(rabbitmq.prototype.publish)
              sinon.assert.calledWithExactly(
                rabbitmq.prototype.publish,
                'khronos:weave:prune-dock',
                { dockerHost: 'http://example1.com' }
              )
              sinon.assert.calledWithExactly(
                rabbitmq.prototype.publish,
                'khronos:weave:prune-dock',
                { dockerHost: 'http://example2.com' }
              )
            })
        })
      })
    })

    describe('failure', function () {
      describe('of mavis', function () {
        beforeEach(function () {
          Swarm.prototype.getSwarmHosts.throws(new Error('foobar'))
        })

        it('should throw an error', function () {
          return assert.isRejected(
            weavePrune(),
            Error,
            'foobar'
          )
            .then(function () {
              sinon.assert.notCalled(rabbitmq.prototype.publish)
              sinon.assert.calledOnce(rabbitmq.prototype.close)
              sinon.assert.calledOnce(Bunyan.prototype.error)
            })
        })
      })

      describe('of rabbit connecting', function () {
        beforeEach(function () {
          rabbitmq.prototype.connect.throws(new Error('foobar'))
        })

        it('should throw an error', function () {
          return assert.isRejected(
            weavePrune(),
            Error,
            'foobar'
          )
            .then(function () {
              sinon.assert.notCalled(Swarm.prototype.getSwarmHosts)
            })
        })
      })

      describe('of rabbit publishing', function () {
        beforeEach(function () {
          rabbitmq.prototype.publish.throws(new Error('foobar'))
        })

        it('should throw an error', function () {
          return assert.isRejected(
            weavePrune(),
            Error,
            'foobar'
          )
            .then(function () {
              sinon.assert.calledOnce(rabbitmq.prototype.connect)
              sinon.assert.calledOnce(Swarm.prototype.getSwarmHosts)
              sinon.assert.calledOnce(rabbitmq.prototype.close)
            })
        })
      })

      describe('of rabbit closing', function () {
        beforeEach(function () {
          rabbitmq.prototype.close.throws(new Error('foobar'))
        })

        it('should not throw an error, but simply log', function () {
          assert.isFulfilled(weavePrune())
            .then(function () {
              sinon.assert.calledOnce(rabbitmq.prototype.connect)
              sinon.assert.calledOnce(Swarm.prototype.getSwarmHosts)
              sinon.assert.calledOnce(rabbitmq.prototype.publish)
              sinon.assert.calledOnce(Bunyan.prototype.error)
              assert.equal(
                Bunyan.prototype.error.firstCall.args[0].err.message,
                'foobar')
            })
        })
      })
    })
  })
})
