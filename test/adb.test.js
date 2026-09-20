import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  chooseDevice,
  getAppPid,
  getAppUid,
  launchApp,
  listDevices,
  streamAppLogs,
  supportsLogcatUid,
  uninstallPackage,
} from '../src/adb.js';

test('parses authorized adb devices and ignores offline devices', () => {
  const fakeRun = () => ({
    status: 0,
    stdout: [
      'List of devices attached',
      'emulator-5554 device product:sdk model:Pixel_9 device:emu transport_id:1',
      'abc123 offline product:test model:Offline_Phone transport_id:2',
      '',
    ].join('\n'),
  });

  assert.deepEqual(listDevices(fakeRun), [
    { serial: 'emulator-5554', state: 'device', name: 'Pixel 9' },
  ]);
});

test('parses serials containing spaces and collapses duplicate macOS mDNS aliases', () => {
  const fakeRun = () => ({
    status: 0,
    stdout: [
      'List of devices attached',
      'adb-6220ce3e-0a8Grb (2)._adb-tls-connect._tcp device product:venus model:M2012K11AI device:venus',
      'adb-6220ce3e-0a8Grb._adb-tls-connect._tcp device product:venus model:M2012K11AI device:venus',
      '',
    ].join('\n'),
  });

  assert.deepEqual(listDevices(fakeRun), [
    {
      serial: 'adb-6220ce3e-0a8Grb._adb-tls-connect._tcp',
      state: 'device',
      name: 'M2012K11AI',
    },
  ]);
});

test('keeps genuinely different devices so the chooser can display them', () => {
  const fakeRun = () => ({
    status: 0,
    stdout: [
      'List of devices attached',
      'emulator-5554 device model:Pixel_9 device:emu',
      'R5CT123456 device model:Galaxy_S24 device:e3q',
      '',
    ].join('\n'),
  });

  assert.equal(listDevices(fakeRun).length, 2);
});

test('automatically chooses the only connected device', async () => {
  const device = { serial: 'one', state: 'device', name: 'Phone' };
  assert.equal(await chooseDevice([device]), device);
});

test('chooses a requested serial', async () => {
  const devices = [
    { serial: 'one', state: 'device', name: 'One' },
    { serial: 'two', state: 'device', name: 'Two' },
  ];
  assert.equal((await chooseDevice(devices, 'two')).serial, 'two');
});

test('uninstalls the package from the selected device', async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0, null));
    return child;
  };

  await uninstallPackage('emulator-5554', 'com.example.app', fakeSpawn);
  assert.deepEqual(invocation, {
    command: 'adb',
    args: ['-s', 'emulator-5554', 'uninstall', 'com.example.app'],
    options: { stdio: 'inherit' },
  });
});

test('launches the package on the selected device', async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    queueMicrotask(() => child.emit('exit', 0, null));
    return child;
  };

  await launchApp('emulator-5554', 'com.example.app', fakeSpawn);
  assert.deepEqual(invocation, {
    command: 'adb',
    args: [
      '-s', 'emulator-5554', 'shell', 'monkey',
      '-p', 'com.example.app',
      '-c', 'android.intent.category.LAUNCHER',
      '1',
    ],
    options: { stdio: ['ignore', 'pipe', 'pipe'] },
  });
});

test('gets the running app PID', () => {
  const fakeRun = (command, args) => {
    assert.equal(command, 'adb');
    assert.deepEqual(args, ['-s', 'phone-1', 'shell', 'pidof', 'com.example.app']);
    return { status: 0, stdout: '4321\n' };
  };
  assert.equal(getAppPid('phone-1', 'com.example.app', fakeRun), '4321');
});

test('gets the installed package UID', () => {
  const fakeRun = () => ({
    status: 0,
    stdout: 'package:com.example.app uid:10234\npackage:com.example.app.test uid:10235\n',
  });
  assert.equal(getAppUid('phone-1', 'com.example.app', fakeRun), '10234');
});

test('detects UID filtering support from device logcat help', () => {
  assert.equal(supportsLogcatUid('phone-1', () => ({ stdout: '  --uid=<uids> filter by UID' })), true);
  assert.equal(supportsLogcatUid('phone-1', () => ({ stdout: '  --pid=<pid> filter by PID' })), false);
});

test('streams detailed colored error logs for only the app process', async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0, null));
    return child;
  };

  await streamAppLogs(
    'phone-1',
    '--pid=4321',
    { level: 'error', jsOnly: false, color: true },
    fakeSpawn,
  );
  assert.deepEqual(invocation, {
    command: 'adb',
    args: [
      '-s', 'phone-1', 'logcat', '--pid=4321',
      '-v', 'threadtime', '-v', 'color', '*:E',
    ],
    options: { stdio: 'inherit' },
  });
});

test('limits React Native JS logs by tag and priority', async () => {
  let args;
  const fakeSpawn = (_command, receivedArgs) => {
    args = receivedArgs;
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0, null));
    return child;
  };
  await streamAppLogs(
    'phone-1',
    '--uid=10234',
    { level: 'debug', jsOnly: true, color: false },
    fakeSpawn,
  );
  assert.deepEqual(args, [
    '-s', 'phone-1', 'logcat', '--uid=10234',
    '-v', 'threadtime', 'ReactNativeJS:D', '*:S',
  ]);
});
