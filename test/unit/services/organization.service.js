'use strict'
require('loadenv')()

const chai = require('chai')
const assert = chai.assert
chai.use(require('chai-as-promised'))

const keypather = require('keypather')()
const sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

const OrganizationService = require('services/organization.service')

const BigPoppaClient = require('@runnable/big-poppa-client')

describe('Organization Service', function () {
  var orgGithubId
  var bigPoppaOrg
  var user
  var userGithubId
  beforeEach(function (done) {
    orgGithubId = '232323'
    user = {}
    userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    bigPoppaOrg = {
      id: '12123123123',
      githubId: orgGithubId
    }
    done()
  })
  describe('getByGithubId', function () {
    beforeEach(function (done) {
      sinon.stub(BigPoppaClient.prototype, 'getOrganizations').resolves([bigPoppaOrg])
      done()
    })

    afterEach(function (done) {
      BigPoppaClient.prototype.getOrganizations.restore()
      done()
    })
    describe('fail', function () {
      it('should throw OrganizationNotFoundError when no org is returned', function (done) {
        BigPoppaClient.prototype.getOrganizations.resolves([])
        OrganizationService.getByGithubId(orgGithubId)
          .asCallback(function (err) {
            assert.match(err.message, /Organization not found/)
            done()
          })
      })
    })

    describe('success', function () {
      it('should resolve job', function (done) {
        OrganizationService.getByGithubId(orgGithubId)
          .tap(function (org) {
            sinon.assert.calledOnce(BigPoppaClient.prototype.getOrganizations)
            sinon.assert.calledWith(BigPoppaClient.prototype.getOrganizations, {
              githubId: orgGithubId
            })
            assert.equal(org, bigPoppaOrg)
          })
          .asCallback(done)
      })
    })
  })

  describe('isActiveOrg', function () {
    beforeEach(function (done) {
      sinon.stub(OrganizationService, 'getByGithubId').resolves([bigPoppaOrg])
      sinon.stub(OrganizationService, 'assertActive').returns()
      done()
    })
    afterEach(function (done) {
      OrganizationService.getByGithubId.restore()
      OrganizationService.assertActive.restore()
      done()
    })
    it('should return true if success', function (done) {
      OrganizationService.isActiveOrg(orgGithubId)
      .tap(function (isActive) {
        assert.equal(isActive, true)
      })
      .asCallback(done)
    })
    it('should return false if getByGithubId throws', function (done) {
      OrganizationService.getByGithubId.rejects(new Error('No org'))
      OrganizationService.isActiveOrg(orgGithubId)
      .then(function (isActive) {
        assert.equal(isActive, false)
        done()
      })
      .catch(done)
    })
    it('should return false if assertActive throws', function (done) {
      OrganizationService.assertActive.returns(function () {
        throw new Error('Not a valid org')
      })
      OrganizationService.isActiveOrg(orgGithubId)
      .then(function (isActive) {
        assert.equal(isActive, false)
        done()
      })
      .catch(done)
    })
  })
})
