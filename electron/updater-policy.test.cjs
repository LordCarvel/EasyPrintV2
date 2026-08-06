const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { shouldSkipUpdateCheck } = require('./updater-policy.cjs');
const packageJson = require('../package.json');

test('nao inicia outra verificacao durante download ou instalacao', () => {
  for (const status of ['downloading', 'downloaded', 'installing']) {
    assert.equal(shouldSkipUpdateCheck(status), true, status);
  }
  assert.equal(shouldSkipUpdateCheck('available'), false);
  assert.equal(shouldSkipUpdateCheck('checking', { scheduled: true }), true);
});

test('gera instalador com elevacao para a pasta Program Files', () => {
  assert.equal(packageJson.build.nsis.oneClick, true);
  assert.equal(packageJson.build.nsis.perMachine, true);
  assert.equal(packageJson.build.nsis.allowElevation, true);
  assert.equal(path.basename(packageJson.build.directories.output), 'release');
});
