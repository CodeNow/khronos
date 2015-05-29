/**
 * Mock Mavis API responses
 * @module test/mocks/mavis/index
 */
'use strict';

var docks = require('./docks');
var nock = require('nock');

module.exports = function (host) {
  var mavisUrlRegex = /^(.+)\//;
  var mavisUrlRegexExecResult = mavisUrlRegex.exec(process.env.KHRONOS_MAVIS || host);
  nock(mavisUrlRegexExecResult[0])
    .get('/docks')
    .reply(200, docks);
};
