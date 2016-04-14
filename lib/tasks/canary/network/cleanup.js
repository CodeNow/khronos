'use strict'

const enqueueContainerJobs = require('tasks/utils/enqueue-container-jobs')

/**
 * Removes all network canary test containers for the given docker host.
 * @param {object} job The job to perform.
 * @param {string} job.dockerHost The docker host to clean.
 * @return {Promise} Resolves when the task has been completed.
 */
module.export = function networkCleanup (job) {
  return enqueueContainerJobs({
    job: job,
    targetQueue: 'khronos:containers:remove',
    imageFilters: [ new RegExp(process.env.NETWORK_PING_IMAGE) ]
  })
}
