'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')

// internal (being tested)
var imagesPruneDock = require('tasks/images/prune-dock')

describe('images prune dock task', function () {
  beforeEach(function (done) {
    sinon.stub(Docker.prototype, 'getImages').yieldsAsync(null, [], [])
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
    done()
  })
  afterEach(function (done) {
    Docker.prototype.getImages.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
    rabbitmq.prototype.close.restore()
    done()
  })

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function (done) {
        imagesPruneDock({})
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(TaskFatalError, function (err) {
            assert.match(err.message, /dockerHost.+required/)
            done()
          })
          .catch(done)
      })
    })

    describe('if rabbitmq throws an error', function () {
      it('should throw the error', function (done) {
        rabbitmq.prototype.connect.yieldsAsync(new Error('foobar'))
        imagesPruneDock({ dockerHost: 'http://example.com' })
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(Error, function (err) {
            assert.equal(err.message, 'foobar')
            done()
          })
          .catch(done)
      })
    })

    describe('if docker throws an error', function () {
      it('should throw the error', function (done) {
        Docker.prototype.getImages.yieldsAsync(new Error('foobar'))
        imagesPruneDock({ dockerHost: 'http://example.com' })
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(function (err) {
            assert.instanceOf(err, Error, 'fatal task error')
            assert.equal(err.message, 'foobar')
            done()
          })
          .catch(done)
      })
    })
  })

  describe('with a no images on a host', function () {
    it('should not enqueue any task', function (done) {
      imagesPruneDock({ dockerHost: 'http://example.com' })
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getImages)
          sinon.assert.calledWithExactly(
            Docker.prototype.getImages,
            parseInt(process.env.KHRONOS_MIN_IMAGE_AGE, 10),
            sinon.match.func
          )
          sinon.assert.notCalled(rabbitmq.prototype.publish)
          assert.equal(result.taglessJobsEnqueued, 0)
          assert.equal(result.taggedJobsEnqueued, 0)
          done()
        })
        .catch(done)
    })
  })

  describe('with a single tagged image on a host', function () {
    beforeEach(function (done) {
      var taggedImages = ['foo/bar']
      Docker.prototype.getImages.yieldsAsync(null, taggedImages, [])
      done()
    })

    it('should enqueue a job to investigate the tagged image', function (done) {
      imagesPruneDock({ dockerHost: 'http://example.com' })
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
          assert.equal(result.taggedJobsEnqueued, 1)
          assert.equal(result.taglessJobsEnqueued, 0)
          done()
        })
        .catch(done)
    })
  })

  describe('with a single tagless image on a host', function () {
    beforeEach(function (done) {
      var taglessImages = [{
        Id: 4
      }]
      Docker.prototype.getImages.yieldsAsync(null, [], taglessImages)
      done()
    })

    it('should enqueue a job to remove the tagged image', function (done) {
      imagesPruneDock({ dockerHost: 'http://example.com' })
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
          assert.equal(result.taggedJobsEnqueued, 0)
          assert.equal(result.taglessJobsEnqueued, 1)
          done()
        })
        .catch(done)
    })
  })

  describe('with a tagged and tagless images on a host', function () {
    beforeEach(function (done) {
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
      done()
    })

    it('should enqueue all the right jobs', function (done) {
      imagesPruneDock({ dockerHost: 'http://example.com' })
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
          assert.equal(result.taggedJobsEnqueued, 2)
          assert.equal(result.taglessJobsEnqueued, 2)
          done()
        })
        .catch(done)
    })
  })
})
