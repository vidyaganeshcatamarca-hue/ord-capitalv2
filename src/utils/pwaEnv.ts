// src/utils/pwaEnv.ts
// PWA install environment detection for the Google Play Protect WebAPK block.
//
// Background: PWAs installed from Samsung Internet are wrapped into a WebAPK
// minted by Samsung's server, which still ships an outdated targetSdkVersion.
// On Android 14+ Google Play Protect blocks that install with
// "This app was built for an older version of Android...". Chrome is
// unaffected while up to date (its minting server tracks the current API
// level and delegates WebAPK installs to Google Play), but an old Chrome
// client can request an old template.
//
// This module is pure (UA-string parsing only) so it is unit-testable in
// Node; callers pass `navigator.userAgent` explicitly.

/**
 * Chrome major version floor below which we guide the user to update before
 * installing. Chrome's WebAPK shell first targeted API 34 in the 12x series;
 * below 120 a minted WebAPK can fall more than two API levels under Android
 * 14, which trips the Play Protect warning.
 */
export const MIN_CHROME_MAJOR_FOR_WEBAPK = 120;

export type PwaBrowserEnv =
  | { kind: 'samsung-internet'; samsungBrowserVersion: string; embeddedChromeMajor: number | null }
  | { kind: 'chrome'; majorVersion: number }
  | { kind: 'ios' }
  | { kind: 'other' }

/** Samsung Internet's UA embeds a Chrome/<major> token, so it must be checked first. */
export function detectPwaBrowserEnv(userAgent: string): PwaBrowserEnv {
  const ua = userAgent.toLowerCase()

  // iOS browsers: no WebAPKs, no Play Protect. CriOS/EdgiOS/FxiOS all match here.
  if (/iphone|ipad|ipod/.test(ua)) {
    return { kind: 'ios' }
  }

  const samsungMatch = ua.match(/samsungbrowser\/([\d.]+)/)
  if (samsungMatch) {
    const embeddedChrome = ua.match(/chrome\/(\d+)/)
    return {
      kind: 'samsung-internet',
      samsungBrowserVersion: `SamsungBrowser/${samsungMatch[1]}`,
      embeddedChromeMajor: embeddedChrome ? parseInt(embeddedChrome[1], 10) : null,
    }
  }

  // Only plain Chrome mints WebAPKs. Edge (EdgA/) and Brave embed Chrome/<n>
  // in their UA but install as shortcuts, so they are not routed as Chrome.
  const chromeMajor = ua.match(/chrome\/(\d+)/)
  if (chromeMajor && !/\bedga?\//.test(ua) && !/\bbrave\//.test(ua)) {
    return { kind: 'chrome', majorVersion: parseInt(chromeMajor[1], 10) }
  }

  return { kind: 'other' }
}

/**
 * True when the Chrome client is too old for a safe WebAPK mint.
 */
export function isChromeOutdatedForWebapk(env: PwaBrowserEnv): boolean {
  if (env.kind !== 'chrome') return false
  return env.majorVersion < MIN_CHROME_MAJOR_FOR_WEBAPK
}

/**
 * Deep link that opens the same page inside Chrome on Android
 * (Chrome registers the googlechrome:// scheme). Returns null for
 * inputs it cannot map safely.
 */
export function googleChromeSchemeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    const hostPath = `${parsed.host}${path}${parsed.search}${parsed.hash}`
    return `googlechrome://${hostPath}`
  } catch {
    return null
  }
}