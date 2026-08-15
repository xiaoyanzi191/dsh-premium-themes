/** Token derivation: color math utilities and the full-map expansion for imports. */
import { describe, expect, it } from 'vitest'
import {
  alpha, contrastInk, deriveCustomTokens, hexToRgb, luminance, mix, rgbToHex,
} from '../src/derive.ts'
import { PREMIUM_PALETTES } from '../src/palettes.ts'
import type { CustomPaletteDef } from '../src/theme-settings.ts'

const DEF = (overrides: Partial<CustomPaletteDef> = {}): CustomPaletteDef => ({
  id: 'mine',
  name: '我的',
  colorScheme: 'dark',
  colors: { base: '#16161e', accent: '#7aa2f7', text: '', surface: '' },
  tokens: {},
  ...overrides,
})

describe('derive color utilities', () => {
  it('parses and renders hex colors losslessly', () => {
    expect(rgbToHex(hexToRgb('#a1B2c3'))).toBe('#a1b2c3')
    expect(() => hexToRgb('red')).toThrow(/#rrggbb/)
    expect(() => hexToRgb('#12345')).toThrow(/#rrggbb/)
  })

  it('mixes toward the second color by ratio', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('picks readable ink by perceived brightness', () => {
    expect(contrastInk('#ffffff')).toBe('#161616')
    expect(contrastInk('#16161e')).toBe('#ffffff')
    expect(contrastInk('#f6c177')).toBe('#161616')
    expect(luminance(hexToRgb('#ffffff'))).toBeGreaterThan(luminance(hexToRgb('#000000')))
  })

  it('renders alpha overlays from a hex color', () => {
    expect(alpha('#7aa2f7', 0.5)).toBe('rgba(122, 162, 247, 0.5)')
  })
})

describe('deriveCustomTokens', () => {
  it('derives every token a built-in palette carries, in both schemes', () => {
    const builtinKeys = new Set(PREMIUM_PALETTES.flatMap(palette => Object.keys(palette.tokens)))
    for (const scheme of ['dark', 'light'] as const) {
      const tokens = deriveCustomTokens(DEF({ colorScheme: scheme }))
      for (const key of builtinKeys) {
        expect(tokens[key], `missing ${key} in ${scheme} derivation`).toBeTypeOf('string')
      }
    }
  })

  it('keeps layering coherent within a dark scheme (surfaces lift, text stays readable)', () => {
    const tokens = deriveCustomTokens(DEF())
    const base = hexToRgb(tokens['--dsw-alias-bg-base']!)
    const layer3 = hexToRgb(tokens['--dsw-alias-bg-layer-3']!)
    const overlay = hexToRgb(tokens['--dsw-alias-bg-overlay']!)
    expect(luminance(layer3)).toBeGreaterThan(luminance(base))
    expect(luminance(overlay)).toBeGreaterThan(luminance(layer3))
    expect(luminance(hexToRgb(tokens['--dsw-alias-label-primary']!)))
      .toBeGreaterThan(luminance(hexToRgb(tokens['--dsw-alias-label-secondary']!)))
    expect(tokens['--dsw-alias-brand-primary']).toBe('#7aa2f7')
  })

  it('uses explicit text and surface seeds over the derived values', () => {
    const tokens = deriveCustomTokens(DEF({
      colors: { base: '#16161e', accent: '#7aa2f7', text: '#ffeedd', surface: '#202040' },
    }))
    expect(tokens['--dsw-alias-label-primary']).toBe('#ffeedd')
    expect(tokens['--dsw-alias-bg-layer-2']).toBe('#202040')
  })

  it('applies explicit token overrides last', () => {
    const tokens = deriveCustomTokens(DEF({
      tokens: { '--dsw-alias-bg-base': '#123456', '--dsw-alias-brand-primary': '#fedcba' },
    }))
    expect(tokens['--dsw-alias-bg-base']).toBe('#123456')
    expect(tokens['--dsw-alias-brand-primary']).toBe('#fedcba')
  })

  it('rejects malformed seed colors with a teaching error', () => {
    expect(() => deriveCustomTokens(DEF({ colors: { base: 'nope', accent: '#7aa2f7', text: '', surface: '' } })))
      .toThrow(/#rrggbb/)
  })
})
