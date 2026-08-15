/**
 * Browser half of the premium-palette plugin, built entirely on public
 * extension surfaces — no core changes:
 *
 * - `ctx.theme.register(...)` adds each palette as a third-party theme
 *   definition riding the base light/dark palette plus alias-token overrides
 *   (the same contract any plugin theme uses; disposing the plugin resets an
 *   active palette back to the base preference).
 * - The plugin persists its own selection through its own Host routes
 *   (`ui-premium-themes` settings namespace — the shared Web settings plane
 *   only serves product allowlists) and restores it at activation, so
 *   selections survive reloads and browser sessions.
 * - Imported custom palettes live in the same durable section: the import
 *   dialog collects a name, scheme, and two seed colors, the Host verifies
 *   and stores the def, and this half derives the full token map
 *   (`derive.ts`), registers the theme, and selects it. Deleting an import
 *   unregisters it and restores the base preference when it was active.
 * - A Palette row joins the settings General section below the Appearance
 *   row; the 默认 chip restores the remembered base preference. Selecting a
 *   base cube (浅色/深色/跟随系统) anywhere in the UI clears the palette, and
 *   every durable write is best-effort: a failure leaves the visual selection
 *   in place for the session and logs a warning.
 *
 * Race discipline: ui-theme asynchronously adopts its own durable base
 * preference after boot and would clobber a palette applied first. The plugin
 * therefore binds ui-theme's settings scope (the same settings document both
 * plugins read) and treats the scope's first `ready` as the base-settle
 * signal: it re-applies the palette when the initial adoption overwrote it,
 * and clears the palette on any later scope change, which can only be a base
 * preference write (the Appearance cubes).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.theme Context merge from the theme plugin.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: the ctx.locale Context merge from the locale plugin.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.settingsScope Context merge from the settings plugin.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PaletteRowInjected } from './PaletteRow.tsx'
import { PaletteRow } from './PaletteRow.tsx'
import { createPaletteRowStore, type CustomChip } from './settings-store.ts'
import { en, zh, type PremiumThemesKey } from './locales.ts'
import { PREMIUM_PALETTES } from '../palettes.ts'
import { deriveCustomTokens } from '../derive.ts'
import {
  BASE_FIELD, CUSTOM_FIELD, CUSTOM_ROUTE_PATH, DEFAULT_SELECTION, isCustomThemeId,
  isPaletteSelection, OFF, PALETTE_FIELD, PALETTE_ROUTE_PATH, customThemeId,
  type BasePreference, type CustomPaletteDef, type PaletteSelection,
} from '../theme-settings.ts'

export type { PaletteRowComponentProps, PaletteRowInjected } from './PaletteRow.tsx'
export type { PaletteRowState, CustomChip } from './settings-store.ts'
export type { PremiumThemesKey } from './locales.ts'
export { PREMIUM_PALETTES, type PremiumPalette } from '../palettes.ts'
export type { PalettePreference, PaletteSelection, BasePreference, CustomPaletteDef } from '../theme-settings.ts'

/** Namespace owning this feature's settings-row copy. */
export const SETTINGS_NS = 'settings.premiumThemes'

/** Row id under the General section item slot (after the Appearance row). */
export const ROW_ID = 'premium-palettes'

/** ui-theme's durable section (published contract; read-only mirror here). */
const BASE_THEME_NAMESPACE = 'ui-theme'
const BASE_THEME_FIELD = 'preference'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Palette settings row's copy. */
    'settings.premiumThemes': PremiumThemesKey
  }
}

/** Required services: the theme registry, the General-settings slot, locale copy, and the base-preference scope. */
export const inject = ['theme', 'slots', 'locale', 'settingsScope']

/** One durable section snapshot crossing the plugin's routes. */
interface DurableSnapshot {
  palette: PaletteSelection
  base: BasePreference
  customs: Record<string, CustomPaletteDef>
}

/** The durable defaults (every route failure falls back here). */
const FALLBACK: DurableSnapshot = {
  palette: DEFAULT_SELECTION,
  base: 'system',
  customs: {},
}

