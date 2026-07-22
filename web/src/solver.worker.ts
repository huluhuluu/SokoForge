import type { SolveMode, SolveResult } from './types'

type Request = { id: number; type: 'solve'; xsb: string; mode: SolveMode; timeLimitMs: number } | { id: number; type: 'generate'; width: number; height: number; boxes: number; seed: number }
type Reply = { id: number; result?: SolveResult; xsb?: string }

type WasmApi = { solve_xsb: (xsb: string, mode: string, timeLimitMs: bigint, nodeLimit: number) => string; generate_xsb: (width: number, height: number, boxes: number, seed: bigint) => string }
let wasm: WasmApi | null = null

async function loadWasm() {
  if (wasm) return wasm
  const modulePath: string = '/wasm/sokoforge_wasm.js'
  const nativeImport = new Function('path', 'return import(path)') as (path: string) => Promise<{ default: () => Promise<void> } & WasmApi>
  const module = await nativeImport(modulePath)
  await module.default()
  const api: WasmApi = module
  wasm = api
  return api
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data
  try {
    const api = await loadWasm()
    if (request.type === 'generate') {
      self.postMessage({ id: request.id, xsb: api.generate_xsb(request.width, request.height, request.boxes, BigInt(request.seed)) } satisfies Reply)
    } else {
      const result = JSON.parse(api.solve_xsb(request.xsb, request.mode, BigInt(request.timeLimitMs), request.mode === 'optimal' ? 2_000_000 : 300_000)) as SolveResult
      self.postMessage({ id: request.id, result } satisfies Reply)
    }
  } catch (error) {
    self.postMessage({ id: request.id, result: { status: 'invalid', moves: '', pushes: 0, explored_nodes: 0, elapsed_ms: 0, optimal: false, message: `Solver runtime unavailable: ${String(error)}` } } satisfies Reply)
  }
}
