import { spawn, spawnSync } from 'node:child_process';

export function isScrcpyInstalled(run = spawnSync) {
  const result = run('scrcpy', ['--version'], { stdio: 'ignore' });
  return result.error?.code !== 'ENOENT';
}

export function launchScrcpy(serial, start = spawn) {
  return new Promise((resolve, reject) => {
    const child = start('scrcpy', ['-s', serial], { stdio: 'inherit' });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('scrcpy was not found. Install it with: brew install scrcpy'));
      } else {
        reject(error);
      }
    });
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`scrcpy was stopped by ${signal}.`));
      else if (code !== 0) reject(new Error(`scrcpy failed with exit code ${code}.`));
      else resolve();
    });
  });
}
