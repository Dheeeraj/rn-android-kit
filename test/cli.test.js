import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../src/cli.js';

test('parses the memorable command forms', () => {
  assert.deepEqual(parseArgs(['apk']), {
    command: 'apk', type: undefined, variant: 'release', device: undefined, packageName: undefined,
    logLevel: 'verbose', jsOnly: false, buildFirst: false,
    variantExplicit: false, help: false,
  });
  assert.equal(parseArgs(['bundle']).command, 'bundle');
  assert.equal(parseArgs(['build', 'aab']).type, 'aab');
  assert.equal(parseArgs(['install', 'apk', '--device', 'abc']).device, 'abc');
  assert.equal(parseArgs(['apk', '--debug']).variant, 'debug');
  assert.equal(parseArgs(['install', '--debug']).variantExplicit, true);
  assert.equal(parseArgs(['screen']).command, 'screen');
  assert.equal(parseArgs(['scrcpy', '--device', 'phone-1']).device, 'phone-1');
  assert.equal(parseArgs(['uninstall', 'com.example.app']).packageName, 'com.example.app');
  assert.equal(parseArgs(['remove', '--package', 'com.example.app']).packageName, 'com.example.app');
  assert.equal(parseArgs(['report']).command, 'report');
  assert.equal(parseArgs(['launch']).command, 'launch');
  assert.equal(parseArgs(['lauch', 'com.example.app']).packageName, 'com.example.app');
  assert.equal(parseArgs(['logs', '--package', 'com.example.app']).packageName, 'com.example.app');
  assert.equal(parseArgs(['logs', 'error']).logLevel, 'error');
  assert.equal(parseArgs(['logs', 'warnings']).logLevel, 'warn');
  assert.equal(parseArgs(['logs', 'js', '--level', 'debug']).jsOnly, true);
  assert.equal(parseArgs(['logs', 'js', '--level', 'debug']).logLevel, 'debug');
});
