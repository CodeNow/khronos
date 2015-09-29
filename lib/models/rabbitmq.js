'use strict';

// external
var Hermes = require('runnable-hermes');
var isString = require('101/is-string');
var TaskFatalError = require('ponos').TaskFatalError;

/**
 * RabbitMQ factory.
 * @class
 * @param {array} queues String array of queue names to which to connect
 * @return {hermes} RabbitMQ client, hermes
 */
module.exports = function (queues) {
  // we need to enforce this here so that it is a FatalError
  if (!Array.isArray(queues) || !queues.every(isString)) {
    throw new TaskFatalError('queues must be a string array');
  }
  var opts = {
    hostname: process.env.RABBITMQ_HOSTNAME || 'localhost',
    port: process.env.RABBITMQ_PORT || 5672,
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    queues: queues
  };
  return new Hermes(opts);
};
