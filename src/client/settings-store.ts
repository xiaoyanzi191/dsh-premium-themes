/**
 * Palette row slot store: a mirror of this plugin's durable selection plus
 * the imported custom chips. The plugin's apply-world writer is the only
 * source; the row component reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_SELECTION, type PaletteSelection } from '../theme-settings.ts'

/** One imported palette chip (built-in chips render statically from `palettes.ts`). */
export interface CustomChip {
  /** Theme id (`custom-<raw>`). */
  id: string
  /** User-authored display name. */
  label: string
  /** Signature accent for the swatch dot. */
  swatchAccent: string
  /** Signature background for the swatch dot. */
  swatchBackground: string
}

/** Store state mirrored from the durable selection. */
export interface PaletteRowState {
  /** Selected palette id (`off` when the base preference governs). */
  palette: PaletteSelection
  /** Imported custom chips in import order (insertion order of the defs dict). */
  chips: readonly CustomChip[]
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type PaletteRowActions = {
  sync: (draft: PaletteRowState, palette: PaletteSelection, chips: readonly CustomChip[], revision: number) => void
}

/**
 * Declares the Palette row state and write surface.
 * @returns the store handle.
 */
export function createPaletteRowStore(): EngineStoreHandle<PaletteRowState, PaletteRowActions> {
  return defineStore({
    init: (): PaletteRowState => ({ palette: DEFAULT_SELECTION, chips: [], revision: -1 }),
    actions: {
      sync: (d, palette: PaletteSelection, chips: readonly CustomChip[], revision: number) => {
        if (revision <= d.revision) return
        d.palette = palette
        d.chips = chips
        d.revision = revision
      },
    },
  })
}
