'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Hermes = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Mavis = require('models/mavis')

// internal (being tested)
var enqueueDockJobsHelper = require('tasks/utils/enqueue-dock-jobs')

describe('Enqueue Dock Jobs Helper', function () {
  beforeEach(function () {
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
    sinon.stub(Hermes.prototype, 'publish').returns()
    sinon.stub(Mavis.prototype, 'getDocks').returns(['http://example.com'])
  })
  afterEach(function () {
    Hermes.prototype.connect.restore()
    Hermes.prototype.publish.restore()
    Mavis.prototype.getDocks.restore()
  })

  it('should enforce a target queue', function () {
    return assert.isRejected(
      enqueueDockJobsHelper(),
      TaskFatalError
    )
  })

  it('should enforce a string target queue', function () {
    return assert.isRejected(
      enqueueDockJobsHelper(4),
      TaskFatalError
    )
  })

  it('should return a promise resolving the number of jobs', function () {
    return assert.isFulfilled(enqueueDockJobsHelper('queue:one'))
      .then(function (result) {
        assert.equal(result, 1, 'had 1 host')
        sinon.assert.calledOnce(Hermes.prototype.publish)
        sinon.assert.calledWithExactly(
          Hermes.prototype.publish,
          'queue:one',
          { dockerHost: 'http://example.com' }
        )
      })
  })

  it('should throw if mavis errors', function () {
    Mavis.prototype.getDocks.throws(new Error('foobar'))
    return assert.isRejected(
      enqueueDockJobsHelper('queue:one'),
      Error,
      'foobar'
    )
  })

  it('should throw if rabbitmq errors', function () {
    Hermes.prototype.connect.throws(new Error('foobar'))
    return assert.isRejected(
      enqueueDockJobsHelper('queue:one'),
      Error,
      'foobar'
    )
  })
})
