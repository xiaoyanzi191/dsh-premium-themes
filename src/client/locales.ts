/** `settings.premiumThemes` namespace dictionaries (the Palette row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'palette.title': '配色',
  'palette.off': '默认',
  'palette.tokyoNight': '东京夜',
  'palette.nord': '北境',
  'palette.catppuccinMocha': '摩卡',
  'palette.everforest': '森林',
  'palette.rosePine': '玫瑰松',
  'palette.ayuMirage': '鎏金',
  'palette.catppuccinLatte': '拿铁',
  'palette.paperGold': '羊皮纸金',
  'palette.import': '导入配色',
  'import.title': '导入自定义配色',
  'import.name': '名称',
  'import.scheme': '明暗',
  'import.light': '浅色',
  'import.dark': '深色',
  'import.base': '底色',
  'import.accent': '强调色',
  'import.advanced': '高级(可选 JSON:text / surface 颜色,tokens 覆盖)',
  'import.submit': '导入',
  'import.cancel': '取消',
  'import.existing': '已导入的配色',
  'import.delete': '删除',
  'import.none': '还没有导入的配色',
  'import.invalidJson': '高级 JSON 解析失败',
  'import.nameRequired': '请输入名称',
} satisfies Record<string, string>

/** The settings.premiumThemes namespace key union. */
export type PremiumThemesKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
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
} satisfies Record<PremiumThemesKey, string>
