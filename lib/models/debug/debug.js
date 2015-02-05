'use strict';

var DebugModule = require('debug');

function Debug (fileName) {
  var prefix = GLOBAL.fileNameRegex.exec(fileName)[0];
  this.debug = new DebugModule('khronos|'+prefix);
}

Debug.prototype.log = function (message) {
  this.debug(message);
};

module.exports = function (fileName) {
  return new Debug(fileName);
};
