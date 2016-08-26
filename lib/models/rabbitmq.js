/**
 * RabbitMQ Factory
 * @module lib/models/rabbitmq
 */
'use strict'
const RabbitMQ = require('ponos/lib/rabbitmq')

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
  events: [
    'instance.container.health-check.failed'
  ],
  tasks: [
    'khronos:canary:build',
    'khronos:canary:failover',
    'khronos:canary:github-branch',
    'khronos:canary:log',
    'khronos:canary:network',
    'khronos:canary:network-ping',
    'khronos:containers:delete',
    'khronos:containers:image-builder:prune',
    'khronos:containers:image-builder:prune-dock',
    'khronos:containers:orphan:check-against-mongo',
    'khronos:containers:orphan:prune',
    'khronos:containers:orphan:prune-dock',
    'khronos:containers:remove',
    'khronos:context-versions:check-recent-usage',
    'khronos:context-versions:prune-expired',
    'khronos:context-versions:remove-and-protect-instances',
    'khronos:images:check-against-context-versions',
    'khronos:images:prune',
    'khronos:images:prune-dock',
    'khronos:images:remove',
    'khronos:metrics:container-status',
    'khronos:metrics:report-org-container-status',
    'khronos:weave:prune',
    'khronos:weave:prune-dock'
  ]
})

module.exports = publisher
