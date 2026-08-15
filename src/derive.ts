/**
 * Deterministic token derivation for imported custom palettes: a handful of
 * seed colors (base background, brand accent, optional text/surface) expand
 * into the full `--dsw-alias-*` / `--dsw-specific-*` override map the theme
 * presenter applies, so an import paints the whole UI — layered surfaces,
 * borders, buttons, text, code blocks, sidebar, scrollbars — from one or two
 * hex values. Explicit `tokens` overrides from the definition win last.
 *
 * All helpers are pure and tested in isolation; the module shares no state
 * and runs identically in the Host and browser bundles.
 */

import type { CustomPaletteDef } from './theme-settings.ts'

/** One parsed hex color. */
interface Rgb {
  r: number
  g: number
  b: number
}

/** Parse `#rrggbb` (case-insensitive); throws a teaching error otherwise. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (match === null) {
    throw new TypeError(`premium-themes: "${hex}" is not a #rrggbb color`)
  }
  const value = Number.parseInt(match[1]!, 16)
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

/** Render an rgb triple back to lowercase `#rrggbb`. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** Mix `from` toward `to` by ratio `t` (0 = from, 1 = to). */
export function mix(from: string, to: string, t: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  })
}

/** Relative luminance (0..1) of one parsed color (perceived brightness). */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Readable ink over one color: near-black on bright colors, white otherwise. */
export function contrastInk(color: string): string {
  return luminance(hexToRgb(color)) > 0.45 ? '#161616' : '#ffffff'
}

