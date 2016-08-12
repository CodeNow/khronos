/**
 * RabbitMQ Factory
 * @module lib/models/rabbitmq
 */
'use strict'

// external
var clone = require('101/clone')
var Hermes = require('runnable-hermes')
var joi = require('joi')
var TaskFatalError = require('ponos').TaskFatalError

/**
 * RabbitMQ factory.
 * @class
 * @param {array} queues String array of queue names to which to connect
 * @return {hermes} RabbitMQ client, hermes
 */
module.exports = function (queues, subscribedEvents, publishedEvents) {
  var arrayOfStrings = joi.array().items(joi.string())
  // we need to enforce this here so that it is a FatalError
  if (joi.validate(queues, arrayOfStrings.required()).error) {
    throw new TaskFatalError('khronos:*', 'queues must be a string array')
  }
  if (joi.validate(subscribedEvents, arrayOfStrings.optional()).error) {
    throw new TaskFatalError('khronos:*', 'subscribedEvents must be a string array')
  }
  var opts = {
    name: 'khronos',
    hostname: process.env.RABBITMQ_HOSTNAME || 'localhost',
    port: process.env.RABBITMQ_PORT || 5672,
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    prefetch: process.env.KHRONOS_PREFETCH || 3,
    queues: queues,
    subscribedEvents: subscribedEvents,
    publishedEvents: publishedEvents
  }
  return module.exports._createClient(opts)
}

module.exports._createClient = function (opts) {
  // clone here so that if/when Hermes modifies the object, we can still test it
  return new Hermes(clone(opts))
}
