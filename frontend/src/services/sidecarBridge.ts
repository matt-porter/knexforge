/**
 * Tauri command bridge to the Python core sidecar.
 *
 * In development without Tauri, operations fall through to no-ops.
 * When Tauri is available, commands are forwarded to the Python FastAPI sidecar.
 */

import type { PartInstance, Connection } from '../types/parts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapRequest {
  from_instance_id: string
  from_port_id: string
  to_instance_id: string
  to_port_id: string
  tolerance_mm?: number
}

export interface SnapResponse {
  success: boolean
  connection: Connection | null
  updated_position?: [number, number, number]
  updated_rotation?: [number, number, number, number]
}

export interface StabilityResponse {
  stability: number
  details: Record<string, unknown>
  stress_data?: Record<string, number>
}

export interface BuildExport {
  parts: PartInstance[]
  connections: Connection[]
  stability_score: number
}

// ---------------------------------------------------------------------------
// Tauri detection
// ---------------------------------------------------------------------------

function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Dynamically import @tauri-apps/api/core only when Tauri is available.
 * This avoids bundling errors in pure web dev mode.
 */
async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

// ---------------------------------------------------------------------------
// Bridge class
// ---------------------------------------------------------------------------

export class SidecarBridge {
  private _connected = false
  private _baseUrl = 'http://127.0.0.1:8000'

  get connected(): boolean {
    return this._connected
  }

  /**
   * Attempt to connect to the Python sidecar.
   * In Tauri mode, this starts the sidecar process.
   * In web dev mode, it tries the FastAPI HTTP server directly.
   */
  async connect(): Promise<boolean> {
    if (isTauriAvailable()) {
      try {
        await tauriInvoke('start_sidecar')
        this._connected = true
        console.log('[SIM-WS] Tauri sidecar started')
        return true
      } catch {
        // Sidecar may already be running
        this._connected = true
        console.log('[SIM-WS] Tauri sidecar already running')
        return true
      }
    }

    // Fallback: try direct HTTP to FastAPI dev server
    try {
      const resp = await fetch(`${this._baseUrl}/docs`, { method: 'HEAD' })
      this._connected = resp.ok
      console.log('[SIM-WS] HTTP connect to %s → ok=%s', this._baseUrl, resp.ok)
      return this._connected
    } catch (err) {
      this._connected = false
      console.warn('[SIM-WS] HTTP connect to %s failed:', this._baseUrl, err)
      return false
    }
  }

  /**
   * Request a snap between two ports via the Python core.
   * The core validates the snap and returns the connection + updated positions.
   */
  async requestSnap(req: SnapRequest): Promise<SnapResponse> {
    if (!this._connected) {
      return { success: false, connection: null }
    }

    try {
      if (isTauriAvailable()) {
        return await tauriInvoke<SnapResponse>('request_snap', { request: req })
      }

      const resp = await fetch(`${this._baseUrl}/snap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      return (await resp.json()) as SnapResponse
    } catch {
      return { success: false, connection: null }
    }
  }

  /**
   * Request stability score for the current build.
   */
  async requestStability(parts: PartInstance[], connections: Connection[]): Promise<StabilityResponse> {
    if (!this._connected) {
      return { stability: 100, details: {} }
    }

    try {
      if (isTauriAvailable()) {
        return await tauriInvoke<StabilityResponse>('request_stability', { parts, connections })
      }

      const resp = await fetch(`${this._baseUrl}/stability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts, connections }),
      })
      return (await resp.json()) as StabilityResponse
    } catch {
      return { stability: 100, details: {} }
    }
  }

  /**
   * Export the build to a .knx file via the Python core.
   */
  async exportBuild(parts: PartInstance[], connections: Connection[]): Promise<Uint8Array | null> {
    if (!this._connected) return null

    try {
      if (isTauriAvailable()) {
        return await tauriInvoke<Uint8Array>('export_build', { parts, connections })
      }

      const resp = await fetch(`${this._baseUrl}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts, connections }),
      })
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      return new Uint8Array(buf)
    } catch {
      return null
    }
  }

  /**
   * Load a build from a .knx file via the Python core.
   */
  async loadBuild(data: Uint8Array): Promise<BuildExport | null> {
    if (!this._connected) return null

    try {
      if (isTauriAvailable()) {
        return await tauriInvoke<BuildExport>('load_build', { data: Array.from(data) })
      }

      const resp = await fetch(`${this._baseUrl}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data.buffer as ArrayBuffer,
      })
      if (!resp.ok) return null
      return (await resp.json()) as BuildExport
    } catch {
      return null
    }
  }

  /**
   * Connect to the simulation websocket.
   */
  connectSimulation(
    parts: PartInstance[],
    connections: Connection[],
    motorSpeed: number,
    onTransforms: (data: Record<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>) => void,
    onClose: () => void
  ): { close: () => void; setSpeed: (s: number) => void } {
    const wsUrl = this._baseUrl.replace('http', 'ws') + '/ws/simulate'
    console.log('[SIM-WS] Opening WebSocket:', wsUrl)
    const ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      console.log('[SIM-WS] WebSocket opened, sending initial payload')
      ws.send(JSON.stringify({ parts, connections, motor_speed: motorSpeed }))
    }

    ws.onerror = (ev) => {
      console.error('[SIM-WS] WebSocket error:', ev)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'error') {
          console.error('[SIM-WS] Backend error:', msg.data)
        } else if (msg.type === 'transforms' && msg.data) {
          onTransforms(msg.data)
        } else if (msg.type === 'status') {
          console.log('[SIM-WS] Status:', msg.data)
        }
      } catch (err) {
        console.error('[SIM-WS] Failed to parse simulation message:', err)
      }
    }

    ws.onclose = (ev) => {
      console.log('[SIM-WS] WebSocket closed, code=%d reason=%s', ev.code, ev.reason)
      onClose()
    }

    return {
      close: () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'stop' }))
        }
        ws.close()
      },
      setSpeed: (s: number) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ motor_speed: s }))
        }
      }
    }
  }
}

/** Singleton bridge instance. */
export const sidecarBridge = new SidecarBridge()