/** Narrow one wire section into a durable snapshot; unknown fields fall back per-field. */
function narrowSnapshot(body: Record<string, unknown>): DurableSnapshot {
  const customs = typeof body[CUSTOM_FIELD] === 'object' && body[CUSTOM_FIELD] !== null
    ? { ...(body[CUSTOM_FIELD] as Record<string, CustomPaletteDef>) }
    : {}
  return {
    palette: isPaletteSelection(body[PALETTE_FIELD]) ? body[PALETTE_FIELD] : DEFAULT_SELECTION,
    base: body[BASE_FIELD] === 'light' || body[BASE_FIELD] === 'dark' || body[BASE_FIELD] === 'system'
      ? body[BASE_FIELD]
      : 'system',
    customs,
  }
}

/** Read the durable section from the plugin's Host route (defaults on failure). */
async function fetchSelection(): Promise<DurableSnapshot> {
  try {
    const response = await fetch(PALETTE_ROUTE_PATH)
    if (!response.ok) return FALLBACK
    return narrowSnapshot(await response.json() as Record<string, unknown>)
  } catch {
    return FALLBACK
  }
}

/** Write the durable selection through the plugin's Host route (best-effort). */
async function persistSelection(
  logger: Context['logger'],
  selection: { palette: PaletteSelection; base: BasePreference },
): Promise<void> {
  try {
    await fetch(PALETTE_ROUTE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [PALETTE_FIELD]: selection.palette, [BASE_FIELD]: selection.base }),
    })
  } catch (error) {
    logger.warn(`premium-themes: palette write failed (selection stays session-local): ${String(error)}`)
  }
}

