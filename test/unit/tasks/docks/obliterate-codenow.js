'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
chai.use(require('chai-as-promised'))
var assert = chai.assert

var CODENOW_GITHUB_ID = '2335750'

// external
var Promise = require('bluebird')
var sinon = require('sinon')
var rabbitmq = require('runnable-hermes')

// Internal
var Mavis = require('models/mavis')
var TaskFatalError = require('ponos').TaskFatalError
var rawDocks = require('../../../mocks/mavis/multiple-docks.json')

// internal (being tested)
var ObliterateCodeNow = require('tasks/docks/obliterate-codenow')

describe('Obliterate CodeNow Task', function () {
  beforeEach(function () {
    sinon.stub(Mavis.prototype, 'getRawDocks').returns(Promise.resolve(rawDocks))

    // Because I can't stub rabbitMqHelper :(
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
  })
  afterEach(function () {
    Mavis.prototype.getRawDocks.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
    rabbitmq.prototype.close.restore()
  })

  it('should register a dock unhealthy for a random codeNow dock', function () {
    return assert.isFulfilled(ObliterateCodeNow())
      .then(function () {
        sinon.assert.calledOnce(Mavis.prototype.getRawDocks)
        sinon.assert.calledOnce(rabbitmq.prototype.publish)
        sinon.assert.calledWith(rabbitmq.prototype.publish, 'on-dock-unhealthy', { host: rawDocks[0].host, githubId: CODENOW_GITHUB_ID })
      })
  })

  describe('when no code now docks exist', function () {
    var rawDock = require('../../../mocks/mavis/docks.json')
    beforeEach(function () {
      Mavis.prototype.getRawDocks.returns(Promise.resolve(rawDock))
    })

    it('should throw a task fatal error', function () {
      return assert.isRejected(ObliterateCodeNow())
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'No CodeNow')

          sinon.assert.calledOnce(Mavis.prototype.getRawDocks)
          sinon.assert.notCalled(rabbitmq.prototype.publish)
        })
    })
  })

  describe('when there is an error getting docks from mavis', function () {
    var error = new Error('Mavis Error')
    beforeEach(function () {
      Mavis.prototype.getRawDocks.returns(Promise.reject(error))
    })

    it('should throw an error', function () {
      return assert.isRejected(ObliterateCodeNow())
        .then(function (err) {
          assert.equal(err, error)
          sinon.assert.calledOnce(Mavis.prototype.getRawDocks)
          sinon.assert.notCalled(rabbitmq.prototype.publish)
        })
    })
  })
})
