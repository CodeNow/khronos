#!/usr/bin/env node

/**
 * Prunes containers running/dead > 12 hours
 */

var Docker = require('dockerode');

console.log('connecting to docker daemon');
var docker = new Docker({host:'127.0.0.1', port:4243});

console.log('fetching containers');
docker.listContainers(function (err, containers) {
  console.log(err, containers);
});
