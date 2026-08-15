// @vitest-environment jsdom
/** Host index injection and the resulting pre-plugin palette paint. */
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { injectPaletteBoot } from '../src/boot.ts'
import type { CustomPaletteDef, PaletteSelection } from '../src/theme-settings.ts'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function executeBootstrap(
  selection: PaletteSelection,
  html = '<html><body></body></html>',
  customs: Readonly<Record<string, CustomPaletteDef>> = {},
): string {
  const injected = injectPaletteBoot(html, selection, customs)
  const script = /<script>([\s\S]*?)<\/script>/.exec(injected)?.[1]
  if (script === undefined) throw new Error('palette bootstrap script missing')
  runInNewContext(script, { document })
  return injected
}

afterEach(() => {
  document.documentElement.style.removeProperty('color-scheme')
  document.body.removeAttribute(DARK_ATTRIBUTE)
})

describe('premium-themes boot index transform', () => {
  it('pins dark palettes to the dark base scheme', () => {
    executeBootstrap('tokyo-night')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it('pins light palettes to the light base scheme, clearing stale dark state', () => {
    document.body.setAttribute(DARK_ATTRIBUTE, '')
    document.documentElement.style.colorScheme = 'dark'
    executeBootstrap('paper-gold')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
  })

  it('injects after ui-theme\'s body-start bootstrap so the palette wins the paint', () => {
    const html = '<html><head></head><body><script>(() => { document.body.setAttribute("data-ds-dark-theme", "") })()</script><div id="root"></div></body></html>'
    const injected = injectPaletteBoot(html, 'catppuccin-latte')
    expect(injected.indexOf('premium-themes: palette')).toBeGreaterThan(injected.indexOf('<div id="root">'))
    expect(injected.indexOf('<script>')).toBeLessThan(injected.indexOf('premium-themes: palette'))
  })

  it('leaves the HTML untouched when no palette is selected', () => {
    const html = '<html><body><div id="root"></div></body></html>'
    expect(injectPaletteBoot(html, 'off')).toBe(html)
  })

  it('appends the script to a body-less fragment', () => {
    const html = injectPaletteBoot('<main>loading</main>', 'nord')
    expect(html.startsWith('<main>loading</main><script>')).toBe(true)
  })

  it('resolves imported palettes to their stored base scheme', () => {
    const customs = {
      mint: {
        id: 'mint', name: '薄荷', colorScheme: 'light' as const,
        colors: { base: '#eef7f2', accent: '#2f9e6e', text: '', surface: '' }, tokens: {},
      },
      ink: {
        id: 'ink', name: '墨黑', colorScheme: 'dark' as const,
        colors: { base: '#101014', accent: '#ffcc66', text: '', surface: '' }, tokens: {},
      },
    }
    executeBootstrap('custom-mint', '<html><body></body></html>', customs)
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)

    executeBootstrap('custom-ink', '<html><body></body></html>', customs)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it('injects nothing for an imported id without a stored def', () => {
    const html = '<html><body></body></html>'
    expect(injectPaletteBoot(html, 'custom-ghost', {})).toBe(html)
  })
})
