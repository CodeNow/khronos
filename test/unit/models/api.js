'use strict'

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external

// internal (being tested)
var api = require('models/api')

describe('api model', function () {
  describe('connect', function () {
    it('should reject without a token', function () {
      return assert.isRejected(api.connect(null))
    })
  })
})
