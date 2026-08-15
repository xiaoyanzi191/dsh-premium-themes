/** Premium-themes apply wiring: palette registry, durable selection adoption
 * (both settle orders), Palette row registration, base-preference clearing,
 * and teardown. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, stubSettingsScope, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeSettings } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject, ROW_ID, SETTINGS_NS } from '../src/client/index.ts'
import type { PaletteRowInjected } from '../src/client/PaletteRow.tsx'
import { PaletteRow } from '../src/client/PaletteRow.tsx'
import type { createPaletteRowStore } from '../src/client/settings-store.ts'
import { PREMIUM_PALETTES } from '../src/palettes.ts'
import {
  BASE_FIELD, CUSTOM_FIELD, CUSTOM_ROUTE_PATH, OFF, PALETTE_FIELD, PALETTE_ROUTE_PATH,
  customThemeId, type CustomPaletteDef,
} from '../src/theme-settings.ts'

// ui-theme's durable schema, rebuilt locally so the standalone repo needs no
// source checkout (the scope decoder only rehydrates this envelope).
const baseThemeSchema = z.object({ preference: z.union(['light', 'dark', 'system']) })

usePinnedBrowserLanguages('zh-CN')

const SLOT = 'settings.general.item'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

/** Stand in for the settings shell: declare the General item slot from root. */
function declareItems(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

/** Mirror the framework's inject choreography: bake a real instance and hand its actions to the inject factory. */
function faceOf(slots: SlotRegistry) {
  const entry = slots.entries(SLOT).find(e => e.component === PaletteRow)!
  const handle = entry.store as ReturnType<typeof createPaletteRowStore>
  const instance = handle.create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => PaletteRowInjected)(instance.actions)
  return { entry, instance, face }
}

interface BenchOptions {
  palette?: unknown
  base?: unknown
  /** Seed imported defs served by the custom route. */
  customs?: Record<string, CustomPaletteDef>
  /** Keep every initial settings describe pending until settleDescribe() runs. */
  deferred?: boolean
  /** Fail the palette route fetch (route-unavailable fallback path). */
  failFetch?: boolean
}

