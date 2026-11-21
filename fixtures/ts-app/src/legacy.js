const path = require('path');
const { slug } = require('./utils/text');

function legacyPath(name) {
  return path.join('./data/cache', slug(name));
}

module.exports = { legacyPath };
