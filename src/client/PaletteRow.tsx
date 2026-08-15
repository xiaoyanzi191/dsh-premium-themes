/**
 * Palette preference row registered into the General section item slot below
 * ui-theme's Appearance row: title + one chip per premium palette plus a 默认
 * chip that restores the remembered base preference, imported custom chips
 * (rendered from the store), and a 导入配色 chip opening the import dialog.
 * Registered by this package — the feature owns its own settings surface.
 * Selection follows the plugin's persisted setting, never the resolved active
 * theme.
 */
import clsx from 'clsx'
import { useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { PREMIUM_PALETTES } from '../palettes.ts'
import { OFF, type PaletteSelection } from '../theme-settings.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createPaletteRowStore } from './settings-store.ts'
import { ImportPaletteDialog, type ImportPaletteDialogInjected } from './ImportPaletteDialog.tsx'
import css from './PaletteRow.module.css'

/** Injected business faces: the selection write plus the import lifecycle. */
export interface PaletteRowInjected extends ImportPaletteDialogInjected {
  /** Select a palette id, or `off` to restore the remembered base preference. */
  setPalette: (id: PaletteSelection) => void
}

/** Full component props: runtime share + store share + locale seat + injected faces. */
export type PaletteRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createPaletteRowStore>>
  & PropsLocale<'settings.premiumThemes'> & PaletteRowInjected

/** Neutral two-tone for the 默认 chip's swatch dot. */
const OFF_SWATCH = 'linear-gradient(135deg, #f5f5f5 50%, #9e9e9e 50%)'

/**
 * Render the Palette row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function PaletteRow({ t, setPalette, importPalette, removePalette, useStore }: PaletteRowComponentProps) {
  const palette = useStore(s => s.palette)
  const chips = useStore(s => s.chips)
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('palette.title')}</div>
      <div className={css.paletteRow}>
        <button
          type="button"
          className={clsx(css.paletteChip, palette === OFF && css.selected)}
          aria-pressed={palette === OFF}
          onClick={() => { setPalette(OFF) }}
        >
          <span className={css.swatchDot} style={{ background: OFF_SWATCH }} />
          {t('palette.off')}
        </button>
        {PREMIUM_PALETTES.map(entry => (
          <button
            key={entry.id}
            type="button"
            className={clsx(css.paletteChip, palette === entry.id && css.selected)}
            aria-pressed={palette === entry.id}
            onClick={() => { setPalette(entry.id) }}
          >
            <span
              className={css.swatchDot}
              style={{
                background: `linear-gradient(135deg, ${entry.swatchBackground} 50%, ${entry.swatchAccent} 50%)`,
              }}
            />
            {t(entry.labelKey)}
          </button>
        ))}
        {chips.map(chip => (
          <button
            key={chip.id}
            type="button"
            className={clsx(css.paletteChip, palette === chip.id && css.selected)}
            aria-pressed={palette === chip.id}
            onClick={() => { setPalette(chip.id as PaletteSelection) }}
          >
            <span
              className={css.swatchDot}
              style={{
                background: `linear-gradient(135deg, ${chip.swatchBackground} 50%, ${chip.swatchAccent} 50%)`,
              }}
            />
            {chip.label}
          </button>
        ))}
        <button type="button" className={css.importChip} onClick={() => { setDialogOpen(true) }}>
          {t('palette.import')}
        </button>
      </div>
      {dialogOpen
        ? (
          <ImportPaletteDialog
            t={t}
            chips={chips}
            importPalette={importPalette}
            removePalette={removePalette}
            onClose={() => { setDialogOpen(false) }}
          />
        )
        : null}
    </div>
  )
}
