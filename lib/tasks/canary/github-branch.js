'use strict'

require('loadenv')()

var api = require('../../models/api')
var CanaryFailedError = require('../../errors/canary-failed-error')
var github = require('../../models/github')
var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))

var CanaryBase = require('./CanaryBase')

/**
 * Runs a canary test against the production API to ensure we can successfully
 * push new branches using the Github API. The results of the test are reported
 * to datadog.
 * @param {object} job The canary job to exectute.
 * @return {Promise} Resolves when the github hook has been successfully completed.
 */
module.exports = (job) => {
  return new GithubBranchCanary(job).executeTest()
}

class GithubBranchCanary extends CanaryBase {

  constructor (job) {
    super(job)
    this.instanceId = process.env.CANARY_GITHUB_BRANCHES_INSTANCE_ID
    this.queue = 'khronos:canary:github-branch'
    this.name = 'Github Branch Canary'
    this.gauge = 'canary.github-branch'
    this.branchName = 'test-branch-' + (new Date().getTime())
    this.refName = 'refs/heads/' + this.branchName

    this.log = this.log.child({
      task: this.queue,
      instanceId: this.instanceId
    })
  }

  setup () {
    return api.connect(process.env.CANARY_API_TOKEN)
      .then((client) => {
        this.client = client
      })
      .catch((err) => {
        throw new CanaryFailedError('Error connecting to Runnable client', {err: err})
      })
  }

  test () {
    return this.setup()
      .then(() => {
        this.log.debug('Fetching canary test repository')
        return this.client.fetchInstanceAsync(this.instanceId)
      })
      .then((rawInstanceData) => {
        var instance = this.client.newInstance(rawInstanceData)
        var status = instance.status()
        if (status !== 'running') {
          throw new CanaryFailedError('Instance not running')
        }
        return instance
      })
      .then((instance) => {
        let acv = instance.attrs.contextVersion.appCodeVersions[0]
        this.userName = acv.repo.split('/')[0]
        this.repoName = acv.repo.split('/')[1]
        this.log.debug('Getting all commits')
        return Promise.fromCallback((cb) => {
          github.repos.getCommits({
            repo: this.repoName,
            user: this.userName
          }, cb)
        })
          .then((commits) => {
            this.lastCommitSha = commits[0].sha
            this.log.debug({ branchName: this.refName, commit: this.lastCommitSha }, 'Creating new branch from commit')
            return Promise.fromCallback((cb) => {
              github.gitdata.createReference({
                repo: this.repoName,
                user: this.userName,
                ref: this.refName,
                sha: this.lastCommitSha
              }, cb)
            })
          })
          .then((ref) => {
            this.ref = ref
            return instance
          })
          .catch((err) => {
            throw new CanaryFailedError('Unable to make Github API request', {err: err})
          })
      })
      .delay(process.env.CANARY_GITHUB_BRANCH_DELAY)
      .then((instance) => {
        this.log.debug('Fetch all containers by their owner and repo name')
        return this.client.fetchInstancesAsync({
          githubUsername: this.userName
        })
          .then((allInstances) => {
            return allInstances.filter((instance) => {
              return instance.name.toLowerCase().includes(this.repoName.toLowerCase())
            })
          })
      })
      .then((instances) => {
        let instancesWithBranchName = instances.filter((x) => x.name.includes(this.branchName))
        if (instancesWithBranchName.length === 0) {
          throw new CanaryFailedError('No instances with branch name found. Branch was not auto-deployed.')
        }
      })
      .then(this.teardown.bind(this))
  }

  teardown () {
    // Would have loved to use node-github, but this request didn't work
    return request.delAsync({
      url: this.ref.url + '?access_token=' + process.env.CANARY_API_TOKEN,
      headers: {
        'User-Agent': 'request'
      }
    })
      .catch((err) => {
        this.log.debug({err: err}, 'Test teardown failed. Ignoring error.')
      })
  }
}
