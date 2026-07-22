import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, BrainCircuit, Check,
  ChevronLeft, ChevronRight, Download, Eraser, FileDown, FileUp, Gamepad2,
  CircleHelp, FolderOpen, FolderSync, Grid3X3, Languages, Pause, Pencil, Play, Redo2, RotateCcw, Save, Sparkles,
  PanelLeftClose, PanelLeftOpen, Square, Target, Undo2, UserRound, WandSparkles,
} from 'lucide-react'
import { copy, getInitialLanguage } from './i18n'
import { loadRememberedDirectory, rememberDirectory, requestDirectory, scanDirectory, supportsLevelDirectory, writePack, type LevelDirectoryHandle } from './levelDirectory'
import { applyTool, boardStatus, move, parseLevel, resizeLevel, SAMPLE, toXsb, type ParsedLevel } from './level'
import { createLevelPack, downloadLevelPack, isPackLevel, mergeLevelLists, packFileName, parseImportedFile } from './packFiles'
import type { DifficultyMode, Language, PackLevel, PublishedLevel, PublishedLevelBundle, PublishedLevelIndex, SolveMode, SolveResult, Tool } from './types'

const toolIcons = { wall: Square, floor: Grid3X3, goal: Target, box: Box, player: UserRound, eraser: Eraser }
const directionByKey: Record<string, string> = {
  ArrowUp: 'U', w: 'U', W: 'U', ArrowRight: 'R', d: 'R', D: 'R',
  ArrowDown: 'D', s: 'D', S: 'D', ArrowLeft: 'L', a: 'L', A: 'L',
}
type PlayStats = { moves: number; pushes: number }
type PlaySnapshot = { level: ParsedLevel; stats: PlayStats }

function loadStoredLibrary(): PackLevel[] {
  try {
    const stored = JSON.parse(localStorage.getItem('sokoforge-library') ?? '[]')
    return Array.isArray(stored) ? stored.filter(isPackLevel) : []
  } catch {
    return []
  }
}

