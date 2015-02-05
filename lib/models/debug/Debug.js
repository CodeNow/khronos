'use strict';

var DebugModule = require('debug');

function Debug (fileName) {
  var prefix = /\/?([A-z0-9]+)?\/([A-z0-9]+)\.js$/.exec(fileName)[0]
  this.debug = new DebugModule('khronos|'+prefix);
}

Debug.prototype.log = function (message) {
  this.debug(message);
};

module.exports = Debug;
