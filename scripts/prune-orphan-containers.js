/**
 * Prune containers from each dock if no corresponding instance document exists
 * @module scripts/prune-orphan-containers
 */
'use strict';

var async = require('async');
var equals = require('101/equals');
var findIndex = require('101/find-index');
var pluck = require('101/pluck');

var datadog = require('models/datadog/datadog')(__filename);
var dockerModule = require('models/docker/docker');
var log = require('logger').getChild(__filename);
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb');

var TEST_IMAGE_TAG =
    new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');
var IMAGE_FILTERS = [
  TEST_IMAGE_TAG,
  /^[A-z0-9]{12}$/
];

module.exports = function(finalCB) {
  log.info('prune-orphan-containers start');
  var orphanedContainersCount = 0;
  var totalContainersCount = 0;
  datadog.startTiming('complete-prune-orphan-containers');
  // for each dock
    // find all containers with tag 'registry.runnable.io'
    // query mongodb instances and if any container is not in db, remove it from dock
  mavis.getDocks(function (err) {
    if (err) {
      log.error({
        err: err
      }, 'prune-orphan-containers mavis.getDocks error');
      finalCB(err);
    }
    processOrphanContainers();
  });
  function processOrphanContainers () {
    log.trace('processOrphanContainers');
    async.each(mavis.docks,
    function (dock, dockCB) {
      log.trace({
        dock: dock
      }, 'processOrphanContainers async.each');
      var docker = dockerModule();
      docker.connect(dock);
      async.series([
        docker.getContainers.bind(docker, {all: true}, IMAGE_FILTERS),
        fetchInstancesAndPrune
      ], function (err) {
        if (err) {
          log.error({
            err: err,
            dock: dock
          }, 'processOrphanContainers complete error');
        }
        else {
          log.trace({
            dock: dock
          }, 'processOrphanContainers complete success');
        }
        totalContainersCount += docker.containers.length;
        dockCB();
      });
      function fetchInstancesAndPrune (fetchCVCB) {
        log.trace({
          dock: dock
        }, 'fetchInstancesAndPrune');
        // chunk check context versions in db for batch of 100 images
        var chunkSize = 100;
        var lowerBound = 0;
        var upperBound = Math.min(chunkSize, docker.containers.length);
        var containerSet = [];
        if (docker.containers.length) {
          containerSet = docker.containers.slice(lowerBound, upperBound);
        }
        /**
         * Chunk requests to mongodb to avoid potential memory/heap size issues
         * when working with large numbers of containers and instance documents
         */
        async.doWhilst(
          doWhilstIterator,
          function check () {
            lowerBound = upperBound;
            upperBound = Math.min(upperBound+chunkSize, docker.containers.length);
            containerSet = docker.containers.slice(lowerBound, upperBound);
            return containerSet.length;
          },
          fetchCVCB
        );
        function doWhilstIterator (doWhilstIteratorCB) {
          log.trace({
            dock: dock,
            lowerBound: lowerBound,
            upperBound: upperBound
          }, 'fetchInstancesAndPrune doWhilstIterator');
          /**
           * construct query for instances by iterating over each container
           */
          var query = {
            'container.dockerContainer': {
              '$in': containerSet.map(pluck('Id'))
            }
          };
          log.trace({
            dock: dock,
            query: query
          }, 'mongodb.fetchInstances pre-fetch');
          mongodb.fetchInstances(query, function (err, instances) {
            if (err) {
              log.error({
                err: err,
                dock: dock,
                query: query
              }, 'fetchInstancesAndPrune doWhilstIterator mongodb.fetchInstances error');
              return doWhilstIteratorCB(err);
            }
            /**
             * The difference between the range (upperBound-lowerBound) and the number
             * of instances that were retrieved is the number of orphaned containers
             * that have just been discovered on the current dock.
             */
            var numberMissing = (upperBound - lowerBound) - instances.length;
            if (!numberMissing) {
              log.trace({
                numberMissing: numberMissing,
                upperBound: upperBound,
                lowerBound: lowerBound,
                instancesLength: instances.length,
                dock: dock
              }, 'doWhilstIterator: no missing containers in set');
              return doWhilstIteratorCB();
            }
            log.trace({
              numberMissing: numberMissing,
              upperBound: upperBound,
              lowerBound: lowerBound,
              instancesLength: instances.length,
              dock: dock
            }, 'doWhilstIterator: found missing containers in set');
            // track total number of orphaned containers that were discovered in this cron iteration
            orphanedContainersCount += numberMissing;
            /**
             * determine which containers in containerSet do not have corresponding instances
             * by iterating over each container in containerSet, and searching through the retrieved
             * instance documents for a match. If no match found, this container is an
             * orphan.
             */
            var foundInstancesContainerIds = instances.map(pluck('container.dockerContainer'));
            async.eachSeries(containerSet,
            function (container, eachCB) {
              // have container, is it in the list of "foundInstancesContainerIds" ????
              if (-1 !== findIndex(foundInstancesContainerIds, equals(container.Id))) {
                // container has corresponding Instance, continue (not orphan)
                return eachCB();
              }
              log.trace({
                containerId: container.Id
              }, 'matching instance not found for container, removing container');
              docker.removeContainer(container.Id, eachCB);
            }, doWhilstIteratorCB);
          });
        }
      }
    }, function (err) {
      if (err) {
        log.error({
          err: err,
          orphanedContainersCount: orphanedContainersCount,
          totalContainersCount: totalContainersCount
        }, 'prune-orphan-containers completed error');
      }
      else {
        log.info({
          orphanedContainersCount: orphanedContainersCount,
          totalContainersCount: totalContainersCount
        }, 'prune-orphan-containers completed success');
      }
      datadog.endTiming('complete-prune-orphan-images');
      finalCB(err);
    });
  }
};
