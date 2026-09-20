import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'rn.js');

function fakeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-android-kit-integration-'));
  const android = path.join(root, 'android');
  fs.mkdirSync(path.join(android, 'app'), { recursive: true });
  const gradlew = path.join(android, 'gradlew');
  fs.writeFileSync(
    gradlew,
    `#!/bin/sh
set -eu
if [ "$1" = "assembleRelease" ]; then
  mkdir -p app/build/outputs/apk/release
  touch app/build/outputs/apk/release/app-release.apk
elif [ "$1" = "signingReport" ]; then
  printf '> Task :app:signingReport\\n> Variant: debug\\n> Config: debug\\n> Store: debug.keystore\\n> Alias: androiddebugkey\\n> MD5: DEBUG_MD5\\n> SHA1: DEBUG_SHA1\\n> SHA-256: DEBUG_FINGERPRINT\\n> Valid until: 2052\\n> Variant: demoRelease\\n> Alias: release-key\\n> MD5: RELEASE_MD5\\n> SHA-256: RELEASE_FINGERPRINT\\n'
else
  exit 2
fi
`,
  );
  fs.chmodSync(gradlew, 0o755);
  return root;
}

test('builds from the project root and from inside android', (context) => {
  const root = fakeProject();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const fromRoot = spawnSync(process.execPath, [cli, 'apk'], { cwd: root, encoding: 'utf8' });
  assert.equal(fromRoot.status, 0, fromRoot.stderr);
  assert.match(fromRoot.stdout, /app-release\.apk/);

  const fromAndroid = spawnSync(process.execPath, [cli, 'apk'], {
    cwd: path.join(root, 'android'),
    encoding: 'utf8',
  });
  assert.equal(fromAndroid.status, 0, fromAndroid.stderr);
});

test('runs the Gradle signing report and displays SHA-256 fingerprints', (context) => {
  const root = fakeProject();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cli, 'report'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^debug$/m);
  assert.match(result.stdout, /Store: debug\.keystore/);
  assert.match(result.stdout, /Alias: androiddebugkey/);
  assert.match(result.stdout, /MD5: DEBUG_MD5/);
  assert.match(result.stdout, /SHA-256: DEBUG_FINGERPRINT/);
  assert.match(result.stdout, /Valid until: 2052/);
  assert.match(result.stdout, /demoRelease/);
  assert.match(result.stdout, /SHA-256: RELEASE_FINGERPRINT/);
  assert.doesNotMatch(result.stdout, /Task :app:signingReport/);
  assert.doesNotMatch(result.stdout, /SHA1:/);
});

test('starts scrcpy for the only connected device from outside a project', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-screen-integration-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fakeBin = path.join(root, 'bin');
  fs.mkdirSync(fakeBin);

  const adb = path.join(fakeBin, 'adb');
  fs.writeFileSync(adb, `#!/bin/sh
printf 'List of devices attached\\nemulator-5554 device model:Pixel_9 device:emu\\n'
`);
  fs.chmodSync(adb, 0o755);

  const scrcpy = path.join(fakeBin, 'scrcpy');
  fs.writeFileSync(scrcpy, `#!/bin/sh
if [ "$1" = "--version" ]; then
  exit 0
fi
printf 'SCRCPY_ARGS=%s %s\\n' "$1" "$2"
`);
  fs.chmodSync(scrcpy, 0o755);

  const result = spawnSync(process.execPath, [cli, 'screen'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:/usr/bin:/bin` },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pixel 9 \(emulator-5554\)/);
  assert.match(result.stdout, /SCRCPY_ARGS=-s emulator-5554/);
});

test('prints the Homebrew command when scrcpy is missing', () => {
  const result = spawnSync(process.execPath, [cli, 'screen'], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    env: { ...process.env, PATH: '/usr/bin:/bin' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /brew install scrcpy/);
});

test('detects the Gradle package and uninstalls it from the requested device', (context) => {
  const root = fakeProject();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'android', 'app', 'build.gradle'),
    'android { defaultConfig { applicationId "com.example.fixture" } }',
  );

  const fakeBin = path.join(root, 'fake-bin');
  fs.mkdirSync(fakeBin);
  const adb = path.join(fakeBin, 'adb');
  fs.writeFileSync(adb, `#!/bin/sh
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nemulator-5554 device model:Pixel_9\\nphone-123 device model:Galaxy_S24\\n'
  exit 0
fi
printf 'ADB_ARGS=%s %s %s %s\\n' "$1" "$2" "$3" "$4"
`);
  fs.chmodSync(adb, 0o755);

  const result = spawnSync(
    process.execPath,
    [cli, 'uninstall', '--device', 'phone-123'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:/usr/bin:/bin` },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Detected package: com\.example\.fixture/);
  assert.match(result.stdout, /ADB_ARGS=-s phone-123 uninstall com\.example\.fixture/);
});

test('detects the package, launches the app, and streams its PID logs', (context) => {
  const root = fakeProject();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'android', 'app', 'build.gradle'),
    'android { defaultConfig { applicationId "com.example.fixture" } }',
  );

  const fakeBin = path.join(root, 'fake-bin');
  fs.mkdirSync(fakeBin);
  const adb = path.join(fakeBin, 'adb');
  fs.writeFileSync(adb, `#!/bin/sh
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nphone-123 device model:Pixel_9\\n'
elif [ "$3" = "shell" ] && [ "$4" = "pidof" ]; then
  printf '4321\\n'
elif [ "$3" = "logcat" ]; then
  printf 'APP_LOG_LINE for PID %s\\n' "$4"
elif [ "$3" = "shell" ] && [ "$4" = "monkey" ]; then
  exit 0
else
  exit 2
fi
`);
  fs.chmodSync(adb, 0o755);
  const environment = { ...process.env, PATH: `${fakeBin}:/usr/bin:/bin` };

  const launchResult = spawnSync(process.execPath, [cli, 'launch'], {
    cwd: root,
    encoding: 'utf8',
    env: environment,
  });
  assert.equal(launchResult.status, 0, launchResult.stderr);
  assert.match(launchResult.stdout, /Launching com\.example\.fixture on Pixel 9/);
  assert.match(launchResult.stdout, /App launched/);

  const logsResult = spawnSync(process.execPath, [cli, 'logs'], {
    cwd: root,
    encoding: 'utf8',
    env: environment,
  });
  assert.equal(logsResult.status, 0, logsResult.stderr);
  assert.match(logsResult.stdout, /PID 4321/);
  assert.match(logsResult.stdout, /APP_LOG_LINE for PID --pid=4321/);
});
