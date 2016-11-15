'use strict'

const Warning = require('error-cat/errors/warning')
const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

const logger = require('logger')

const OrganizationService = module.exports = {
  /**
   * Checks if the Organization exists
   *
   * @throws {Warning}
   */
  checkOrg: function (githubOrgId) {
    return function (org) {
      const log = OrganizationService.log.child({
        githubOrgId,
        org,
        method: 'OrganizationService.checkOrg'
      })
      log.info('OrganizationService.checkOrg called')
      if (!org) {
        throw new Warning('Organization not found', { githubOrgId })
      }
    }
  },
  /**
   * Checks if the Organization allowed
   *
   * @throws {Warning}
   */
  assertActive: function (githubOrgId) {
    return function (org) {
      const log = OrganizationService.log.child({
        githubOrgId,
        org,
        method: 'OrganizationService.assertActive'
      })
      log.info('OrganizationService.assertActive called')
      if (!org.allowed) {
        throw new Warning('Organization is not allowed', { githubOrgId })
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
   * @throws   {Warning}       if a failure occurs while communicating with bigPoppa
   * @throws   {OrganizationNotFoundError} when no organization could be found
   */
  getByGithubId: function (githubOrgId) {
    const log = OrganizationService.log.child({
      githubOrgId,
      method: 'OrganizationService.getByGithubId'
    })
    log.info('OrganizationService.getByGithubId called')

    return bigPoppaClient.getOrganizations({ githubId: githubOrgId })
      .get('0')
      .catch(function () {
        throw new Warning('Organization not found', { githubOrgId })
      })
      .tap(OrganizationService.checkOrg(githubOrgId))
  },

  isActiveOrg: function (githubOrgId) {
    const log = OrganizationService.log.child({
      githubOrgId,
      method: 'OrganizationService.isActiveOrg'
    })
    log.info('OrganizationService.isActiveOrg called')
    return OrganizationService.getByGithubId(githubOrgId)
      .then(OrganizationService.assertActive(githubOrgId))
      .then(function () {
        log.info('OrganizationService.isActiveOrg true')
        return true
      })
      .catch(function () {
        log.info('OrganizationService.isActiveOrg false')
        return false
      })
  }
}
