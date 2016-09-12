'use strict'

// external
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const Intercom = require('intercom-client')
const intercomClient = new Intercom.Client(process.env.INTERCOM_APP_ID, process.env.INTERCOM_API_KEY).usePromises()

module.exports = function (job) {
  return intercomClient.companies.listBy({ company_id: job.lowerName })
    .then(function (response) {
      return response.body
    })
    .catch((err) => {
      throw new WorkerStopError(
        'Task failed when trying to fetch company from intercom',
        { err: err }
      )
    })
    .then((company) => {
      return intercomClient.companies.create({
        company_id: company.company_id,
        custom_attributes: {
          hasConfirmedSetup: job.hasConfirmedSetup
        }
      })
        .catch((err) => {
          throw new WorkerStopError(
            'Task failed when trying to update company in intercom',
            { err: err.body }
          )
        })
    })
}
