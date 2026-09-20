import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  chooseDevice,
  getAppPid,
  getAppUid,
  installApk,
  launchApp,
  listDevices,
  streamAppLogs,
  supportsLogcatUid,
  uninstallPackage,
} from './adb.js';
import { findPackageName, isValidPackageName } from './android-package.js';
import { artifactDirectory, findArtifacts, findProject, gradleTask } from './project.js';
import { isScrcpyInstalled, launchScrcpy } from './scrcpy.js';
import { formatSigningReport, parseSigningReport } from './signing-report.js';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
);

const HELP = `
rn-android-kit — short Android commands for React Native

Usage:
  rn apk                    Build a release APK
  rn aab                    Build a release Android App Bundle
  rn bundle                 Alias for "rn aab"
  rn build [apk|aab]        Build an APK (default) or AAB
  rn open [apk|aab]         Reveal the newest build artifact
  rn install [apk]          Install the newest APK; build one if missing
  rn uninstall [package]    Uninstall the project app from a device
  rn remove [package]       Alias for "rn uninstall"
  rn report                 Show debug/release signing SHA fingerprints
  rn launch [package]       Open the installed Android app
  rn lauch [package]        Spelling-friendly alias for "rn launch"
  rn logs [package]         Stream logs for the running Android app
  rn screen                 Mirror and control a connected Android device
  rn scrcpy                 Alias for "rn screen"

Options:
  --debug                   Use the debug variant
  --variant <name>          Use another Android build variant
  --device <serial>         Target a specific adb device
  --package <name>          Android package for uninstall/launch/logs
  --level <name>            Log level: verbose, debug, info, warn, error, fatal
  --js                      Show only ReactNativeJS logs
  --build                   Rebuild before installing
  -h, --help                Show help
  -v, --version             Show version

Build, open, install, and automatic package detection work inside a React Native project.
Screen and package-explicit uninstall/launch/log commands work from any directory.
`;

