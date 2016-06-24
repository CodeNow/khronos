'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const chai = require('chai')
const monitor = require('monitor-dog')
const sinon = require('sinon')

// Internal
const Swarm = require('models/swarm')
const TaskError = require('ponos').TaskError
const TaskFatalError = require('ponos').TaskFatalError

// internal (being tested)
const OrganizationCreated = require('tasks/organization/created')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Organization Created Task', function () {
  beforeEach(function () {
    sinon.stub(Swarm.prototype, 'getHostsWithOrgs')
    sinon.stub(monitor, 'event')
  })
  afterEach(function () {
    Swarm.prototype.getHostsWithOrgs.restore()
    monitor.event.restore()
  })

  describe('Joi validation', function () {
    it('should fail if empty', function () {
      return assert.isRejected(OrganizationCreated())
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'Invalid Job')
        })
    })
    it('should fail missing createdAt', function () {
      return assert.isRejected(OrganizationCreated({
        githubId: 123213,
        orgName: 'asdasdasd'
      }))
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'Invalid Job')
        })
    })
    it('should fail missing githubId', function () {
      return assert.isRejected(OrganizationCreated({
        createdAt: Math.floor(new Date().getTime() / 1000),
        orgName: 'asdasdasd'
      }))
        .then(function (err) {
          assert.instanceOf(err, TaskFatalError)
          assert.include(err.message, 'Invalid Job')
        })
    })
    it('should fail missing orgName', function () {
      return assert.isRejected(OrganizationCreated({
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
      return assert.isRejected(OrganizationCreated({
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
    var orgWithoutDock = 21312321
    var rawDock = [{
      host: 'http://localhost:5454',
      org: orgWithDock.toString()
    }]
    beforeEach(function () {
      Swarm.prototype.getHostsWithOrgs.resolves(rawDock)
    })

    it('should resolve successfully', function () {
      return OrganizationCreated({
        createdAt: Math.floor(new Date().getTime() / 1000) - 101,
        githubId: orgWithDock,
        orgName: 'asdasdasd'
      })
    })
    it('should fire off a datadog when the org doesn\'t have a dock!', function () {
      return assert.isRejected(OrganizationCreated({
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
