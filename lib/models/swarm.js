'use strict'

require('loadenv')()

const SwarmClient = require('@runnable/loki').Swarm
const logger = require('logger').getChild(__filename)
const util = require('util')

module.exports = class Swarm extends SwarmClient {
  /**
   * creates swarm class
   * @param  {String} host docker host format: 10.0.0.0:4242
   * @return {Docker}      Docker instance
   */
  constructor () {
    super({ host: process.env.SWARM_HOST, log: logger })
  }

  /**
   * get array of hosts from swarm
   * @return {Promise}
   * @resolves {Object[]} array of nodes
   */
  getSwarmHosts () {
    const log = logger.child({
      module: 'Swarm',
      method: 'getSwarmHosts'
    })
    log.info('call')
    return this.swarmHostsAsync()
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
  checkHostExists (host) {
    const log = logger.child({
      module: 'Swarm',
      method: 'checkHostExists'
    })
    log.info('call')
    if (host.indexOf('//') !== -1) {
      host = host.split('//').pop()
    }
    return this.swarmHostExistsAsync(host)
      .then((result) => {
        if (!result) {
          throw new InvalidHostError('host is not valid')
        }
        return true
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
  getHostsWithOrgs () {
    const log = logger.child({
      module: 'Swarm',
      method: 'getHostsWithOrgs'
    })
    log.info('call')
    return this.client.swarmInfoAsync()
      .then((info) => {
        return Object.keys(info.parsedSystemStatus.ParsedNodes).map((k) => {
          const d = info.parsedSystemStatus.ParsedNodes[k]
          return {
            host: 'http://' + d.host,
            org: d.Labels.org.toString()
          }
        })
      })
  }
}

function InvalidHostError (message) {
  Error.apply(this)
  this.message = message
}
util.inherits(InvalidHostError, Error)

module.exports.InvalidHostError = InvalidHostError
