'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const Bunyan = require('bunyan')
const chai = require('chai')
const Promise = require('bluebird')
const rabbitmq = require('models/rabbitmq')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const Docker = require('models/docker')
const Swarm = require('models/swarm')

// internal (being tested)
const imagesPruneDock = require('tasks/images/prune-dock')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(Promise)

describe('images prune dock task', function () {
  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'warn').returns()
    sinon.stub(Docker.prototype, 'getImages').resolves([[], []])
    sinon.stub(Swarm.prototype, 'checkHostExists').returns(Promise.resolve(true))
    sinon.stub(rabbitmq, 'publishTask').resolves()
  })
  afterEach(function () {
    Bunyan.prototype.warn.restore()
    Docker.prototype.getImages.restore()
    Swarm.prototype.checkHostExists.restore()
    rabbitmq.publishTask.restore()
  })

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function () {
        return assert.isRejected(
          imagesPruneDock({}),
          WorkerStopError,
          /dockerHost.+required/
        )
      })
    })

    describe('if docker throws an error', function () {
      beforeEach(function () {
        Docker.prototype.getImages.rejects(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          imagesPruneDock({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })

    describe('Swarm Error', function () {
      beforeEach(function () {
        Swarm.prototype.checkHostExists.throws(new Swarm.InvalidHostError())
      })

      it('should return an empty data if dock not in Swarm', function () {
        return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
          .then(function (result) {
            sinon.assert.calledOnce(Swarm.prototype.checkHostExists)
            sinon.assert.calledWithExactly(Swarm.prototype.checkHostExists, 'http://example.com')
            assert.deepEqual(result, {
              dockerHost: 'http://example.com',
              taglessJobsEnqueued: -1,
              taggedJobsEnqueued: -1
            })
            sinon.assert.calledOnce(Bunyan.prototype.warn)
            sinon.assert.notCalled(rabbitmq.publishTask)
          })
      })
    })
  })

  describe('with a no images on a host', function () {
    it('should not enqueue any task', function () {
      return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getImages)
          sinon.assert.calledWithExactly(
            Docker.prototype.getImages,
            parseInt(process.env.KHRONOS_MIN_IMAGE_AGE, 10)
          )
          sinon.assert.notCalled(rabbitmq.publishTask)
          assert.deepEqual(result, {
            dockerHost: 'http://example.com',
            taggedJobsEnqueued: 0,
            taglessJobsEnqueued: 0
          })
        })
    })
  })

  describe('with a single tagged image on a host', function () {
    beforeEach(function () {
      var taggedImages = ['foo/bar']
      Docker.prototype.getImages.resolves([taggedImages, []])
    })

    it('should enqueue a job to investigate the tagged image', function () {
      return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(rabbitmq.publishTask)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'images.check-against-context-versions',
            {
              dockerHost: 'http://example.com',
              imageId: 'foo/bar'
            }
          )
          assert.deepEqual(result, {
            dockerHost: 'http://example.com',
            taggedJobsEnqueued: 1,
            taglessJobsEnqueued: 0
          })
        })
    })
  })

  describe('with a single tagless image on a host', function () {
    beforeEach(function () {
      var taglessImages = [{
        Id: 4
      }]
      Docker.prototype.getImages.resolves([[], taglessImages])
    })

    it('should enqueue a job to remove the tagged image', function () {
      return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(rabbitmq.publishTask)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'images.remove',
            {
              dockerHost: 'http://example.com',
              imageId: 4
            }
          )
          assert.deepEqual(result, {
            dockerHost: 'http://example.com',
            taggedJobsEnqueued: 0,
            taglessJobsEnqueued: 1
          })
        })
    })
  })

  describe('with a tagged and tagless images on a host', function () {
    beforeEach(function () {
      var taggedImages = [
        'foo/bar',
        'bar/baz'
      ]
      var taglessImages = [{
        Id: 4
      }, {
        Id: 5
      }]
      Docker.prototype.getImages.resolves([ taggedImages, taglessImages ])
    })

    it('should enqueue all the right jobs', function () {
      return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.callCount(rabbitmq.publishTask, 4)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'images.remove',
            {
              dockerHost: 'http://example.com',
              imageId: 4
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'images.remove',
            {
              dockerHost: 'http://example.com',
              imageId: 5
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'images.check-against-context-versions',
            {
              dockerHost: 'http://example.com',
              imageId: 'foo/bar'
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'images.check-against-context-versions',
            {
              dockerHost: 'http://example.com',
              imageId: 'bar/baz'
            }
          )
          assert.deepEqual(result, {
            dockerHost: 'http://example.com',
            taggedJobsEnqueued: 2,
            taglessJobsEnqueued: 2
          })
        })
    })
  })
})
