'use strict'
var GitHubApi = require('github')

var github = new GitHubApi({
  // required
  version: '3.0.0',
  // optional
  protocol: 'https',
  timeout: 5000
})

github.authenticate({
  type: 'token',
  token: process.env.CANARY_GITHUB_AUTH_TOKEN
})

module.exports = github
