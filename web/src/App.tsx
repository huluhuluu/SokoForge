import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, BrainCircuit, Download, Eraser, FileDown, FileUp, Grid3X3, Languages, Play, Redo2, RotateCcw, Save, Sparkles, Square, Target, Undo2, UserRound, WandSparkles, X } from 'lucide-react'
import { copy, getInitialLanguage } from './i18n'
import { applyTool, boardStatus, move, parseLevel, resizeLevel, SAMPLE, toXsb, type ParsedLevel } from './level'
import type { DifficultyMode, Language, LevelPack, PackLevel, SolveMode, SolveResult, Tool } from './types'

const toolIcons = { wall: Square, floor: Grid3X3, goal: Target, box: Box, player: UserRound, eraser: Eraser }
const directionByKey: Record<string, string> = { ArrowUp: 'U', w: 'U', W: 'U', ArrowRight: 'R', d: 'R', D: 'R', ArrowDown: 'D', s: 'D', S: 'D', ArrowLeft: 'L', a: 'L', A: 'L' }

export default function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)
  const t = copy[language]
  const [level, setLevel] = useState<ParsedLevel>(() => parseLevel(SAMPLE))
  const [history, setHistory] = useState<ParsedLevel[]>([])
  const [future, setFuture] = useState<ParsedLevel[]>([])
  const [tool, setTool] = useState<Tool>('wall')
  const [activeTab, setActiveTab] = useState<'solve' | 'forge' | 'library'>('solve')
  const [solveMode, setSolveMode] = useState<SolveMode>('quick')
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null)
  const [isSolving, setIsSolving] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [batchCount, setBatchCount] = useState(100)
  const [boxCount, setBoxCount] = useState(3)
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>('composite')
  const [results, setResults] = useState<PackLevel[]>([])
  const [generationProgress, setGenerationProgress] = useState(0)
  const [library, setLibrary] = useState<PackLevel[]>(() => JSON.parse(localStorage.getItem('sokoforge-library') ?? '[]'))
  const worker = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const pending = useRef(new Map<number, (reply: { result?: SolveResult; xsb?: string }) => void>())
  const fileInput = useRef<HTMLInputElement>(null)

  const xsb = useMemo(() => toXsb(level), [level])
  const state = boardStatus(level)

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    localStorage.setItem('sokoforge-language', language)
  }, [language])
  useEffect(() => { localStorage.setItem('sokoforge-library', JSON.stringify(library)) }, [library])
  useEffect(() => {
    worker.current = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    worker.current.onmessage = (event: MessageEvent<{ id: number; result?: SolveResult; xsb?: string }>) => pending.current.get(event.data.id)?.(event.data)
    return () => worker.current?.terminate()
  }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const direction = directionByKey[event.key]
      if (!direction || event.metaKey || event.ctrlKey) return
      const next = move(level, direction)
      if (next) { event.preventDefault(); commit(next) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  function commit(next: ParsedLevel) { setHistory((items) => [...items.slice(-99), level]); setFuture([]); setLevel(next); setSolveResult(null); setIsPlaying(false) }
  function solve(targetXsb = xsb, mode = solveMode): Promise<SolveResult> {
    return new Promise((resolve) => {
      const id = ++requestId.current
      pending.current.set(id, (reply) => { pending.current.delete(id); resolve(reply.result ?? { status: 'invalid', moves: '', pushes: 0, explored_nodes: 0, elapsed_ms: 0, optimal: false, message: 'Missing solver response' }) })
      worker.current?.postMessage({ id, type: 'solve', xsb: targetXsb, mode, timeLimitMs: mode === 'optimal' ? 30_000 : 5_000 })
    })
  }
  function generateCandidate(seed: number): Promise<string> {
    return new Promise((resolve) => {
      const id = ++requestId.current
      pending.current.set(id, (reply) => { pending.current.delete(id); resolve(reply.xsb ?? '') })
      worker.current?.postMessage({ id, type: 'generate', width: level.width, height: level.height, boxes: Math.max(1, Math.min(8, boxCount)), seed })
    })
  }
  async function onSolve() { setIsSolving(true); const result = await solve(); setSolveResult(result); setIsSolving(false) }
  async function playSolution() {
    if (!solveResult?.moves || isPlaying) return
    setIsPlaying(true)
    for (const step of solveResult.moves) { await new Promise((resolve) => window.setTimeout(resolve, 90)); setLevel((current) => move(current, step) ?? current) }
    setIsPlaying(false)
  }
  function paint(index: number) { commit(applyTool(level, index, tool)) }
  function resize(axis: 'width' | 'height', value: number) { const safe = Math.max(5, Math.min(20, value || 5)); commit(resizeLevel(level, axis === 'width' ? safe : level.width, axis === 'height' ? safe : level.height)) }
  function undo() { const previous = history.at(-1); if (!previous) return; setFuture((items) => [level, ...items]); setLevel(previous); setHistory((items) => items.slice(0, -1)) }
  function redo() { const next = future[0]; if (!next) return; setHistory((items) => [...items, level]); setLevel(next); setFuture((items) => items.slice(1)) }
  function exportLevel() { const blob = new Blob([xsb], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sokoforge-level.xsb'; anchor.click(); URL.revokeObjectURL(url) }
  function saveLevel() { const entry: PackLevel = { id: crypto.randomUUID(), name: `${t.brand} ${library.length + 1}`, xsb, difficulty: solveResult ? { score: solveResult.pushes, pushes: solveResult.pushes, moves: solveResult.moves.length, dependency: 0, trap: 0, away_pushes: 0, box_switches: 0 } : { score: 0, pushes: 0, moves: 0, dependency: 0, trap: 0, away_pushes: 0, box_switches: 0 } }; setLibrary((items) => [entry, ...items]) }
  async function generate() {
    const total = Math.max(1, Math.min(1000, batchCount)); const collected: PackLevel[] = []
    setGenerationProgress(0); setResults([])
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
      if (i % 5 === 0 || i + 1 === total) { collected.sort((a, b) => b.difficulty.score - a.difficulty.score); setResults([...collected.slice(0, 50)]); setGenerationProgress(Math.round(((i + 1) / total) * 100)) }
    }
  }
  function importJson(file: File) { const reader = new FileReader(); reader.onload = () => { try { const pack = JSON.parse(String(reader.result)) as LevelPack; if (pack.kind !== 'sokoforge-level-pack' || pack.schemaVersion !== 1 || !Array.isArray(pack.levels)) throw new Error('Unsupported pack'); setResults(pack.levels); setLibrary((items) => [...pack.levels, ...items]); setActiveTab('library') } catch { window.alert('Invalid SokoForge level pack') } }; reader.readAsText(file) }
  function load(entry: PackLevel) { commit(parseLevel(entry.xsb)); setSolveResult(entry.solution ? { status: 'solved', moves: entry.solution, pushes: entry.difficulty.pushes, explored_nodes: 0, elapsed_ms: 0, optimal: false, message: '' } : null); setActiveTab('solve') }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Box size={19} /></div><div><strong>{t.brand}</strong><span>{t.subtitle}</span></div></div>
      <div className="top-actions">
        <button className="icon-button" title={t.newLevel} onClick={() => commit(parseLevel(SAMPLE))}><Sparkles size={18} /></button>
        <button className="icon-button" title={t.import} onClick={() => fileInput.current?.click()}><FileUp size={18} /></button>
        <button className="icon-button" title={t.export} onClick={exportLevel}><Download size={18} /></button>
        <button className="language-button" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}><Languages size={16} /> {language === 'en' ? '中文' : 'EN'}</button>
        <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && importJson(event.target.files[0])} />
      </div>
    </header>

    <section className="workspace">
      <aside className="tool-rail" aria-label={t.tools}>
        <div className="section-label">{t.tools}</div>
        {(Object.keys(toolIcons) as Tool[]).map((item) => { const Icon = toolIcons[item]; return <button key={item} className={`tool-button ${tool === item ? 'selected' : ''}`} title={t[item]} onClick={() => setTool(item)}><Icon size={20} /><span>{t[item]}</span></button> })}
        <div className="divider" />
        <div className="dimension-grid"><label>{t.width}<input aria-label={t.width} type="number" value={level.width} min="5" max="20" onChange={(e) => resize('width', Number(e.target.value))} /></label><label>{t.height}<input aria-label={t.height} type="number" value={level.height} min="5" max="20" onChange={(e) => resize('height', Number(e.target.value))} /></label></div>
        <small>{t.constraints}</small>
        <div className="history-actions"><button className="icon-button" title="Undo" disabled={!history.length} onClick={undo}><Undo2 size={17} /></button><button className="icon-button" title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={17} /></button><button className="icon-button" title={t.reset} onClick={() => commit(parseLevel(SAMPLE))}><RotateCcw size={17} /></button></div>
      </aside>

      <section className="board-area">
        <div className="board-heading"><div><span className={`status-dot ${state}`} />{t.board}</div><span>{level.width} × {level.height}</span></div>
        <div className="board-wrap"><div className="board" style={{ gridTemplateColumns: `repeat(${level.width}, minmax(0, 1fr))` }}>
          {level.cells.map((cell, index) => { const goal = level.goals.includes(index); const hasBox = level.boxes.includes(index); const hasPlayer = level.player === index; const classes = ['cell', cell === '#' ? 'wall' : 'floor', goal ? 'goal' : '', hasBox ? 'box' : '', hasPlayer ? 'player' : ''].filter(Boolean).join(' '); return <button aria-label={`cell ${index}`} key={index} className={classes} onPointerDown={() => paint(index)} onPointerEnter={(event) => { if (event.buttons === 1) paint(index) }}>{hasBox && <span className="crate" />}{hasPlayer && <span className="keeper" />}{goal && <span className="goal-mark" />}</button> })}
        </div></div>
        <p className="keyboard-note">{t.keyboard}</p>
      </section>

      <aside className="control-panel">
        <nav className="tabs"><button className={activeTab === 'solve' ? 'active' : ''} onClick={() => setActiveTab('solve')}><BrainCircuit size={16} />{t.solve}</button><button className={activeTab === 'forge' ? 'active' : ''} onClick={() => setActiveTab('forge')}><WandSparkles size={16} />{t.forge}</button><button className={activeTab === 'library' ? 'active' : ''} onClick={() => setActiveTab('library')}><FileDown size={16} />{t.library}</button></nav>
        {activeTab === 'solve' && <div className="panel-body"><h2>{t.solution}</h2><div className="segmented"><button className={solveMode === 'quick' ? 'active' : ''} onClick={() => setSolveMode('quick')}>{t.quick}</button><button className={solveMode === 'optimal' ? 'active' : ''} onClick={() => setSolveMode('optimal')}>{t.optimal}</button></div><button className="primary-action" disabled={isSolving || state === 'invalid'} onClick={onSolve}><BrainCircuit size={18} />{isSolving ? '...' : solveMode === 'optimal' ? t.optimal : t.quick}</button>{solveResult && <div className="solution-result"><div className={`result-status ${solveResult.status}`}>{solveResult.status === 'solved' ? (solveResult.optimal ? t.optimalProven : t.feasibleOnly) : solveResult.status === 'timeout' ? t.timedOut : t.invalid}</div><div className="metrics"><span><b>{solveResult.pushes}</b>{t.pushes}</span><span><b>{solveResult.moves.length}</b>{t.moves}</span><span><b>{solveResult.explored_nodes.toLocaleString()}</b>{t.nodes}</span></div><p>{solveResult.message}</p>{solveResult.moves && <button className="secondary-action" onClick={playSolution} disabled={isPlaying}><Play size={16} />{isPlaying ? t.stop : t.play}</button>}</div>}<div className="panel-foot"><button className="secondary-action" onClick={saveLevel}><Save size={16} />{t.save}</button></div></div>}
        {activeTab === 'forge' && <div className="panel-body"><h2>{t.generate}</h2><label>{t.candidateCount}<input type="number" min="10" max="1000" step="10" value={batchCount} onChange={(e) => setBatchCount(Number(e.target.value))} /></label><label>{t.boxes}<input type="number" min="1" max="8" value={boxCount} onChange={(e) => setBoxCount(Number(e.target.value))} /></label><label>{t.difficulty}<select value={difficultyMode} onChange={(e) => setDifficultyMode(e.target.value as DifficultyMode)}>{(['composite','long_solution','deep_trap','dependency'] as DifficultyMode[]).map((mode) => <option key={mode} value={mode}>{t[mode]}</option>)}</select></label><button className="primary-action" onClick={generate}><WandSparkles size={18} />{t.generate}</button><div className="progress"><span style={{ width: `${generationProgress}%` }} /></div><p className="muted">{generationProgress}% · Rust CLI is recommended for 1,000–5,000+ candidates.</p><ResultList title={t.topResults} items={results} empty={t.noResults} onLoad={load} /></div>}
        {activeTab === 'library' && <div className="panel-body"><h2>{t.library}</h2><div className="import-box" onClick={() => fileInput.current?.click()}><FileUp size={20} /><span>{t.importPack}</span></div><ResultList title={t.library} items={library} empty={t.emptyLibrary} onLoad={load} /></div>}
      </aside>
    </section>
  </main>
}

function ResultList({ title, items, empty, onLoad }: { title: string; items: PackLevel[]; empty: string; onLoad: (entry: PackLevel) => void }) {
  return <section className="result-list"><div className="list-header"><h3>{title}</h3><span>{items.length}</span></div>{items.length === 0 ? <p className="empty-state">{empty}</p> : items.slice(0, 50).map((item, index) => <button key={item.id} className="result-row" onClick={() => onLoad(item)}><span className="rank">{index + 1}</span><span className="mini-map">{item.xsb.split('\n').map((row) => row.replace(/ /g, '·')).join(' / ')}</span><span><b>{item.difficulty.score.toFixed(1)}</b><small>{item.difficulty.pushes} pushes</small></span></button>)}</section>
}