/** One color plus alpha as `rgba(r, g, b, a)`. */
export function alpha(color: string, a: number): string {
  const { r, g, b } = hexToRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Lift a surface color one step within its scheme (toward white when dark, black when light). */
function lift(color: string, t: number, scheme: 'light' | 'dark'): string {
  return mix(color, scheme === 'dark' ? '#ffffff' : '#000000', t)
}

/**
 * Derive the full token map for one imported palette definition.
 * @param def - the persisted source definition (seed colors + overrides).
 * @returns the `--dsw-*` override map, with explicit `tokens` applied last.
 */
export function deriveCustomTokens(def: CustomPaletteDef): Record<string, string> {
  // Validate the seeds up front: every later expression can rely on them.
  const base = def.colors.base
  const accent = def.colors.accent
  hexToRgb(base)
  hexToRgb(accent)
  if (def.colors.text !== '') hexToRgb(def.colors.text)
  if (def.colors.surface !== '') hexToRgb(def.colors.surface)

  const scheme = def.colorScheme
  const layer1 = base
  const layer2 = def.colors.surface !== '' ? def.colors.surface : lift(base, 0.04, scheme)
  const layer3 = lift(base, 0.1, scheme)
  const overlay = lift(base, 0.16, scheme)
  const deeper = lift(base, 0.24, scheme)
  const text1 = def.colors.text !== '' ? def.colors.text : lift(base, 0.88, scheme)
  const text2 = lift(base, 0.7, scheme)
  const text3 = lift(base, 0.46, scheme)
  const dimmed = lift(base, 0.3, scheme)
  const accentHover = mix(accent, scheme === 'dark' ? '#ffffff' : '#000000', 0.12)
  const onAccent = contrastInk(accent)
  const toast = scheme === 'dark' ? deeper : mix(base, '#000000', 0.72)
  const whiteOverBlack = scheme === 'dark'

  const tokens: Record<string, string> = {
    '--dsw-alias-bg-base': base,
    '--dsw-alias-bg-layer-1': layer1,
    '--dsw-alias-bg-layer-2': layer2,
    '--dsw-alias-bg-layer-3': layer3,
    '--dsw-alias-bg-overlay': overlay,
    '--dsw-alias-bg-module-platform': layer3,
    '--dsw-alias-bg-multi-select': layer2,
    '--dsw-alias-bg-skeleton': alpha(text1, scheme === 'dark' ? 0.08 : 0.05),
    '--dsw-alias-bg-mask-drop': alpha(base, 0.72),
    '--dsw-alias-border-l1': alpha(text1, 0.08),
    '--dsw-alias-border-l2': alpha(text1, 0.14),
    '--dsw-alias-border-l2-darkmode-thin': alpha(text1, 0.08),
    '--dsw-alias-border-l3': alpha(text1, 0.2),
    '--dsw-alias-border-l4': alpha(text1, 0.28),
    '--dsw-alias-border-inverted': whiteOverBlack ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.4)',
    '--dsw-alias-border-inverted2': whiteOverBlack ? 'rgba(0, 0, 0, 0.34)' : 'rgba(255, 255, 255, 0.6)',
    '--dsw-alias-brand-primary': accent,
    '--dsw-alias-brand-primary-invert': base,
    '--dsw-alias-brand-primary-new-colorprimary-new-color': accent,
    '--dsw-alias-brand-text': text1,
    '--dsw-alias-button-primary-fill': accent,
    '--dsw-alias-button-primary-hover': accentHover,
    '--dsw-alias-button-primary-dimmed': layer3,
    '--dsw-alias-button-info-fill': accent,
    '--dsw-alias-button-info-hover': accentHover,
    '--dsw-alias-button-contrast-fill': text1,
    '--dsw-alias-button-elevated-fill': scheme === 'dark' ? layer3 : '#ffffff',
    '--dsw-alias-button-floating-fill': overlay,
    '--dsw-alias-button-floating-hover': deeper,
    '--dsw-alias-button-ghost-active-border': text3,
    '--dsw-alias-button-ghost-active-fill': layer3,
    '--dsw-alias-button-ghost-active-hover': overlay,
    '--dsw-alias-interactive-bg-hover': alpha(accent, 0.1),
    '--dsw-alias-interactive-bg-active': alpha(accent, 0.16),
    '--dsw-alias-interactive-bg-hover-accent': alpha(accent, 0.18),
    '--dsw-alias-interactive-bg-hover-solid': overlay,
    '--dsw-alias-interactive-bg-hover-danger': scheme === 'dark' ? 'rgba(242, 90, 90, 0.15)' : 'rgba(236, 19, 19, 0.05)',
    '--dsw-alias-label-primary': text1,
    '--dsw-alias-label-secondary': text2,
    '--dsw-alias-label-tertiary': text3,
    '--dsw-alias-label-caption': text3,
    '--dsw-alias-label-dimmed': dimmed,
    '--dsw-alias-label-primary-foreground': onAccent,
    '--dsw-alias-label-primary-inverted': onAccent,
    '--dsw-alias-label-primary-bluish': accent,
    '--dsw-alias-label-primary-dimmed': dimmed,
    '--dsw-alias-markdown-code-block': layer2,
    '--dsw-alias-markdown-code-block-banner': layer3,
    '--dsw-alias-markdown-inline-code': layer3,
    '--dsw-alias-markdown-citation': overlay,
    '--dsw-alias-markdown-tag': layer3,
    '--dsw-alias-markdown-placeholder': layer2,
    '--dsw-alias-markdown-code-segment-selected': scheme === 'dark' ? layer3 : '#ffffff',
    '--dsw-alias-markdown-code-segment-unselected': scheme === 'dark' ? base : layer2,
    '--dsw-alias-scrollbar-bg-l1': overlay,
    '--dsw-alias-scrollbar-bg-l2': deeper,
    '--dsw-alias-scrollbar-hover-l1': deeper,
    '--dsw-alias-scrollbar-hover-l2': lift(base, 0.34, scheme),
    '--dsw-alias-state-business-primary': accent,
    '--dsw-alias-state-business-tertiary': layer3,
    '--dsw-alias-toast-bg': toast,
    '--dsw-alias-tooltip-bg': toast,
    '--dsw-specific-bubble': layer2,
    '--dsw-specific-bubble-highlight': layer3,
    '--dsw-specific-input-major': layer2,
    '--dsw-specific-login-input': base,
    '--dsw-specific-selector': layer3,
    '--dsw-specific-sidebar-fill': scheme === 'dark' ? base : layer2,
    '--dsw-specific-sidebar-nav-item-active': layer3,
    '--dsw-specific-sidebar-nav-item-active-accent': overlay,
    '--dsw-specific-sidebar-nav-item-hover': lift(base, 0.06, scheme),
    '--dsw-specific-tip': layer3,
  }
  return { ...tokens, ...def.tokens }
}
