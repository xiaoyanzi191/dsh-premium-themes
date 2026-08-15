// @vitest-environment jsdom
/** PaletteRow behavior: 默认 chip plus one chip per premium palette plus
 * imported chips and the import dialog; selection follows the store mirror,
 * clicks drive the injected faces. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { PaletteRow } from '../src/client/PaletteRow.tsx'
import type { PaletteRowComponentProps } from '../src/client/PaletteRow.tsx'
import { createPaletteRowStore, type CustomChip } from '../src/client/settings-store.ts'
import { PREMIUM_PALETTES } from '../src/palettes.ts'
import { OFF, type PaletteSelection } from '../src/theme-settings.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'palette.title': 'Palette',
  'palette.off': 'Default',
  'palette.tokyoNight': 'Tokyo Night',
  'palette.nord': 'Nord',
  'palette.catppuccinMocha': 'Mocha',
  'palette.everforest': 'Everforest',
  'palette.rosePine': 'Rosé Pine',
  'palette.ayuMirage': 'Ayu Mirage',
  'palette.catppuccinLatte': 'Latte',
  'palette.paperGold': 'Paper Gold',
  'palette.import': 'Import palette',
  'import.title': 'Import custom palette',
  'import.name': 'Name',
  'import.scheme': 'Scheme',
  'import.light': 'Light',
  'import.dark': 'Dark',
  'import.base': 'Background',
  'import.accent': 'Accent',
  'import.advanced': 'Advanced (optional JSON: text / surface colors, token overrides)',
  'import.submit': 'Import',
  'import.cancel': 'Cancel',
  'import.existing': 'Imported palettes',
  'import.delete': 'Delete',
  'import.none': 'No imported palettes yet',
  'import.invalidJson': 'Advanced JSON failed to parse',
  'import.nameRequired': 'Enter a name',
}

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

function mount(palette: PaletteSelection = OFF, chips: readonly CustomChip[] = []) {
  const store = createPaletteRowStore().create()
  store.actions.sync(palette, chips, 0)
  const setPalette = vi.fn()
  const importPalette = vi.fn(() => Promise.resolve(undefined))
  const removePalette = vi.fn(() => Promise.resolve())
  const props: PaletteRowComponentProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setPalette,
    importPalette,
    removePalette,
  }
  render(<PaletteRow {...props} />)
  return { store, setPalette, importPalette, removePalette }
}

const pressed = (name: RegExp): string | null =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('PaletteRow', () => {
  it('renders the title, the 默认 chip, one chip per premium palette, and the import chip', () => {
    mount()
    expect(screen.getByText('Palette')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(PREMIUM_PALETTES.length + 2)
    expect(pressed(/Default/)).toBe('true')
    expect(screen.getByRole('button', { name: /Import palette/ })).toBeDefined()
    for (const palette of PREMIUM_PALETTES) {
      const chip = screen.getByRole('button', { name: new RegExp(COPY[palette.labelKey]) })
      expect(chip.querySelector('[class*="swatchDot"]')).not.toBeNull()
      expect(chip.getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('click drives setPalette; selection follows the store mirror, not the click echo', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: /Tokyo Night/ }))
    expect(b.setPalette).toHaveBeenCalledWith('tokyo-night')
    // No store write yet: selection is unchanged.
    expect(pressed(/Tokyo Night/)).toBe('false')
    act(() => { b.store.actions.sync('tokyo-night', [], 1) })
    expect(pressed(/Tokyo Night/)).toBe('true')
    expect(pressed(/Default/)).toBe('false')
  })

  it('routes the 默认 chip through setPalette with off', () => {
    const b = mount('paper-gold')
    expect(pressed(/Paper Gold/)).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Default/ }))
    expect(b.setPalette).toHaveBeenCalledWith(OFF)
  })

  it('renders imported chips from the store and selects through them', () => {
    const chip: CustomChip = { id: 'custom-mint', label: '薄荷', swatchAccent: '#2f9e6e', swatchBackground: '#eef7f2' }
    const b = mount('custom-mint', [chip])
    expect(pressed(/薄荷/)).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Tokyo Night/ }))
    expect(b.setPalette).toHaveBeenCalledWith('tokyo-night')
  })

  it('opens the import dialog from the import chip and submits through the face', async () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: /Import palette/ }))
    const dialog = screen.getByRole('dialog', { name: /Import custom palette/ })
    expect(dialog).toBeDefined()
    expect(screen.getByText('No imported palettes yet')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '我的薄荷' } })
    fireEvent.click(screen.getByRole('button', { name: /Import$/ }))
    await vi.waitFor(() => { expect(b.importPalette).toHaveBeenCalledOnce() })
    const input = b.importPalette.mock.calls[0]![0] as { name: string; colorScheme: string }
    expect(input.name).toBe('我的薄荷')
    expect(input.colorScheme).toBe('dark')
  })

  it('lists imported palettes in the dialog and deletes through the face', async () => {
    const chip: CustomChip = { id: 'custom-mint', label: '薄荷', swatchAccent: '#2f9e6e', swatchBackground: '#eef7f2' }
    const b = mount(OFF, [chip])
    fireEvent.click(screen.getByRole('button', { name: /Import palette/ }))
    const dialog = screen.getByRole('dialog', { name: /Import custom palette/ })
    expect(within(dialog).getByText('薄荷')).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }))
    await vi.waitFor(() => { expect(b.removePalette).toHaveBeenCalledWith('custom-mint') })
  })

  it('requires a name before importing', async () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: /Import palette/ }))
    fireEvent.click(screen.getByRole('button', { name: /Import$/ }))
    expect(screen.getByText('Enter a name')).toBeDefined()
    expect(b.importPalette).not.toHaveBeenCalled()
  })
})
