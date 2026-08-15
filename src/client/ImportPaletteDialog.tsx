/**
 * Import dialog for custom palettes: a compact form (name, scheme, base,
 * accent) plus an optional advanced JSON field for fine-tuning (`text`,
 * `surface`, explicit `tokens`). The seed colors expand into the full token
 * map server-verified on import; imported palettes list below the form with
 * per-entry delete. Rendered as a fixed overlay inside the Palette row.
 */
import { useState, type ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CustomChip } from './settings-store.ts'
import type { PremiumThemesKey } from './locales.ts'
import css from './ImportPaletteDialog.module.css'

/** Injected business faces driving the dialog (see the plugin's apply wiring). */
export interface ImportPaletteDialogInjected {
  /** Upsert one imported palette and select it; resolves with an error message on failure. */
  importPalette: (input: {
    name: string
    colorScheme: 'light' | 'dark'
    colors: { base: string; accent: string; text: string; surface: string }
    tokens: Record<string, string>
  }) => Promise<string | undefined>
  /** Remove one imported palette by theme id. */
  removePalette: (themeId: string) => Promise<void>
}

export type ImportPaletteDialogProps =
  PropsLocale<'settings.premiumThemes'> & ImportPaletteDialogInjected & {
    /** Existing imported chips (delete list). */
    chips: readonly CustomChip[]
    /** Close the dialog. */
    onClose: () => void
  }

/** Optional advanced JSON: extra seed colors plus explicit token overrides. */
interface AdvancedJson {
  text?: string
  surface?: string
  tokens?: Record<string, string>
}

/**
 * Render the import dialog.
 * @param props - locale seat, faces, chips, and the close callback.
 * @returns the dialog element tree.
 */
export function ImportPaletteDialog({ t, chips, importPalette, removePalette, onClose }: ImportPaletteDialogProps) {
  const [name, setName] = useState('')
  const [scheme, setScheme] = useState<'light' | 'dark'>('dark')
  const [base, setBase] = useState('#1a1b26')
  const [accent, setAccent] = useState('#7aa2f7')
  const [advanced, setAdvanced] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (name.trim() === '') {
      setError(t('import.nameRequired' as PremiumThemesKey))
      return
    }
    let extra: AdvancedJson = {}
    if (advanced.trim() !== '') {
      try {
        extra = JSON.parse(advanced) as AdvancedJson
        if (typeof extra !== 'object' || extra === null) throw new Error('not an object')
      } catch {
        setError(t('import.invalidJson' as PremiumThemesKey))
        return
      }
    }
    setBusy(true)
    setError(undefined)
    const failure = await importPalette({
      name: name.trim(),
      colorScheme: scheme,
      colors: {
        base,
        accent,
        text: typeof extra.text === 'string' ? extra.text : '',
        surface: typeof extra.surface === 'string' ? extra.surface : '',
      },
      tokens: typeof extra.tokens === 'object' && extra.tokens !== null ? { ...extra.tokens } : {},
    })
    setBusy(false)
    if (failure === undefined) onClose()
    else setError(failure)
  }

  const schemeButton = (value: 'light' | 'dark', labelKey: string): ReactElement => (
    <button
      key={value}
      type="button"
      className={scheme === value ? css.schemeSelected : css.schemeOption}
      aria-pressed={scheme === value}
      onClick={() => { setScheme(value) }}
    >
      {t(labelKey as PremiumThemesKey)}
    </button>
  )

  return (
    <div className={css.backdrop} onClick={onClose}>
      <div
        className={css.dialog}
        role="dialog"
        aria-label={t('import.title' as PremiumThemesKey)}
        onClick={event => { event.stopPropagation() }}
      >
        <div className={css.title}>{t('import.title' as PremiumThemesKey)}</div>

        <label className={css.field}>
          <span className={css.label}>{t('import.name' as PremiumThemesKey)}</span>
          <input className={css.input} value={name} onChange={event => { setName(event.target.value) }} />
        </label>

        <div className={css.field}>
          <span className={css.label}>{t('import.scheme' as PremiumThemesKey)}</span>
          <div className={css.schemeRow}>
            {schemeButton('dark', 'import.dark')}
            {schemeButton('light', 'import.light')}
          </div>
        </div>

        <div className={css.field}>
          <span className={css.label}>{t('import.base' as PremiumThemesKey)}</span>
          <div className={css.colorRow}>
            <input type="color" className={css.colorInput} value={base} onChange={event => { setBase(event.target.value) }} />
            <input className={css.input} value={base} onChange={event => { setBase(event.target.value) }} />
          </div>
        </div>

        <div className={css.field}>
          <span className={css.label}>{t('import.accent' as PremiumThemesKey)}</span>
          <div className={css.colorRow}>
            <input type="color" className={css.colorInput} value={accent} onChange={event => { setAccent(event.target.value) }} />
            <input className={css.input} value={accent} onChange={event => { setAccent(event.target.value) }} />
          </div>
        </div>

        <label className={css.field}>
          <span className={css.label}>{t('import.advanced' as PremiumThemesKey)}</span>
          <textarea className={css.textarea} rows={3} value={advanced} onChange={event => { setAdvanced(event.target.value) }} />
        </label>

        {error !== undefined ? <div className={css.error}>{error}</div> : null}

        <div className={css.actions}>
          <button type="button" className={css.cancelButton} onClick={onClose}>{t('import.cancel' as PremiumThemesKey)}</button>
          <button type="button" className={css.submitButton} disabled={busy} onClick={() => { void submit() }}>
            {t('import.submit' as PremiumThemesKey)}
          </button>
        </div>

        <div className={css.existingTitle}>{t('import.existing' as PremiumThemesKey)}</div>
        {chips.length === 0
          ? <div className={css.none}>{t('import.none' as PremiumThemesKey)}</div>
          : chips.map(chip => (
            <div key={chip.id} className={css.existingRow}>
              <span
                className={css.existingDot}
                style={{ background: `linear-gradient(135deg, ${chip.swatchBackground} 50%, ${chip.swatchAccent} 50%)` }}
              />
              <span className={css.existingName}>{chip.label}</span>
              <button
                type="button"
                className={css.deleteButton}
                onClick={() => { void removePalette(chip.id) }}
              >
                {t('import.delete' as PremiumThemesKey)}
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}
