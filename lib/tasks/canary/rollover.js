'use strict'

require('loadenv')()

var api = require('../../models/api')
var CanaryFailedError = require('../../errors/canary-failed-error')
var Promise = require('bluebird')
var uuid = require('uuid')

var CanaryBase = require('./canary-base')

module.exports = (job) => {
  return new RolloverCanary(job).executeTest()
}

/**
 * Class for testing dock rollover
 */
class RolloverCanary extends CanaryBase {
  constructor (job) {
    super(job)
    this.orgId = process.env.CANARY_ROLLOVER_ORG
    this.queue = 'khronos:canary:rollover'
    this.name = 'Rollover Canary'
    this.gauge = 'canary.rollover'
    this.jobTimeout = 1000 * 60

    this.log = this.log.child({
      task: this.queue,
      orgId: this.orgId
    })
  }

  /**
   * Setup:
   * 1. Create an organization
   * 2. Add a repo to the organization
   * 3. Login to runnable with that organization
   * 4. Add a non-repo container
   * 5. Add a repo container
   * 6. Setup auto-isolation
   * 7. Create a branch with auto isolation
   *
   * Test dock rollover:
   * 1. Mark a dock as unhealthy
   * 2. Wait for all the instances to no longer have containers on that dock
   * 3. Wait for every instance to respond on the HTTP port as expected
   */
  test () {
    console.log('EXECUTING TEST!')
  }
}
