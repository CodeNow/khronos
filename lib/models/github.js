'use strict'
var GitHubApi = require('github')

var github = new GitHubApi({
  // required
  version: '3.0.0',
  // optional
  protocol: 'https',
  timeout: process.env.GITHUB_TIMEOUT_MS
})

github.authenticate({
  type: 'token',
  token: process.env.CANARY_API_TOKEN
})

module.exports = github
