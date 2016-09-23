'use strict'

// external
var Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
var exists = require('101/exists')
var Intercom = require('intercom-client')
var intercomClient = new Intercom.Client(process.env.INTERCOM_APP_ID, process.env.INTERCOM_API_KEY).usePromises()
var datadog = require('models/datadog')('org.instance.stats')

module.exports = function (job) {
  var processedData = {}
  return Promise.try(() => {
    if (!exists(job.orgId)) {
      throw new WorkerStopError('orgId is required')
    }
    if (!exists(job.orgName)) {
      throw new WorkerStopError('orgName is required')
    }
    if (!exists(job.instances)) {
      throw new WorkerStopError('instances is required')
    }
    if (!exists(job.totalInstances)) {
      throw new WorkerStopError('totalInstances is required')
    }
  })
    .then(() => {
      var masterStati = {
        urls: [],
        green: 0,
        red: 0,
        orange: 0,
        gray: 0,
        total: 0,
        type: {
          repo: 0,
          nonRepo: 0
        }
      }
      var highestRedName = ''
      var highestRed = 0
      job.instances.forEach((instance) => {
        masterStati.green += instance.masterStatus.green
        masterStati.red += instance.masterStatus.red
        masterStati.orange += instance.masterStatus.orange
        masterStati.gray += instance.masterStatus.gray
        masterStati.total += 1
        if (instance.avgRed > highestRed) {
          highestRed = instance.avgRed
          highestRedName = instance.name
        }
        if (instance.isRepo) {
          masterStati.type.repo += 1
        } else {
          masterStati.type.nonRepo += 1
        }
      })
      processedData = {
        masterStati: masterStati,
        highestRed: highestRed,
        highestRedName: highestRedName
      }
    })
    .then(() => {
      datadog.gauge('total', job.totalInstances, 1, [
        'org:' + job.orgId,
        'orgName:' + job.orgName
      ])
      job.instances.forEach((instance) => {
        var tags = [
          'org:' + job.orgId,
          'orgName:' + job.orgName,
          'containerName:' + instance.name,
          'shortHash:' + instance.shortHash
        ]
        datadog.gauge('pod.total', instance.total, 1, tags)
        datadog.gauge('pod.sumStarting', instance.sumStarting, 1, tags)
        datadog.gauge('pod.sumStopping', instance.sumStopping, 1, tags)
        datadog.gauge('pod.sumRunning', instance.sumRunning, 1, tags)
        datadog.gauge('pod.sumNeverStarted', instance.sumNeverStarted, 1, tags)
        datadog.gauge('pod.sumBuildFailed', instance.sumBuildFailed, 1, tags)
        datadog.gauge('pod.sumBuilding', instance.sumBuilding, 1, tags)
        datadog.gauge('pod.sumStopped', instance.sumStopped, 1, tags)
        datadog.gauge('pod.sumCrashed', instance.sumCrashed, 1, tags)
      })
    })
    .then(() => {
      return intercomClient.companies.listBy({ company_id: job.orgName.toLowerCase() })
        .then(function (response) {
          return response.body
        })
        .catch((err) => {
          throw new WorkerStopError(
            'Task failed when trying to fetch company from intercom',
            { err: err }
          )
        })
    })
    .then((company) => {
      var newDatas = {
        company_id: company.company_id,
        custom_attributes: {
          total_green_master: processedData.masterStati.green,
          total_red_master: processedData.masterStati.red,
          total_orange_master: processedData.masterStati.orange,
          total_gray_master: processedData.masterStati.gray,
          total_masters: processedData.masterStati.total,
          highest_red_percentage: processedData.highestRed * 100,
          highest_red_name: processedData.highestRedName,
          total_containers: job.totalInstances,
          total_repo_master: processedData.masterStati.type.repo,
          total_non_repo_master: processedData.masterStati.type.nonRepo
        }
      }
      return newDatas
    })
    .then((newDatas) => {
      return Promise.all([
        intercomClient.companies.create(newDatas),
        tagCompanyByTemplates(newDatas)
      ])
        .catch((err) => {
          throw new WorkerStopError(
            'Task failed when trying to update company in intercom',
            { err: err.body }
          )
        })
    })
}

function tagCompanyByTemplates (newDatas) {
  if (newDatas.total_repo_master > 0) {
    // Tag 1+ repo on Intercom
    return intercomClient.tag({ name: '1+ Repo', companies: [{ id: newDatas.company_id }] })
  }
  return Promise.resolve()
}
