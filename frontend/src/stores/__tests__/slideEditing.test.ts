import { describe, it, expect, beforeEach } from 'vitest'
import { useBuildStore } from '../buildStore'
import { useInteractionStore } from '../interactionStore'
import type { KnexPartDef } from '../../types/parts'

describe('Slide Editing Constraints', () => {
  beforeEach(() => {
    useBuildStore.setState({
      parts: {},
      connections: [],
      undoStack: [],
      redoStack: []
    })
    useInteractionStore.setState({
      slideOffset: 0,
      slideRange: null,
      isSlideEditing: false,
      slideEditConnectionIndex: null
    })
  })

  it('updateSlideOffset checks collision and fires rejection event instead of moving', () => {
    const store = useBuildStore.getState()
    
    // Setup part definitions
    const partDefs = new Map<string, KnexPartDef>()
    partDefs.set('rod', {
      id: 'rod', category: 'rod', ports: [
        { id: 'center_axial_1', position: [64,0,0], direction: [-1,0,0], mate_type: 'rod_end', accepts: ['rod_hole'], allowed_angles_deg: [0], slide_clearance_mm: 15.0 }
      ]
    } as any)
    partDefs.set('conn', {
      id: 'conn', category: 'connector', ports: [
        { id: 'A', position: [12,0,0], direction: [1,0,0], mate_type: 'rod_hole', accepts: ['rod_end'], allowed_angles_deg: [0] }
      ]
    } as any)

    // Add rod and two connectors
    store.addPart({ instance_id: 'r1', part_id: 'rod', position: [0,0,0], rotation: [0,0,0,1] })
    store.addPart({ instance_id: 'c1', part_id: 'conn', position: [0,0,0], rotation: [0,0,0,1] })
    store.addPart({ instance_id: 'c2', part_id: 'conn', position: [0,0,0], rotation: [0,0,0,1] })

    // Conn 1 at offset -30
    store.addConnection({
      from_instance: 'c1', from_port: 'A',
      to_instance: 'r1', to_port: 'center_axial_1',
      joint_type: 'revolute', slide_offset: -30
    })

    // Conn 2 at offset +30
    store.addConnection({
      from_instance: 'c2', from_port: 'A',
      to_instance: 'r1', to_port: 'center_axial_1',
      joint_type: 'revolute', slide_offset: 30
    })

    const c2ConnIndex = 1

    let rejectedEventFired = false
    let validOffsetReturned = 0
    const handleRejected = (e: any) => {
      rejectedEventFired = true
      validOffsetReturned = e.detail.validOffset
    }
    window.addEventListener('knexforge:slide-edit-rejected', handleRejected)

    // Try moving c2 to -25 (collides with c1 at -30)
    useBuildStore.getState().updateSlideOffset(c2ConnIndex, -25, partDefs)

    // Ensure state was not mutated to -25
    expect(useBuildStore.getState().connections[c2ConnIndex].slide_offset).toBe(30)
    
    // Ensure event was fired
    expect(rejectedEventFired).toBe(true)
    expect(validOffsetReturned).toBe(30)

    window.removeEventListener('knexforge:slide-edit-rejected', handleRejected)
  })

  it('Escape revert restores buildStore and closes edit mode', () => {
    const store = useBuildStore.getState()
    
    useBuildStore.setState(s => {
      s.parts['p1'] = { instance_id: 'p1', part_id: 'rod', position: [0,0,0], rotation: [0,0,0,1] }
      s.parts['p2'] = { instance_id: 'p2', part_id: 'conn', position: [0,0,0], rotation: [0,0,0,1] }
      s.connections.push({ from_instance: 'p1', from_port: 'A', to_instance: 'p2', to_port: 'B', joint_type: 'fixed', slide_offset: 10 })
    })
    
    const snapshot = useBuildStore.getState().getSnapshot()
    
    // Mutate the connection simulating a slide edit
    useBuildStore.setState((s) => {
        s.connections[0].slide_offset = 20
    })

    expect(useBuildStore.getState().connections[0].slide_offset).toBe(20)

    // Revert
    useBuildStore.getState().revertSlideEdit(snapshot)

    expect(useBuildStore.getState().connections[0].slide_offset).toBe(10)
  })
})
