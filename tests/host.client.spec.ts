/** Host half: settings registration, index transform wiring, and the palette/custom routes. */
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  apply, customRouteHandler, paletteRouteHandler, PREMIUM_THEMES_SETTINGS_NAMESPACE,
} from '../src/index.ts'
import {
  BASE_FIELD, CUSTOM_FIELD, CUSTOM_ROUTE_PATH, PALETTE_FIELD, PALETTE_ROUTE_PATH,
} from '../src/theme-settings.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

/** Minimal request double: method, JSON body, and a buffered response. */
function request(method: string, body?: unknown): { req: IncomingMessage; res: ServerResponse & { json: () => unknown; status: () => number } } {
  const req = new EventEmitter() as unknown as IncomingMessage & { method?: string }
  req.method = method
  const res = new EventEmitter() as unknown as ServerResponse & { json: () => unknown; status: () => number }
  let status = 200
  let payload: unknown
  res.writeHead = (code: number) => { status = code; return res }
  res.end = (chunk?: unknown) => { payload = typeof chunk === 'string' ? JSON.parse(chunk) : undefined; return res }
  res.status = () => status
  res.json = () => payload
  // The handler reads the body only for POST/DELETE; emit events synchronously
  // before the first await so the promise sees them on attach. A string body
  // passes through verbatim (the malformed-JSON case); anything else is
  // JSON-encoded. `end` always fires so body-less methods cannot hang a read.
  const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  queueMicrotask(() => {
    if (raw !== undefined) req.emit('data', Buffer.from(raw))
    req.emit('end')
  })
  return { req, res }
}

describe('premium-themes host', () => {
  it('registers, validates, and disposes the durable namespace with its fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const ns = settingsNamespace(PREMIUM_THEMES_SETTINGS_NAMESPACE)
    expect(ctx.settings.get(ns)).toEqual({ [PALETTE_FIELD]: 'off', [BASE_FIELD]: 'system', [CUSTOM_FIELD]: {} })
    await ctx.settings.update(ns, { [PALETTE_FIELD]: 'tokyo-night' })
    expect(ctx.settings.get(ns)).toMatchObject({ [PALETTE_FIELD]: 'tokyo-night' })
    await expect(ctx.settings.update(ns, { [PALETTE_FIELD]: 'sepia' })).rejects.toThrow()
    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('renders the durable selection into the index and disposes the transform', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    let transform: ((html: string) => string) | undefined
    let disposed = false
    ctx.provide('webServer', {
      tapIndex: (next: (html: string) => string) => {
        transform = next
        return () => { disposed = true }
      },
      register: () => () => undefined,
    } as unknown as WebServer)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(transform?.('<html><body></body></html>')).not.toContain('premium-themes: palette')
    await ctx.settings.update(settingsNamespace(PREMIUM_THEMES_SETTINGS_NAMESPACE), { [PALETTE_FIELD]: 'nord' })
    expect(transform?.('<html><body></body></html>')).toContain('palette "nord"')
    await fiber.dispose()
    expect(disposed).toBe(true)
  })

  it('answers GET with the durable selection, or the defaults without a provider', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    await ctx.plugin({ apply }).await()
    await ctx.settings.update(settingsNamespace(PREMIUM_THEMES_SETTINGS_NAMESPACE), {
      [PALETTE_FIELD]: 'rose-pine', [BASE_FIELD]: 'dark',
    })
    const get = request('GET')
    await paletteRouteHandler(ctx.settings, get.req, get.res)
    expect(get.res.status()).toBe(200)
    expect(get.res.json()).toEqual({ [PALETTE_FIELD]: 'rose-pine', [BASE_FIELD]: 'dark', [CUSTOM_FIELD]: {} })

    const bare = request('GET')
    await paletteRouteHandler(undefined, bare.req, bare.res)
    expect(bare.res.json()).toEqual({ [PALETTE_FIELD]: 'off', [BASE_FIELD]: 'system', [CUSTOM_FIELD]: {} })
  })

  it('accepts valid POST bodies through the settings seam and answers the new section', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    await ctx.plugin({ apply }).await()
    const post = request('POST', { [PALETTE_FIELD]: 'ayu-mirage', [BASE_FIELD]: 'light' })
    await paletteRouteHandler(ctx.settings, post.req, post.res)
    expect(post.res.status()).toBe(200)
    expect(ctx.settings.get(settingsNamespace(PREMIUM_THEMES_SETTINGS_NAMESPACE))).toEqual({
      [PALETTE_FIELD]: 'ayu-mirage', [BASE_FIELD]: 'light', [CUSTOM_FIELD]: {},
    })

    // Base-only write keeps the palette untouched.
    const baseOnly = request('POST', { [BASE_FIELD]: 'dark' })
    await paletteRouteHandler(ctx.settings, baseOnly.req, baseOnly.res)
    expect(baseOnly.res.status()).toBe(200)
    expect(baseOnly.res.json()).toEqual({ [PALETTE_FIELD]: 'ayu-mirage', [BASE_FIELD]: 'dark', [CUSTOM_FIELD]: {} })
  })

  it('rejects selections of imported ids that do not exist', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    await ctx.plugin({ apply }).await()
    const ghost = request('POST', { [PALETTE_FIELD]: 'custom-ghost', [BASE_FIELD]: 'light' })
    await paletteRouteHandler(ctx.settings, ghost.req, ghost.res)
    expect(ghost.res.status()).toBe(400)
    expect(ghost.res.json()).toMatchObject({ error: expect.stringContaining('custom-ghost') })
  })

  it('rejects malformed bodies, unknown ids, missing providers, and odd methods', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()

    const badJson = request('POST', '{not json')
    await paletteRouteHandler(ctx.settings, badJson.req, badJson.res)
    expect(badJson.res.status()).toBe(400)

    const badId = request('POST', { [PALETTE_FIELD]: 'sepia' })
    await paletteRouteHandler(ctx.settings, badId.req, badId.res)
    expect(badId.res.status()).toBe(400)

    const badBase = request('POST', { [PALETTE_FIELD]: 'off', [BASE_FIELD]: 'purple' })
    await paletteRouteHandler(ctx.settings, badBase.req, badBase.res)
    expect(badBase.res.status()).toBe(400)

    const noProvider = request('POST', { [PALETTE_FIELD]: 'nord' })
    await paletteRouteHandler(undefined, noProvider.req, noProvider.res)
    expect(noProvider.res.status()).toBe(503)

    const patch = request('PATCH')
    await paletteRouteHandler(ctx.settings, patch.req, patch.res)
    expect(patch.res.status()).toBe(405)
  })

  it('registers both routes on the webserver', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const register = vi.fn(() => () => undefined)
    ctx.provide('webServer', { tapIndex: () => () => undefined, register } as unknown as WebServer)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(register).toHaveBeenCalledTimes(2)
    expect(register.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'exact', path: PALETTE_ROUTE_PATH }),
      expect.objectContaining({ kind: 'exact', path: CUSTOM_ROUTE_PATH }),
    ]))
    await fiber.dispose()
  })
})

