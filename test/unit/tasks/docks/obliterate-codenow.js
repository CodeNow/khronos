'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const CODENOW_GITHUB_ID = '2335750'

// external
const chai = require('chai')
const Promise = require('bluebird')
const sinon = require('sinon')
const rabbitmq = require('runnable-hermes')

// Internal
const rawDocks = require('../../../mocks/mavis/multiple-docks.json')
const Swarm = require('models/swarm')
const TaskFatalError = require('ponos').TaskFatalError

// internal (being tested)
const ObliterateCodeNow = require('tasks/docks/obliterate-codenow')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Obliterate CodeNow Task', function () {
  beforeEach(function () {
    sinon.stub(Swarm.prototype, 'getHostsWithOrgs').resolves(rawDocks)

    // Because I can't stub rabbitMqHelper :(
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
  })
  afterEach(function () {
    Swarm.prototype.getHostsWithOrgs.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
    rabbitmq.prototype.close.restore()
  })

  it('should register a dock unhealthy for a random codeNow dock', function () {
    return assert.isFulfilled(ObliterateCodeNow())
      .then(function () {
        sinon.assert.calledOnce(Swarm.prototype.getHostsWithOrgs)
        sinon.assert.calledOnce(rabbitmq.prototype.publish)
        sinon.assert.calledWith(
          rabbitmq.prototype.publish,
          'on-dock-unhealthy',
          {
            host: rawDocks[0].host,
            githubId: CODENOW_GITHUB_ID
          }
        )
      })
  })

  describe('when no code now docks exist', function () {
    var rawDock = require('../../../mocks/mavis/docks.json')
    beforeEach(function () {
      Swarm.prototype.getHostsWithOrgs.returns(Promise.resolve(rawDock))
    })

    it('should throw a task fatal error', function () {
      return assert.isRejected(ObliterateCodeNow())
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'No CodeNow')

          sinon.assert.calledOnce(Swarm.prototype.getHostsWithOrgs)
          sinon.assert.notCalled(rabbitmq.prototype.publish)
        })
    })
  })

  describe('when there is an error getting docks from mavis', function () {
    var error = new Error('Mavis Error')
    beforeEach(function () {
      Swarm.prototype.getHostsWithOrgs.returns(Promise.reject(error))
    })

    it('should throw an error', function () {
      return assert.isRejected(ObliterateCodeNow())
        .then(function (err) {
          assert.equal(err, error)
          sinon.assert.calledOnce(Swarm.prototype.getHostsWithOrgs)
          sinon.assert.notCalled(rabbitmq.prototype.publish)
        })
    })
  })
})
