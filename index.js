'use strict'

require('loadenv')('khronos:test')

var log = require('logger')
var ponos = require('ponos')
var rabbitmq = require('models/rabbitmq')

var tasks = {
  'khronos:containers:delete': require('tasks/containers/delete'),
  'khronos:containers:image-builder:prune-dock': require('tasks/image-builder/prune-dock'),
  'khronos:containers:image-builder:prune': require('tasks/image-builder/prune'),
  'khronos:containers:orphan:check-against-mongo': require('tasks/containers/check-against-mongo'),
  'khronos:containers:orphan:prune-dock': require('tasks/containers/prune-orphans-dock'),
  'khronos:containers:orphan:prune': require('tasks/containers/prune-orphans'),
  'khronos:containers:remove': require('tasks/containers/remove'),
  'khronos:context-versions:check-recent-usage': require('tasks/context-versions/check-recent-usage'),
  'khronos:context-versions:prune-expired': require('tasks/context-versions/prune-expired'),
  'khronos:context-versions:remove-and-protect-instances': require('tasks/context-versions/remove-and-protect-instances'),
  'khronos:images:check-against-context-versions': require('tasks/images/check-against-context-versions'),
  'khronos:images:prune-dock': require('tasks/images/prune-dock'),
  'khronos:images:prune': require('tasks/images/prune'),
  'khronos:images:remove': require('tasks/images/remove'),
  'khronos:weave:prune-dock': require('tasks/weave/prune-dock'),
  'khronos:weave:prune': require('tasks/weave/prune'),
  'khronos:docks:obliterate-codenow': require('tasks/docks/obliterate-codenow')
}
var hermes = rabbitmq(Object.keys(tasks))
var server = new ponos.Server({ hermes: hermes })

server.setAllTasks(tasks)
server.start()
  .then(function () { log.info('Worker Server has started') })
  .catch(function (err) {
    log.fatal({ err: err }, 'Error starting Server')
    throw err
  })
