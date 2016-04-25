'use strict'

const loadenv = require('loadenv')
loadenv()

const Promise = require('bluebird')
const request = require('request')

const CONSUL_HOST = process.env.CONSUL_HOST
const SWARM_PREFIX = 'swarm/docker/swarm/nodes/'

function Consul () {}

Consul._makeRequest = function (url) {
  return Promise.fromCallback((cb) => {
    request.get(url, {}, cb)
  }, { multiArgs: true })
    .spread((res, body) => {
      return JSON.parse(body)
    })
    .map((v) => {
      v.Value = v.Value ? (new Buffer(v.Value, 'base64')).toString('utf-8') : ''
      return v
    })
    .catch((err) => {
      console.error(err.stack || err.message)
    })
}

Consul._getRecursiveKV = function (prefix) {
  return Consul._makeRequest(`http://${CONSUL_HOST}/v1/kv/${prefix}?recurse=true`)
}

Consul.getSwarmNodes = function () {
  return Consul._getRecursiveKV(SWARM_PREFIX)
    .then((pairs) => {
      return pairs.map((p) => (p.Key.substr(SWARM_PREFIX.length)))
    })
}

module.exports = Consul
