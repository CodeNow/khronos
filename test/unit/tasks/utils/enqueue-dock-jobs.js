'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const chai = require('chai')
const rabbitmq = require('models/rabbitmq')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const Swarm = require('models/swarm')

// internal (being tested)
const enqueueDockJobsHelper = require('tasks/utils/enqueue-dock-jobs')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Enqueue Dock Jobs Helper', function () {
  beforeEach(function () {
    sinon.stub(rabbitmq, 'publishTask').returns()
    sinon.stub(Swarm.prototype, 'getSwarmHosts').resolves(['http://example.com'])
  })
  afterEach(function () {
    rabbitmq.publishTask.restore()
    Swarm.prototype.getSwarmHosts.restore()
  })

  it('should enforce a target queue', function () {
    return assert.isRejected(
      enqueueDockJobsHelper(),
      WorkerStopError
    )
  })

  it('should enforce a string target queue', function () {
    return assert.isRejected(
      enqueueDockJobsHelper(4),
      WorkerStopError
    )
  })

  it('should return a promise resolving the number of jobs', function () {
    return assert.isFulfilled(enqueueDockJobsHelper('queue:one'))
      .then(function (result) {
        assert.equal(result, 1, 'had 1 host')
        sinon.assert.calledOnce(rabbitmq.publishTask)
        sinon.assert.calledWithExactly(
          rabbitmq.publishTask,
          'queue:one',
          { dockerHost: 'http://example.com' }
        )
      })
  })

  it('should throw if mavis errors', function () {
    Swarm.prototype.getSwarmHosts.throws(new Error('foobar'))
    return assert.isRejected(
      enqueueDockJobsHelper('queue:one'),
      Error,
      'foobar'
    )
  })
})
