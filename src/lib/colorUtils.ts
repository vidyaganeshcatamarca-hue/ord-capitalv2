/**
 * Utility functions for generating color variations and shades for subaccounts
 */

const COLOR_NAME_MAP: Record<string, string> = {
  'var(--mint)': '#00E599',
  'var(--surface-3)': '#2A3441',
  'orange': '#F97316',
  'green': '#10B981',
  'blue': '#3B82F6',
  'purple': '#8B5CF6',
  'red': '#EF4444',
  'yellow': '#F59E0B'
}

function parseColorToHsl(colorStr: string): { h: number; s: number; l: number } {
  if (!colorStr) return { h: 160, s: 100, l: 45 }
  
  let str = colorStr.trim()
  if (COLOR_NAME_MAP[str]) {
    str = COLOR_NAME_MAP[str]
  }

  // Handle hsl(h, s%, l%)
  const hslMatch = str.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i)
  if (hslMatch) {
    return {
      h: parseInt(hslMatch[1], 10),
      s: parseInt(hslMatch[2], 10),
      l: parseInt(hslMatch[3], 10)
    }
  }

  // Handle HEX (#RRGGBB or #RGB)
  let cleanHex = str.replace('#', '').trim()
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  if (cleanHex.length !== 6) {
    return { h: 160, s: 100, l: 45 }
  }

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  }
}

/**
 * Generates a distinct color shade for a subaccount based on parent base color.
 */
export function generateColorShade(baseHex: string, index: number, total: number): string {
  if (!baseHex) return 'var(--mint)'
  const { h, s } = parseColorToHsl(baseHex)
  
  if (total <= 1) {
    return `hsl(${h}, ${Math.max(s, 50)}%, 48%)`
  }

  const minL = 28
  const maxL = 72
  const step = (maxL - minL) / (total - 1)
  const l = Math.round(minL + index * step)

  return `hsl(${h}, ${Math.max(s, 50)}%, ${l}%)`
}
