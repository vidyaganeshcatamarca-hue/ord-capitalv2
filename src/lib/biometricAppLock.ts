// src/lib/biometricAppLock.ts
// Device biometry glue for the app-lock feature (feature: pin-huella, spec S4).
//
// NOT pure (talks to navigator.credentials and localStorage): all policy math
// lives in `src/lib/appLock.ts`; this file only owns "can this device unlock
// with biometry" and "perform the local biometric check".
//
// S4 (feature doc): o PIN o huella — the lock screen presents biometry as the
// primary path when it is enabled on this device, and "Usar PIN" as the
// explicit alternative. The biometric credential is device-local by nature:
// each device opts in separately; the PIN itself is account-level (S3).
//
// Web/PWA path: WebAuthn platform authenticator (fingerprint/face on the
// device). No server validation is needed for the LOCAL unlock: success means
// "the platform authenticator verified presence", which is exactly the trust
// claim of S4. Native (Capacitor) path: the plugin is added when the native
// build exists (today there is no android/ project in this repo) — calls below
// degrade to "not available" until then.

export const BIOMETRIA_CREDENTIAL_KEY = 'app_lock_biometria_credencial'

function nativePlatform(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

/**
 * S4 — whether this device can offer biometric unlock right now.
 * On the future native shell this must be rechecked with the biometrics
 * plugin; today it degrades cleanly on the web build.
 */
export async function biometriaDisponible(): Promise<boolean> {
  if (nativePlatform()) {
    // Plugin not installed in this phase (no native build yet): fall through
    // to WebAuthn, which still works inside Capacitor WebView if the platform
    // authenticator is exposed. If it answers false, the device shows PIN only.
  }
  try {
    if (typeof PublicKeyCredential === 'undefined') return false
    if (typeof (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable()
    }
    return false
  } catch {
    return false
  }
}

/** S4 — per-device opt-in state (kept out of the account: device-local). */
export function biometriaHabilitadaEnEsteDispositivo(): boolean {
  try {
    return localStorage.getItem(BIOMETRIA_CREDENTIAL_KEY) != null
  } catch {
    return false
  }
}

/** Register a WebAuthn platform credential for this device. */
export async function registrarBiometriaUsuario(usuarioId: string, accountLabel: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof crypto?.getRandomValues !== 'function') return false
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'ORD Capital' },
        user: { id: userId, name: accountLabel, displayName: accountLabel },
        // ES256 is the platform-authenticator default and broadly supported.
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    const rawId = credential?.rawId
    if (!rawId || !credential) return false
    const encoded = btoa(String.fromCharCode(...new Uint8Array(rawId)))
    localStorage.setItem(BIOMETRIA_CREDENTIAL_KEY, encoded)
    return true
  } catch {
    return false
  }
}

/**
 * Perform the local biometric check. True only when the platform
 * authenticator asserts (user verification "required" at the OS level).
 */
export async function desbloquearConBiometria(): Promise<boolean> {
  const encoded = (() => {
    try {
      return localStorage.getItem(BIOMETRIA_CREDENTIAL_KEY)
    } catch {
      return null
    }
  })()
  if (!encoded) return false
  try {
    const bin = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: 'required',
        timeout: 60_000,
        // Restrict to this device's registered credential (device-local scope).
        allowCredentials: [{ type: 'public-key', id: bin }],
      },
    })
    return true
  } catch {
    return false
  }
}

/** Remove this device's credential record (device-local opt-out). */
export function borrarBiometriaDispositivo(): void {
  try {
    localStorage.removeItem(BIOMETRIA_CREDENTIAL_KEY)
  } catch {
    // Ignore: storage may be unavailable (private mode); nothing else to do.
  }
}