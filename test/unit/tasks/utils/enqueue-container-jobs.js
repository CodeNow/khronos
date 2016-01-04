'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var Hermes = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var Mavis = require('models/mavis')

// internal (being tested)
var enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')

describe('Enqueue Container Jobs Helper', function () {
  beforeEach(function (done) {
    sinon.stub(Docker.prototype, 'getContainers').yieldsAsync(null, [])
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
    sinon.stub(Hermes.prototype, 'publish').returns()
    sinon.stub(Mavis.prototype, 'verifyHost').returns(true)
    done()
  })
  afterEach(function (done) {
    Docker.prototype.getContainers.restore()
    Hermes.prototype.connect.restore()
    Hermes.prototype.publish.restore()
    Mavis.prototype.verifyHost.restore()
    done()
  })

  var options
  beforeEach(function (done) {
    options = {
      job: { dockerHost: 'http://example.com' },
      targetQueue: 'queue:one',
      imageFilters: ['philter']
    }
    done()
  })

  describe('failures', function () {
    it('should enforce being passed one object argument', function (done) {
      enqueueContainerJobsHelper()
        .then(function () { throw new Error('should have rejected') })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.match(err.message, /options must be an object/)
          done()
        })
        .catch(done)
    })
    it('should require options.job', function (done) {
      options.job = undefined
      enqueueContainerJobsHelper(options)
        .then(function () { throw new Error('should have rejected') })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.match(err.message, /job.+object/)
          done()
        })
        .catch(done)
    })
    it('should require object.job to be an object', function (done) {
      options.job = ''
      enqueueContainerJobsHelper(options)
        .then(function () { throw new Error('should have rejected') })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.match(err.message, /job.+object/)
          done()
        })
        .catch(done)
    })
    it('should require object.targetQueue', function (done) {
      options.targetQueue = undefined
      enqueueContainerJobsHelper(options)
        .then(function () { throw new Error('should have rejected') })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.match(err.message, /targetQueue.+string/)
          done()
        })
        .catch(done)
    })
    it('should require object.imageFilters', function (done) {
      options.imageFilters = undefined
      enqueueContainerJobsHelper(options)
        .then(function () { throw new Error('should have rejected') })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.match(err.message, /imageFilters.+array/)
          done()
        })
        .catch(done)
    })
    it('should require object.imageFilters to be an array', function (done) {
      options.imageFilters = {}
      enqueueContainerJobsHelper(options)
        .then(function () { throw new Error('should have rejected') })
        .catch(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.match(err.message, /imageFilters.+array/)
          done()
        })
        .catch(done)
    })
    it('should throw if Docker errors', function (done) {
      Docker.prototype.getContainers.yieldsAsync(new Error('foobar'))
      enqueueContainerJobsHelper(options)
        .then(function () {
          throw new Error('helper should have thrown an error')
        })
        .catch(function (err) {
          assert.instanceOf(err, Error)
          assert.notOk(Hermes.prototype.publish.called,
            'no publishing of jobs')
          assert.equal(err.message, 'foobar')
          done()
        })
        .catch(done)
    })
    it('should throw if rabbitmq errors', function (done) {
      Hermes.prototype.connect.throws(new Error('foobar'))
      enqueueContainerJobsHelper(options)
        .then(function () {
          throw new Error('helper should have thrown an error')
        })
        .catch(function (err) {
          assert.instanceOf(err, Error)
          assert.notOk(Docker.prototype.getContainers.called,
            'no getContainers')
          assert.notOk(Hermes.prototype.publish.called,
            'no publishing of jobs')
          assert.equal(err.message, 'foobar')
          done()
        })
        .catch(done)
    })
  })

  describe('successes', function () {
    it('should not enqueue jobs if there are no containers', function (done) {
      Docker.prototype.getContainers.yieldsAsync(null, [])
      enqueueContainerJobsHelper(options)
        .then(function (result) {
          assert.equal(result, 0, 'no jobs enqueued')
          assert.ok(Docker.prototype.getContainers.calledOnce, 'gotContainers')
          assert.notOk(Hermes.prototype.publish.called, 'no job published')
          done()
        })
        .catch(done)
    })
    it('should not enqueue jobs if the dock no longer exists', function (done) {
      Mavis.prototype.verifyHost.throws(new Mavis.InvalidHostError())
      Docker.prototype.getContainers.yieldsAsync(null, [{ Id: 4 }])
      enqueueContainerJobsHelper(options)
        .then(function (result) {
          assert.equal(result, 0, 'no jobs queued')
          assert.notOk(Docker.prototype.getContainers.called, 'no docker call')
          assert.notOk(Hermes.prototype.publish.called, 'no job queued')
          done()
        })
        .catch(done)
    })
    it('should return a promise resolving the number of jobs', function (done) {
      Docker.prototype.getContainers.yieldsAsync(null, [{ Id: 4 }])
      enqueueContainerJobsHelper(options)
        .then(function (result) {
          assert.equal(result, 1, 'had 1 container')
          assert.deepEqual(
            Docker.prototype.getContainers.firstCall.args[1],
            ['philter'],
            'passes filters to getContainers')
          assert.ok(Hermes.prototype.publish.calledOnce, 'one job published')
          assert.equal(
            Hermes.prototype.publish.firstCall.args[0],
            'queue:one',
            'publishes to the correct queue')
          assert.deepEqual(
            Hermes.prototype.publish.firstCall.args[1],
            {
              dockerHost: 'http://example.com',
              containerId: 4
            },
            'publishes a vaild job')
          done()
        })
        .catch(done)
    })
  })
})
