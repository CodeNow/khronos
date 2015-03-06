'use strict';

var async = require('async');
var clone = require('101/clone');
var find = require('101/find');
var request = require('request');
var exec = require('child_process').exec;
var mongo = require('models/mongodb/mongodb');
var startCommands = [];
var instances = {};
var users = {};
var env = clone(process.env);

if (!process.env.KHRONOS_MONGO) {
  console.error('require env.KHRONOS_MONGO');
  return process.exit(2);
}
if (!process.env.DOCKER_HOST) {
  console.error('require env.DOCKER_HOST');
  return process.exit(2);
}

var dry = process.env.DRY !== 'false';

async.series([
  function connectToMongo (cb) {
    mongo.connect(cb);
  },
  function getInstancesOnDock (cb) {
    mongo.fetchInstances({
      'contextVersion.dockerHost': process.env.DOCKER_HOST,
      'container.inspect.State.Running': true
    }, function (err, mongoInstances) {
      if (err) { return cb(err); }
      if (!mongoInstances || mongoInstances.length === 0) {
        return cb(new Error('there are no instances to restart. noop. bye.'));
      }
      console.log('there are', mongoInstances.length, 'to be restarted');
      // TODO: save instance list off to disk for safety
      mongoInstances.forEach(function (i) {
        instances[i._id.toString()] = i;
        if (!users[i.createdBy.github]) {
          users[i.createdBy.github] = {
            token: false,
            username: undefined,
            id: -1,
            instances: [i._id.toString()]
          };
        } else {
          users[i.createdBy.github].instances.push(i._id.toString());
        }
      });
      cb();
    });
  },
  function getUsersForInstances (cb) {
    mongo.fetchUsers({
      'accounts.github.id': { $in: Object.keys(users).map(toInt) }
    }, function (err, mongoUsers) {
      if (err) { return cb(err); }
      if (!mongoUsers || mongoUsers.length === 0) {
        return cb(new Error('did not get any users. sorry, cannot continue'));
      }
      console.log('using', mongoUsers.length, 'users to restart them');
      mongoUsers.forEach(function (u) {
        users[u.accounts.github.id.toString()].token = u.accounts.github.accessToken;
        users[u.accounts.github.id.toString()].login =
          u.accounts.github.username || u.accounts.github.login;
        users[u.accounts.github.id.toString()].id = u.accounts.github.id;
      });
      cb();
    });
  },
  function restartUserContainers (cb) {
    async.eachSeries(
      Object.keys(users),
      function (u, cb) {
        u = users[u];
        if (!u.token) {
          console.warn('we cannot restart instances w/o a user token. skipping', u.login);
          return cb();
        }
        console.log('hello,', u.login);
        async.eachSeries(
          u.instances,
          function (instanceId, cb) {
            if (!instances[instanceId]) {
              console.log('found an instance that I do not know about? confused.');
              return cb();
            }
            if (instances[instanceId].createdBy.github === instances[instanceId].owner.github) {
              // it's owned and created by the user, so it's not an org
              var baseCommand = 'runnable instance:' + instances[instanceId].lowerName;
              var e = clone(env);
              e.RUNNABLE_GITHUB_TOKEN = u.token;
              e.NO_COOKIE = true;
              if (!dry) {
                console.log('running', baseCommand + ' stop');
                exec(baseCommand + ' stop',
                  { env: e },
                  function (err, stdout, stderr) {
                    if (err) {
                      console.error('could not stop instance', instances[instanceId].lowerName);
                      console.error(err, stderr.toString());
                    }
                    console.log(stdout);
                    console.error(stderr);
                    delete instances[instanceId];
                    startCommands.push({
                      cmd: baseCommand + ' start',
                      env: e
                    });
                    // don't pass the error. just accept that the stop failed.
                    cb();
                  }
                );
              } else {
                console.log('running runnable-cli to restart instance',
                  instances[instanceId].lowerName);
                delete instances[instanceId];
                startCommands.push({
                  cmd: baseCommand + ' start',
                  env: e
                });
                console.log('and assumed it worked');
                cb();
              }
            } else {
              cb();
            }
          },
          cb
        );
      },
      cb
    );
  },
  function restartOrgContainers (cb) {
    if (Object.keys(instances).length === 0) {
      console.log('no org instances to restart! noop.');
      return cb();
    }
    console.log('have', Object.keys(instances).length, 'more to restart');
    async.eachSeries(
      Object.keys(users),
      function (u, cb) {
        u = users[u];
        if (!u.token) {
          console.warn('we cannot restart instances w/o a user token. skipping', u.login);
          return cb();
        }
        console.log('hello again,', u.login);
        var instanceIds = u.instances.reduce(function (memo, curr) {
          if (instances[curr]) { memo.push(curr); }
          return memo;
        }, []);
        var opts = {
          url: 'https://api.github.com/users/' + u.login + '/orgs?access_token=' + u.token,
          headers: {
            'user-agent': 'runnable',
            'accept': 'application/json'
          }
        };
        request.get(opts, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            console.error('failed to get orgs for', u.login);
            return cb();
          }
          body = JSON.parse(body);
          async.eachSeries(
            instanceIds,
            function (instanceId, cb) {
              var targetOwnerId = instances[instanceId].owner.github.toString();
              var org = find(body, function (o) {
                return o.id.toString() === targetOwnerId;
              });
              if (!org) {
                console.error('failed find orgs for', targetOwnerId);
                console.error('cannot stop', instances[instanceId].lowerName);
                return cb();
              }
              var baseCommand = [
                'runnable',
                org.login + ':instance:' + instances[instanceId].lowerName
              ].join(' ');
              var e = clone(env);
              e.RUNNABLE_GITHUB_TOKEN = u.token;
              e.NO_COOKIE = true;
              if (!dry) {
                console.log('running', baseCommand + ' stop');
                exec(baseCommand + ' stop', { env: e }, function (err, stdout, stderr) {
                  if (err) {
                    console.error('could not stop instance', instances[instanceId].lowerName);
                    console.error(err, stderr.toString());
                  }
                  console.log(stdout);
                  console.error(stderr);
                  delete instances[instanceId];
                  startCommands.push({
                    cmd: baseCommand + ' start',
                    env: e
                  });
                  // don't pass the error. just accept that the stop failed.
                  cb();
                });
              } else {
                console.log('running runnable-cli to stop instance',
                  org.login,
                  instances[instanceId].lowerName);
                delete instances[instanceId];
                startCommands.push({
                  cmd: baseCommand + ' start',
                  env: e
                });
                console.log('and assumed it worked');
                cb();
              }
            },
            cb);
          },
          cb
        );
      },
      cb
    );
  },
  function waitForGo (cb) {
    console.log('type "GO RUNNABLE" to continue');
    process.stdin.on('data', function (d) {
      d = d.toString().trim();
      if (d === 'GO RUNNABLE') {
        cb();
      } else {
        console.log('nope. not what I was looking for. you said: "' + d + '"');
      }
    });
  },
  function runStartCommands (cb) {
    console.log('running all the things', startCommands.length);
    async.eachSeries(
      startCommands,
      function (cmd, cb) {
        if (!dry) {
          console.log('running', cmd.cmd);
          exec(cmd.cmd, cmd.env, function (err, stdout, stderr) {
            if (err) {
              console.error('could not start instance', cmd.cmd);
              console.error(err);
              console.log(stderr.toString());
            } else {
              console.log('started', cmd.cmd);
              console.log(stdout.toString());
            }
            cb();
          });
        } else {
          console.log('starting', cmd.cmd);
          console.log('started', cmd.cmd);
          cb();
        }
      },
      cb
    );
  }
], function (err) {
  if (err) {
    console.error(err);
    return process.exit(1);
  }
  console.log('done!');
  process.exit(0);
});

function toInt (s) {
  return parseInt(s, 10);
}
