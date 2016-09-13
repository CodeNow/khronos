'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const log = require('logger')
const ponos = require('ponos')
const rabbitmq = require('models/rabbitmq')

const events = {
  'context-version.deleted': require('tasks/context-versions/deleted')
}

const tasks = {
  'canary.build': require('tasks/canary/build'),
  'canary.failover': require('tasks/canary/failover'),
  'canary.github-branch': require('tasks/canary/github-branch'),
  'canary.log': require('tasks/canary/log'),
  'canary.network': require('tasks/canary/network/index'),
  'canary.network-ping': require('tasks/canary/network/ping'),
  'containers.delete': require('tasks/containers/delete'),
  'containers.image-builder:prune': require('tasks/image-builder/prune'),
  'containers.image-builder:prune-dock': require('tasks/image-builder/prune-dock'),
  'containers.orphan:check-against-mongo': require('tasks/containers/check-against-mongo'),
  'containers.orphan:prune': require('tasks/containers/prune-orphans'),
  'containers.orphan:prune-dock': require('tasks/containers/prune-orphans-dock'),
  'containers.remove': require('tasks/containers/remove'),
  'context-versions.check-recent-usage': require('tasks/context-versions/check-recent-usage'),
  'context-versions.prune-expired': require('tasks/context-versions/prune-expired'),
  'context-versions.remove-and-protect-instances': require('tasks/context-versions/remove-and-protect-instances'),
  'images.check-against-context-versions': require('tasks/images/check-against-context-versions'),
  'images.prune': require('tasks/images/prune'),
  'images.prune-dock': require('tasks/images/prune-dock'),
  'images.remove': require('tasks/images/remove'),
  'instances.cleanup': require('tasks/instances/cleanup'),
  'metrics.container-status': require('tasks/metrics/container-status'),
  'metrics.report-org-container-status': require('tasks/metrics/report-org-container-status'),
  'weave.prune': require('tasks/weave/prune'),
  'weave.prune-dock': require('tasks/weave/prune-dock')
}

const server = new ponos.Server({
  log: log.child({ module: 'ponos' }),
  name: process.env.APP_NAME,
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
