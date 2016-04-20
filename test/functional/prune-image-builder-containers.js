'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const chai = require('chai')
const nock = require('nock')
const async = require('async')
const Container = require('dockerode/lib/container')
const Docker = require('dockerode')
const dockerMock = require('docker-mock')
const Hermes = require('runnable-hermes')
const ponos = require('ponos')
const sinon = require('sinon')
const swarmInfoMock = require('swarmerode/test/fixtures/swarm-info')
const MongoDB = require('models/mongodb')

// internal
const dockerFactory = require('../factories/docker')

chai.use(require('chai-as-promised'))
const assert = chai.assert
const expect = chai.expect

const docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
})

describe('Prune Exited Image-Builder Containers', function () {
  var tasks = {
    'khronos:containers:delete': require('../../lib/tasks/containers/delete'),
    'khronos:containers:image-builder:prune': require('../../lib/tasks/image-builder/prune'),
    'khronos:containers:image-builder:prune-dock': require('../../lib/tasks/image-builder/prune-dock')
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
    nock('http://localhost:4242', { allowUnmocked: true })
      .persist()
      .get('/info')
      .reply(200, swarmInfoMock([{
        host: 'localhost:5454'
      }]))
  })
  beforeEach(function () {
    sinon.spy(Container.prototype, 'remove')
    sinon.spy(tasks, 'khronos:containers:image-builder:prune-dock')
    sinon.spy(tasks, 'khronos:containers:delete')
    workerServer = new ponos.Server({ hermes: hermes })
    workerServer.setAllTasks(tasks)
    return assert.isFulfilled(workerServer.start())
  })
  afterEach(function () {
    return assert.isFulfilled(workerServer.stop())
  })
  afterEach(function (done) {
    Container.prototype.remove.restore()
    tasks['khronos:containers:image-builder:prune-dock'].restore()
    tasks['khronos:containers:delete'].restore()
    dockerFactory.deleteAllImagesAndContainers(docker, done)
  })
  afterEach(function () {
    nock.cleanAll()
  })
  after(function (done) {
    dockerMockServer.close(done)
  })

  describe('unpopulated dock', function () {
    it('should run successfully', function (done) {
      workerServer.hermes.publish('khronos:containers:image-builder:prune', {})
      async.until(
        function () {
          var pruneDockTaskCallCount =
          tasks['khronos:containers:image-builder:prune-dock'].callCount
          return pruneDockTaskCallCount === 1
        },
        function (cb) { setTimeout(cb, 100) },
        function (err) {
          if (err) { return done(err) }
          expect(Container.prototype.remove.callCount).to.equal(0)
          setTimeout(done, 100)
        })
    })
  })

  describe('on a populated dock', function () {
    beforeEach(function (done) {
      dockerFactory.createRandomContainers(docker, 5, done)
    })

    it('should run with no iamge-builder containers', function (done) {
      workerServer.hermes.publish('khronos:containers:image-builder:prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          var pruneDockTaskCallCount =
          tasks['khronos:containers:image-builder:prune-dock'].callCount
          return pruneDockTaskCallCount === 1
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

    describe('with multiple docks', function () {
      beforeEach(function () {
        nock.cleanAll()
        nock('http://localhost:4242', { allowUnmocked: true })
          .persist()
          .get('/info')
          .reply(200, swarmInfoMock([{
            host: 'localhost:5454'
          }, {
            host: 'localhost:5454'
          }]))
      })
      it('should run successfully', function (done) {
        workerServer.hermes.publish('khronos:containers:image-builder:prune', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            var pruneDockTaskCallCount =
              tasks['khronos:containers:image-builder:prune-dock'].callCount
            return pruneDockTaskCallCount === 2
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
    })

    describe('where image-builder containers are present', function () {
      var instance
      beforeEach(function () {
        nock.cleanAll()
        nock('http://localhost:4242', { allowUnmocked: true })
          .persist()
          .get('/info')
          .reply(200, swarmInfoMock([{
            host: 'localhost:5454'
          }]))
      })
      beforeEach(function (done) {
        dockerFactory.createImageBuilderContainers(docker, 2, function (err, containers) {
          instance = {
            contextVersion: {
              build: {
                dockerContainer: containers[0].id
              }
            }
          }
          sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync(null, [instance])
          done()
        })
      })
      afterEach(function () {
        MongoDB.prototype.fetchInstances.restore()
      })

      it('should only remove dead image-builder containers', function (done) {
        workerServer.hermes.publish(
          'khronos:containers:image-builder:prune',
          {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            return Container.prototype.remove.callCount === 1
          },
          function (err) {
            if (err) { return done(err) }
            var pruneDockTaskCallCount =
              tasks['khronos:containers:image-builder:prune-dock'].callCount
            expect(pruneDockTaskCallCount).to.equal(1)
            expect(tasks['khronos:containers:delete'].callCount).to.equal(2)
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