describe('premium-themes custom route', () => {
  const IMPORT = {
    name: '我的薄荷',
    colorScheme: 'light',
    colors: { base: '#eef7f2', accent: '#2f9e6e' },
  }

  it('imports a forgiving payload as a normalized def and lists it', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    await ctx.plugin({ apply }).await()

    // A pure-Chinese name slugs to nothing: the route generates an id.
    const post = request('POST', IMPORT)
    await customRouteHandler(ctx.settings, post.req, post.res)
    expect(post.res.status()).toBe(200)
    const imported = post.res.json() as { [CUSTOM_FIELD]: Record<string, unknown> }
    const entries = Object.entries(imported[CUSTOM_FIELD])
    expect(entries).toHaveLength(1)
    expect(entries[0]![0]).toMatch(/^palette-[a-z0-9]+$/)
    expect(entries[0]![1]).toMatchObject({ name: '我的薄荷', colorScheme: 'light' })

    const list = request('GET')
    await customRouteHandler(ctx.settings, list.req, list.res)
    expect(list.res.json()).toEqual({
      [entries[0]![0]]: {
        id: entries[0]![0], name: '我的薄荷', colorScheme: 'light',
        colors: { base: '#eef7f2', accent: '#2f9e6e', text: '', surface: '' },
        tokens: {},
      },
    })

    // A latin name slugs to itself.
    const latin = request('POST', { ...IMPORT, name: 'Mint' })
    await customRouteHandler(ctx.settings, latin.req, latin.res)
    const latinImported = latin.res.json() as { [CUSTOM_FIELD]: Record<string, unknown> }
    expect(Object.keys(latinImported[CUSTOM_FIELD]).sort()).toEqual([entries[0]![0], 'mint'].sort())
  })

  it('rejects imports without a name, scheme, or with malformed colors', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    await ctx.plugin({ apply }).await()

    for (const body of [
      { colorScheme: 'dark', colors: { base: '#101014', accent: '#ffcc66' } },
      { name: 'x', colors: { base: '#101014', accent: '#ffcc66' } },
      { name: 'x', colorScheme: 'dark', colors: { base: 'nope', accent: '#ffcc66' } },
    ]) {
      const post = request('POST', body)
      await customRouteHandler(ctx.settings, post.req, post.res)
      expect(post.res.status()).toBe(400)
    }
  })

  it('deleting an import removes it and restores the base when it was active', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    await ctx.plugin({ apply }).await()
    await ctx.settings.update(settingsNamespace(PREMIUM_THEMES_SETTINGS_NAMESPACE), {
      [PALETTE_FIELD]: 'custom-mint',
      [CUSTOM_FIELD]: {
        mint: {
          id: 'mint', name: 'mint', colorScheme: 'light',
          colors: { base: '#eef7f2', accent: '#2f9e6e', text: '', surface: '' },
          tokens: {},
        },
      },
    })

    const del = request('DELETE', { id: 'mint' })
    await customRouteHandler(ctx.settings, del.req, del.res)
    expect(del.res.status()).toBe(200)
    const section = ctx.settings.get(settingsNamespace(PREMIUM_THEMES_SETTINGS_NAMESPACE)) as {
      palette: string
      customPalettes: Record<string, unknown>
    }
    expect(section.palette).toBe('off')
    expect(section.customPalettes).toEqual({})

    const ghost = request('DELETE', { id: 'ghost' })
    await customRouteHandler(ctx.settings, ghost.req, ghost.res)
    expect(ghost.res.status()).toBe(404)
  })

  it('answers 503 without a settings provider and 405 for odd methods', async () => {
    const post = request('POST', IMPORT)
    await customRouteHandler(undefined, post.req, post.res)
    expect(post.res.status()).toBe(503)

    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    await ctx.plugin({ apply }).await()
    const patch = request('PATCH')
    await customRouteHandler(ctx.settings, patch.req, patch.res)
    expect(patch.res.status()).toBe(405)
  })
})
