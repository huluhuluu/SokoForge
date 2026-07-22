import type { Language } from './types'

export const copy = {
  en: {
    brand: 'SokoForge', subtitle: 'Push-box level workbench',
    editor: 'Editor', solve: 'Solve', forge: 'Forge', library: 'Library',
    playMode: 'Play', editMode: 'Edit', published: 'Published levels', myLevels: 'My levels', restartLevel: 'Restart', completed: 'Level complete',
    level: 'Level', untitled: 'Untitled level', starter: 'Starter', easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', optimalPushes: 'Optimal pushes', playedMoves: 'Moves', playedPushes: 'Pushes', previousLevel: 'Previous level', nextLevel: 'Next level', ready: 'Ready', solverStatus: 'Solver status',
    newLevel: 'New level', import: 'Import', export: 'Export', reset: 'Reset',
    board: 'Board', tools: 'Tools', stats: 'Stats', solution: 'Solution',
    quick: 'Fast solution', optimal: 'Shortest solution', play: 'Play solution', pause: 'Pause solution', stop: 'Stop',
    undoMove: 'Undo move', previousStep: 'Previous step', nextStep: 'Next step', speed: 'Speed', solutionStep: 'Solution step', movePlayer: 'Move player', howToPlay: 'How to play',
    movementHelp: 'Move with the arrow keys, WASD, or the on-screen direction pad.', goalHelp: 'Push every crate onto a goal. Crates can be pushed but cannot be pulled.', recoveryHelp: 'Use Undo move for one step, or Restart level to restore the initial board.', replayHelp: 'After solving, pause the replay or inspect the solution one step at a time.',
    generate: 'Generate batch', candidateCount: 'Candidates', width: 'Width', height: 'Height', boxes: 'Boxes', difficulty: 'Difficulty mode',
    composite: 'Composite', long_solution: 'Long solution', deep_trap: 'Deep traps', dependency: 'Box dependency',
    topResults: 'Top results', noResults: 'No generated levels yet', importPack: 'Import JSON / XSB files',
    exportPack: 'Download pack', saveToFolder: 'Save to folder', chooseFolder: 'Choose level folder', packSaved: 'Level pack saved', folderUnavailable: 'This browser cannot access that folder.', invalidFiles: '{count} file(s) could not be imported.',
    chooseFile: 'Choose JSON', save: 'Save locally', saved: 'Saved locally',
    wall: 'Wall', floor: 'Floor', goal: 'Goal', box: 'Box', player: 'Player', eraser: 'Erase',
    pushes: 'pushes', moves: 'moves', nodes: 'nodes', elapsed: 'ms',
    optimalProven: 'Shortest pushes verified', feasibleOnly: 'Solution found', timedOut: 'Timed out', invalid: 'Invalid level',
    helper: 'Create, solve, and evolve compact Sokoban puzzles in your browser.',
    constraints: '5–12 standard · up to 20 advanced',
    language: 'Language', keyboard: 'Arrow keys / WASD move the player',
    emptyLibrary: 'Save a level or import a generated pack to see it here.',
    generated: 'Generated', loaded: 'Loaded',
  },
  zh: {
    brand: '推箱工坊', subtitle: '推箱子关卡工作台',
    editor: '编辑', solve: '求解', forge: '生成', library: '关卡库',
    playMode: '游玩', editMode: '编辑', published: '发布关卡', myLevels: '我的关卡', restartLevel: '重新开始', completed: '关卡完成',
    level: '关卡', untitled: '未命名关卡', starter: '入门', easy: '简单', medium: '中等', hard: '困难', expert: '专家', optimalPushes: '最少推动', playedMoves: '移动', playedPushes: '推动', previousLevel: '上一关', nextLevel: '下一关', ready: '就绪', solverStatus: '求解状态',
    newLevel: '新关卡', import: '导入', export: '导出', reset: '重置',
    board: '地图', tools: '工具', stats: '统计', solution: '解法',
    quick: '快速解', optimal: '最短解', play: '播放解法', pause: '暂停解法', stop: '停止',
    undoMove: '回退一步', previousStep: '上一步解法', nextStep: '下一步解法', speed: '倍速', solutionStep: '解法进度', movePlayer: '移动玩家', howToPlay: '玩法说明',
    movementHelp: '使用方向键、WASD 或屏幕方向键移动玩家。', goalHelp: '把所有箱子推到目标点；箱子只能推，不能拉。', recoveryHelp: '走错时可回退一步，或重新开始恢复初始地图。', replayHelp: '求解后可以暂停回放，也可以前后逐步查看解法。',
    generate: '批量生成', candidateCount: '候选数', width: '宽', height: '高', boxes: '箱子', difficulty: '难度模式',
    composite: '综合难度', long_solution: '长解', deep_trap: '深层陷阱', dependency: '箱子依赖',
    topResults: '最高难度', noResults: '还没有生成关卡', importPack: '导入 JSON / XSB 文件',
    exportPack: '下载关卡包', saveToFolder: '保存到目录', chooseFolder: '选择关卡目录', packSaved: '关卡包已保存', folderUnavailable: '当前浏览器无法访问该目录。', invalidFiles: '有 {count} 个文件无法导入。',
    chooseFile: '选择 JSON', save: '保存到本地', saved: '已保存',
    wall: '墙', floor: '地板', goal: '目标', box: '箱子', player: '玩家', eraser: '擦除',
    pushes: '推动', moves: '移动', nodes: '状态', elapsed: '毫秒',
    optimalProven: '已验证最少推动', feasibleOnly: '已找到解法', timedOut: '求解超时', invalid: '地图无效',
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
