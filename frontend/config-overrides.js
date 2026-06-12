const webpack = require('webpack');

module.exports = function override(config) {
  config.resolve.fallback = {
    ...config.resolve.fallback,
    '@react-native-async-storage/async-storage': false,
  };
  return config;
};
