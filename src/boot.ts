/**
 * Host-rendered palette bootstrap for the browser's pre-plugin interval. Each
 * index response embeds the durable palette selection; when a palette is
 * active the script pins `color-scheme` and `body[data-ds-dark-theme]` to the
 * palette's base scheme so the shell loading page paints in the right family
 * before the client plugin tree activates and applies the alias tokens.
 *
 * The script is injected before `</body>` — after ui-theme's own bootstrap,
 * which sits right after the opening `<body>` tag — so the palette wins over
 * the base light/dark preference for the initial paint, matching what the
 * theme presenter applies once the plugins activate.
 */

import {
  isCustomThemeId, OFF, PALETTE_COLOR_SCHEMES,
  type CustomPaletteDef, type PaletteSelection,
} from './theme-settings.ts'

/** Base scheme of a selected palette; built-ins come from the static table, imports from their def. */
export function paletteSchemeOf(
  selection: PaletteSelection,
  customs: Readonly<Record<string, CustomPaletteDef>>,
): 'light' | 'dark' | undefined {
  if (selection === OFF) return undefined
  if (isCustomThemeId(selection)) {
    const rawId = selection.slice('custom-'.length)
    return customs[rawId]?.colorScheme
  }
  return PALETTE_COLOR_SCHEMES[selection as keyof typeof PALETTE_COLOR_SCHEMES]
}

/** Build the inline script for one schema-validated selection; `off` or an unknown id yields nothing. */
function bootPaletteScript(
  selection: PaletteSelection,
  customs: Readonly<Record<string, CustomPaletteDef>>,
): string {
  const scheme = paletteSchemeOf(selection, customs)
  if (scheme === undefined) return ''
  const dark = scheme === 'dark'
  return `<script>(() => {
  // premium-themes: palette "${selection}" rides the ${scheme} base palette
  // (injected after ui-theme's bootstrap, so it wins the pre-plugin paint).
  document.documentElement.style.colorScheme = ${JSON.stringify(scheme)}
  document.body.toggleAttribute('data-ds-dark-theme', ${JSON.stringify(dark)})
})()</script>`
}

/**
 * Insert the palette bootstrap before the closing body tag, after any
 * content; body-less fragments receive it at the end. With no palette
 * selected the HTML passes through unchanged.
 * @param html - Raw application index HTML.
 * @param selection - Current durable palette selection.
 * @param customs - Imported custom palette defs (scheme lookup for imports).
 * @returns HTML containing the palette bootstrap.
 */
export function injectPaletteBoot(
  html: string,
  selection: PaletteSelection,
  customs: Readonly<Record<string, CustomPaletteDef>> = {},
): string {
  const script = bootPaletteScript(selection, customs)
  if (script === '') return html
  const bodyClose = /<\/body>/i.exec(html)
  if (bodyClose === null) return `${html}${script}`
  return `${html.slice(0, bodyClose.index)}${script}${html.slice(bodyClose.index)}`
}