/** Wire one test composition: theme service, locale, slots, settings scope, and stubbed plugin routes. */
async function bench(options: BenchOptions = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const host = stubSettingsScope<ThemeSettings>()
  const theme = new ThemeRuntime(ctx, host.scope)
  ctx.provide('theme', theme)

  // Durable section state the stubbed routes mutate and serve back.
  const section: {
    palette: string
    base: string
    customPalettes: Record<string, CustomPaletteDef>
  } = {
    palette: typeof options.palette === 'string' ? options.palette : OFF,
    base: typeof options.base === 'string' ? options.base : 'system',
    customPalettes: { ...(options.customs ?? {}) },
  }

  let preference = 'system'
  const namespace = () => ({
    ns: 'ui-theme',
    schema: baseThemeSchema.toJSON(),
    value: { preference },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  })
  const describeImpl = () => Promise.resolve({
    rpcId: 'settings-describe' as never,
    result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [namespace()] } },
  })
  const settle = deferred<Awaited<ReturnType<typeof describeImpl>>>()
  const describe = vi.fn(describeImpl)
  if (options.deferred) {
    // Every early describe rides the same pending promise, so whichever scope
    // (locale's or the plugin's) loads first still waits for settleDescribe.
    describe.mockImplementation(() => settle.promise)
  }
  ctx.provide('connection', { api: { settings: { describe, mutate: vi.fn() } }, isLoopback: true } as never)
  new TestRemote(ctx)
  await ctx.plugin(SettingsScopeBinder).await()

  const requests: { method: string; path: string; body: unknown }[] = []
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (options.failFetch) throw new Error('no host route')
    if (init?.method === 'POST' && path === CUSTOM_ROUTE_PATH) {
      const body = JSON.parse(String(init.body)) as { name: string; colorScheme: 'light' | 'dark' }
      requests.push({ method: 'POST', path, body })
      const rawId = body.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
      section.customPalettes = {
        ...section.customPalettes,
        [rawId]: {
          id: rawId, name: body.name, colorScheme: body.colorScheme,
          colors: { base: '#eef7f2', accent: '#2f9e6e', text: '', surface: '' },
          tokens: {},
        },
      }
      return { ok: true, json: async () => ({ ...section, imported: rawId }) } as Response
    }
    if (init?.method === 'DELETE' && path === CUSTOM_ROUTE_PATH) {
      const body = JSON.parse(String(init.body)) as { id: string }
      requests.push({ method: 'DELETE', path, body })
      delete section.customPalettes[body.id]
      if (section.palette === customThemeId(body.id)) section.palette = OFF
      return { ok: true, json: async () => ({ ...section }) } as Response
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { palette?: string; base?: string }
      requests.push({ method: 'POST', path, body })
      if (body.palette !== undefined) section.palette = body.palette
      if (body.base !== undefined) section.base = body.base
      return { ok: true, json: async () => ({ ...section }) } as Response
    }
    return { ok: true, json: async () => ({ ...section }) } as Response
  })
  vi.stubGlobal('fetch', fetch)

  declareItems(ctx.get('slots') as SlotRegistry)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, locale, theme, fetch, requests, fiber, section,
    settleDescribe: () => {
      settle.resolve(describeImpl())
      describe.mockImplementation(describeImpl)
    },
    setHostPreference: (next: string) => { preference = next },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('premium-themes apply', () => {
  it('declares the slot and locale services', () => {
    expect(inject).toEqual(['theme', 'slots', 'locale', 'settingsScope'])
  })

  it('registers every palette as a third-party theme on the runtime', async () => {
    const b = await bench()
    const ids = b.theme.getTheme().themes.map(t => t.id)
    expect(ids).toEqual(['light', 'dark', ...PREMIUM_PALETTES.map(p => p.id)])
    const palette = b.theme.getTheme().themes.find(t => t.id === 'tokyo-night')!
    expect(palette.colorScheme).toBe('dark')
    expect(palette.tokens['--dsw-alias-bg-base']).toBe('#16161e')
  })

  it('restores the durable palette after activation and mirrors it into the row', async () => {
    const b = await bench({ palette: 'tokyo-night', base: 'light' })
    await vi.waitFor(() => { expect(b.theme.getTheme().active.id).toBe('tokyo-night') })
    const { instance } = faceOf(b.slots)
    expect(instance.getSnapshot().palette).toBe('tokyo-night')
  })

  it('re-applies the palette when the base preference settles after the fetch (late adoption)', async () => {
    const b = await bench({ palette: 'rose-pine', base: 'dark', deferred: true })
    await vi.waitFor(() => { expect(b.theme.getTheme().active.id).toBe('rose-pine') })
    // ui-theme's adoption lands late and clobbers the applied palette…
    b.setHostPreference('dark')
    b.theme.setTheme('dark')
    expect(b.theme.getTheme().active.id).toBe('dark')
    // …then its scope's first ready must restore the palette.
    b.settleDescribe()
    await vi.waitFor(() => { expect(b.theme.getTheme().active.id).toBe('rose-pine') })
  })

  it('clears the palette when the base preference is written after settlement', async () => {
    const b = await bench({ palette: 'nord', base: 'light' })
    // Adoption lands and the initial scope publish (ready, immediate describe)
    // marks the base settled; both precede the user's later write.
    await vi.waitFor(() => { expect(b.theme.getTheme().active.id).toBe('nord') })
    await vi.waitFor(() => { expect(b.fetch).toHaveBeenCalledWith(PALETTE_ROUTE_PATH) })
    // The user clicks a base cube: ui-theme adopts the new preference (its
    // subscription precedes ours), then our mirror clears the palette.
    b.setHostPreference('dark')
    b.theme.setTheme('dark')
    b.ctx.remote.$dispatch('settings/document-updated', ['ui-theme', 1])
    await vi.waitFor(() => { expect(b.theme.getTheme().active.id).toBe('dark') })
    const { instance } = faceOf(b.slots)
    await vi.waitFor(() => { expect(instance.getSnapshot().palette).toBe(OFF) })
    const writes = b.requests.filter(r => r.method === 'POST')
    expect(writes.at(-1)!.body).toEqual({ [PALETTE_FIELD]: OFF, base: 'dark' })
  })

  it('routes face writes: palette selection persists with the remembered base; 默认 restores it', async () => {
    const b = await bench()
    b.setHostPreference('dark')
    b.theme.setTheme('dark')
    const { instance, face } = faceOf(b.slots)
    face.setPalette('paper-gold')
    expect(b.theme.getTheme().active.id).toBe('paper-gold')
    expect(instance.getSnapshot().palette).toBe('paper-gold')
    await vi.waitFor(() => { expect(b.requests.at(-1)!.body).toEqual({ [PALETTE_FIELD]: 'paper-gold', base: 'dark' }) })

    face.setPalette(OFF)
    expect(b.theme.getTheme().active.id).toBe('dark')
    expect(instance.getSnapshot().palette).toBe(OFF)
  })

  it('registers the Palette row with its locale and order', async () => {
    const b = await bench()
    const entry = b.slots.entries(SLOT).find(e => e.component === PaletteRow)!
    expect(entry.options).toMatchObject({ id: ROW_ID, order: 20 })
    expect(entry.locale).toBe(SETTINGS_NS)
    expect(b.locale.bind(SETTINGS_NS)('palette.title')).toBe('配色')
    b.locale.setLocale('en')
    expect(b.locale.bind(SETTINGS_NS)('palette.title')).toBe('Palette')
  })

  it('falls back to the defaults when the route is unavailable', async () => {
    const b = await bench({ failFetch: true })
    await vi.waitFor(() => { expect(b.theme.getTheme().themes).toHaveLength(10) })
    expect(b.theme.getTheme().active.id).toBe('light')
    const { instance } = faceOf(b.slots)
    expect(instance.getSnapshot().palette).toBe(OFF)
  })

  it('imports a custom palette: registers the derived theme, selects it, and persists', async () => {
    const b = await bench()
    b.setHostPreference('light')
    b.theme.setTheme('light')
    const { instance, face } = faceOf(b.slots)
    const failure = await face.importPalette({
      name: 'Mint',
      colorScheme: 'light',
      colors: { base: '#eef7f2', accent: '#2f9e6e', text: '', surface: '' },
      tokens: {},
    })
    expect(failure).toBeUndefined()
    const themeId = customThemeId('mint')
    expect(b.theme.getTheme().themes.some(t => t.id === themeId)).toBe(true)
    const active = b.theme.getTheme().active
    expect(active.id).toBe(themeId)
    expect(active.tokens['--dsw-alias-bg-base']).toBe('#eef7f2')
    expect(active.tokens['--dsw-alias-brand-primary']).toBe('#2f9e6e')
    await vi.waitFor(() => { expect(instance.getSnapshot().palette).toBe(themeId) })
    expect(instance.getSnapshot().chips.map(chip => chip.label)).toEqual(['Mint'])
    const paletteWrite = b.requests.filter(r => r.method === 'POST' && r.path === PALETTE_ROUTE_PATH).at(-1)!
    expect(paletteWrite.body).toEqual({ [PALETTE_FIELD]: themeId, [BASE_FIELD]: 'light' })
  })

  it('removing the active import unregisters the theme and restores the base', async () => {
    const mint: CustomPaletteDef = {
      id: 'mint', name: '薄荷', colorScheme: 'light',
      colors: { base: '#eef7f2', accent: '#2f9e6e', text: '', surface: '' },
      tokens: {},
    }
    const b = await bench({ palette: 'custom-mint', base: 'light', customs: { mint } })
    await vi.waitFor(() => { expect(b.theme.getTheme().active.id).toBe('custom-mint') })
    const { face } = faceOf(b.slots)
    await face.removePalette('custom-mint')
    expect(b.theme.getTheme().themes.some(t => t.id === 'custom-mint')).toBe(false)
    expect(b.theme.getTheme().active.id).toBe('light')
  })

  it('surfaces import failures from the route as a readable error', async () => {
    const b = await bench({ failFetch: true })
    const { face } = faceOf(b.slots)
    const failure = await face.importPalette({
      name: 'x', colorScheme: 'dark',
      colors: { base: '#101014', accent: '#ffcc66', text: '', surface: '' },
      tokens: {},
    })
    expect(failure).toBeTypeOf('string')
    expect(b.theme.getTheme().themes.some(t => t.id === 'custom-x')).toBe(false)
  })

  it('teardown unregisters the palettes and removes the row and dictionaries', async () => {
    const b = await bench()
    expect(b.slots.entries(SLOT)).toHaveLength(1)
    await b.fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    expect(b.theme.getTheme().themes.map(t => t.id)).toEqual(['light', 'dark'])
    expect(b.locale.bind(SETTINGS_NS)('palette.title')).toBe('palette.title')
  })
})
