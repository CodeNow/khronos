# Khronos

### NOTE

**Tests will not work if you run them using NPN@2.x.x.**

### Intro

Khronos is the Titan god of time and the ages, and is described as destructive and all-devouring. He rules runnable during the so-called Golden Age, after deposing his father (runnable one-point-o). In fear of a prophecy that he would be in turn be overthrown by running out of disk space, Kronos swallows containers as soon as they become lost, orphaned, or forgotten. He is also known for creating schemes which are executed at opportune times.

## Tasks

This is a listing of the "functional title" of a task group and which tasks are utilized to accomplish them:

- prune exited weave containers
  - `weave.prune`: Gets all the docks and enqueues a job for each.
  - `weave.prune-dock`: Gets all the exited weave containers and enqueues a job for each to delete them.
  - `containers.delete`: Deletes individual containers.
- prune image-builder containers
  - `containers.image-builder.prune`: Gets all the docks and enqueues a job for each.
  - `containers.image-builder.prune-dock`: Gets all the exited image-builder containers and enqueues a job for each to delete them.
  - `containers.delete`: Deletes individual containers.
- prune orphan containers
  - `containers.orphan.prune`: Gets all the docks and enqueues a job for each.
  - `containers.orphan.prune-dock`: Gets every container on the dock and enqueues a job to check it against mongo.
  - `containers.orphan.check-against-mongo`: Check container against mongo and if it doesn't exist, enqueue a job to delete it.
  - `containers.remove`: Stops and deletes containers.
- canary tests
  - `canary.build`: Rebuilds a specific canary container without cache and reports success/failure to datadog.

```
NODE_ENV=production|staging npm start

// Testing
npm test

// Individual tests
NODE_ENV=test NODE_PATH=lib/ node node_modules/lab/bin/lab test/___.unit.js
DEBUG=khronos* (for debug output)

// Run examples
NODE_ENV=staging NODE_PATH=./lib MANUAL_RUN=true DEBUG=khronos* node index.js

// ENV Flags
DRY_RUN=true    # docker stop/kill/remove commands stubbed (very time consuming, useful for quick test)
MANUAL_RUN=true # run immediately rather than wait for scheduled datetime
```



