/**
 * Mock Docker API responses
 * @module test/mocks/docker/index
 */
'use strict';

var images = require('./images');
var nock = require('nock');

module.exports = function () {
  var nockUrl = 'http://'+
    process.env.KHRONOS_DOCKER_HOST+':'+
    process.env.KHRONOS_DOCKER_PORT;
  console.log('nock url', nockUrl);
  nock(nockUrl)
    .get('/images/json?all=true')
    .reply(200, images);
/*
  images.forEach(function (image) {
    if (!~image.RepoTags[0].indexOf('\u003cnone\u003e:')) { return; }
    nock(nockUrl)
      .delete('/images/'+image.Id)
      .reply(200);
  });
*/
};
