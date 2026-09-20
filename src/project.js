import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_EXTENSIONS = {
  apk: '.apk',
  aab: '.aab',
};

export function findProject(startDirectory = process.cwd()) {
  let current = path.resolve(startDirectory);

  while (true) {
    const nestedAndroid = path.join(current, 'android');
    if (isAndroidDirectory(nestedAndroid)) {
      return { root: current, android: nestedAndroid };
    }

    if (isAndroidDirectory(current)) {
      return { root: path.dirname(current), android: current };
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(
    'No React Native Android project found. Run this inside a project that has android/gradlew and android/app.',
  );
}

function isAndroidDirectory(directory) {
  return (
    fs.existsSync(path.join(directory, 'gradlew')) &&
    fs.existsSync(path.join(directory, 'app'))
  );
}

export function artifactDirectory(project, type) {
  if (type === 'apk') {
    return path.join(project.android, 'app', 'build', 'outputs', 'apk');
  }
  if (type === 'aab') {
    return path.join(project.android, 'app', 'build', 'outputs', 'bundle');
  }
  return path.join(project.android, 'app', 'build', 'outputs');
}

export function findArtifacts(project, type = 'any') {
  const types = type === 'any' ? ['apk', 'aab'] : [type];
  const artifacts = [];

  for (const currentType of types) {
    const directory = artifactDirectory(project, currentType);
    walk(directory, (filePath, stats) => {
      if (path.extname(filePath).toLowerCase() !== ARTIFACT_EXTENSIONS[currentType]) return;
      artifacts.push({
        type: currentType,
        path: filePath,
        modifiedAt: stats.mtimeMs,
      });
    });
  }

  return artifacts.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

function walk(directory, visit) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, visit);
    } else if (entry.isFile()) {
      visit(entryPath, fs.statSync(entryPath));
    }
  }
}

export function gradleTask(type, variant = 'release') {
  const normalizedVariant = variant.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(normalizedVariant)) {
    throw new Error(`Invalid Android variant: ${variant}`);
  }

  const capitalized = normalizedVariant[0].toUpperCase() + normalizedVariant.slice(1);
  return `${type === 'aab' ? 'bundle' : 'assemble'}${capitalized}`;
}
