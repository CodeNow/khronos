'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
chai.use(require('chai-as-promised'))
var assert = chai.assert
var expect = chai.expect

// external
var async = require('async')
var Container = require('dockerode/lib/container')
var Docker = require('dockerode')
var dockerMock = require('docker-mock')
var Hermes = require('runnable-hermes')
var ponos = require('ponos')
var sinon = require('sinon')

// internal
var dockerFactory = require('../factories/docker')

var docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
})

describe('Prune Exited Weave Containers', function () {
  var tasks = {
    'khronos:containers:delete': require('../../lib/tasks/containers/delete'),
    'khronos:weave:prune-dock': require('../../lib/tasks/weave/prune-dock'),
    'khronos:weave:prune': require('../../lib/tasks/weave/prune')
  }
  var hermes = new Hermes({
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    queues: Object.keys(tasks)
  })
  var dockerMockServer
  var workerServer

  before(function (done) {
    dockerMockServer = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT, done)
  })
  beforeEach(function () {
    process.env.KHRONOS_DOCKS =
      'http://localhost:' + process.env.KHRONOS_DOCKER_PORT
    sinon.spy(Container.prototype, 'remove')
    sinon.spy(tasks, 'khronos:weave:prune-dock')
    sinon.spy(tasks, 'khronos:containers:delete')
    workerServer = new ponos.Server({ hermes: hermes })
    var startServerPromise = workerServer.setAllTasks(tasks)
      .then(workerServer.start())
    assert.isFulfilled(startServerPromise)
  })
  afterEach(function () {
    assert.isFulfilled(workerServer.stop())
  })
  afterEach(function (done) {
    process.env.KHRONOS_DOCKS = null
    Container.prototype.remove.restore()
    tasks['khronos:weave:prune-dock'].restore()
    tasks['khronos:containers:delete'].restore()
    dockerFactory.deleteAllImagesAndContainers(docker, done)
  })
  after(function (done) {
    dockerMockServer.close(done)
  })

  describe('unpopulated dock', function () {
    it('should run successfully', function (done) {
      workerServer.hermes.publish('khronos:weave:prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['khronos:weave:prune-dock'].callCount === 1
        },
        function (err) {
          if (err) { return done(err) }
          expect(Container.prototype.remove.callCount).to.equal(0)
          setTimeout(done, 100)
        })
    })
  })

  describe('on a populated dock', function () {
    beforeEach(dockerFactory.createRandomContainers.bind(null, docker, 5))

    it('should run successfully with no weave containers', function (done) {
      workerServer.hermes.publish('khronos:weave:prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['khronos:weave:prune-dock'].callCount === 1
        },
        function (err) {
          if (err) { return done(err) }
          expect(Container.prototype.remove.callCount).to.equal(0)
          dockerFactory.listContainersAndAssert(
            docker,
            function (containers) { expect(containers).to.have.length(5) },
            function (err) {
              if (err) { return done(err) }
              setTimeout(done, 100)
            })
        })
    })
    it('should run successfully on multiple docks', function (done) {
      process.env.KHRONOS_DOCKS =
        process.env.KHRONOS_DOCKS + ',' + process.env.KHRONOS_DOCKS
      workerServer.hermes.publish('khronos:weave:prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['khronos:weave:prune-dock'].callCount === 2
        },
        function (err) {
          if (err) { return done(err) }
          expect(Container.prototype.remove.callCount).to.equal(0)
          dockerFactory.listContainersAndAssert(
            docker,
            function (containers) { expect(containers).to.have.length(5) },
            function (err) {
              if (err) { return done(err) }
              setTimeout(done, 100)
            })
        })
    })

    describe('where weave containers are present', function () {
      beforeEach(dockerFactory.createWeaveContainers.bind(null, docker, 2))

      it('should only remove dead weave containers', function (done) {
        workerServer.hermes.publish('khronos:weave:prune', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () { return Container.prototype.remove.callCount === 2 },
          function (err) {
            if (err) { return done(err) }
            expect(tasks['khronos:weave:prune-dock'].callCount).to.equal(1)
            expect(tasks['khronos:containers:delete'].callCount).to.equal(2)
            expect(Container.prototype.remove.callCount).to.equal(2)
            dockerFactory.listContainersAndAssert(
              docker,
              function (containers) { expect(containers).to.have.length(5) },
              function (err) {
                if (err) { return done(err) }
                setTimeout(done, 100)
              })
          })
      })
    })
  })
})
