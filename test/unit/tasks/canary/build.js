'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var noop = require('101/noop')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var api = require('models/api')
var monitor = require('monitor-dog')
var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))

// internal (being tested)
var buildCanary = require('tasks/canary/build')

describe('Rebuild Canary', function () {
  var mock = {
    oldBuildId: 'some-build-id',
    newBuildId: 'some-new-build-id',
    instanceId: 'some-instance-id',
    naviResponse: {
      body: { count: 1 }
    }
  }

  before(function () {
    process.env.CANARY_REBUILD_INSTANCE_ID = mock.instanceId
    process.env.CANARY_REBUILD_START_DELAY = 0
  })

  beforeEach(function () {
    mock.client = {
      fetchInstanceAsync: sinon.stub().returns(Promise.resolve({
        build: {
          id: mock.oldBuildId
        }
      })),
      deepCopyBuildAsync: sinon.stub().returns(Promise.resolve({
        id: mock.newBuildId
      })),
      buildBuildAsync: sinon.stub().returns(Promise.resolve()),
      updateInstanceAsync: sinon.stub().returns(Promise.resolve()),
      newInstance: noop
    }

    sinon.stub(mock.client, 'newInstance')
      .onFirstCall().returns({ status: sinon.stub().returns('building') })
      .onSecondCall().returns({ status: sinon.stub().returns('running') })

    sinon.stub(api, 'connect').returns(Promise.resolve(mock.client))
    sinon.stub(monitor, 'event')
    sinon.stub(monitor, 'gauge')
    sinon.stub(request, 'getAsync').returns(Promise.resolve(mock.naviResponse))
  })

  afterEach(function () {
    api.connect.restore()
    monitor.event.restore()
    monitor.gauge.restore()
    request.getAsync.restore()
  })

  describe('issueRebuild', function () {
    it('should fetch the instance', function () {
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(mock.client.fetchInstanceAsync, mock.instanceId)
      })
    })

    it('should deep copy the last build', function () {
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(mock.client.deepCopyBuildAsync, mock.oldBuildId)
      })
    })

    it('should build the build', function () {
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(mock.client.buildBuildAsync, mock.newBuildId)
      })
    })

    it('should update the instance with the new build', function () {
      return assert.isFulfilled(buildCanary({})).then(function () {
        assert.deepEqual(mock.client.updateInstanceAsync.firstCall.args, [
          mock.instanceId, { build: mock.newBuildId }
        ])
      })
    })
  }) // end 'issueRebuild'

  describe('testBuildCompletes', function () {
    it('should fail if the instance is not building or starting', function () {
      mock.client.newInstance
        .onFirstCall().returns({ status: sinon.stub().returns('fracking') })
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
      })
    })

    it('should pass if the instance is building', function () {
      mock.client.newInstance
        .onFirstCall().returns({ status: sinon.stub().returns('building') })
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 1)
      })
    })

    it('should pass if the instance is starting', function () {
      mock.client.newInstance
        .onFirstCall().returns({ status: sinon.stub().returns('starting') })
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 1)
      })
    })

    it('should fail if the instance is not running', function () {
      mock.client.newInstance
        .onSecondCall().returns({ status: sinon.stub().returns('building') })
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
      })
    })

    it('should pass if the instance is running', function () {
      mock.client.newInstance
        .onSecondCall().returns({ status: sinon.stub().returns('running') })
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 1)
      })
    })
  }) // end 'testBuildCompletes'

  describe('testNaviURL', function () {
    it('should fail if the navi url could not be reached', function () {
      var error = new Error('some thang was wrong')
      request.getAsync.restore()
      sinon.stub(request, 'getAsync', function () {
        return Promise.reject(error)
      })
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
      })
    })
  }) // end 'testNaviURL'

  describe('checkNaviResult', function () {
    it('should fail if the navi result is null', function () {
      request.getAsync.returns(Promise.resolve(null))
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
      })
    })

    it('should fail if the navi result is malformed', function () {
      request.getAsync.returns(Promise.resolve({}))
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
      })
    })

    it('should fail if the navi result is incorrect', function () {
      request.getAsync.returns(Promise.resolve({ count: 2 }))
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
      })
    })

    it('should pass if the navi result is as expected', function () {
      request.getAsync.returns(Promise.resolve({ count: 1 }))
      return assert.isFulfilled(buildCanary({})).then(function () {
        sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
      })
    })
  }) // end 'checkNaviResult'

  describe('publishFailed', function () {
    it('should send a datadog event on failure', function () {
      request.getAsync.returns(Promise.resolve({ count: 2 }))
      return assert.isFulfilled(buildCanary({})).then(function () {
        assert.deepEqual(monitor.event.firstCall.args[0], {
          title: 'Build Canary Failed',
          text: 'Navi URL did not return the expected result'
        })
      })
    })
  }) // end 'publishFailed'

  describe('stopOnError', function () {
    it('should stop the task and fail on an unexpected error', function () {
      mock.client.fetchInstanceAsync = function () {
        throw new Error('unexpected')
      }
      return assert.isRejected(buildCanary({}), TaskFatalError)
        .then(function () {
          sinon.assert.calledWith(monitor.gauge, 'canary.build', 0)
          assert.deepEqual(monitor.event.firstCall.args[0], {
            title: 'Build Canary Failed',
            text: 'unexpected'
          })
        })
    })
  }) // end 'stopOnError'
}) // end 'Rebuild Canary'