/**
 * Client plugin body: register the built-in and imported palette themes,
 * restore the durable selection after the base preference settles, register
 * the Palette row, and keep the selection in step with base-theme switches.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const theme = ctx.theme
  // Register every built-in palette once; disposing the plugin (hot-unplug)
  // unregisters them, which also resets the preference when a palette was
  // active. Imported palettes ride the same registry with their own disposers.
  const unregisterAll = PREMIUM_PALETTES.map(palette => theme.register({
    id: palette.id,
    colorScheme: palette.colorScheme,
    tokens: { ...palette.tokens },
  }))
  // Live registry of imported themes: theme id -> disposer.
  const imported = new Map<ReturnType<typeof customThemeId>, () => void>()
  ctx.effect(() => () => {
    for (const dispose of imported.values()) dispose()
    unregisterAll.forEach(dispose => dispose())
  }, 'premium-themes: palette registry')

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'premium-themes: row dictionaries')

  const store = createPaletteRowStore()
  let bound: BoundActions<typeof store> | undefined
  let revision = 0
  // Current selection, mirrored into the row store on every change and on row
  // mount — a fast adoption cannot be lost to a slow row registration.
  let current: PaletteSelection = DEFAULT_SELECTION
  // Current imported chips (insertion order of the defs dict).
  let chips: readonly CustomChip[] = []
  const sync = (palette: PaletteSelection): void => {
    current = palette
    bound?.sync(palette, chips, ++revision)
  }
  // Base preference to restore on 默认; adopted from the durable section, then
  // refreshed whenever the user selects a base theme while a palette is off.
  let restoreBase: BasePreference = 'system'
  // Set once the durable section has settled, so a slow fetch cannot clobber
  // a selection the user already made.
  let adopted = false

  /** Reconcile the imported theme registry and chips against the durable defs. */
  const applyCustoms = (customs: Record<string, CustomPaletteDef>): void => {
    const wanted = new Set(Object.keys(customs).map(rawId => customThemeId(rawId)))
    for (const themeId of [...imported.keys()]) {
      if (!wanted.has(themeId)) {
        imported.get(themeId)!()
        imported.delete(themeId)
      }
    }
    const nextChips: CustomChip[] = []
    for (const [rawId, def] of Object.entries(customs)) {
      const themeId = customThemeId(rawId)
      if (!imported.has(themeId)) {
        imported.set(themeId, theme.register({
          id: themeId,
          colorScheme: def.colorScheme,
          tokens: deriveCustomTokens(def),
        }))
      }
      nextChips.push({
        id: themeId,
        label: def.name,
        swatchAccent: def.colors.accent,
        swatchBackground: def.colors.base,
      })
    }
    chips = nextChips
    bound?.sync(current, chips, ++revision)
  }

  const applySelection = (palette: PaletteSelection, base: BasePreference): void => {
    restoreBase = base
    if (palette === OFF) {
      if (theme.getTheme().preference !== restoreBase) theme.setTheme(restoreBase)
    } else if ((theme.getTheme().preference as string) !== palette) {
      theme.setTheme(palette)
    }
    sync(palette)
  }

  const clearPalette = (): void => {
    sync(OFF)
    void persistSelection(ctx.logger, { palette: OFF, base: restoreBase })
  }

  // Base-settle discipline over ui-theme's durable section (see module doc):
  // the first ready mirrors the initial adoption; later changes are writes.
  const baseScope: SettingsScope<{ [BASE_THEME_FIELD]: BasePreference }> =
    ctx.settingsScope.bind({ namespace: BASE_THEME_NAMESPACE })
  let baseSettled = false
  ctx.effect(() => baseScope.subscribe(() => {
    const snapshot = baseScope.getSnapshot()
    if (snapshot.status !== 'ready' || snapshot.value === undefined) return
    const base = snapshot.value[BASE_THEME_FIELD] ?? 'system'
    if (!baseSettled) {
      // ui-theme's adoption ran (its subscription precedes ours). If it
      // overwrote an already-applied palette, restore the palette.
      baseSettled = true
      restoreBase = base
      if (adopted && current !== OFF && (theme.getTheme().preference as string) !== current) theme.setTheme(current)
      return
    }
    // A later write to the base preference clears the palette.
    restoreBase = base
    if (adopted) clearPalette()
  }), 'premium-themes: base preference mirror')

  const injected = (actions: BoundActions<typeof store>): PaletteRowInjected => {
    bound = actions
    bound.sync(current, chips, ++revision)
    return {
      setPalette: (id) => {
        adopted = true
        if (id === OFF) {
          applySelection(OFF, restoreBase)
          void persistSelection(ctx.logger, { palette: OFF, base: restoreBase })
        } else {
          // Remember the base preference in force before this palette, so
          // 默认 restores exactly what the user left behind.
          const preference = theme.getTheme().preference
          const base = preference === 'light' || preference === 'dark' || preference === 'system'
            ? preference
            : restoreBase
          applySelection(id, base)
          void persistSelection(ctx.logger, { palette: id, base })
        }
      },
      importPalette: async (input) => {
        try {
          const response = await fetch(CUSTOM_ROUTE_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          })
          const body = await response.json() as Record<string, unknown>
          if (!response.ok) {
            return typeof body.error === 'string' ? body.error : 'import failed'
          }
          const snapshot = narrowSnapshot(body)
          applyCustoms(snapshot.customs)
          adopted = true
          const preference = theme.getTheme().preference
          const base = preference === 'light' || preference === 'dark' || preference === 'system'
            ? preference
            : restoreBase
          // The Host answers with the upserted raw id (generated ids for
          // non-latin names are not guessable client-side).
          const importedRaw = typeof body.imported === 'string' ? body.imported : undefined
          const themeId: PaletteSelection | undefined = importedRaw !== undefined ? customThemeId(importedRaw) : undefined
          applySelection(themeId ?? snapshot.palette, base)
          void persistSelection(ctx.logger, { palette: themeId ?? snapshot.palette, base })
          return undefined
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      },
      removePalette: async (themeId) => {
        if (!isCustomThemeId(themeId)) return
        try {
          const response = await fetch(CUSTOM_ROUTE_PATH, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: themeId.slice('custom-'.length) }),
          })
          const body = await response.json() as Record<string, unknown>
          if (!response.ok) {
            ctx.logger.warn(`premium-themes: palette removal failed: ${String(body.error ?? response.status)}`)
            return
          }
          const snapshot = narrowSnapshot(body)
          applyCustoms(snapshot.customs)
          adopted = true
          // Removing the active palette restores the remembered base.
          if (snapshot.palette === OFF) applySelection(OFF, restoreBase)
          else sync(snapshot.palette)
        } catch (error) {
          ctx.logger.warn(`premium-themes: palette removal failed: ${String(error)}`)
        }
      },
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: ROW_ID,
    order: 20,
    store,
    locale: SETTINGS_NS,
    inject: injected,
  }, PaletteRow))

  // Restore the durable selection and imported defs; the row mirror is synced
  // by the same paths so state survives a reload before any click.
  void fetchSelection().then(({ palette, base, customs }) => {
    applyCustoms(customs)
    if (!adopted) {
      adopted = true
      applySelection(palette, base)
    }
  }).catch(() => {})
}
