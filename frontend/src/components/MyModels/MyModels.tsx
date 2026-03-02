import { useState, useEffect } from 'react'
import { getLocalModelsIndex, deleteLocalModel, loadLocalModelData, type LocalModelMeta } from '../../services/localModels'
import { useBuildStore } from '../../stores/buildStore'
import type { PartInstance, Connection } from '../../types/parts'

export function MyModels() {
  const [models, setModels] = useState<LocalModelMeta[]>([])

  useEffect(() => {
    setModels(getLocalModelsIndex())
  }, [])

  const handleOpen = (id: string, title: string) => {
    const data = loadLocalModelData(id)
    if (!data) {
      alert('Could not load model data.')
      return
    }

    const partsList: PartInstance[] = data.model.parts.map((p) => ({
      instance_id: p.instance_id,
      part_id: p.part_id,
      position: p.position as [number, number, number],
      rotation: p.quaternion as [number, number, number, number],
      color: p.color,
    }))

    const connectionsList: Connection[] = data.model.connections.map((c) => {
      const fromLastDot = c.from.lastIndexOf('.')
      const toLastDot = c.to.lastIndexOf('.')
      return {
        from_instance: c.from.substring(0, fromLastDot),
        from_port: c.from.substring(fromLastDot + 1),
        to_instance: c.to.substring(0, toLastDot),
        to_port: c.to.substring(toLastDot + 1),
        joint_type: (c.joint_type as 'fixed' | 'revolute' | 'prismatic') || 'fixed',
      }
    })

    const buildStore = useBuildStore.getState()
    buildStore.loadBuild(partsList, connectionsList)
    buildStore.setCurrentModelMeta(id, title)
    
    // Fire event to switch tabs
    window.dispatchEvent(new CustomEvent('knexforge:open-builder'))
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this model?')) {
      deleteLocalModel(id)
      setModels(getLocalModelsIndex())
      
      const { currentModelId } = useBuildStore.getState()
      if (currentModelId === id) {
        useBuildStore.getState().setCurrentModelMeta(null, 'Untitled Build')
      }
    }
  }

  const handleNewModel = () => {
    const buildStore = useBuildStore.getState()
    buildStore.clearBuild()
    buildStore.setCurrentModelMeta(null, 'Untitled Build')
    window.dispatchEvent(new CustomEvent('knexforge:open-builder'))
  }

  return (
    <div style={{ padding: 40, width: '100%', height: '100%', overflowY: 'auto', background: '#0a0a1e', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, maxWidth: 1000, margin: '0 auto 30px' }}>
        <h2 style={{ color: '#8888cc', fontSize: 24, margin: 0 }}>My Models</h2>
        <button
          onClick={handleNewModel}
          style={{
            background: '#4488ff',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 14
          }}
        >
          + New Build
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
        {models.length === 0 && (
          <div style={{ color: '#888', fontStyle: 'italic', marginTop: 20 }}>
            No saved models yet. Start building!
          </div>
        )}

        {models.map(model => (
          <div
            key={model.id}
            style={{
              background: '#1a1a3e',
              border: '1px solid #2a2a4a',
              borderRadius: 8,
              padding: 20,
              width: 300,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <h3 style={{ margin: 0, fontSize: 18, color: '#e0e0ff' }}>{model.title}</h3>
            <div style={{ fontSize: 13, color: '#aaa' }}>
              <div>{model.pieceCount} pieces</div>
              <div>Last updated: {new Date(model.updatedAt).toLocaleString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 10 }}>
              <button
                onClick={() => handleOpen(model.id, model.title)}
                style={{ flex: 1, background: '#2a2a5e', color: '#fff', border: 'none', padding: '8px', borderRadius: 4, cursor: 'pointer' }}
              >
                Open
              </button>
              <button
                onClick={() => handleDelete(model.id)}
                style={{ background: 'transparent', color: '#ff6666', border: '1px solid #ff6666', padding: '8px 12px', borderRadius: 4, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
