'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const log = require('logger')
const ponos = require('ponos')
const rabbitmq = require('models/rabbitmq')

const events = {
  'context-version.deleted': require('tasks/context-versions/deleted')
}

const tasks = {
  'khronos:canary:build': require('tasks/canary/build'),
  'khronos:canary:failover': require('tasks/canary/failover'),
  'khronos:canary:github-branch': require('tasks/canary/github-branch'),
  'khronos:canary:log': require('tasks/canary/log'),
  'khronos:canary:network': require('tasks/canary/network/index'),
  'khronos:canary:network-ping': require('tasks/canary/network/ping'),
  'khronos:containers:delete': require('tasks/containers/delete'),
  'khronos:containers:image-builder:prune': require('tasks/image-builder/prune'),
  'khronos:containers:image-builder:prune-dock': require('tasks/image-builder/prune-dock'),
  'khronos:containers:orphan:check-against-mongo': require('tasks/containers/check-against-mongo'),
  'khronos:containers:orphan:prune': require('tasks/containers/prune-orphans'),
  'khronos:containers:orphan:prune-dock': require('tasks/containers/prune-orphans-dock'),
  'khronos:containers:remove': require('tasks/containers/remove'),
  'khronos:context-versions:check-recent-usage': require('tasks/context-versions/check-recent-usage'),
  'khronos:context-versions:prune-expired': require('tasks/context-versions/prune-expired'),
  'khronos:context-versions:remove-and-protect-instances': require('tasks/context-versions/remove-and-protect-instances'),
  'khronos:images:check-against-context-versions': require('tasks/images/check-against-context-versions'),
  'khronos:images:prune': require('tasks/images/prune'),
  'khronos:images:prune-dock': require('tasks/images/prune-dock'),
  'khronos:images:remove': require('tasks/images/remove'),
  'khronos:metrics:container-status': require('tasks/metrics/container-status'),
  'khronos:metrics:report-org-container-status': require('tasks/metrics/report-org-container-status'),
  'khronos:weave:prune': require('tasks/weave/prune'),
  'khronos:weave:prune-dock': require('tasks/weave/prune-dock')
}

const server = new ponos.Server({
  log: log.child({ module: 'ponos' }),
  tasks: tasks,
  events: events,
  rabbitmq: {
    channel: {
      prefetch: process.env.KHRONOS_PREFETCH || 3
    },
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME,
    password: process.env.RABBITMQ_PASSWORD
  }
})

log.info('Server start')
rabbitmq.connect()
  .tap(function () { log.info('RabbitMQ Client connected') })
  .then(() => {
    server.start()
      .tap(function () { log.info('Worker Server has started') })
      .catch(function (err) {
        log.fatal({ err: err }, 'Error starting Server')
        throw err
      })
  })
