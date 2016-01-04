'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Bunyan = require('bunyan')
var Promise = require('bluebird')
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var Mavis = require('models/mavis')

// internal (being tested)
var imagesPruneDock = require('tasks/images/prune-dock')

describe('images prune dock task', function () {
  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'warn').returns()
    sinon.stub(Docker.prototype, 'getImages').yieldsAsync(null, [], [])
    sinon.stub(Mavis.prototype, 'verifyHost').returns(Promise.resolve(true))
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
  })
  afterEach(function () {
    Bunyan.prototype.warn.restore()
    Docker.prototype.getImages.restore()
    Mavis.prototype.verifyHost.restore()
    rabbitmq.prototype.close.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
  })

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function () {
        return assert.isRejected(
          imagesPruneDock({}),
          TaskFatalError,
          /dockerHost.+required/
        )
      })
    })

    describe('if rabbitmq throws an error', function () {
      beforeEach(function () {
        rabbitmq.prototype.connect.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          imagesPruneDock({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })

    describe('if docker throws an error', function () {
      beforeEach(function () {
        Docker.prototype.getImages.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          imagesPruneDock({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })

    describe('Mavis Error', function () {
      beforeEach(function () {
        Mavis.prototype.verifyHost.throws(new Mavis.InvalidHostError())
      })

      it('should return an empty data if dock not in mavis', function () {
        return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
          .then(function (result) {
            sinon.assert.calledOnce(Mavis.prototype.verifyHost)
            sinon.assert.calledWithExactly(Mavis.prototype.verifyHost, 'http://example.com')
            assert.deepEqual(result, {
              dockerHost: 'http://example.com',
              taglessJobsEnqueued: -1,
              taggedJobsEnqueued: -1
            })
            sinon.assert.calledOnce(Bunyan.prototype.warn)
            sinon.assert.notCalled(rabbitmq.prototype.publish)
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
            parseInt(process.env.KHRONOS_MIN_IMAGE_AGE, 10),
            sinon.match.func
          )
          sinon.assert.notCalled(rabbitmq.prototype.publish)
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
      Docker.prototype.getImages.yieldsAsync(null, taggedImages, [])
    })

    it('should enqueue a job to investigate the tagged image', function () {
      return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:images:check-against-context-versions',
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
      Docker.prototype.getImages.yieldsAsync(null, [], taglessImages)
    })

    it('should enqueue a job to remove the tagged image', function () {
      return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:images:remove',
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
      Docker.prototype.getImages.yieldsAsync(null, taggedImages, taglessImages)
    })

    it('should enqueue all the right jobs', function () {
      return assert.isFulfilled(imagesPruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.callCount(rabbitmq.prototype.publish, 4)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:images:remove',
            {
              dockerHost: 'http://example.com',
              imageId: 4
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:images:remove',
            {
              dockerHost: 'http://example.com',
              imageId: 5
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:images:check-against-context-versions',
            {
              dockerHost: 'http://example.com',
              imageId: 'foo/bar'
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:images:check-against-context-versions',
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
