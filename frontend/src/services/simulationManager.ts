import { sidecarBridge } from './sidecarBridge'
import { useBuildStore } from '../stores/buildStore'
import { useInteractionStore } from '../stores/interactionStore'

type Transform = { position: [number, number, number]; quaternion: [number, number, number, number] }

// Mutable map to hold 60fps transform updates without triggering React renders
export const simulationTransforms = new Map<string, Transform>()

let currentConnection: { close: () => void; setSpeed: (s: number) => void } | null = null

export async function startSimulation(motorSpeed: number) {
  const connected = await sidecarBridge.connect().catch(() => false)
  useBuildStore.getState().setSidecarConnected(connected)
  if (!connected) {
    // Revert optimistic UI toggle when the sidecar/websocket backend is unavailable.
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

  try {
    currentConnection = sidecarBridge.connectSimulation(
      instances,
      connections,
      motorSpeed,
      (data) => {
        // Update the mutable map with incoming transforms
        // 'data' is the msg.data from sidecarBridge
        for (const [id, transform] of Object.entries(data)) {
          simulationTransforms.set(id, transform as Transform)
        }
      },
      () => {
        currentConnection = null
        if (useInteractionStore.getState().isSimulating) {
          useInteractionStore.getState().toggleSimulation()
        }
      }
    )
  } catch {
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
