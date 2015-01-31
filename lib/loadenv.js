'use strict';

var dotenv = require('dotenv');
var envIs = require('101/env-is');
var path = require('path');

var ROOT_DIR = path.resolve(__dirname, '..');
var env = process.env.NODE_ENV || 'development';

function readDotEnvConfigs () {
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env'));
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env.'+ env));
  dotenv._setEnvs();
  dotenv.load();
  process.env.ROOT_DIR = ROOT_DIR;
  if (!envIs('test')) {
    console.log('ENVIRONMENT CONFIG', process.env.NODE_ENV, process.env);
  }
}
readDotEnvConfigs();
