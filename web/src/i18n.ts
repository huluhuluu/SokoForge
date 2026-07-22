import type { Language } from './types'

export const copy = {
  en: {
    brand: 'SokoForge', subtitle: 'Push-box level workbench',
    editor: 'Editor', solve: 'Solve', forge: 'Forge', library: 'Library',
    playMode: 'Play', editMode: 'Edit', published: 'Published levels', myLevels: 'My levels', restartLevel: 'Restart level', completed: 'Level complete',
    newLevel: 'New level', import: 'Import', export: 'Export', reset: 'Reset',
    board: 'Board', tools: 'Tools', stats: 'Stats', solution: 'Solution',
    quick: 'Quick solve', optimal: 'Prove optimal', play: 'Play solution', stop: 'Stop',
    generate: 'Generate batch', candidateCount: 'Candidates', width: 'Width', height: 'Height', boxes: 'Boxes', difficulty: 'Difficulty mode',
    composite: 'Composite', long_solution: 'Long solution', deep_trap: 'Deep traps', dependency: 'Box dependency',
    topResults: 'Top results', noResults: 'No generated levels yet', importPack: 'Drop a JSON pack or choose a file',
    chooseFile: 'Choose JSON', save: 'Save locally', saved: 'Saved locally',
    wall: 'Wall', floor: 'Floor', goal: 'Goal', box: 'Box', player: 'Player', eraser: 'Erase',
    pushes: 'pushes', moves: 'moves', nodes: 'nodes', elapsed: 'ms',
    optimalProven: 'Optimality proven', feasibleOnly: 'Feasible solution', timedOut: 'Timed out', invalid: 'Invalid level',
    helper: 'Create, solve, and evolve compact Sokoban puzzles in your browser.',
    constraints: '5–12 standard · up to 20 advanced',
    language: 'Language', keyboard: 'Arrow keys / WASD move the player',
    emptyLibrary: 'Save a level or import a generated pack to see it here.',
    generated: 'Generated', loaded: 'Loaded',
  },
  zh: {
    brand: '推箱工坊', subtitle: '推箱子关卡工作台',
    editor: '编辑', solve: '求解', forge: '生成', library: '关卡库',
    playMode: '游玩', editMode: '编辑', published: '发布关卡', myLevels: '我的关卡', restartLevel: '重开关卡', completed: '关卡完成',
    newLevel: '新关卡', import: '导入', export: '导出', reset: '重置',
    board: '地图', tools: '工具', stats: '统计', solution: '解法',
    quick: '快速求解', optimal: '证明最优', play: '播放解法', stop: '停止',
    generate: '批量生成', candidateCount: '候选数', width: '宽', height: '高', boxes: '箱子', difficulty: '难度模式',
    composite: '综合难度', long_solution: '长解', deep_trap: '深层陷阱', dependency: '箱子依赖',
    topResults: '最高难度', noResults: '还没有生成关卡', importPack: '拖入 JSON 关卡包，或选择文件',
    chooseFile: '选择 JSON', save: '保存到本地', saved: '已保存',
    wall: '墙', floor: '地板', goal: '目标', box: '箱子', player: '玩家', eraser: '擦除',
    pushes: '推动', moves: '移动', nodes: '状态', elapsed: '毫秒',
    optimalProven: '已证明最优', feasibleOnly: '已找到可行解', timedOut: '求解超时', invalid: '地图无效',
    helper: '在浏览器中创建、求解和进化推箱子关卡。',
    constraints: '标准 5–12 格 · 高级最多 20 格',
    language: '语言', keyboard: '方向键 / WASD 移动玩家',
    emptyLibrary: '保存关卡或导入生成包后，这里会显示关卡。',
    generated: '生成', loaded: '载入',
  },
} as const

export type CopyKey = keyof typeof copy.en
export function getInitialLanguage(): Language {
  const saved = localStorage.getItem('sokoforge-language')
  if (saved === 'en' || saved === 'zh') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
