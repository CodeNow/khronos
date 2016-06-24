'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const chai = require('chai')
const monitor = require('monitor-dog')
const sinon = require('sinon')

// Internal
const rawDocks = require('../../../mocks/swarm/multiple-docks.json')
const Swarm = require('models/swarm')
const TaskError = require('ponos').TaskError
const TaskFatalError = require('ponos').TaskFatalError

// internal (being tested)
const UserWhitelisted = require('tasks/docks/user-whitelisted')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('User Whitelisted Task', function () {
  beforeEach(function () {
    sinon.stub(Swarm.prototype, 'getHostsWithOrgs').resolves(rawDocks)
    sinon.stub(monitor, 'event')
  })
  afterEach(function () {
    Swarm.prototype.getHostsWithOrgs.restore()
    monitor.event.restore()
  })

  describe('Joi validation', function () {
    it('should fail if empty', function () {
      return assert.isRejected(UserWhitelisted())
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'Invalid Job')
        })
    })
    it('should fail missing createdAt', function () {
      return assert.isRejected(UserWhitelisted({
        githubId: 123213,
        orgName: 'asdasdasd'
      }))
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'Invalid Job')
        })
    })
    it('should fail missing githubId', function () {
      return assert.isRejected(UserWhitelisted({
        createdAt: Math.floor(new Date().getTime() / 1000),
        orgName: 'asdasdasd'
      }))
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'Invalid Job')
        })
    })
    it('should fail missing orgName', function () {
      return assert.isRejected(UserWhitelisted({
        createdAt: Math.floor(new Date().getTime() / 1000),
        githubId: 123213
      }))
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'Invalid Job')
        })
    })
  })
  describe('testing the delay', function () {
    process.env.CHECK_ASG_CREATED_DELAY_IN_SEC = 100
    it('should throw TaskError when not enough time has passed ', function () {
      return assert.isRejected(UserWhitelisted({
        createdAt: Math.floor(new Date().getTime() / 1000) + 100,
        githubId: 1232132,
        orgName: 'asdasdasd'
      }))
        .then(function (err) {
          assert.instanceOf(err, TaskError)
          assert.include(err.message, 'still needs to wait')
        })
    })
  })

  describe('Successful runs', function () {
    process.env.CHECK_ASG_CREATED_DELAY_IN_SEC = 100
    var orgWithDock = 13801594
    var orgWithoutDock = 13801594
    var rawDock = require('../../../mocks/swarm/docks.json')
    beforeEach(function () {
      Swarm.prototype.getHostsWithOrgs.resolves(rawDock)
    })

    it('should resolve successfully', function () {
      return UserWhitelisted({
        createdAt: Math.floor(new Date().getTime() / 1000) - 101,
        githubId: orgWithDock,
        orgName: 'asdasdasd'
      })
    })
    it('should fire off a datadog when the org doesn\'t have a dock!', function () {
      return assert.isRejected(UserWhitelisted({
        createdAt: Math.floor(new Date().getTime() / 1000) - 101,
        githubId: orgWithoutDock,
        orgName: 'asdasdasd'
      }))
        .then(function (err) {
          assert.instanceOf(err, TaskError)
          sinon.assert.calledOnce(monitor.event)
        })
    })
  })
})
