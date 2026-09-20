import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { isScrcpyInstalled, launchScrcpy } from '../src/scrcpy.js';

test('detects whether scrcpy is installed', () => {
  assert.equal(isScrcpyInstalled(() => ({ status: 0 })), true);
  assert.equal(isScrcpyInstalled(() => ({ error: { code: 'ENOENT' } })), false);
});

test('launches scrcpy with the selected device serial', async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0, null));
    return child;
  };

  await launchScrcpy('emulator-5554', fakeSpawn);
  assert.deepEqual(invocation, {
    command: 'scrcpy',
    args: ['-s', 'emulator-5554'],
    options: { stdio: 'inherit' },
  });
});
