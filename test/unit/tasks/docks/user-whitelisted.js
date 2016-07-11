'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const sinon = require('sinon')
const chai = require('chai')

const TaskFatalError = require('ponos').TaskFatalError
const rabbitmq = require('runnable-hermes')

// internal (being tested)
const UserWhitelisted = require('tasks/user/whitelisted')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe.only('User Whitelisted Task', function () {
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

  describe('Successful runs', function () {
    var org = 13801594
    beforeEach(function () {
      sinon.stub(rabbitmq.prototype, 'publish').returns()
    })
    afterEach(function () {
      rabbitmq.prototype.publish.restore()
    })

    it('should resolve successfully', function (done) {
      let job = {
        createdAt: Math.floor(new Date().getTime() / 1000) - 101,
        githubId: org,
        orgName: 'asdasdasd'
      }
      UserWhitelisted(job)
        .then(function () {
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:asg:check-created',
            job
          )
        })
        .asCallback(done)
    })
  })
})
