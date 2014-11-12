var Code = require('code');
var Lab = require('lab');
var lab = exports.lab = Lab.script();

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var after = lab.after;
var expect = Code.expect;

var dockerMock = require('docker-mock');

describe('basic', function() {
  it('should pass', function() {
    expect(true).to.equal(true);
  });
});
