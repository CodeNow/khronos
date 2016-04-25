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

// internal
const Consul = require('./consul')

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
  return Consul.getSwarmNodes()
    .then((hosts) => {
      return hosts.map((h) => { return 'http://' + h })
    })
}

/**
 * Verify that a host exists in swarm. Accepts `https://` prefixed hosts for
 * backwards compatibility.
 * @param  {string} host String host to check. Can be of form
 *   "http://ip.addr:3434" or "ip.addr:3434".
 * @return {Promise} Resolves with `true` if valid, rejects otherwise.
 */
Swarm.prototype.checkHostExists = function (host) {
  if (host.indexOf('//') !== -1) {
    host = host.split('//').pop()
  }
  return Consul.getSwarmNodes()
    .then((hosts) => {
      if (hosts.indexOf(host) !== -1) {
        return true
      } else {
        throw new InvalidHostError('host is not valid')
      }
    })
}

/**
 * Get the swarm hosts with the org attached to them.
 * @return {Promise} Resolves with an array of objects of the form:
 *   {
 *     host: 'http://ip.addr:port',
 *     org: 'orgidasastring'
 *   }
 */
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
