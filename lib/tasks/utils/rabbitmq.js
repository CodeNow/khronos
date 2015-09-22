'use strict';

var isString = require('101/is-string');
var log = require('../../logger').getChild(__filename);
var Promise = require('bluebird');
var RabbitMQ = require('../../models/rabbitmq');
var TaskFatalError = require('ponos').TaskFatalError;

/**
 * RabbitMQ promise-chain helper. Returns a Promise.disposer which is very
 * useful when combined with Promise.using.
 * @param {array<string>} queues Array of string gueue names.
 * @return {promise} Resolved when the RabbitMQ client is created.
 */
module.exports = function (queues) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!Array.isArray(queues) || !queues.every(isString)) {
        throw new TaskFatalError('queues must be a string array');
      }
    })
    .then(function newRabbitConnection () {
      var rabbitmq = new RabbitMQ(queues);
      rabbitmq = Promise.promisifyAll(rabbitmq);
      return rabbitmq.connectAsync()
        .then(function () { return rabbitmq; });
    })
    .disposer(function destroyRabbitConnection (rabbitmq) {
      return rabbitmq.closeAsync()
        .catch(function (err) {
          log.error({ err: err }, 'rabbit cannot close');
          return true;
        });
    });
};
