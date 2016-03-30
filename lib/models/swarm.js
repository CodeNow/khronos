'use strict'

// external
const assign = require('101/assign')
const Dockerode = require('dockerode')
const fs = require('fs')
const join = require('path').join
const Promise = require('bluebird')
const Swarmerode = require('swarmerode')
const url = require('url')
const util = require('util')

var certs = {}
try {
  var certPath = process.env.DOCKER_CERT_PATH || '/etc/ssl/docker'
  certs.ca = fs.readFileSync(join(certPath, 'ca.pem'))
  certs.cert = fs.readFileSync(join(certPath, 'cert.pem'))
  certs.key = fs.readFileSync(join(certPath, 'key.pem'))
} catch (err) {
  // log.warn({ err: err }, 'cannot load certificates for docker')
  // use all or none of the certificates
  certs = {}
}

function Swarm () {
  const parsedURL = url.parse(process.env.SWARM_HOST)
  var dockerodeOpts = {
    host: parsedURL.hostname,
    port: parsedURL.port
  }
  assign(dockerodeOpts, certs)
  this.client = new Swarmerode(Dockerode)(dockerodeOpts)
}

Swarm.prototype.getSwarmHosts = function () {
  return Promise.fromCallback((cb) => {
    this.client.swarmHosts(cb)
  })
    .then((hosts) => {
      return hosts.map((h) => { return 'http://' + h })
    })
    .then((hosts) => {
      console.log('HOSTS', hosts)
      return hosts
    })
}

Swarm.prototype.checkHostExists = function (host) {
  if (host.indexOf('//') !== -1) {
    host = host.split('//').pop()
  }
  return new Promise((resolve, reject) => {
    this.client.swarmHostExists(host, (err, result) => {
      if (err) { return reject(err) }
      if (result) { return resolve(true) }
      return reject(new InvalidHostError('host is not valid'))
    })
  })
}

Swarm.prototype.getHostsWithOrgs = function () {
  return new Promise((resolve, reject) => {
    this.client.swarmInfo((err, info) => {
      if (err) { return reject(err) }
      return Object.keys(info.parsedSystemStatus.ParsedNodes).map((k) => {
        const d = info.parsedSystemStatus.ParsedNodes[k]
        return {
          host: 'http://' + d.host,
          org: d.Labels.org.toString()
        }
      })
    })
  })
}

module.exports = Swarm

function InvalidHostError (message) {
  Error.apply(this)
  this.message = message
}
util.inherits(InvalidHostError, Error)

Swarm.InvalidHostError = InvalidHostError
