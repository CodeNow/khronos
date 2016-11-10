#!/usr/bin/env node
'use strict'

var program = require('commander')
var joi = require('joi')

main()

function main () {
  program
    .version(require('../package.json').version)
    .option('-h, --host <hostname:port>', 'rabbitmq hostname and port')
    .option('-j, --job <job>', 'json string job', parseJob)
    .option('-p, --password <password>', 'rabbitmq password')
    .option('-q, --queue <name>', 'queue name')
    .option('-e, --event <name>', 'event name')
    .option('-u, --username <username>', 'rabbitmq username')
    .parse(process.argv)

  if (!program.queue && !program.event) {
    return program.help()
  }

  if (program.queue && program.event) {
    console.log('Provide only a queue or only an event')
    return program.help()
  }

  var hostname = 'localhost'
  var port = 5672
  if (program.host) {
    var split = program.host.split(':')
    hostname = split[0]
    if (split[1]) {
      port = split[1]
    }
  }
  var username = program.username || 'guest'
  var password = program.password || 'guest'
  var RabbitMQ = require('ponos/lib/rabbitmq')

  var opts = {
    name: 'khronos',
    hostname: hostname,
    port: port,
    username: username,
    password: password
  }

  if (program.queue) {
    opts.tasks = [
      {
        name: program.queue,
        jobSchema: joi.object({}).unknown()
      }
    ]
  } else {
    opts.events = [
      {
        name: program.event,
        jobSchema: joi.object({}).unknown()
      }
    ]
  }

  var publisher = new RabbitMQ({opts})

  publisher.connect()
    .tap(function () {
      process.stdout.write('enqueueing job... ')
      if (program.queue) {
        return publisher.publishTask(program.queue, program.job)
      } else {
        return publisher.publishEvent(program.event, program.job)
      }
    })
    .then(function () {
      console.log('published the following job to ' + program.queue || program.event)
      console.log(program.job)
      return publisher.disconnect()
    })

  function parseJob (job) {
    if (job === '') { job = '{}' }
    return JSON.parse(job)
  }
}
