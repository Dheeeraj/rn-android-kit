import fs from 'node:fs';
import path from 'node:path';

export function findPackageName(project) {
  const gradleFiles = [
    path.join(project.android, 'app', 'build.gradle'),
    path.join(project.android, 'app', 'build.gradle.kts'),
  ];

  const gradleSources = gradleFiles
    .filter((file) => fs.existsSync(file))
    .map((file) => stripGradleComments(fs.readFileSync(file, 'utf8')));

  for (const source of gradleSources) {
    const applicationId = staticGradleValue(source, 'applicationId');
    if (isValidPackageName(applicationId)) return applicationId;
  }

  for (const source of gradleSources) {
    const namespace = staticGradleValue(source, 'namespace');
    if (isValidPackageName(namespace)) return namespace;
  }

  const manifest = path.join(project.android, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifest)) {
    const source = fs.readFileSync(manifest, 'utf8');
    const packageName = source.match(/\bpackage\s*=\s*["']([^"']+)["']/)?.[1];
    if (isValidPackageName(packageName)) return packageName;
  }

  const appJson = path.join(project.root, 'app.json');
  if (fs.existsSync(appJson)) {
    try {
      const config = JSON.parse(fs.readFileSync(appJson, 'utf8'));
      const packageName = config.expo?.android?.package || config.android?.package;
      if (isValidPackageName(packageName)) return packageName;
    } catch {
      // A non-JSON or dynamic config cannot be detected safely, so the CLI will ask.
    }
  }

  return undefined;
}

function staticGradleValue(source, key) {
  return source.match(new RegExp(`\\b${key}\\s*(?:=\\s*)?["']([^"']+)["']`))?.[1];
}

function stripGradleComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

export function isValidPackageName(packageName) {
  return typeof packageName === 'string'
    && /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName);
}
