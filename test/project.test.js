import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findArtifacts, findProject, gradleTask } from '../src/project.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-android-kit-'));
  fs.mkdirSync(path.join(root, 'android', 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'android', 'gradlew'), '#!/bin/sh\n');
  return root;
}

test('finds a project from its root, android folder, and a child folder', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const child = path.join(root, 'android', 'app', 'src');
  fs.mkdirSync(child, { recursive: true });

  assert.equal(findProject(root).root, root);
  assert.equal(findProject(path.join(root, 'android')).root, root);
  assert.equal(findProject(child).root, root);
});

test('finds APK and AAB artifacts with the newest first', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const aab = path.join(root, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  fs.mkdirSync(path.dirname(apk), { recursive: true });
  fs.mkdirSync(path.dirname(aab), { recursive: true });
  fs.writeFileSync(apk, 'apk');
  fs.writeFileSync(aab, 'aab');
  const older = new Date(Date.now() - 10_000);
  fs.utimesSync(apk, older, older);

  assert.equal(findArtifacts(findProject(root), 'apk')[0].path, apk);
  assert.equal(findArtifacts(findProject(root), 'any')[0].path, aab);
});

test('creates the expected Gradle task names', () => {
  assert.equal(gradleTask('apk', 'release'), 'assembleRelease');
  assert.equal(gradleTask('aab', 'release'), 'bundleRelease');
  assert.equal(gradleTask('apk', 'demoRelease'), 'assembleDemoRelease');
  assert.throws(() => gradleTask('apk', '../bad'));
});
