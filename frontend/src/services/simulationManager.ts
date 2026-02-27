import { sidecarBridge } from './sidecarBridge'
import { useBuildStore } from '../stores/buildStore'
import { useInteractionStore } from '../stores/interactionStore'

type Transform = { position: [number, number, number]; quaternion: [number, number, number, number] }

// Mutable map to hold 60fps transform updates without triggering React renders
export const simulationTransforms = new Map<string, Transform>()

let currentConnection: { close: () => void; setSpeed: (s: number) => void } | null = null

/** Diagnostic: count of transform frames received from the backend. */
export let simDiagFrameCount = 0

export async function startSimulation(motorSpeed: number) {
  simDiagFrameCount = 0
  console.log('[SIM-FE] startSimulation called, motorSpeed=', motorSpeed)

  const connected = await sidecarBridge.connect().catch((err) => {
    console.warn('[SIM-FE] sidecar connect() failed:', err)
    return false
  })
  console.log('[SIM-FE] sidecar connected=', connected)
  useBuildStore.getState().setSidecarConnected(connected)
  if (!connected) {
    console.warn('[SIM-FE] Sidecar not reachable — aborting simulation')
    if (useInteractionStore.getState().isSimulating) {
      useInteractionStore.getState().toggleSimulation()
    }
    return
  }

  if (currentConnection) {
    currentConnection.close()
  }

  const { parts, connections } = useBuildStore.getState()
  const instances = Object.values(parts)
  console.log('[SIM-FE] Sending %d parts, %d connections to backend', instances.length, connections.length)

  try {
    currentConnection = sidecarBridge.connectSimulation(
      instances,
      connections,
      motorSpeed,
      (data) => {
        const ids = Object.keys(data)
        if (simDiagFrameCount < 3) {
          console.log('[SIM-FE] Transform frame %d, ids=%d, sample=', simDiagFrameCount, ids.length,
            ids.length > 0 ? data[ids[0]] : '(empty)')
        }
        simDiagFrameCount++
        for (const [id, transform] of Object.entries(data)) {
          simulationTransforms.set(id, transform as Transform)
        }
      },
      () => {
        console.log('[SIM-FE] WebSocket closed, received %d frames total', simDiagFrameCount)
        currentConnection = null
        if (useInteractionStore.getState().isSimulating) {
          useInteractionStore.getState().toggleSimulation()
        }
      }
    )
  } catch (err) {
    console.error('[SIM-FE] connectSimulation threw:', err)
    currentConnection = null
    if (useInteractionStore.getState().isSimulating) {
      useInteractionStore.getState().toggleSimulation()
    }
  }
}

export function stopSimulation() {
  if (currentConnection) {
    currentConnection.close()
    currentConnection = null
  }
  simulationTransforms.clear()
}

export function updateMotorSpeed(speed: number) {
  if (currentConnection) {
    currentConnection.setSpeed(speed)
  }
}
