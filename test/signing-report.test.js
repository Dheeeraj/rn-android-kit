import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSigningReport, parseSigningReport } from '../src/signing-report.js';

const rawReport = `
> Task :app:signingReport
> Variant: debug
> Config: debug
> Store: /project/android/app/debug.keystore
> Alias: androiddebugkey
> MD5: DEBUG_MD5
> SHA1: DEBUG_SHA1
> SHA-256: DEBUG_SHA256
> Valid until: Wednesday, 1 May, 2052
> Variant: demoRelease
> Config: release
> Alias: release-key
> MD5: RELEASE_MD5
> SHA1: RELEASE_SHA1
> SHA-256: RELEASE_SHA256
> Variant: debugAndroidTest
> Alias: test-key
> MD5: TEST_MD5
> SHA-256: TEST_SHA256
`;

test('keeps debug, release, and flavor variants with only requested fields', () => {
  assert.deepEqual(parseSigningReport(rawReport), [
    {
      variant: 'debug',
      store: '/project/android/app/debug.keystore',
      alias: 'androiddebugkey',
      md5: 'DEBUG_MD5',
      sha256: 'DEBUG_SHA256',
      validUntil: 'Wednesday, 1 May, 2052',
    },
    {
      variant: 'demoRelease',
      alias: 'release-key',
      md5: 'RELEASE_MD5',
      sha256: 'RELEASE_SHA256',
    },
  ]);
});

test('formats a concise report and marks missing signing details', () => {
  const formatted = formatSigningReport([
    {
      variant: 'release',
      store: 'Not configured',
      alias: 'Not configured',
      md5: 'Not configured',
      sha256: 'Not configured',
      validUntil: 'Not configured',
    },
  ]);
  assert.equal(formatted, [
    'release',
    '  Store: Not configured',
    '  Alias: Not configured',
    '  MD5: Not configured',
    '  SHA-256: Not configured',
    '  Valid until: Not configured',
  ].join('\n'));
});
