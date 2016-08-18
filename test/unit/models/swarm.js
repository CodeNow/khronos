'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const chai = require('chai')
const assert = chai.assert

// external
const sinon = require('sinon')
const Promise = require('bluebird')
require('sinon-as-promised')(Promise)
const SwarmClient = require('@runnable/loki').Swarm
// internal (being tested)

const Swarm = require('models/swarm')
const swarm = new Swarm()

describe('Swarm Model', function () {
  describe('getSwarmHosts', function () {
    beforeEach(function (done) {
      sinon.stub(SwarmClient.prototype, 'swarmHostsAsync').resolves([ '127.0.0.1', '127.0.0.2' ])
      done()
    })

    afterEach(function (done) {
      SwarmClient.prototype.swarmHostsAsync.restore()
      done()
    })

    it('should fail if swarmHostsAsync failed', function (done) {
      SwarmClient.prototype.swarmHostsAsync.rejects(new Error('Swarm error'))
      swarm.getSwarmHosts()
      .then(function () {
        return done(new Error('Should never happen'))
      })
      .catch(function (err) {
        assert.equal(err.message, 'Swarm error')
        sinon.assert.calledOnce(SwarmClient.prototype.swarmHostsAsync)
        done()
      })
    })

    it('should succeed if swarmHostsAsync succeeded', function (done) {
      swarm.getSwarmHosts()
      .tap(function (hosts) {
        sinon.assert.calledOnce(SwarmClient.prototype.swarmHostsAsync)
        assert.equal(hosts.length, 2)
        assert.equal(hosts[0], 'http://127.0.0.1')
        assert.equal(hosts[1], 'http://127.0.0.2')
      })
      .asCallback(done)
    })
  })

  describe('checkHostExists', function () {
    beforeEach(function (done) {
      sinon.stub(SwarmClient.prototype, 'swarmHostExistsAsync').resolves(true)
      done()
    })

    afterEach(function (done) {
      SwarmClient.prototype.swarmHostExistsAsync.restore()
      done()
    })

    it('should fail if swarmHostExistsAsync failed', function (done) {
      SwarmClient.prototype.swarmHostExistsAsync.rejects(new Error('Swarm error'))
      swarm.checkHostExists('127.0.0.1')
      .then(function () {
        return done(new Error('Should never happen'))
      })
      .catch(function (err) {
        assert.equal(err.message, 'Swarm error')
        sinon.assert.calledOnce(SwarmClient.prototype.swarmHostExistsAsync)
        done()
      })
    })

    it('should return true host exist', function (done) {
      swarm.checkHostExists('127.0.0.1')
      .tap(function (exists) {
        sinon.assert.calledOnce(SwarmClient.prototype.swarmHostExistsAsync)
        assert.equal(exists, true)
      })
      .asCallback(done)
    })

    it('should return an error if host does not exist', function (done) {
      SwarmClient.prototype.swarmHostExistsAsync.resolves(false)
      swarm.checkHostExists('127.0.0.3')
      .then(function () {
        return done(new Error('Should never happen'))
      })
      .catch(function (err) {
        assert.equal(err.message, 'host is not valid')
        sinon.assert.calledOnce(SwarmClient.prototype.swarmHostExistsAsync)
        done()
      })
    })
  })
})
