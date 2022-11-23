'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  resource
};

function resource(file) {
  // anyway we need a string..
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', file)).toString('utf-8');
}
