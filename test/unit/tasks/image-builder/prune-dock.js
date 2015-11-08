'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

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
var imageBuilderPruneDock = require('tasks/weave/prune-dock')

describe('image-builder prune dock task', function () {
  beforeEach(function (done) {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'getContainers').yieldsAsync(null, [])
    sinon.stub(Mavis.prototype, 'verifyHost').returns(Promise.resolve(true))
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
    done()
  })
  afterEach(function (done) {
    Bunyan.prototype.error.restore()
    Docker.prototype.getContainers.restore()
    Mavis.prototype.verifyHost.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
    rabbitmq.prototype.close.restore()
    done()
  })

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function (done) {
        imageBuilderPruneDock({})
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(function (err) {
            assert.instanceOf(err, TaskFatalError, 'fatal task error')
            assert.match(err.message, /dockerHost.+required/)
            done()
          })
          .catch(done)
      })
    })

    describe('if rabbitmq throws an error', function () {
      it('should throw the error', function (done) {
        rabbitmq.prototype.connect.yieldsAsync(new Error('foobar'))
        imageBuilderPruneDock({ dockerHost: 'http://example.com' })
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

    describe('if docker throws an error', function () {
      it('should throw the error', function (done) {
        Docker.prototype.getContainers.yieldsAsync(new Error('foobar'))
        imageBuilderPruneDock({ dockerHost: 'http://example.com' })
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

  describe('with a no containers on a host', function () {
    it('should not enqueue any task', function (done) {
      imageBuilderPruneDock({ dockerHost: 'http://example.com' })
        .then(function (result) {
          var getStub = Docker.prototype.getContainers
          assert.ok(getStub.calledOnce, 'get containers called')
          assert.equal(
            getStub.firstCall.args[0].filters,
            '{"status":["exited"]}',
            'get called with exited filter')
          assert.notOk(rabbitmq.prototype.publish.called, 'publish not called')
          assert.equal(result, 0, 'result is 0')
          done()
        })
        .catch(done)
    })
  })

  describe('with a single container on a host', function () {
    beforeEach(function (done) {
      var containers = [{
        Id: 4
      }]
      Docker.prototype.getContainers.yieldsAsync(null, containers)
      done()
    })

    it('should enqueue a job to remove the container', function (done) {
      imageBuilderPruneDock({ dockerHost: 'http://example.com' })
        .then(function (result) {
          var getStub = Docker.prototype.getContainers
          assert.ok(getStub.calledOnce, 'get containers called')
          assert.equal(
            getStub.firstCall.args[0].filters,
            '{"status":["exited"]}',
            'get called with exited filter')
          assert.ok(rabbitmq.prototype.publish.calledOnce, 'publish called')
          assert.equal(
            rabbitmq.prototype.publish.firstCall.args[0],
            'khronos:containers:delete',
            'publish to the correct queue')
          assert.deepEqual(
            rabbitmq.prototype.publish.firstCall.args[1],
            {
              dockerHost: 'http://example.com',
              containerId: 4
            },
            'enqueued a valid job')
          assert.equal(result, 1, 'result is 1')
          done()
        })
        .catch(done)
    })
  })

  describe('with multiple containers on a host', function () {
    beforeEach(function (done) {
      var containers = [{
        Id: 4
      }, {
        Id: 5
      }]
      Docker.prototype.getContainers.yieldsAsync(null, containers)
      done()
    })

    it('should remove all the containers', function (done) {
      imageBuilderPruneDock({ dockerHost: 'http://example.com' })
        .then(function (result) {
          var getStub = Docker.prototype.getContainers
          assert.ok(getStub.calledOnce, 'get containers called')
          assert.equal(
            getStub.firstCall.args[0].filters,
            '{"status":["exited"]}',
            'get called with exited filter')
          assert.equal(
            rabbitmq.prototype.publish.firstCall.args[0],
            'khronos:containers:delete',
            'publish to the correct queue')
          assert.deepEqual(
            rabbitmq.prototype.publish.firstCall.args[1],
            {
              dockerHost: 'http://example.com',
              containerId: 4
            },
            'enqueued a valid job')
          assert.equal(
            rabbitmq.prototype.publish.secondCall.args[0],
            'khronos:containers:delete',
            'publish to the correct queue')
          assert.deepEqual(
            rabbitmq.prototype.publish.secondCall.args[1],
            {
              dockerHost: 'http://example.com',
              containerId: 5
            },
            'enqueued a valid job')
          assert.equal(result, 2, 'result is 2')
          done()
        })
        .catch(done)
    })
  })
})
