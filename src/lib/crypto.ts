// src/lib/crypto.ts
// Utilidades de cifrado local (Web Crypto API) y exportacion CSV.
// No requiere dependencias externas.

export interface CajaRow {
  fecha: string
  tipo: string
  origen: string
  destino: string
  ingreso: number
  egreso: number
  detalle: string
}

const PBKDF2_ITER = 100000
const SALT_BYTES = 16
const IV_BYTES = 12

const enc = new TextEncoder()
const dec = new TextDecoder()

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]!)
  return btoa(bin)
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJSON(payload: unknown, password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('password_too_short')
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)
  const data = enc.encode(JSON.stringify(payload))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return `${toBase64(salt)}|${toBase64(iv)}|${toBase64(cipher)}`
}

export async function decryptJSON(cipherText: string, password: string): Promise<unknown> {
  const parts = cipherText.split('|')
  if (parts.length !== 3) throw new Error('invalid_backup_format')
  const salt = fromBase64(parts[0]!)
  const iv = fromBase64(parts[1]!)
  const cipher = fromBase64(parts[2]!)
  const key = await deriveKey(password, salt)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return JSON.parse(dec.decode(plain))
  } catch (err) {
    throw new Error('decrypt_failed')
  }
}

export function exportCajaToCSV(rows: CajaRow[]): string {
  const headers = ['Fecha', 'Tipo', 'Origen', 'Destino', 'Ingreso', 'Egreso', 'Detalle']
  const escape = (v: string | number) => {
    const s = String(v ?? '')
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      escape(r.fecha),
      escape(r.tipo),
      escape(r.origen),
      escape(r.destino),
      escape(r.ingreso),
      escape(r.egreso),
      escape(r.detalle),
    ].join(','))
  }
  return '\uFEFF' + lines.join('\n')
}
