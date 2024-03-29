'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const chai = require('chai')
const rabbitmq = require('models/rabbitmq')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const Docker = require('models/docker')
const Swarm = require('models/swarm')

// internal (being tested)
const enqueueContainerJobsHelper = require('tasks/utils/enqueue-container-jobs')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Enqueue Container Jobs Helper', function () {
  beforeEach(function () {
    sinon.stub(Docker.prototype, 'getContainers').resolves([])
    sinon.stub(rabbitmq, 'publishTask').resolves()
    sinon.stub(Swarm.prototype, 'checkHostExists').resolves(true)
  })
  afterEach(function () {
    Docker.prototype.getContainers.restore()
    rabbitmq.publishTask.restore()
    Swarm.prototype.checkHostExists.restore()
  })

  var options
  beforeEach(function () {
    options = {
      job: { dockerHost: 'http://example.com' },
      targetQueue: 'queue:one',
      imageBlacklist: ['philter']
    }
  })

  describe('failures', function () {
    it('should enforce being passed one object argument', function () {
      return assert.isRejected(
        enqueueContainerJobsHelper(),
        WorkerStopError,
        /options must be an object/
      )
    })

    it('should require options.job', function () {
      options.job = undefined
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        WorkerStopError,
        /job.+object/
      )
    })

    it('should require object.job to be an object', function () {
      options.job = ''
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        WorkerStopError,
        /job.+object/
      )
    })

    it('should require object.targetQueue', function () {
      options.targetQueue = undefined
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        WorkerStopError,
        /targetQueue.+string/
      )
    })

    it('should require object.imageBlacklist', function () {
      options.imageBlacklist = undefined
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        WorkerStopError,
        /imageFilters.+array/
      )
    })

    it('should require object.imageBlacklist to be an array', function () {
      options.imageBlacklist = {}
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        WorkerStopError,
        /imageFilters.+array/
      )
    })

    it('should throw if Docker errors', function () {
      Docker.prototype.getContainers.rejects(new Error('foobar'))
      return assert.isRejected(
        enqueueContainerJobsHelper(options),
        Error,
        'foobar'
      )
        .then(function () {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })
  })

  describe('successes', function () {
    it('should not enqueue jobs if there are no containers', function () {
      Docker.prototype.getContainers.resolves([])
      return assert.isFulfilled(enqueueContainerJobsHelper(options))
        .then(function (result) {
          assert.equal(result, 0, 'no jobs enqueued')
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })

    it('should not enqueue jobs if the dock no longer exists', function () {
      Swarm.prototype.checkHostExists.throws(new Swarm.InvalidHostError())
      Docker.prototype.getContainers.resolves([{ Id: 4 }])
      return assert.isFulfilled(enqueueContainerJobsHelper(options))
        .then(function (result) {
          assert.equal(result, 0, 'no jobs queued')
          sinon.assert.notCalled(Docker.prototype.getContainers)
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })

    it('should return a promise resolving the number of jobs', function () {
      Docker.prototype.getContainers.resolves([{ Id: 4 }])
      return assert.isFulfilled(enqueueContainerJobsHelper(options))
        .then(function (result) {
          assert.equal(result, 1, 'had 1 container')
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            sinon.match.object,
            ['philter'],
            undefined
          )
          sinon.assert.calledOnce(rabbitmq.publishTask)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
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