export async function main(args) {
  if (args.includes('--version') || args.includes('-v')) {
    console.log(packageJson.version);
    return;
  }

  const parsed = parseArgs(args);
  if (!parsed.command || parsed.command === 'help' || parsed.help) {
    console.log(HELP.trim());
    return;
  }

  if (parsed.command === 'screen' || parsed.command === 'scrcpy') {
    await screen(parsed.device);
    return;
  }

  if (parsed.command === 'uninstall' || parsed.command === 'remove') {
    await uninstall(parsed);
    return;
  }

  if (parsed.command === 'launch' || parsed.command === 'lauch') {
    await launch(parsed);
    return;
  }

  if (parsed.command === 'logs' || parsed.command === 'log') {
    await logs(parsed);
    return;
  }

  const project = findProject();

  if (parsed.command === 'apk') {
    await build(project, 'apk', parsed.variant);
    return;
  }

  if (parsed.command === 'aab' || parsed.command === 'bundle') {
    await build(project, 'aab', parsed.variant);
    return;
  }

  if (parsed.command === 'build') {
    await build(project, parsed.type || 'apk', parsed.variant);
    return;
  }

  if (parsed.command === 'open') {
    await openArtifact(project, parsed.type || 'any');
    return;
  }

  if (parsed.command === 'install') {
    if (parsed.type && parsed.type !== 'apk') {
      throw new Error('Android App Bundles cannot be installed with adb. Use an APK instead.');
    }
    await install(project, parsed);
    return;
  }

  if (parsed.command === 'report') {
    await signingReport(project);
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}. Run "rn --help" to see the commands.`);
}

function parseArgs(args) {
  const parsed = {
    command: undefined,
    type: undefined,
    variant: 'release',
    device: undefined,
    packageName: undefined,
    logLevel: 'verbose',
    jsOnly: false,
    buildFirst: false,
    variantExplicit: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!parsed.command && !argument.startsWith('-')) {
      parsed.command = argument.toLowerCase();
    } else if (!parsed.type && ['apk', 'aab', 'bundle'].includes(argument.toLowerCase())) {
      parsed.type = argument.toLowerCase() === 'bundle' ? 'aab' : argument.toLowerCase();
    } else if (isLogsCommand(parsed.command) && isJsLogMode(argument)) {
      parsed.jsOnly = true;
    } else if (isLogsCommand(parsed.command) && parseLogLevel(argument)) {
      parsed.logLevel = parseLogLevel(argument);
    } else if (
      ['uninstall', 'remove', 'launch', 'lauch', 'logs', 'log'].includes(parsed.command)
      && !parsed.packageName
      && !argument.startsWith('-')
    ) {
      parsed.packageName = argument;
    } else if (argument === '--debug') {
      parsed.variant = 'debug';
      parsed.variantExplicit = true;
    } else if (argument === '--variant') {
      parsed.variant = requiredValue(args, ++index, '--variant');
      parsed.variantExplicit = true;
    } else if (argument === '--device' || argument === '-d') {
      parsed.device = requiredValue(args, ++index, '--device');
    } else if (argument === '--package' || argument === '-p') {
      parsed.packageName = requiredValue(args, ++index, '--package');
    } else if (argument === '--level') {
      const level = requiredValue(args, ++index, '--level');
      parsed.logLevel = parseLogLevel(level);
      if (!parsed.logLevel) throw new Error(`Unknown log level: ${level}`);
    } else if (argument === '--js') {
      parsed.jsOnly = true;
    } else if (argument === '--build') {
      parsed.buildFirst = true;
    } else if (argument === '--help' || argument === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return parsed;
}

function isLogsCommand(command) {
  return command === 'logs' || command === 'log';
}

function isJsLogMode(value) {
  return ['js', 'react-native', 'reactnative'].includes(value.toLowerCase());
}

function parseLogLevel(value) {
  const levels = {
    v: 'verbose', verbose: 'verbose',
    d: 'debug', debug: 'debug',
    i: 'info', info: 'info',
    w: 'warn', warn: 'warn', warning: 'warn', warnings: 'warn',
    e: 'error', error: 'error', errors: 'error',
    f: 'fatal', fatal: 'fatal',
  };
  return levels[value.toLowerCase()];
}

function requiredValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith('-')) throw new Error(`${option} needs a value.`);
  return value;
}

async function build(project, type, variant) {
  const task = gradleTask(type, variant);
  console.log(`Building ${type.toUpperCase()} with ./gradlew ${task} ...\n`);
  await run(path.join(project.android, 'gradlew'), [task], { cwd: project.android });

  const artifact = findArtifacts(project, type)[0];
  if (artifact) console.log(`\nBuilt: ${artifact.path}`);
}

async function openArtifact(project, type) {
  const artifact = findArtifacts(project, type)[0];
  if (!artifact) {
    const label = type === 'any' ? 'APK or AAB' : type.toUpperCase();
    throw new Error(`No ${label} build was found. Build one first with "rn ${type === 'any' ? 'apk' : type}".`);
  }

  console.log(`Opening: ${artifact.path}`);
  if (process.platform === 'darwin') {
    await run('open', ['-R', artifact.path]);
  } else if (process.platform === 'linux') {
    await run('xdg-open', [path.dirname(artifact.path)]);
  } else {
    throw new Error(`Opening files is not supported on ${process.platform}. Artifact: ${artifact.path}`);
  }
}

async function install(project, options) {
  let artifact = findArtifacts(project, 'apk')[0];
  if (options.buildFirst || options.variantExplicit || !artifact) {
    if (!artifact) console.log('No APK found, so one will be built first.');
    await build(project, 'apk', options.variant);
    artifact = findArtifacts(project, 'apk')[0];
  }

  if (!artifact) {
    throw new Error(`The build finished but no APK was found in ${artifactDirectory(project, 'apk')}.`);
  }

  const device = await chooseDevice(listDevices(), options.device);
  console.log(`\nInstalling ${path.basename(artifact.path)} on ${device.name} (${device.serial}) ...\n`);
  await installApk(device.serial, artifact.path);
  console.log('\nInstall complete.');
}

async function screen(requestedSerial) {
  if (!isScrcpyInstalled()) {
    const platformHint = process.platform === 'darwin'
      ? 'Install it with Homebrew:'
      : 'Install it with your package manager, or with Homebrew:';
    throw new Error(`scrcpy was not found. ${platformHint}\n\n  brew install scrcpy`);
  }

  const device = await chooseDevice(listDevices(), requestedSerial);
  console.log(`\nStarting screen sharing for ${device.name} (${device.serial}) ...\n`);
  await launchScrcpy(device.serial);
}

async function signingReport(project) {
  console.log('Reading Android signing fingerprints ...\n');
  const output = await runCapture(
    path.join(project.android, 'gradlew'),
    ['signingReport', '--console=plain'],
    { cwd: project.android },
  );
  const variants = parseSigningReport(output);
  if (variants.length === 0) {
    throw new Error('No debug or release signing variants were found in the Gradle signing report.');
  }
  console.log(formatSigningReport(variants));
}

async function uninstall(options) {
  const project = findProjectIfPresent();
  const packageName = await resolvePackageName(project, options.packageName);
  const device = await chooseDevice(listDevices(), options.device);
  console.log(`\nUninstalling ${packageName} from ${device.name} (${device.serial}) ...\n`);
  await uninstallPackage(device.serial, packageName);
  console.log('\nUninstall complete.');
}

async function launch(options) {
  const project = findProjectIfPresent();
  const packageName = await resolvePackageName(project, options.packageName);
  const device = await chooseDevice(listDevices(), options.device);
  console.log(`\nLaunching ${packageName} on ${device.name} (${device.serial}) ...\n`);
  await launchApp(device.serial, packageName);
  console.log('App launched.');
}

async function logs(options) {
  const project = findProjectIfPresent();
  const packageName = await resolvePackageName(project, options.packageName);
  const device = await chooseDevice(listDevices(), options.device);
  const uid = getAppUid(device.serial, packageName);
  const useUid = uid && supportsLogcatUid(device.serial);
  let target;
  let targetLabel;
  if (useUid) {
    target = `--uid=${uid}`;
    targetLabel = `UID ${uid}`;
  } else {
    const pid = getAppPid(device.serial, packageName);
    if (!pid) {
      throw new Error(`${packageName} is not running on ${device.name}. Run "rn launch" first.`);
    }
    target = `--pid=${pid}`;
    targetLabel = `PID ${pid}`;
  }

  const scope = options.jsOnly ? 'ReactNativeJS' : packageName;
  console.log(`\nShowing ${options.logLevel}+ logs for ${scope} (${targetLabel}) on ${device.name}.`);
  console.log('Press Ctrl+C to stop.\n');
  await streamAppLogs(device.serial, target, {
    level: options.logLevel,
    jsOnly: options.jsOnly,
    color: Boolean(stdout.isTTY),
  });
}

function findProjectIfPresent() {
  try {
    return findProject();
  } catch (error) {
    if (error.message.startsWith('No React Native Android project found.')) return undefined;
    throw error;
  }
}

async function resolvePackageName(project, requestedPackage) {
  if (requestedPackage) {
    if (!isValidPackageName(requestedPackage)) {
      throw new Error(`Invalid Android package name: ${requestedPackage}`);
    }
    return requestedPackage;
  }

  const detected = project ? findPackageName(project) : undefined;
  if (detected) {
    console.log(`Detected package: ${detected}`);
    return detected;
  }

  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Could not detect the Android package name. Use "rn uninstall com.example.app".');
  }

  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await prompt.question('Android package name (for example com.example.app): ')).trim();
      if (isValidPackageName(answer)) return answer;
      console.log('Please enter a valid Android package name, such as com.example.app.');
    }
  } finally {
    prompt.close();
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') reject(new Error(`Command not found: ${command}`));
      else reject(error);
    });
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${path.basename(command)} was stopped by ${signal}.`));
      else if (code !== 0) reject(new Error(`${path.basename(command)} failed with exit code ${code}.`));
      else resolve();
    });
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') reject(new Error(`Command not found: ${command}`));
      else reject(error);
    });
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${path.basename(command)} was stopped by ${signal}.`));
      } else if (code !== 0) {
        const details = (errors || output).trim();
        reject(new Error(details || `${path.basename(command)} failed with exit code ${code}.`));
      } else {
        resolve(`${output}\n${errors}`);
      }
    });
  });
}

export { parseArgs };
