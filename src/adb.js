import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export function listDevices(run = spawnSync) {
  const result = run('adb', ['devices', '-l'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('adb was not found. Install Android platform-tools and make sure adb is in your PATH.');
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || 'Could not list adb devices.').trim());
  }

  const devices = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDeviceLine)
    .filter((device) => device?.state === 'device');

  return deduplicateMdnsAliases(devices);
}

function parseDeviceLine(line) {
  const match = line.match(
    /^(.*?)\s+(device|offline|unauthorized|authorizing|recovery|sideload|bootloader|no permissions)(?:\s+(.*))?$/,
  );
  if (!match) return null;
  const [, serial, state, detailText = ''] = match;
  const details = detailText.split(/\s+/).filter(Boolean);
  const properties = Object.fromEntries(
    details
      .filter((item) => item.includes(':'))
      .map((item) => {
        const separator = item.indexOf(':');
        return [item.slice(0, separator), item.slice(separator + 1)];
      }),
  );

  return {
    serial,
    state,
    name: (properties.model || properties.device || serial).replaceAll('_', ' '),
  };
}

function deduplicateMdnsAliases(devices) {
  const unique = new Map();

  for (const device of devices) {
    const canonicalSerial = device.serial.replace(
      / \(\d+\)(?=\._adb-tls-(?:connect|pairing)\._tcp$)/,
      '',
    );
    const existing = unique.get(canonicalSerial);

    // Prefer the original mDNS name over macOS duplicate names ending in " (2)", " (3)", etc.
    if (!existing || device.serial === canonicalSerial) {
      unique.set(canonicalSerial, device);
    }
  }

  return [...unique.values()];
}

export async function chooseDevice(devices, requestedSerial) {
  if (devices.length === 0) {
    throw new Error('No authorized Android device or emulator is connected.');
  }

  if (requestedSerial) {
    const selected = devices.find((device) => device.serial === requestedSerial);
    if (!selected) {
      throw new Error(`Device ${requestedSerial} is not connected or authorized.`);
    }
    return selected;
  }

  if (devices.length === 1) return devices[0];

  if (!stdin.isTTY || !stdout.isTTY) {
    const choices = devices.map((device) => device.serial).join(', ');
    throw new Error(`Multiple devices are connected (${choices}). Use --device <serial>.`);
  }

  console.log('\nChoose a device:');
  devices.forEach((device, index) => {
    console.log(`  ${index + 1}) ${device.name}  (${device.serial})`);
  });

  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await prompt.question(`Device [1-${devices.length}]: `);
      const index = Number.parseInt(answer, 10) - 1;
      if (Number.isInteger(index) && devices[index]) return devices[index];
      console.log('Please enter one of the numbers shown above.');
    }
  } finally {
    prompt.close();
  }
}

export function installApk(serial, apkPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('adb', ['-s', serial, 'install', '-r', apkPath], {
      stdio: 'inherit',
    });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('adb was not found. Install Android platform-tools and make sure adb is in your PATH.'));
      } else {
        reject(error);
      }
    });
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`adb was stopped by ${signal}.`));
      else if (code !== 0) reject(new Error(`adb install failed with exit code ${code}.`));
      else resolve();
    });
  });
}

export function uninstallPackage(serial, packageName, start = spawn) {
  return new Promise((resolve, reject) => {
    const child = start('adb', ['-s', serial, 'uninstall', packageName], {
      stdio: 'inherit',
    });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('adb was not found. Install Android platform-tools and make sure adb is in your PATH.'));
      } else {
        reject(error);
      }
    });
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`adb was stopped by ${signal}.`));
      else if (code !== 0) reject(new Error(`adb uninstall failed with exit code ${code}.`));
      else resolve();
    });
  });
}

export function launchApp(serial, packageName, start = spawn) {
  return new Promise((resolve, reject) => {
    const child = start(
      'adb',
      [
        '-s', serial, 'shell', 'monkey',
        '-p', packageName,
        '-c', 'android.intent.category.LAUNCHER',
        '1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { output += chunk; });
    child.stderr?.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => rejectAdbError(error, reject));
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`adb was stopped by ${signal}.`));
      else if (code !== 0 || /No activities found|monkey aborted/i.test(output)) {
        reject(new Error(`Could not launch ${packageName}. Make sure it is installed and has a launcher activity.`));
      } else resolve();
    });
  });
}

export function getAppPid(serial, packageName, run = spawnSync) {
  const result = run('adb', ['-s', serial, 'shell', 'pidof', packageName], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('adb was not found. Install Android platform-tools and make sure adb is in your PATH.');
  }
  if (result.status !== 0) return undefined;
  return result.stdout.trim().split(/\s+/).find(Boolean);
}

export function getAppUid(serial, packageName, run = spawnSync) {
  const result = run(
    'adb',
    ['-s', serial, 'shell', 'pm', 'list', 'packages', '-U', packageName],
    { encoding: 'utf8' },
  );
  if (result.error?.code === 'ENOENT') {
    throw new Error('adb was not found. Install Android platform-tools and make sure adb is in your PATH.');
  }
  if (result.status !== 0) return undefined;
  const exactPackageLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith(`package:${packageName} `));
  return exactPackageLine?.match(/\buid:(\d+)\b/)?.[1];
}

export function supportsLogcatUid(serial, run = spawnSync) {
  const result = run('adb', ['-s', serial, 'logcat', '--help'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('adb was not found. Install Android platform-tools and make sure adb is in your PATH.');
  }
  return /--uid(?:=|[\s<])/.test(`${result.stdout || ''}\n${result.stderr || ''}`);
}

export function streamAppLogs(serial, target, options = {}, start = spawn) {
  const priorities = {
    verbose: 'V', debug: 'D', info: 'I', warn: 'W', error: 'E', fatal: 'F',
  };
  const priority = priorities[options.level || 'verbose'];
  if (!priority) throw new Error(`Unknown log level: ${options.level}`);
  const args = ['-s', serial, 'logcat', target, '-v', 'threadtime'];
  if (options.color) args.push('-v', 'color');
  if (options.jsOnly) args.push(`ReactNativeJS:${priority}`, '*:S');
  else args.push(`*:${priority}`);

  return new Promise((resolve, reject) => {
    const child = start('adb', args, { stdio: 'inherit' });
    child.once('error', (error) => rejectAdbError(error, reject));
    child.once('exit', (code, signal) => {
      if (signal === 'SIGINT' || signal === 'SIGTERM') resolve();
      else if (signal) reject(new Error(`adb was stopped by ${signal}.`));
      else if (code !== 0) reject(new Error(`adb logcat failed with exit code ${code}.`));
      else resolve();
    });
  });
}

function rejectAdbError(error, reject) {
  if (error.code === 'ENOENT') {
    reject(new Error('adb was not found. Install Android platform-tools and make sure adb is in your PATH.'));
  } else {
    reject(error);
  }
}
