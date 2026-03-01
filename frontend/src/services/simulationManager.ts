/**
 * Simulation manager — orchestrates the Rapier.js physics loop.
 *
 * Replaces the previous WebSocket-based PyBullet simulation with
 * client-side Rapier.js (WASM). Transforms are written into a mutable
 * Map at 60fps that PartMesh.tsx reads in its useFrame callback.
 */

import { useBuildStore } from '../stores/buildStore'
import { useInteractionStore } from '../stores/interactionStore'
import { createSimDiagnostics, type SimOrientationDiagnostics } from './simulationDiagnostics'
import { RapierSimulator, type Transform } from './rapierSimulator'

// Mutable map to hold 60fps transform updates without triggering React renders
export const simulationTransforms = new Map<string, Transform>()

let simulator: RapierSimulator | null = null
let animFrameId: number | null = null

/** Diagnostic: count of transform frames received from the backend. */
export let simDiagFrameCount = 0

/** Orientation diagnostics instance — inspect from browser console via simDiagnostics. */
export let simDiagnostics: SimOrientationDiagnostics | null = null

export async function startSimulation(motorSpeed: number) {
  simDiagFrameCount = 0
  console.log('[SIM-FE] startSimulation called, motorSpeed=', motorSpeed)

  const { parts, connections } = useBuildStore.getState()
  const instances = Object.values(parts)
  console.log('[SIM-FE] Initializing Rapier with %d parts, %d connections', instances.length, connections.length)

  simDiagnostics = createSimDiagnostics(parts)
  console.log('[SIM-DIAG] Diagnostics initialized for %d parts', instances.length)

  try {
    simulator = new RapierSimulator()
    await simulator.init(parts, connections, motorSpeed)

    // Mark sidecar as "connected" for UI consistency
    useBuildStore.getState().setSidecarConnected(true)

    // Start the simulation loop
    const loop = () => {
      if (!simulator?.initialized) return

      const transforms = simulator.step()
      const ids = Object.keys(transforms)

      if (simDiagFrameCount < 3) {
        console.log(
          '[SIM-FE] Transform frame %d, ids=%d, sample=',
          simDiagFrameCount,
          ids.length,
          ids.length > 0 ? transforms[ids[0]] : '(empty)',
        )
      }
      simDiagFrameCount++
      simDiagnostics?.processFrame(transforms as Record<string, Transform>)

      for (const [id, transform] of Object.entries(transforms)) {
        simulationTransforms.set(id, transform)
      }

      animFrameId = requestAnimationFrame(loop)
    }

    animFrameId = requestAnimationFrame(loop)
    console.log('[SIM-FE] Rapier simulation loop started')
  } catch (err) {
    console.error('[SIM-FE] Rapier init failed:', err)
    simulator?.destroy()
    simulator = null
    if (useInteractionStore.getState().isSimulating) {
      useInteractionStore.getState().toggleSimulation()
    }
  }
}

export function stopSimulation() {
  if (simDiagnostics) {
    const report = simDiagnostics.getReport()
    console.log('[SIM-DIAG] Simulation ended — %s', report.summary)
  }
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
  if (simulator) {
    simulator.destroy()
    simulator = null
  }
  simulationTransforms.clear()
}

export function updateMotorSpeed(speed: number) {
  if (simulator) {
    simulator.setMotorSpeed(speed)
  }
}
