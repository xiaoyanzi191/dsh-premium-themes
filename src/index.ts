/**
 * Host half of the premium-palette plugin: registers the plugin's own durable
 * settings namespace (`ui-premium-themes` — the shared Web settings plane only
 * serves product allowlists, so this plugin persists through its own routes),
 * injects the pre-plugin palette bootstrap into the index response, and serves
 * the selection route plus the custom-palette management route the browser
 * half uses. Everything is optional-service guarded: compositions without the
 * settings provider or the HTTP server keep the base light/dark/system theme
 * untouched.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { settingsNamespace, type SettingsProvider } from '@deepseek-ai/dsh-settings'
import { injectPaletteBoot } from './boot.ts'
import { deriveCustomTokens } from './derive.ts'
import {
  BASE_FIELD, CUSTOM_FIELD, CUSTOM_ROUTE_PATH, DEFAULT_CUSTOMS, DEFAULT_SELECTION,
  isBasePreference, isCustomThemeId, isPaletteSelection,
  PALETTE_FIELD, PALETTE_ROUTE_PATH, PREMIUM_THEMES_SETTINGS_NAMESPACE,
  PremiumThemesSettingsSchema, type CustomPaletteDef, type PremiumThemesSettings,
} from './theme-settings.ts'

export {
  BASE_FIELD, CUSTOM_FIELD, CUSTOM_ROUTE_PATH, DEFAULT_SELECTION, OFF,
  PALETTE_FIELD, PALETTE_PREFERENCES, PALETTE_ROUTE_PATH,
  PREMIUM_THEMES_SETTINGS_NAMESPACE, PremiumThemesSettingsSchema, isPaletteSelection,
  type PalettePreference, type PaletteSelection, type BasePreference,
  type CustomPaletteDef, type PremiumThemesSettings,
} from './theme-settings.ts'

const THEME_NAMESPACE = settingsNamespace(PREMIUM_THEMES_SETTINGS_NAMESPACE)

/** Read the registered section or the schema defaults without a settings provider. */
function readSelection(settings: SettingsProvider | undefined): PremiumThemesSettings {
  if (settings === undefined) {
    return {
      [PALETTE_FIELD]: DEFAULT_SELECTION,
      [BASE_FIELD]: 'system',
      [CUSTOM_FIELD]: { ...DEFAULT_CUSTOMS },
    }
  }
  const section = settings.get(THEME_NAMESPACE) as Partial<PremiumThemesSettings> | undefined
  const customs = section?.[CUSTOM_FIELD]
  return {
    [PALETTE_FIELD]: isPaletteSelection(section?.[PALETTE_FIELD]) ? section[PALETTE_FIELD] : DEFAULT_SELECTION,
    [BASE_FIELD]: isBasePreference(section?.[BASE_FIELD]) ? section[BASE_FIELD] : 'system',
    [CUSTOM_FIELD]: customs !== null && typeof customs === 'object' ? { ...(customs as Record<string, CustomPaletteDef>) } : {},
  }
}

/** Read one request body (bounded shapes only — the routes are small JSON objects). */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Parse a request body into a JSON object, answering 400 on malformed input. */
async function readJson(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readBody(req)) as Record<string, unknown>
  } catch {
    json(res, 400, { error: 'request body must be a JSON object' })
    return undefined
  }
}

/**
 * Normalize a forgiving import payload into the strict stored shape: missing
 * text/surface/tokens default to empty, the id defaults to a slug of the name
 * (lowercased, spaces to dashes, latin letters/digits/dashes kept), and the
 * seed colors must derive without throwing. Returns the def, or an error
 * message.
 */
function normalizeImport(body: Record<string, unknown>): { def?: CustomPaletteDef; error?: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name === '') return { error: 'name is required' }
  let rawId = typeof body.id === 'string' && body.id !== ''
    ? body.id
    : name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  // A name with no latin letters or digits (e.g. pure Chinese) slugs to
  // nothing; fall back to a generated id so the import still lands.
  if (rawId === '') rawId = `palette-${Date.now().toString(36)}`
  const colorScheme = body.colorScheme === 'dark' ? 'dark' : body.colorScheme === 'light' ? 'light' : undefined
  if (colorScheme === undefined) return { error: 'colorScheme must be light or dark' }
  const colors = (body.colors ?? {}) as Record<string, unknown>
  const def: CustomPaletteDef = {
    id: rawId,
    name,
    colorScheme,    colors: {
      base: typeof colors.base === 'string' ? colors.base : '',
      accent: typeof colors.accent === 'string' ? colors.accent : '',
      text: typeof colors.text === 'string' ? colors.text : '',
      surface: typeof colors.surface === 'string' ? colors.surface : '',
    },
    tokens: typeof body.tokens === 'object' && body.tokens !== null
      ? { ...(body.tokens as Record<string, string>) }
      : {},
  }
  try {
    deriveCustomTokens(def)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  return { def }
}

/**
 * The palette route: GET answers the durable selection plus the imported
 * defs; POST accepts `{ palette, base? }` and writes it through the settings
 * seam (a palette must be a built-in id, `off`, or an imported id that
 * exists). Unsupported methods answer 405, malformed bodies 400, and a
 * missing settings provider 503 — the browser half falls back to the schema
 * defaults on any failure.
 */
