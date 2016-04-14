'use strict'

const enqueueContainerJobs = require('tasks/utils/enqueue-container-jobs')
const logger = require('logger')
const TaskFatalError = require('ponos').TaskFatalError

/**
 * Removes all network canary test containers for the given docker host.
 * @param {object} job The job to perform.
 * @param {string} job.dockerHost The docker host to clean.
 * @return {Promise} Resolves when the task has been completed.
 */
module.export = function networkCleanup (job) {
  const log = logger.child({ job: job })
  return enqueueContainerJobs({
    job: job,
    targetQueue: 'khronos:containers:remove',
    imageFilters: [ new RegExp(process.env.NETWORK_PING_IMAGE) ]
  })
}