export default function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)
  const t = copy[language]
  const [level, setLevel] = useState<ParsedLevel>(() => parseLevel(SAMPLE))
  const [initialLevel, setInitialLevel] = useState<ParsedLevel>(() => parseLevel(SAMPLE))
  const [workMode, setWorkMode] = useState<'play' | 'edit'>('play')
  const [currentLevelId, setCurrentLevelId] = useState<string | null>(null)
  const [playStats, setPlayStats] = useState({ moves: 0, pushes: 0 })
  const [playHistory, setPlayHistory] = useState<PlaySnapshot[]>([])
  const [history, setHistory] = useState<ParsedLevel[]>([])
  const [future, setFuture] = useState<ParsedLevel[]>([])
  const [tool, setTool] = useState<Tool>('wall')
  const [activeTab, setActiveTab] = useState<'solve' | 'forge' | 'library'>('solve')
  const [isLevelSidebarCollapsed, setIsLevelSidebarCollapsed] = useState(false)
  const [solveMode, setSolveMode] = useState<SolveMode>('quick')
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null)
  const [isSolving, setIsSolving] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [solutionStart, setSolutionStart] = useState<ParsedLevel | null>(() => parseLevel(SAMPLE))
  const [playbackIndex, setPlaybackIndex] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [batchCount, setBatchCount] = useState(100)
  const [boxCount, setBoxCount] = useState(3)
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>('composite')
  const [results, setResults] = useState<PackLevel[]>([])
  const [generationProgress, setGenerationProgress] = useState(0)
  const [library, setLibrary] = useState<PackLevel[]>(loadStoredLibrary)
  const [published, setPublished] = useState<PublishedLevel[]>([])
  const [directory, setDirectory] = useState<LevelDirectoryHandle | null>(null)
  const [directoryBusy, setDirectoryBusy] = useState(false)
  const worker = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const solveRun = useRef(0)
  const pending = useRef(new Map<number, (reply: { result?: SolveResult; xsb?: string }) => void>())
  const fileInput = useRef<HTMLInputElement>(null)

  const xsb = useMemo(() => toXsb(level), [level])
  const state = boardStatus(level)
  const publishedItems = useMemo<PackLevel[]>(() => published.map((item) => ({
    id: item.id,
    name: item.title[language],
    xsb: item.xsb,
    difficulty: { score: item.optimalPushes, pushes: item.optimalPushes, moves: 0, dependency: 0, trap: 0, away_pushes: 0, box_switches: 0 },
  })), [published, language])
  const currentPublishedIndex = published.findIndex((item) => item.id === currentLevelId)
  const currentPublished = currentPublishedIndex >= 0 ? published[currentPublishedIndex] : null
  const currentTitle = currentPublished?.title[language] ?? t.untitled

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    try { localStorage.setItem('sokoforge-language', language) } catch { /* Storage may be unavailable. */ }
  }, [language])

  useEffect(() => {
    try { localStorage.setItem('sokoforge-library', JSON.stringify(library)) } catch { /* Storage may be full or unavailable. */ }
  }, [library])

  useEffect(() => {
    fetch('/levels/index.json').then((response) => response.json()).then(async (index: PublishedLevelIndex) => {
      if (index.schemaVersion !== 1) return
      const direct = await Promise.all(index.levels.filter((meta) => meta.file).map(async (meta) => ({
        ...meta,
        xsb: await fetch(meta.file!).then((response) => response.text()),
      })))
      const bundles = await Promise.all((index.packs ?? []).map(async (path) => {
        const bundle = await fetch(path).then((response) => response.json()) as PublishedLevelBundle
        return bundle.schemaVersion === 1 && bundle.kind === 'sokoforge-published-pack' ? bundle.levels : []
      }))
      const loaded = [...direct, ...bundles.flat()]
      setPublished(loaded)
      if (loaded[0]) {
        const first = parseLevel(loaded[0].xsb)
        setLevel(first)
        setInitialLevel(first)
        setSolutionStart(first)
        setCurrentLevelId(loaded[0].id)
      }
    }).catch(() => setPublished([]))
  }, [])

  useEffect(() => {
    loadRememberedDirectory().then(async (handle) => {
      if (!handle) return
      setDirectory(handle)
      if (await handle.queryPermission({ mode: 'read' }) === 'granted') await importDirectory(handle, false)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    worker.current = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    worker.current.onmessage = (event: MessageEvent<{ id: number; result?: SolveResult; xsb?: string }>) => pending.current.get(event.data.id)?.(event.data)
    return () => worker.current?.terminate()
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (workMode !== 'play' || event.metaKey || event.ctrlKey) return
      if ((event.key === 'z' || event.key === 'Z' || event.key === 'Backspace') && (playHistory.length || playbackIndex > 0) && !isPlaying) {
        event.preventDefault()
        undoCurrentMove()
        return
      }
      const direction = directionByKey[event.key]
      if (!direction || isPlaying) return
      if (move(level, direction)) {
        event.preventDefault()
        playMove(direction)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPlaying, level, playbackIndex, playHistory, solveResult, workMode])

  useEffect(() => {
    if (!isPlaying || !solveResult?.moves || !solutionStart) return
    if (playbackIndex >= solveResult.moves.length) {
      setIsPlaying(false)
      return
    }
    const timeout = window.setTimeout(advanceSolutionPlayback, 420 / playbackSpeed)
    return () => window.clearTimeout(timeout)
  }, [isPlaying, level, playStats, playbackIndex, playbackSpeed, solutionStart, solveResult])

  function commit(next: ParsedLevel) {
    solveRun.current += 1
    setIsSolving(false)
    setHistory((items) => [...items.slice(-99), level])
    setFuture([])
    setLevel(next)
    setSolveResult(null)
    setIsPlaying(false)
    setSolutionStart(null)
    setPlaybackIndex(0)
  }

  function solve(targetXsb = xsb, mode = solveMode): Promise<SolveResult> {
    return new Promise((resolve) => {
      if (!worker.current) {
        resolve({ status: 'invalid', moves: '', pushes: 0, explored_nodes: 0, elapsed_ms: 0, optimal: false, message: 'Solver worker is not ready.' })
        return
      }
      const id = ++requestId.current
      pending.current.set(id, (reply) => {
        pending.current.delete(id)
        resolve(reply.result ?? { status: 'invalid', moves: '', pushes: 0, explored_nodes: 0, elapsed_ms: 0, optimal: false, message: 'Missing solver response' })
      })
      worker.current.postMessage({ id, type: 'solve', xsb: targetXsb, mode, timeLimitMs: mode === 'optimal' ? 30_000 : 5_000 })
    })
  }

  function generateCandidate(seed: number): Promise<string> {
    return new Promise((resolve) => {
      if (!worker.current) {
        resolve('')
        return
      }
      const id = ++requestId.current
      pending.current.set(id, (reply) => { pending.current.delete(id); resolve(reply.xsb ?? '') })
      worker.current.postMessage({ id, type: 'generate', width: level.width, height: level.height, boxes: Math.max(1, Math.min(8, boxCount)), seed })
    })
  }

  async function onSolve() {
    const run = ++solveRun.current
    setIsSolving(true)
    setIsPlaying(false)
    const start = initialLevel
    setLevel(start)
    setPlayStats({ moves: 0, pushes: 0 })
    setPlayHistory([])
    setSolutionStart(start)
    setPlaybackIndex(0)
    setSolveResult(null)
    const result = await solve(toXsb(start))
    if (run === solveRun.current) {
      setSolveResult(result)
      setIsSolving(false)
    }
  }

  function replaySolutionTo(index: number) {
    if (!solveResult?.moves || !solutionStart) return
    const safeIndex = Math.max(0, Math.min(solveResult.moves.length, index))
    let replayed = solutionStart
    let stats: PlayStats = { moves: 0, pushes: 0 }
    for (const direction of solveResult.moves.slice(0, safeIndex)) {
      const next = move(replayed, direction)
      if (!next) break
      const pushed = next.boxes.some((box, boxIndex) => box !== replayed.boxes[boxIndex])
      replayed = next
      stats = { moves: stats.moves + 1, pushes: stats.pushes + Number(pushed) }
    }
    setLevel(replayed)
    setPlayStats(stats)
    setPlaybackIndex(safeIndex)
    setPlayHistory([])
  }

  function advanceSolutionPlayback() {
    if (!solveResult?.moves || playbackIndex >= solveResult.moves.length) return
    const next = move(level, solveResult.moves[playbackIndex])
    if (!next) {
      setIsPlaying(false)
      return
    }
    const pushed = next.boxes.some((box, boxIndex) => box !== level.boxes[boxIndex])
    setLevel(next)
    setPlayStats((stats) => ({ moves: stats.moves + 1, pushes: stats.pushes + Number(pushed) }))
    setPlaybackIndex((index) => index + 1)
    setPlayHistory([])
  }

  function toggleSolutionPlayback() {
    if (!solveResult?.moves || !solutionStart) return
    if (isPlaying) {
      setIsPlaying(false)
      return
    }
    replaySolutionTo(playbackIndex >= solveResult.moves.length ? 0 : playbackIndex)
    setIsPlaying(true)
  }

  function stepSolution(delta: number) {
    setIsPlaying(false)
    replaySolutionTo(playbackIndex + delta)
  }

  function paint(index: number) { commit(applyTool(level, index, tool)) }

  function playMove(direction: string) {
    if (isPlaying) return
    const next = move(level, direction)
    if (!next) return
    const pushed = next.boxes.some((box, index) => box !== level.boxes[index])
    setPlayHistory((items) => [...items.slice(-199), { level, stats: playStats }])
    setLevel(next)
    setPlayStats((stats) => ({ moves: stats.moves + 1, pushes: stats.pushes + Number(pushed) }))
    setPlaybackIndex(0)
  }

  function undoCurrentMove() {
    if (isPlaying) return
    if (playbackIndex > 0 && solveResult?.moves) {
      stepSolution(-1)
      return
    }
    const previous = playHistory.at(-1)
    if (!previous) return
    setLevel(previous.level)
    setPlayStats(previous.stats)
    setPlayHistory((items) => items.slice(0, -1))
    setPlaybackIndex(0)
  }

  function restartLevel() {
    solveRun.current += 1
    setIsSolving(false)
    setIsPlaying(false)
    setLevel(initialLevel)
    setPlayStats({ moves: 0, pushes: 0 })
    setPlayHistory([])
    setPlaybackIndex(0)
    if (!solutionStart || toXsb(solutionStart) !== toXsb(initialLevel)) {
      setSolveResult(null)
      setSolutionStart(initialLevel)
    }
  }

  function switchWorkMode(mode: 'play' | 'edit') {
    solveRun.current += 1
    setIsSolving(false)
    if (mode === 'play') setInitialLevel(level)
    else setCurrentLevelId(null)
    setWorkMode(mode)
    setSolveResult(null)
    setPlayStats({ moves: 0, pushes: 0 })
    setPlayHistory([])
    setIsPlaying(false)
    setPlaybackIndex(0)
  }

  function resize(axis: 'width' | 'height', value: number) {
    const safe = Math.max(5, Math.min(20, value || 5))
    commit(resizeLevel(level, axis === 'width' ? safe : level.width, axis === 'height' ? safe : level.height))
  }

  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    setFuture((items) => [level, ...items])
    setLevel(previous)
    setHistory((items) => items.slice(0, -1))
  }

  function redo() {
    const next = future[0]
    if (!next) return
    setHistory((items) => [...items, level])
    setLevel(next)
    setFuture((items) => items.slice(1))
  }

  function exportLevel() {
    const blob = new Blob([xsb], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'sokoforge-level.xsb'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function addToLibrary(levels: PackLevel[], activate = true) {
    if (!levels.length) return
    setLibrary((items) => mergeLevelLists(levels, items))
    if (activate) setActiveTab('library')
  }

  async function importFiles(files: File[]) {
    const imported: PackLevel[] = []
    let invalid = 0
    for (const file of files) {
      try { imported.push(...parseImportedFile(file.name, await file.text())) } catch { invalid += 1 }
    }
    if (imported.length) {
      setResults(imported)
      addToLibrary(imported)
    }
    if (invalid) window.alert(t.invalidFiles.replace('{count}', String(invalid)))
  }

  async function importDirectory(handle: LevelDirectoryHandle, activate = true) {
    setDirectoryBusy(true)
    try { addToLibrary(await scanDirectory(handle), activate) } finally { setDirectoryBusy(false) }
  }

  async function chooseLevelDirectory() {
    if (!supportsLevelDirectory() || !window.showDirectoryPicker) {
      fileInput.current?.click()
      return
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'sokoforge-levels', mode: 'readwrite' })
      await rememberDirectory(handle)
      setDirectory(handle)
      await importDirectory(handle)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') window.alert(t.folderUnavailable)
    }
  }

  async function refreshDirectory() {
    if (!directory) return chooseLevelDirectory()
    if (await requestDirectory(directory, 'read')) await importDirectory(directory)
  }

  function exportGeneratedPack() {
    if (results.length) downloadLevelPack(createLevelPack(results))
  }

  async function saveGeneratedPackToDirectory() {
    if (!results.length) return
    let handle = directory
    if (!handle && supportsLevelDirectory() && window.showDirectoryPicker) {
      try {
        handle = await window.showDirectoryPicker({ id: 'sokoforge-levels', mode: 'readwrite' })
        await rememberDirectory(handle)
        setDirectory(handle)
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') window.alert(t.folderUnavailable)
        return
      }
    }
    if (!handle) {
      exportGeneratedPack()
      return
    }
    if (!await requestDirectory(handle, 'readwrite')) return
    await writePack(handle, packFileName(), createLevelPack(results))
    window.alert(t.packSaved)
  }

  function saveLevel() {
    const metrics = solveResult
      ? { score: solveResult.pushes, pushes: solveResult.pushes, moves: solveResult.moves.length, dependency: 0, trap: 0, away_pushes: 0, box_switches: 0 }
      : { score: 0, pushes: 0, moves: 0, dependency: 0, trap: 0, away_pushes: 0, box_switches: 0 }
    setLibrary((items) => [{ id: crypto.randomUUID(), name: `${t.brand} ${library.length + 1}`, xsb, difficulty: metrics }, ...items])
  }

  async function generate() {
    const total = Math.max(1, Math.min(1000, batchCount))
    const collected: PackLevel[] = []
    setGenerationProgress(0)
    setResults([])
    for (let i = 0; i < total; i += 1) {
      const candidate = await generateCandidate(Date.now() + i)
      if (!candidate) continue
      const result = await solve(candidate, 'quick')
      if (result.status === 'solved') {
        const density = result.pushes / Math.sqrt(level.width * level.height)
        const trap = Math.min(100, Math.log10(Math.max(1, result.explored_nodes)) * 12)
        const dependency = Math.min(100, result.pushes * 4 + (result.moves.length - result.pushes) * 0.5)
        const score = difficultyMode === 'long_solution' ? density * 20 : difficultyMode === 'deep_trap' ? trap : difficultyMode === 'dependency' ? dependency : density * 8 + trap * 0.3 + dependency * 0.3
        collected.push({ id: `browser-${Date.now()}-${i}`, name: `${t.generated} ${i + 1}`, xsb: candidate, solution: result.moves, difficulty: { score, pushes: result.pushes, moves: result.moves.length, dependency, trap, away_pushes: 0, box_switches: 0 } })
      }
      if (i % 5 === 0 || i + 1 === total) {
        collected.sort((a, b) => b.difficulty.score - a.difficulty.score)
        setResults([...collected.slice(0, 50)])
        setGenerationProgress(Math.round(((i + 1) / total) * 100))
      }
    }
  }

  function load(entry: PackLevel) {
    solveRun.current += 1
    setIsSolving(false)
    const loaded = parseLevel(entry.xsb)
    setLevel(loaded)
    setInitialLevel(loaded)
    setSolutionStart(loaded)
    setCurrentLevelId(published.some((item) => item.id === entry.id) ? entry.id : null)
    setPlayStats({ moves: 0, pushes: 0 })
    setPlayHistory([])
    setPlaybackIndex(0)
    setIsPlaying(false)
    setHistory([])
    setFuture([])
    setWorkMode('play')
    setSolveResult(entry.solution ? { status: 'solved', moves: entry.solution, pushes: entry.difficulty.pushes, explored_nodes: 0, elapsed_ms: 0, optimal: false, message: '' } : null)
    setActiveTab('solve')
  }

  function navigateLevel(offset: number) {
    if (!publishedItems.length) return
    const index = currentPublishedIndex < 0 ? 0 : (currentPublishedIndex + offset + publishedItems.length) % publishedItems.length
    load(publishedItems[index])
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Box size={20} strokeWidth={1.8} /></div><strong>{t.brand}</strong></div>
      <nav className="workspace-switch" aria-label={t.editor}>
        <button className={workMode === 'play' ? 'active' : ''} onClick={() => switchWorkMode('play')}><Gamepad2 size={16} />{t.playMode}</button>
        <button className={workMode === 'edit' ? 'active' : ''} onClick={() => switchWorkMode('edit')}><Pencil size={16} />{t.editMode}</button>
      </nav>
      <div className="top-actions">
        <button className="icon-button" title={t.newLevel} onClick={() => { solveRun.current += 1; const fresh = parseLevel(SAMPLE); setLevel(fresh); setInitialLevel(fresh); setSolutionStart(null); setCurrentLevelId(null); setPlayStats({ moves: 0, pushes: 0 }); setPlayHistory([]); setPlaybackIndex(0); setIsPlaying(false); setIsSolving(false); setSolveResult(null); setHistory([]); setWorkMode('edit') }}><Sparkles size={18} /></button>
        <button className="icon-button" title={t.import} onClick={() => fileInput.current?.click()}><FileUp size={18} /></button>
        <button className="icon-button" title={t.export} onClick={exportLevel}><Download size={18} /></button>
        <button className="language-button" title={t.language} onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}><Languages size={16} /><span>{language === 'en' ? '中文' : 'EN'}</span></button>
        <input ref={fileInput} hidden multiple type="file" accept="application/json,text/plain,.json,.xsb" onChange={(event) => { if (event.target.files) void importFiles([...event.target.files]); event.target.value = '' }} />
      </div>
    </header>

    <section className={`workspace ${workMode === 'play' && isLevelSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`context-sidebar ${workMode} ${workMode === 'play' && isLevelSidebarCollapsed ? 'collapsed' : ''}`}>
        {workMode === 'play' ? <PlaySidebar published={published} publishedItems={publishedItems} currentLevelId={currentLevelId} language={language} t={t} collapsed={isLevelSidebarCollapsed} onToggleCollapsed={() => setIsLevelSidebarCollapsed((value) => !value)} onLoad={load} onImport={() => fileInput.current?.click()} /> : <EditSidebar level={level} tool={tool} history={history} future={future} t={t} onTool={setTool} onResize={resize} onUndo={undo} onRedo={redo} onReset={() => commit(parseLevel(SAMPLE))} />}
      </aside>

      <section className="board-area">
        <header className="level-header">
          <div className="level-identity"><span>{t.level} {currentPublishedIndex >= 0 ? `${String(currentPublishedIndex + 1).padStart(2, '0')} / ${String(published.length).padStart(2, '0')}` : '—'}</span><h1>{currentTitle}</h1></div>
          <div className="level-meta">{currentPublished && <><span className={`difficulty ${currentPublished.difficulty}`}>{t[currentPublished.difficulty]}</span><span><Target size={14} />{t.optimalPushes} {currentPublished.optimalPushes}</span></>}</div>
          <div className="level-actions"><button title={t.previousLevel} disabled={!published.length} onClick={() => navigateLevel(-1)}><ChevronLeft size={19} /></button><button title={t.restartLevel} onClick={restartLevel}><RotateCcw size={17} /></button><button title={t.nextLevel} disabled={!published.length} onClick={() => navigateLevel(1)}><ChevronRight size={19} /></button></div>
        </header>

        <div className="board-stage">
          <div className="board" style={{ gridTemplateColumns: `repeat(${level.width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${level.height}, minmax(0, 1fr))`, aspectRatio: `${level.width} / ${level.height}` }}>
            {level.cells.map((cell, index) => <BoardCell key={index} index={index} cell={cell} level={level} workMode={workMode} onPaint={paint} />)}
          </div>
          {state === 'solved' && <div className="completion-badge"><Check size={17} />{t.completed}</div>}
        </div>

        <footer className="game-dock">
          {workMode === 'play' ? <>
            <div className="play-stats"><span><b>{playStats.moves}</b>{t.playedMoves}</span><span><b>{playStats.pushes}</b>{t.playedPushes}</span></div>
            <GameControls t={t} onMove={playMove} onUndo={undoCurrentMove} onRestart={restartLevel} moveDisabled={isPlaying} undoDisabled={(!playHistory.length && playbackIndex === 0) || isPlaying} />
            <span className={`board-status ${state}`}>{state === 'solved' ? t.completed : t.ready}</span>
          </> : <div className="edit-status"><Pencil size={15} />{level.width} × {level.height}</div>}
        </footer>
      </section>

      <aside className="control-panel">
        <nav className="tabs"><button className={activeTab === 'solve' ? 'active' : ''} onClick={() => setActiveTab('solve')}><BrainCircuit size={16} />{t.solve}</button><button className={activeTab === 'forge' ? 'active' : ''} onClick={() => setActiveTab('forge')}><WandSparkles size={16} />{t.forge}</button><button className={activeTab === 'library' ? 'active' : ''} onClick={() => setActiveTab('library')}><FileDown size={16} />{t.library}</button></nav>
        {activeTab === 'solve' && <SolvePanel t={t} state={state} mode={solveMode} result={solveResult} isSolving={isSolving} isPlaying={isPlaying} playbackIndex={playbackIndex} playbackSpeed={playbackSpeed} onMode={setSolveMode} onSolve={onSolve} onTogglePlayback={toggleSolutionPlayback} onStep={stepSolution} onSpeed={setPlaybackSpeed} onSave={saveLevel} />}
        {activeTab === 'forge' && <div className="panel-body"><div className="panel-title"><span>{t.forge}</span><b>{generationProgress}%</b></div><div className="form-grid"><label>{t.candidateCount}<input type="number" min="10" max="1000" step="10" value={batchCount} onChange={(event) => setBatchCount(Number(event.target.value))} /></label><label>{t.boxes}<input type="number" min="1" max="8" value={boxCount} onChange={(event) => setBoxCount(Number(event.target.value))} /></label></div><label>{t.difficulty}<select value={difficultyMode} onChange={(event) => setDifficultyMode(event.target.value as DifficultyMode)}>{(['composite','long_solution','deep_trap','dependency'] as DifficultyMode[]).map((mode) => <option key={mode} value={mode}>{t[mode]}</option>)}</select></label><button className="primary-action" onClick={generate}><WandSparkles size={18} />{t.generate}</button><div className="pack-actions"><button className="secondary-action" disabled={!results.length} onClick={exportGeneratedPack}><Download size={16} />{t.exportPack}</button><button className="secondary-action" disabled={!results.length} onClick={saveGeneratedPackToDirectory}><FolderOpen size={16} />{t.saveToFolder}</button></div><div className="progress"><span style={{ width: `${generationProgress}%` }} /></div><ResultList title={t.topResults} items={results} empty={t.noResults} onLoad={load} pushLabel={t.pushes} /></div>}
        {activeTab === 'library' && <div className="panel-body"><div className="panel-title"><span>{t.library}</span><b>{publishedItems.length + library.length}</b></div><button className="import-row" onClick={() => fileInput.current?.click()}><FileUp size={17} />{t.importPack}</button><button className="import-row" disabled={directoryBusy} onClick={chooseLevelDirectory}><FolderOpen size={17} />{t.chooseFolder}</button>{directory && <button className="directory-row" disabled={directoryBusy} onClick={refreshDirectory}><FolderSync size={16} /><span>{directory.name}</span></button>}<ResultList title={t.myLevels} items={library} empty={t.emptyLibrary} onLoad={load} pushLabel={t.pushes} /><ResultList title={t.published} items={publishedItems} empty={t.noResults} onLoad={load} pushLabel={t.pushes} /></div>}
      </aside>
    </section>
  </main>
}

type Translations = typeof copy.en | typeof copy.zh

function PlaySidebar({ published, publishedItems, currentLevelId, language, t, collapsed, onToggleCollapsed, onLoad, onImport }: { published: PublishedLevel[]; publishedItems: PackLevel[]; currentLevelId: string | null; language: Language; t: Translations; collapsed: boolean; onToggleCollapsed: () => void; onLoad: (entry: PackLevel) => void; onImport: () => void }) {
  const currentIndex = published.findIndex((item) => item.id === currentLevelId)
  const [jumpValue, setJumpValue] = useState(currentIndex >= 0 ? String(currentIndex + 1) : '1')

  useEffect(() => {
    if (currentIndex >= 0) setJumpValue(String(currentIndex + 1))
  }, [currentIndex])

  function jumpToLevel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requested = Number(jumpValue)
    if (!Number.isInteger(requested) || requested < 1 || requested > publishedItems.length) return
    onLoad(publishedItems[requested - 1])
  }

  if (collapsed) return <button className="sidebar-collapse-toggle" title={t.expandLevels} aria-label={t.expandLevels} onClick={onToggleCollapsed}><PanelLeftOpen size={18} /></button>
  return <><div className="sidebar-heading"><span>{t.published}</span><div className="sidebar-heading-actions"><b>{published.length}</b><button className="sidebar-collapse-toggle" title={t.collapseLevels} aria-label={t.collapseLevels} onClick={onToggleCollapsed}><PanelLeftClose size={16} /></button></div></div><form className="level-jump" onSubmit={jumpToLevel}><label>{t.levelNumber}<input aria-label={t.levelNumber} type="number" min="1" max={Math.max(1, publishedItems.length)} value={jumpValue} disabled={!publishedItems.length} onChange={(event) => setJumpValue(event.target.value)} /></label><button type="submit" title={t.goToLevel} aria-label={t.goToLevel} disabled={!publishedItems.length}><ArrowRight size={16} /></button></form><div className="level-list">{published.map((item, index) => <button key={item.id} className={currentLevelId === item.id ? 'active' : ''} onClick={() => onLoad(publishedItems[index])}><span className="level-number">{String(index + 1).padStart(2, '0')}</span><span className="level-copy"><b>{item.title[language]}</b><small>{t[item.difficulty]} · {item.optimalPushes} {t.pushes}</small></span>{currentLevelId === item.id && <Check size={15} />}</button>)}</div><button className="sidebar-import" onClick={onImport}><FileUp size={16} />{t.import}</button></>
}

function EditSidebar({ level, tool, history, future, t, onTool, onResize, onUndo, onRedo, onReset }: { level: ParsedLevel; tool: Tool; history: ParsedLevel[]; future: ParsedLevel[]; t: Translations; onTool: (tool: Tool) => void; onResize: (axis: 'width' | 'height', value: number) => void; onUndo: () => void; onRedo: () => void; onReset: () => void }) {
  return <><div className="sidebar-heading"><span>{t.tools}</span><b>{level.width}×{level.height}</b></div><div className="editor-tools">{(Object.keys(toolIcons) as Tool[]).map((item) => { const Icon = toolIcons[item]; return <button key={item} className={tool === item ? 'active' : ''} title={t[item]} onClick={() => onTool(item)}><Icon size={19} /><span>{t[item]}</span></button> })}</div><div className="sidebar-section"><span>{t.board}</span><div className="dimension-grid"><label>{t.width}<input aria-label={t.width} type="number" value={level.width} min="5" max="20" onChange={(event) => onResize('width', Number(event.target.value))} /></label><label>{t.height}<input aria-label={t.height} type="number" value={level.height} min="5" max="20" onChange={(event) => onResize('height', Number(event.target.value))} /></label></div></div><div className="history-actions"><button className="icon-button" title="Undo" disabled={!history.length} onClick={onUndo}><Undo2 size={17} /></button><button className="icon-button" title="Redo" disabled={!future.length} onClick={onRedo}><Redo2 size={17} /></button><button className="icon-button" title={t.reset} onClick={onReset}><RotateCcw size={17} /></button></div></>
}

function BoardCell({ index, cell, level, workMode, onPaint }: { index: number; cell: string; level: ParsedLevel; workMode: 'play' | 'edit'; onPaint: (index: number) => void }) {
  const goal = level.goals.includes(index)
  const hasBox = level.boxes.includes(index)
  const hasPlayer = level.player === index
  const classes = ['cell', cell === '#' ? 'wall' : 'floor', goal ? 'goal' : '', hasBox ? 'box' : '', hasPlayer ? 'player' : '', workMode].filter(Boolean).join(' ')
  return <button tabIndex={workMode === 'edit' ? 0 : -1} aria-label={`cell ${index}`} className={classes} onPointerDown={() => { if (workMode === 'edit') onPaint(index) }} onPointerEnter={(event) => { if (workMode === 'edit' && event.buttons === 1) onPaint(index) }}>{goal && <span className="goal-mark" />}{hasBox && <span className="crate" />}{hasPlayer && <span className="keeper"><span className="keeper-head"><i className="keeper-eye left" /><i className="keeper-eye right" /></span><span className="keeper-body" /></span>}</button>
}

function GameControls({ t, onMove, onUndo, onRestart, moveDisabled, undoDisabled }: { t: Translations; onMove: (direction: string) => void; onUndo: () => void; onRestart: () => void; moveDisabled: boolean; undoDisabled: boolean }) {
  return <div className="game-controls"><div className="utility-controls"><button title={t.undoMove} aria-label={t.undoMove} disabled={undoDisabled} onClick={onUndo}><Undo2 size={16} /></button><button title={t.restartLevel} aria-label={t.restartLevel} onClick={onRestart}><RotateCcw size={16} /></button></div><span className="control-divider" /><div className="direction-pad"><button className="control-up" title={t.moveUp} aria-label={t.moveUp} disabled={moveDisabled} onClick={() => onMove('U')}><ArrowUp size={18} /></button><button className="control-left" title={t.moveLeft} aria-label={t.moveLeft} disabled={moveDisabled} onClick={() => onMove('L')}><ArrowLeft size={18} /></button><button className="control-down" title={t.moveDown} aria-label={t.moveDown} disabled={moveDisabled} onClick={() => onMove('D')}><ArrowDown size={18} /></button><button className="control-right" title={t.moveRight} aria-label={t.moveRight} disabled={moveDisabled} onClick={() => onMove('R')}><ArrowRight size={18} /></button></div></div>
}

function SolvePanel({ t, state, mode, result, isSolving, isPlaying, playbackIndex, playbackSpeed, onMode, onSolve, onTogglePlayback, onStep, onSpeed, onSave }: { t: Translations; state: string; mode: SolveMode; result: SolveResult | null; isSolving: boolean; isPlaying: boolean; playbackIndex: number; playbackSpeed: number; onMode: (mode: SolveMode) => void; onSolve: () => void; onTogglePlayback: () => void; onStep: (delta: number) => void; onSpeed: (speed: number) => void; onSave: () => void }) {
  const status = result ? (result.status === 'solved' ? (result.optimal ? t.optimalProven : t.feasibleOnly) : result.status === 'timeout' ? t.timedOut : t.invalid) : t.ready
  const totalSteps = result?.moves.length ?? 0
  const progress = totalSteps ? (playbackIndex / totalSteps) * 100 : 0
  return <div className="panel-body solve-panel">
    <div className="panel-title"><span>{t.solverStatus}</span><b className={result?.status ?? 'ready'}>{status}</b></div>
    <div className="movement-guide"><span className="key-cluster"><kbd>↑↓←→</kbd><kbd>WASD</kbd></span><span>{t.movePlayer}</span></div>
    <div className="segmented"><button className={mode === 'quick' ? 'active' : ''} onClick={() => onMode('quick')}>{t.quick}</button><button className={mode === 'optimal' ? 'active' : ''} onClick={() => onMode('optimal')}>{t.optimal}</button></div>
    <button className="primary-action" disabled={isSolving || state === 'invalid'} onClick={onSolve}><BrainCircuit size={18} />{isSolving ? '...' : mode === 'optimal' ? t.optimal : t.quick}</button>
    {result ? <div className="solution-result">
      <div className="metrics"><span><b>{result.pushes}</b>{t.pushes}</span><span><b>{result.moves.length}</b>{t.moves}</span><span><b>{result.explored_nodes.toLocaleString()}</b>{t.nodes}</span></div>
      {result.status === 'solved' && result.moves && <div className="playback"><div className="playback-heading"><span>{t.solutionStep}</span><b>{playbackIndex} / {totalSteps}</b></div><div className="solution-progress"><span style={{ width: `${progress}%` }} /></div><div className="playback-controls"><button title={t.previousStep} aria-label={t.previousStep} disabled={playbackIndex === 0} onClick={() => onStep(-1)}><ChevronLeft size={18} /></button><button className="playback-toggle" title={isPlaying ? t.pause : t.play} aria-label={isPlaying ? t.pause : t.play} onClick={onTogglePlayback}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button title={t.nextStep} aria-label={t.nextStep} disabled={playbackIndex >= totalSteps} onClick={() => onStep(1)}><ChevronRight size={18} /></button><label>{t.speed}<select aria-label={t.speed} value={playbackSpeed} onChange={(event) => onSpeed(Number(event.target.value))}>{[0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label></div></div>}
    </div> : <div className="solver-idle"><BrainCircuit size={30} strokeWidth={1.4} /><span>{t.ready}</span></div>}
    <details className="game-help"><summary><CircleHelp size={16} />{t.howToPlay}</summary><div><p>{t.movementHelp}</p><p>{t.goalHelp}</p><p>{t.recoveryHelp}</p><p>{t.replayHelp}</p></div></details>
    <div className="panel-foot"><button className="secondary-action" onClick={onSave}><Save size={16} />{t.save}</button></div>
  </div>
}

function ResultList({ title, items, empty, onLoad, pushLabel }: { title: string; items: PackLevel[]; empty: string; onLoad: (entry: PackLevel) => void; pushLabel: string }) {
  return <section className="result-list"><div className="list-header"><h3>{title}</h3><span>{items.length}</span></div>{items.length === 0 ? <p className="empty-state">{empty}</p> : items.map((item, index) => <button key={item.id} className="result-row" onClick={() => onLoad(item)}><span className="rank">{String(index + 1).padStart(2, '0')}</span><span className="mini-map"><b>{item.name}</b><small>{item.xsb.split('\n').map((row) => row.replace(/ /g, '·')).join(' / ')}</small></span><span className="result-score"><b>{item.difficulty.score.toFixed(1)}</b><small>{item.difficulty.pushes} {pushLabel}</small></span></button>)}</section>
}
