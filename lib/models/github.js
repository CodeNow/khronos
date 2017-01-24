'use strict'
const GitHubApi = require('github')

const github = new GitHubApi({
  // required
  version: '3.0.0',
  // optional
  protocol: process.env.GITHUB_PROTOCOL,
  host: process.env.GITHUB_VARNISH_HOST,
  port: process.env.GITHUB_VARNISH_PORT,
  timeout: process.env.GITHUB_TIMEOUT_MS
})

github.authenticate({
  type: 'token',
  token: process.env.CANARY_API_TOKEN
})

module.exports = github
