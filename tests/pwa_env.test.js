// tests/pwa_env.test.js
// PWA install environment detection for the Play Protect WebAPK block.
//
// Background: Samsung Internet's WebAPK minting server generates WebAPKs
// with an outdated targetSdkVersion, and Google Play Protect blocks that
// install on Android 14+ ("This app was built for an older version of
// Android..."). Chrome is unaffected while it stays up to date, because its
// minting server tracks the current API level and its WebAPK installs are
// delegated to Google Play. Very old Chrome clients can still request an
// old template, so they get an update-first guidance instead of prompt().
//
// Detection is pure: it only parses the user agent string.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPwaBrowserEnv,
  MIN_CHROME_MAJOR_FOR_WEBAPK,
  googleChromeSchemeUrl,
} from '../src/utils/pwaEnv.ts';

const UA_SAMSUNG_ANDROID_14 =
  'Mozilla/5.0 (Linux; Android 14; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';

const UA_CHROME_CURRENT_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/135.0.0.0 Mobile Safari/537.36';

const UA_CHROME_OLD_ANDROID_124 =
  'Mozilla/5.0 (Linux; Android 14; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Mobile Safari/537.36';

const UA_CHROME_TOO_OLD_ANDROID =  // predates Chrome 104 (targetSdk < 32 era)
  'Mozilla/5.0 (Linux; Android 14; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/96.0.0.0 Mobile Safari/537.36';

const UA_CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) CriOS/135.0.0.0 Mobile/15E148 Safari/604.1';

const UA_EDGE_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/121.0.0.0 Mobile Safari/537.36 EdgA/121.0.0.0';

const UA_FIREFOX_ANDROID =
  'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0';

const UA_SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

test('Samsung Internet is detected even though its UA also embeds Chrome/121', () => {
  const env = detectPwaBrowserEnv(UA_SAMSUNG_ANDROID_14);
  assert.equal(env.kind, 'samsung-internet');
  assert.equal(env.samsungBrowserVersion, 'SamsungBrowser/25.0');
});

test('current Chrome on Android is reported as chrome', () => {
  const env = detectPwaBrowserEnv(UA_CHROME_CURRENT_ANDROID);
  assert.equal(env.kind, 'chrome');
  assert.equal(env.majorVersion, 135);
});

test('Chrome above the minimum threshold is not treated as outdated', () => {
  const env = detectPwaBrowserEnv(UA_CHROME_OLD_ANDROID_124);
  assert.equal(env.kind, 'chrome');
  assert.equal(env.majorVersion >= MIN_CHROME_MAJOR_FOR_WEBAPK, true);
});

test('a very old Chrome client is still reported as chrome with its version', () => {
  // The outdated-Chrome decision is left to the caller comparing against
  // MIN_CHROME_MAJOR_FOR_WEBAPK, so the util stays policy-free.
  const env = detectPwaBrowserEnv(UA_CHROME_TOO_OLD_ANDROID);
  assert.equal(env.kind, 'chrome');
  assert.equal(env.majorVersion, 96);
});

test('Chrome on iOS is iOS, not the chrome path (no WebAPKs on iOS)', () => {
  const env = detectPwaBrowserEnv(UA_CHROME_IOS);
  assert.equal(env.kind, 'ios');
});

test('Edge-based Android UA keeps its embedded Chrome version out of the decision', () => {
  // Edge does not mint WebAPKs; treat it as other so the normal flow applies.
  const env = detectPwaBrowserEnv(UA_EDGE_ANDROID);
  assert.equal(env.kind, 'other');
});

test('Firefox on Android is other', () => {
  const env = detectPwaBrowserEnv(UA_FIREFOX_ANDROID);
  assert.equal(env.kind, 'other');
});

test('Safari on iOS is ios', () => {
  const env = detectPwaBrowserEnv(UA_SAFARI_IOS);
  assert.equal(env.kind, 'ios');
});

test('minimum Chrome version threshold follows the Android 14 targetSdk rule window', () => {
  // Chrome first minted WebAPKs targeting API 34 in the 12x releases; 120 is
  // the conservative floor below which we ask the user to update first.
  assert.equal(MIN_CHROME_MAJOR_FOR_WEBAPK, 120);
});

test('googleChromeSchemeUrl builds a googlechrome:// deep link for the same origin', () => {
  assert.equal(
    googleChromeSchemeUrl('https://ordcapital.app/configuracion'),
    'googlechrome://ordcapital.app/configuracion',
  );
  assert.equal(
    googleChromeSchemeUrl('https://ordcapital.app'),
    'googlechrome://ordcapital.app',
  );
});