const lib = require('./lib/math');
const { add } = require('./lib/math');

module.exports = function legacy() {
  lib.add(1);
  add(1, 2, 3);
  return lib.whatever();
};
