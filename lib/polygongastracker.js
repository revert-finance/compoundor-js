// from https://github.com/freelogstudio/ethers-polygongastracker
'use strict';

const axios = require('axios');
const units = require('@ethersproject/units');

const SETTINGS = {
  rapid: 'rapidgaspricegwei',
  min: 'mingaspricegwei',
  standard: 'standardgaspricegwei',
  fast: 'fastgaspricegwei'
};

const cache = {};

exports.createGetGasPrice = (setting = 'rapid') => async () => {
  if (!SETTINGS[setting]) throw Error('setting ' + setting + ' invalid, use one of ' + Object.keys(SETTINGS).join(', '));
  let error = false, result = cache[setting];
  try {
    const {
      data: {
        result
      },
      status
    } = await axios.get('https://gpoly.blockscan.com/gasapi.ashx?apikey=key&method=pendingpooltxgweidata');
    if (status !== 200) error = true;
    else cache[setting] = result[SETTINGS[setting]];
  } catch (e) {
    error = true;
  }
  if (!cache[setting]) throw Error('unable to get gasPrice');
  return units.parseUnits(String(cache[setting]), 9);
};