export async function paletteRouteHandler(
  settings: SettingsProvider | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === 'GET') {
    json(res, 200, readSelection(settings))
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end()
    return
  }
  const body = await readJson(req, res)
  if (body === undefined) return
  const base = body[BASE_FIELD]
  if (base !== undefined && !isBasePreference(base)) {
    json(res, 400, { error: `"${BASE_FIELD}" must be light, dark, or system` })
    return
  }
  if (settings === undefined) {
    json(res, 503, { error: 'settings provider unavailable' })
    return
  }
  const current = readSelection(settings)
  // A base-only write keeps the current palette; a missing palette on a fresh
  // section means the defaults.
  let palette: unknown = body[PALETTE_FIELD]
  if (palette === undefined) palette = current[PALETTE_FIELD]
  if (!isPaletteSelection(palette)) {
    json(res, 400, { error: `"${PALETTE_FIELD}" must be "off" or a registered palette id` })
    return
  }
  // Imported ids must exist in the durable defs; a stale id is a client bug.
  if (isCustomThemeId(palette) && current[CUSTOM_FIELD][palette.slice('custom-'.length)] === undefined) {
    json(res, 400, { error: `unknown imported palette "${palette}"` })
    return
  }
  try {
    await settings.update(THEME_NAMESPACE, {
      [PALETTE_FIELD]: palette,
      ...(base === undefined ? {} : { [BASE_FIELD]: base }),
    })
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }
  json(res, 200, readSelection(settings))
}

/**
 * The custom-palette route: GET lists the imported defs; POST upserts one
 * (forgiving payload normalized above — missing id derives from the name);
 * DELETE `{ id }` removes one and, when it was the active selection, restores
 * the remembered base. The browser re-derives tokens from the defs it
 * receives, so no token data crosses the wire.
 */
export async function customRouteHandler(
  settings: SettingsProvider | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === 'GET') {
    json(res, 200, readSelection(settings)[CUSTOM_FIELD])
    return
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.writeHead(405)
    res.end()
    return
  }
  if (settings === undefined) {
    json(res, 503, { error: 'settings provider unavailable' })
    return
  }
  const body = await readJson(req, res)
  if (body === undefined) return
  const current = readSelection(settings)
  const customs: Record<string, CustomPaletteDef> = { ...current[CUSTOM_FIELD] }

  if (req.method === 'POST') {
    const { def, error } = normalizeImport(body)
    if (def === undefined) {
      json(res, 400, { error: error ?? 'invalid palette definition' })
      return
    }
    customs[def.id] = def
    try {
      await settings.update(THEME_NAMESPACE, { [CUSTOM_FIELD]: customs })
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) })
      return
    }
    // The upserted raw id rides the response: the client derives its theme id
    // from it (generated ids for non-latin names are not guessable).
    json(res, 200, { ...readSelection(settings), imported: def.id })
    return
  }

  // DELETE: the settings seam's `update` merges (a merge cannot express
  // removal), so the whole section replaces wholesale.
  const id = typeof body.id === 'string' ? body.id : ''
  if (customs[id] === undefined) {
    json(res, 404, { error: `unknown imported palette "${id}"` })
    return
  }
  delete customs[id]
  // Removing the active palette restores the remembered base preference.
  const nextPalette = current[PALETTE_FIELD] === `custom-${id}` ? 'off' : current[PALETTE_FIELD]
  try {
    await settings.replace(THEME_NAMESPACE, {
      [PALETTE_FIELD]: nextPalette,
      [BASE_FIELD]: current[BASE_FIELD],
      [CUSTOM_FIELD]: customs,
    })
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }
  json(res, 200, readSelection(settings))
}

/**
 * Register the durable section, the index transform, and both routes when
 * their optional Host services are composed. The settings provider is read at
 * request/transform time (never captured at apply time) so a provider that
 * mounts after this plugin still answers every later request.
 * @param ctx - Host context that may acquire settings and HTTP services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(THEME_NAMESPACE, PremiumThemesSettingsSchema)
  })
  ctx.inject(['webServer'], (httpCtx) => {
    const settings = (): SettingsProvider | undefined => ctx.get('settings') as SettingsProvider | undefined
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex((html) => {
        const section = readSelection(settings())
        return injectPaletteBoot(html, section[PALETTE_FIELD], section[CUSTOM_FIELD])
      }),
      'client-ui-premium-themes: palette bootstrap',
    )
    httpCtx.effect(
      () => httpCtx.webServer.register({
        kind: 'exact',
        path: PALETTE_ROUTE_PATH,
        handler: (req, res) => paletteRouteHandler(settings(), req, res),
      }),
      'client-ui-premium-themes: palette route',
    )
    httpCtx.effect(
      () => httpCtx.webServer.register({
        kind: 'exact',
        path: CUSTOM_ROUTE_PATH,
        handler: (req, res) => customRouteHandler(settings(), req, res),
      }),
      'client-ui-premium-themes: custom palette route',
    )
  })
}
