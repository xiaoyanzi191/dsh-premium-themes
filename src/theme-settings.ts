/**
 * Durable palette selection stored in this plugin's own settings namespace
 * (`ui-premium-themes`) — the shared settings plane only serves product
 * allowlists, so the plugin persists through its own host route instead of
 * `ui-theme`'s schema. The `base` field remembers the light/dark/system
 * preference that was active when a palette was chosen, so the 默认 chip can
 * restore it exactly. Imported custom palettes live in the `customPalettes`
 * dict of the same section; their token maps derive deterministically from
 * their seed colors (see `derive.ts`).
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by this plugin. */
export const PREMIUM_THEMES_SETTINGS_NAMESPACE = 'ui-premium-themes'

/** Field carrying the selected palette id (or `off`). */
export const PALETTE_FIELD = 'palette'

/** Field remembering the base preference active before the palette was chosen. */
export const BASE_FIELD = 'base'

/** Field carrying the imported custom palette definitions. */
export const CUSTOM_FIELD = 'customPalettes'

/** Value marking "no palette — the base light/dark/system preference governs". */
export const OFF = 'off'

/** Theme-id prefix for imported custom palettes (keeps them out of the built-in id space). */
export const CUSTOM_PREFIX = 'custom-'

/** Allowed raw custom-palette id shape (joined under the `custom-` prefix). */
export const CUSTOM_ID_PATTERN = /^[a-z0-9-]{1,40}$/

/** Allowed imported theme-id shape (the schema's dynamic selection arm). */
export const CUSTOM_THEME_ID_PATTERN = /^custom-[a-z0-9-]{1,40}$/

/** Theme id of an imported palette for its raw id. */
export function customThemeId(rawId: string): `${typeof CUSTOM_PREFIX}${string}` {
  return `${CUSTOM_PREFIX}${rawId}`
}

/** Whether a theme id names an imported palette (never a built-in). */
export function isCustomThemeId(value: string): boolean {
  return CUSTOM_THEME_ID_PATTERN.test(value)
}

/** Seed colors of one imported palette ('' means "derive from the scheme"). */
export interface CustomPaletteColors {
  /** Page background. */
  base: string
  /** Brand accent. */
  accent: string
  /** Primary text; '' derives from the scheme. */
  text: string
  /** Raised surface; '' derives from the base. */
  surface: string
}

/**
 * Imported custom palette: the persisted source definition. The full token
 * map derives deterministically from `colors` at load/registration time
 * (`derive.ts`); `tokens` carries optional `--dsw-*` overrides for fine-tuning.
 * All fields are required in the section schema (schemastery has no optional):
 * `text`/`surface` empty strings mean "derive", `tokens` an empty dict means
 * no overrides. The host route normalizes forgiving import payloads into this
 * shape before validation.
 */
export interface CustomPaletteDef {
  /** Machine id (raw, without the `custom-` prefix). */
  id: string
  /** Display name shown on the chip. */
  name: string
  /** Base scheme the palette builds on. */
  colorScheme: 'light' | 'dark'
  /** Seed colors the token map derives from. */
  colors: CustomPaletteColors
  /** Explicit `--dsw-*` token overrides applied over the derived map. */
  tokens: Record<string, string>
}

/** Palette preference ids this plugin registers as theme definitions. */
export const PALETTE_PREFERENCES = [
  'tokyo-night', 'nord', 'catppuccin-mocha', 'everforest',
  'rose-pine', 'ayu-mirage', 'catppuccin-latte', 'paper-gold',
] as const

/** One built-in palette id. */
export type PalettePreference = typeof PALETTE_PREFERENCES[number]

/** The persisted selection: a built-in palette id, an imported id, or `off`. */
export type PaletteSelection = PalettePreference | `${typeof CUSTOM_PREFIX}${string}` | typeof OFF

/** The light/dark/system preference a palette selection can restore. */
export type BasePreference = 'light' | 'dark' | 'system'

/**
 * Base palette each built-in palette definition builds on. The boot script
 * resolves custom palettes from the stored defs instead.
 */
export const PALETTE_COLOR_SCHEMES: Readonly<Record<PalettePreference, 'light' | 'dark'>> = {
  'tokyo-night': 'dark',
  nord: 'dark',
  'catppuccin-mocha': 'dark',
  everforest: 'dark',
  'rose-pine': 'dark',
  'ayu-mirage': 'dark',
  'catppuccin-latte': 'light',
  'paper-gold': 'light',
}

/** Durable section shape shared by the Host schema and the browser routes. */
export interface PremiumThemesSettings {
  /** Selected palette id, `off` when the base preference governs. */
  [PALETTE_FIELD]: PaletteSelection
  /** Base preference to restore when the selection goes back to `off`. */
  [BASE_FIELD]: BasePreference
  /** Imported custom palettes by raw id. */
  [CUSTOM_FIELD]: Record<string, CustomPaletteDef>
}

/** Defaults for a section with no override yet. */
export const DEFAULT_SELECTION: PaletteSelection = OFF
export const DEFAULT_BASE: BasePreference = 'system'
export const DEFAULT_CUSTOMS: Record<string, CustomPaletteDef> = {}

/** One custom palette entry inside the durable section. */
export const CustomPaletteSchema: z<CustomPaletteDef> = z.object({
  id: z.string().pattern(CUSTOM_ID_PATTERN),
  name: z.string(),
  colorScheme: z.union(['light', 'dark']),
  colors: z.object({
    base: z.string(),
    accent: z.string(),
    text: z.string(),
    surface: z.string(),
  }),
  tokens: z.dict(z.string()),
})

/**
 * Durable section schema; also the wire envelope the browser routes validate
 * against. The palette arm accepts `off`, the built-in ids, and any imported
 * theme id (`custom-…`); existence of an imported def is checked by the route
 * handlers, not the schema. The cast is sound: the pattern's accepted set is a
 * strict subset of the claimed `PaletteSelection` type.
 */
export const PremiumThemesSettingsSchema = z.object({
  [PALETTE_FIELD]: z.union([
    'off', 'tokyo-night', 'nord', 'catppuccin-mocha', 'everforest',
    'rose-pine', 'ayu-mirage', 'catppuccin-latte', 'paper-gold',
    z.string().pattern(CUSTOM_THEME_ID_PATTERN),
  ]).default(DEFAULT_SELECTION),
  [BASE_FIELD]: z.union(['light', 'dark', 'system']).default(DEFAULT_BASE),
  [CUSTOM_FIELD]: z.dict(CustomPaletteSchema).default(DEFAULT_CUSTOMS),
}) as unknown as z<PremiumThemesSettings>

/** Narrow one wire or registry value to a palette id or `off`. */
export function isPaletteSelection(value: unknown): value is PaletteSelection {
  if (typeof value !== 'string') return false
  if (value === OFF) return true
  if (PALETTE_PREFERENCES.some(preference => preference === value)) return true
  return isCustomThemeId(value)
}

/** Narrow one wire or registry value to a base preference. */
export function isBasePreference(value: unknown): value is BasePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** HTTP route the browser reads and writes the selection through (exact route). */
export const PALETTE_ROUTE_PATH = '/api/premium-themes/palette'

/** HTTP route the browser manages imported palettes through (exact route). */
export const CUSTOM_ROUTE_PATH = '/api/premium-themes/custom'
