'use strict'

const BigPoppaClient = require('@runnable/big-poppa-client')
const rabbitmq = require('models/rabbitmq')

const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

module.exports = function () {
  return bigPoppaClient.getOrganizations()
    .tap((organizations) => {
      organizations.forEach((org) => {
        // Only bother updating allowed organizations
        if (org.allowed) {
          var newJob = {
            lowerName: org.lowerName,
            githubId: org.githubId,
            hasConfirmedSetup: org.hasConfirmedSetup
          }
          rabbitmq.publishTask('khronos:metrics:report-org-status', newJob)
        }
      })
    })
}
