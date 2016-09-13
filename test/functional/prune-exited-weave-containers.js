'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const async = require('async')
const chai = require('chai')
const Container = require('dockerode/lib/container')
const Docker = require('dockerode')
const dockerMock = require('docker-mock')
const rabbitmq = require('models/rabbitmq')
const nock = require('nock')
const ponos = require('ponos')
const sinon = require('sinon')
const swarmInfoMock = require('swarmerode/test/fixtures/swarm-info')

// internal
const dockerFactory = require('../factories/docker')

chai.use(require('chai-as-promised'))
const assert = chai.assert
const expect = chai.expect

const docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
})

describe('Prune Exited Weave Containers', function () {
  var tasks = {
    'containers.delete': require('../../lib/tasks/containers/delete'),
    'weave.prune-dock': require('../../lib/tasks/weave/prune-dock'),
    'weave.prune': require('../../lib/tasks/weave/prune')
  }
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
    nock('http://127.0.0.1:8500', { allowUnmocked: true })
      .persist()
      .get('/v1/kv/swarm/docker/swarm/nodes/?recurse=true')
      .reply(200, [
        { Key: 'swarm/docker/swarm/nodes/localhost:5454',
          Value: 'localhost:5454' }
      ])
  })
  beforeEach(function () {
    sinon.spy(Container.prototype, 'remove')
    sinon.spy(tasks, 'weave.prune-dock')
    sinon.spy(tasks, 'containers.delete')
    workerServer = new ponos.Server({
      name: process.env.APP_NAME,
      log: require('logger').child({ module: 'ponos' }),
      tasks: tasks
    })
    return assert.isFulfilled(Promise.all([rabbitmq.connect(), workerServer.start()]))
  })
  afterEach(function () {
    return assert.isFulfilled(Promise.all([rabbitmq.disconnect(), workerServer.stop()]))
  })
  afterEach(function (done) {
    Container.prototype.remove.restore()
    tasks['weave.prune-dock'].restore()
    tasks['containers.delete'].restore()
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
      rabbitmq.publishTask('weave.prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['weave.prune-dock'].callCount === 1
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
      rabbitmq.publishTask('weave.prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['weave.prune-dock'].callCount === 1
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
        nock('http://127.0.0.1:8500', { allowUnmocked: true })
          .persist()
          .get('/v1/kv/swarm/docker/swarm/nodes/?recurse=true')
          .reply(200, [
            { Key: 'swarm/docker/swarm/nodes/localhost:5454',
              Value: 'localhost:5454' },
            { Key: 'swarm/docker/swarm/nodes/localhost:5454',
              Value: 'localhost:5454' }
          ])
      })
      it('should run successfully', function (done) {
        rabbitmq.publishTask('weave.prune', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            return tasks['weave.prune-dock'].callCount === 2
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

    describe('where weave containers are present', function () {
      beforeEach(dockerFactory.createWeaveContainers.bind(null, docker, 2))

      it('should only remove dead weave containers', function (done) {
        rabbitmq.publishTask('weave.prune', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () { return Container.prototype.remove.callCount === 2 },
          function (err) {
            if (err) { return done(err) }
            expect(tasks['weave.prune-dock'].callCount).to.equal(1)
            expect(tasks['containers.delete'].callCount).to.equal(2)
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
