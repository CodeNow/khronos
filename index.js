'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var log = require('logger')
var ponos = require('ponos')
var rabbitmq = require('models/rabbitmq')

var subscribedEvents = [
  'context-version.deleted'
]
var queues = {
  'khronos:canary:build': require('tasks/canary/build'),
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
  'khronos.context-version.deleted': require('tasks/context-versions/deleted'),
  'khronos:context-versions:check-recent-usage': require('tasks/context-versions/check-recent-usage'),
  'khronos:context-versions:prune-expired': require('tasks/context-versions/prune-expired'),
  'khronos:context-versions:remove-and-protect-instances': require('tasks/context-versions/remove-and-protect-instances'),
  'khronos:docks:obliterate-codenow': require('tasks/docks/obliterate-codenow'),
  'khronos:images:check-against-context-versions': require('tasks/images/check-against-context-versions'),
  'khronos:images:prune': require('tasks/images/prune'),
  'khronos:images:prune-dock': require('tasks/images/prune-dock'),
  'khronos:images:remove': require('tasks/images/remove'),
  'khronos:metrics:container-status': require('tasks/metrics/container-status'),
  'khronos:metrics:report-org-container-status': require('tasks/metrics/report-org-container-status'),
  'khronos:weave:prune': require('tasks/weave/prune'),
  'khronos:weave:prune-dock': require('tasks/weave/prune-dock')
}
var hermes = rabbitmq(Object.keys(queues), subscribedEvents)
var server = new ponos.Server({
  hermes: hermes,
  log: log.child({ module: 'ponos' })
})

server.setAllTasks(queues)
log.info('Server start')
server.start()
  .then(function () { log.info('Worker Server has started') })
  .catch(function (err) {
    log.fatal({ err: err }, 'Error starting Server')
    throw err
  })
