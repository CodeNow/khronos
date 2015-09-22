'use strict';

require('loadenv')('khronos:test');

var log = require('./lib/logger');
var ponos = require('ponos');
var rabbitmq = require('./lib/models/rabbitmq');

var tasks = {
  'khronos:containers:delete': require('./lib/tasks/containers/delete'),
  'khronos:containers:image-builder:prune':
    require('./lib/tasks/image-builder/prune'),
  'khronos:containers:image-builder:prune-dock':
    require('./lib/tasks/image-builder/prune-dock'),
  // 'khronos:containers:orphan:prune':
  // 'khronos:context-versions:prune':
  // 'khronos:images:orphan:prune':
  'khronos:weave:prune-dock': require('./lib/tasks/weave/prune-dock'),
  'khronos:weave:prune': require('./lib/tasks/weave/prune')
};
var hermes = rabbitmq(Object.keys(tasks));
var server = new ponos.Server({ hermes: hermes });

server.setAllTasks(tasks)
  .then(server.start())
  .then(function () { log.info('Worker Server has started'); })
  .catch(function (err) {
    log.fatal({ err: err }, 'Error starting Server');
    throw err;
  });
