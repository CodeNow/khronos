'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

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
  beforeEach(function () {
    sinon.stub(Docker.prototype, 'getContainers').yieldsAsync(null, [])
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
    sinon.stub(Hermes.prototype, 'publish').returns()
    sinon.stub(Mavis.prototype, 'verifyHost').returns(true)
  })
  afterEach(function () {
    Docker.prototype.getContainers.restore()
    Hermes.prototype.connect.restore()
    Hermes.prototype.publish.restore()
    Mavis.prototype.verifyHost.restore()
  })

  var options
  beforeEach(function () {
    options = {
      job: { dockerHost: 'http://example.com' },
      targetQueue: 'queue:one',
      imageFilters: ['philter']
    }
  })

  describe('failures', function () {
    it('should enforce being passed one object argument', function () {
      return assert.isRejected(
        enqueueContainerJobsHelper(),
        TaskFatalError,
        /options must be an object/
      )
    })

    it('should require options.job', function () {
      options.job = undefined
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        TaskFatalError,
        /job.+object/
      )
    })

    it('should require object.job to be an object', function () {
      options.job = ''
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        TaskFatalError,
        /job.+object/
      )
    })

    it('should require object.targetQueue', function () {
      options.targetQueue = undefined
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        TaskFatalError,
        /targetQueue.+string/
      )
    })

    it('should require object.imageFilters', function () {
      options.imageFilters = undefined
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        TaskFatalError,
        /imageFilters.+array/
      )
    })

    it('should require object.imageFilters to be an array', function () {
      options.imageFilters = {}
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        TaskFatalError,
        /imageFilters.+array/
      )
    })

    it('should throw if Docker errors', function () {
      Docker.prototype.getContainers.yieldsAsync(new Error('foobar'))
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        Error,
        'foobar'
      )
        .then(function () {
          sinon.assert.notCalled(Hermes.prototype.publish)
        })
    })

    it('should throw if rabbitmq errors', function () {
      Hermes.prototype.connect.throws(new Error('foobar'))
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        Error,
        'foobar'
      )
        .then(function () {
          sinon.assert.notCalled(Docker.prototype.getContainers)
          sinon.assert.notCalled(Hermes.prototype.publish)
        })
    })
  })

  describe('successes', function () {
    it('should not enqueue jobs if there are no containers', function () {
      Docker.prototype.getContainers.yieldsAsync(null, [])
      return assert.isFulfilled(enqueueContainerJobsHelper(options))
        .then(function (result) {
          assert.equal(result, 0, 'no jobs enqueued')
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.notCalled(Hermes.prototype.publish)
        })
    })

    it('should not enqueue jobs if the dock no longer exists', function () {
      Mavis.prototype.verifyHost.throws(new Mavis.InvalidHostError())
      Docker.prototype.getContainers.yieldsAsync(null, [{ Id: 4 }])
      return assert.isFulfilled(enqueueContainerJobsHelper(options))
        .then(function (result) {
          assert.equal(result, 0, 'no jobs queued')
          sinon.assert.notCalled(Docker.prototype.getContainers)
          sinon.assert.notCalled(Hermes.prototype.publish)
        })
    })

    it('should return a promise resolving the number of jobs', function () {
      Docker.prototype.getContainers.yieldsAsync(null, [{ Id: 4 }])
      return assert.isFulfilled(enqueueContainerJobsHelper(options))
        .then(function (result) {
          assert.equal(result, 1, 'had 1 container')
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            sinon.match.object,
            ['philter'],
            sinon.match.func
          )
          sinon.assert.calledOnce(Hermes.prototype.publish)
          sinon.assert.calledWithExactly(
            Hermes.prototype.publish,
            'queue:one',
            {
              dockerHost: 'http://example.com',
              containerId: 4
            }
          )
        })
    })
  })
})
