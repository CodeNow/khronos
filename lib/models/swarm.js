'use strict'

require('loadenv')()

const SwarmClient = require('@runnable/loki').Swarm
const logger = require('logger').getChild(__filename)
const util = require('util')

module.exports = class Swarm extends SwarmClient {
  /**
   * creates swarm class
   * @return {Docker} Docker instance
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
          throw new InvalidHostError('host is not valid', {
            host: host
          })
        }
        return true
      })
  }
}

function InvalidHostError (message) {
  Error.apply(this)
  this.message = message
}
util.inherits(InvalidHostError, Error)

module.exports.InvalidHostError = InvalidHostError
