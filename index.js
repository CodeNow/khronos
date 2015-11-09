'use strict'

require('loadenv')('khronos:test')

var log = require('logger')
var ponos = require('ponos')
var rabbitmq = require('models/rabbitmq')

var tasks = {
  'khronos:containers:delete': require('tasks/containers/delete'),
  'khronos:containers:image-builder:prune': require('tasks/image-builder/prune'),
  'khronos:containers:image-builder:prune-dock': require('tasks/image-builder/prune-dock'),
  'khronos:containers:orphan:prune': require('tasks/containers/prune-orphans'),
  'khronos:containers:orphan:prune-dock': require('tasks/containers/prune-orphans-dock'),
  'khronos:containers:orphan:check-against-mongo': require('tasks/containers/check-against-mongo'),
  'khronos:containers:remove': require('tasks/containers/remove'),
  // 'khronos:context-versions:prune':
  // 'khronos:images:orphan:prune':
  'khronos:weave:prune-dock': require('tasks/weave/prune-dock'),
  'khronos:weave:prune': require('tasks/weave/prune')
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
