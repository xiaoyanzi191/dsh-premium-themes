/** Durable section schema: defaults, palette-id validation, base narrowing, and the custom-palette dict. */
import { describe, expect, it } from 'vitest'
import {
  BASE_FIELD, CUSTOM_FIELD, DEFAULT_BASE, DEFAULT_SELECTION, isBasePreference, isPaletteSelection,
  OFF, PALETTE_COLOR_SCHEMES, PALETTE_FIELD, PALETTE_PREFERENCES,
  PREMIUM_THEMES_SETTINGS_NAMESPACE, PremiumThemesSettingsSchema,
  customThemeId, isCustomThemeId,
} from '../src/theme-settings.ts'

const CUSTOM_DEF = {
  id: 'my-mint',
  name: '薄荷',
  colorScheme: 'light' as const,
  colors: { base: '#eef7f2', accent: '#2f9e6e', text: '', surface: '' },
  tokens: {},
}

describe('premium-themes settings', () => {
  it('defaults to off plus the system base preference and no imports', () => {
    expect(PremiumThemesSettingsSchema({})).toEqual({
      [PALETTE_FIELD]: DEFAULT_SELECTION,
      [BASE_FIELD]: DEFAULT_BASE,
      [CUSTOM_FIELD]: {},
    })
    expect(DEFAULT_SELECTION).toBe(OFF)
  })

  it('accepts every registered palette id and rejects unknown values', () => {
    for (const id of PALETTE_PREFERENCES) {
      expect(PremiumThemesSettingsSchema({ [PALETTE_FIELD]: id })[PALETTE_FIELD]).toBe(id)
    }
    expect(() => PremiumThemesSettingsSchema({ [PALETTE_FIELD]: 'sepia' })).toThrow()
    expect(() => PremiumThemesSettingsSchema({ [BASE_FIELD]: 'purple' })).toThrow()
  })

  it('stores imported palettes in the custom dict and validates their shape', () => {
    const section = PremiumThemesSettingsSchema({ [CUSTOM_FIELD]: { 'my-mint': CUSTOM_DEF } })
    expect(section[CUSTOM_FIELD]['my-mint']).toEqual(CUSTOM_DEF)
    expect(() => PremiumThemesSettingsSchema({
      [CUSTOM_FIELD]: { bad: { ...CUSTOM_DEF, colorScheme: 'sepia' } },
    })).toThrow()
    // Dict keys ride free (schemastery validates values only); the def's own
    // id carries the shape contract.
    expect(() => PremiumThemesSettingsSchema({
      [CUSTOM_FIELD]: { good: { ...CUSTOM_DEF, id: 'bad id!' } },
    })).toThrow()
  })

  it('narrows selections, base preferences, and custom theme ids at the wire boundary', () => {
    expect(isPaletteSelection(OFF)).toBe(true)
    expect(isPaletteSelection('tokyo-night')).toBe(true)
    expect(isPaletteSelection('sepia')).toBe(false)
    expect(isPaletteSelection(undefined)).toBe(false)
    expect(isPaletteSelection('custom-my-mint')).toBe(true)
    expect(isPaletteSelection('custom-BAD')).toBe(false)
    expect(isBasePreference('system')).toBe(true)
    expect(isBasePreference('off')).toBe(false)
    expect(customThemeId('my-mint')).toBe('custom-my-mint')
    expect(isCustomThemeId('custom-my-mint')).toBe(true)
    expect(isCustomThemeId('tokyo-night')).toBe(false)
  })

  it('maps every built-in palette to its base color scheme', () => {
    const dark = ['tokyo-night', 'nord', 'catppuccin-mocha', 'everforest', 'rose-pine', 'ayu-mirage']
    const light = ['catppuccin-latte', 'paper-gold']
    expect(Object.keys(PALETTE_COLOR_SCHEMES).sort()).toEqual([...PALETTE_PREFERENCES].sort())
    for (const id of dark) expect(PALETTE_COLOR_SCHEMES[id]).toBe('dark')
    for (const id of light) expect(PALETTE_COLOR_SCHEMES[id]).toBe('light')
  })

  it('owns its settings namespace and route paths', () => {
    expect(PREMIUM_THEMES_SETTINGS_NAMESPACE).toBe('ui-premium-themes')
  })
})
