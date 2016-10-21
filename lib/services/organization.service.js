'use strict'

const Warning = require('error-cat/errors/warning')
const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

const logger = require('logger')

const OrganizationService = module.exports = {
  /**
   * Checks if the Organization exists
   *
   * @resolves {Undefined}
   * @throws {OrganizationNotFoundError}
   */
  checkOrg: function (id) {
    return function (org) {
      if (!org) {
        throw new Warning('Organization not found', {
          id: id
        })
      }
    }
  },

  assertActive: function (id) {
    return function (org) {
      if (!org.allowed) {
        throw new Warning('Organization is not allowed', {
          id: id
        })
      }
    }
  },

  log: logger.child({
    module: 'OrganizationService'
  }),

  /**
   * Fetches an organization by it's github id
   *
   * @param {String} githubOrgId - Github id for the organization to fetch
   *
   * @resolves {Organization}              organization model
   * @throws   {BigPoppaClientError}       if a failure occurs while communicating with bigPoppa
   * @throws   {OrganizationNotFoundError} when no organization could be found
   */
  getByGithubId: function (githubOrgId) {
    const log = OrganizationService.log.child({
      githubOrgId: githubOrgId,
      method: 'OrganizationService.getByGithubId'
    })
    log.info('OrganizationService.getByGithubId called')

    return bigPoppaClient.getOrganizations({ githubId: githubOrgId })
      .get('0')
      .catch(function () {
        throw new Warning('Organization not found', {
          githubOrgId: githubOrgId
        })
      })
      .tap(OrganizationService.checkOrg(githubOrgId))
  },

  isActiveOrg: function (githubOrgId) {
    return OrganizationService.getByGithubId(githubOrgId)
      .then(OrganizationService.assertActive(githubOrgId))
      .then(function () {
        return true
      })
      .catch(function () {
        return false
      })
  }
}
