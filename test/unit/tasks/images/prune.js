'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const Bunyan = require('bunyan')
const chai = require('chai')
const rabbitmq = require('models/rabbitmq')
const sinon = require('sinon')

// internal
const Swarm = require('models/swarm')

// internal (being tested)
const imagePruneTask = require('tasks/images/prune')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('image prune task', function () {
  describe('task', function () {
    beforeEach(function () {
      sinon.stub(Bunyan.prototype, 'error').returns()
      sinon.stub(Swarm.prototype, 'getSwarmHosts').resolves(['http://example.com'])
      sinon.stub(rabbitmq, 'publishTask').resolves()
    })
    afterEach(function () {
      Bunyan.prototype.error.restore()
      Swarm.prototype.getSwarmHosts.restore()
      rabbitmq.publishTask.restore()
    })

    describe('success', function () {
      describe('with no docks', function () {
        beforeEach(function () {
          Swarm.prototype.getSwarmHosts.returns([])
        })

        it('should enqueue no tasks in rabbit', function () {
          return assert.isFulfilled(imagePruneTask())
            .then(function (result) {
              assert.equal(result, 0, 'should have published 0 tasks')
              sinon.assert.notCalled(rabbitmq.publishTask)
            })
        })
      })

      describe('with one dock', function () {
        it('should enqueue a task in rabbit', function () {
          return assert.isFulfilled(imagePruneTask())
            .then(function (result) {
              assert.equal(result, 1, 'should have published 1 task')
              sinon.assert.calledOnce(rabbitmq.publishTask)
              sinon.assert.calledWithExactly(
                rabbitmq.publishTask,
                'images.prune-dock',
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
          return assert.isFulfilled(imagePruneTask())
            .then(function (result) {
              assert.equal(result, 2, 'should have published 1 task')
              sinon.assert.calledTwice(rabbitmq.publishTask)
              sinon.assert.calledWithExactly(
                rabbitmq.publishTask,
                'images.prune-dock',
                { dockerHost: 'http://example1.com' }
              )
              sinon.assert.calledWithExactly(
                rabbitmq.publishTask,
                'images.prune-dock',
                { dockerHost: 'http://example2.com' }
              )
            })
        })
      })
    })

    describe('failure', function () {
      describe('of Swarm', function () {
        beforeEach(function () {
          Swarm.prototype.getSwarmHosts.throws(new Error('foobar'))
        })

        it('should throw an error', function () {
          return assert.isRejected(
            imagePruneTask(),
            Error,
            'foobar'
          )
            .then(function () {
              sinon.assert.notCalled(rabbitmq.publishTask)
            })
        })
      })
    })
  })
})
