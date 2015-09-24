#!/usr/bin/env node
'use strict';

var program = require('commander');

program
  .version(require('../package.json').version)
  .option('-h, --host <hostname:port>', 'rabbitmq hostname and port')
  .option('-j, --job <job>', 'json string job', parseJob)
  .option('-p, --password <password>', 'rabbitmq password')
  .option('-q, --queue <name>', 'queue name')
  .option('-u, --username <username>', 'rabbitmq username')
  .parse(process.argv);

if (!program.queue || !program.job) {
  return program.help();
}

var hostname = 'localhost';
var port = 5672;
if (program.hostname) {
  var split = program.hostname.split(':');
  hostname = split[0];
  if (split[1]) { port = split[1]; }
}
var username = program.username || 'guest';
var password = program.password || 'guest';

var hermesClient = require('runnable-hermes')
  .hermesSingletonFactory({
    hostname: hostname,
    port: port,
    username: username,
    password: password,
    queues: [program.queue]
  })
  .connect(enqueueTask);

function enqueueTask (err) {
  if (err) { throw err; }
  process.stdout.write('enqueueing job... ');
  hermesClient.on('publish', function () {
    process.stdout.write('done.\r\n');
    console.log('enqueued the following job to ' + program.queue);
    console.log(program.job);
    hermesClient.close();
  });
  hermesClient.publish(program.queue, program.job);
}

function parseJob (job) {
  if (job === '') { job = '{}'; }
  return JSON.parse(job);
}
