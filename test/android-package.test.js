import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findPackageName, isValidPackageName } from '../src/android-package.js';

function projectFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-package-'));
  const android = path.join(root, 'android');
  fs.mkdirSync(path.join(android, 'app'), { recursive: true });
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, android };
}

test('reads applicationId from Groovy build.gradle and ignores comments', (context) => {
  const project = projectFixture(context);
  fs.writeFileSync(path.join(project.android, 'app', 'build.gradle'), `
    // applicationId "com.wrong.comment"
    android {
      namespace "com.example.namespace"
      defaultConfig {
        applicationId "com.example.release"
      }
    }
  `);

  assert.equal(findPackageName(project), 'com.example.release');
});

test('reads applicationId from Kotlin build.gradle.kts', (context) => {
  const project = projectFixture(context);
  fs.writeFileSync(path.join(project.android, 'app', 'build.gradle.kts'), `
    android { defaultConfig { applicationId = "com.example.kotlin" } }
  `);

  assert.equal(findPackageName(project), 'com.example.kotlin');
});

test('falls back to namespace and AndroidManifest package', (context) => {
  const namespaceProject = projectFixture(context);
  fs.writeFileSync(
    path.join(namespaceProject.android, 'app', 'build.gradle'),
    'android { namespace "com.example.namespace" }',
  );
  assert.equal(findPackageName(namespaceProject), 'com.example.namespace');

  const manifestProject = projectFixture(context);
  const manifest = path.join(manifestProject.android, 'app', 'src', 'main', 'AndroidManifest.xml');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, '<manifest package="com.example.manifest"></manifest>');
  assert.equal(findPackageName(manifestProject), 'com.example.manifest');
});

test('validates Android package names', () => {
  assert.equal(isValidPackageName('com.example.app'), true);
  assert.equal(isValidPackageName('com.example_app.release2'), true);
  assert.equal(isValidPackageName('not-a-package'), false);
  assert.equal(isValidPackageName(''), false);
});
