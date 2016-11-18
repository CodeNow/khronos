/**
 * RabbitMQ Factory
 * @module lib/models/rabbitmq
 */
'use strict'
const joi = require('joi')
const RabbitMQ = require('ponos/lib/rabbitmq')

function generateJobDefs (tasks) {
  return tasks.map(function (task) {
    return {
      name: task,
      jobSchema: joi.object({}).unknown()
    }
  })
}

/**
 * Rabbitmq internal singelton instance.
 * @type {rabbitmq}
 */
const publisher = new RabbitMQ({
  name: process.env.APP_NAME,
  hostname: process.env.RABBITMQ_HOSTNAME,
  port: process.env.RABBITMQ_PORT,
  username: process.env.RABBITMQ_USERNAME,
  password: process.env.RABBITMQ_PASSWORD,
  events: generateJobDefs([
    'dock.lost',
    'instance.container.health-check.failed',
    'instance.expired'
  ]),
  tasks: generateJobDefs([
    'canary.build.run',
    'canary.failover.run',
    'canary.github-branch.run',
    'canary.log.run',
    'canary.network.run',
    'canary.network-ping.run',
    'containers.delete',
    'containers.image-builder.prune',
    'containers.image-builder.prune-dock',
    'containers.orphan.check-against-mongo',
    'containers.orphan.prune',
    'containers.orphan.prune-dock',
    'containers.remove',
    'context-versions.check-recent-usage',
    'context-versions.prune-expired',
    'context-versions.remove-and-protect-instances',
    'images.check-against-context-versions',
    'images.prune',
    'images.prune-dock',
    'images.remove',
    'instances.cleanup',
    'metrics.container-status',
    'metrics.report-org-container-status',
    'weave.prune',
    'weave.prune-dock'
  ])
})

module.exports = publisher
