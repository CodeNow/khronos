'use strict';

var dotenv = require('dotenv');
var envIs = require('101/env-is');
var path = require('path');

var ROOT_DIR = path.resolve(__dirname, '..');
var env = process.env.NODE_ENV || 'development';
var read = false;

module.exports = readDotEnvConfigs;

function readDotEnvConfigs () {

  console.log(path.join(__dirname, '../configs/.env'));

  if (read === true) {
    return;
  }
  read = true;
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env'));
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env.'+ env));
  dotenv._setEnvs();
  dotenv.load();
  process.env.ROOT_DIR = ROOT_DIR;

  if (!envIs('test')) {
    console.log('ENVIRONMENT CONFIG', process.env.NODE_ENV, process.env);
  }
}
