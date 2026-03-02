import { useState, useEffect } from 'react'
import { getLocalModelsIndex, deleteLocalModel, loadLocalModelData, type LocalModelMeta, parseExportedBuildData, saveLastModelId } from '../../services/localModels'
import { getCloudModels, loadCloudModelData, deleteCloudModel, type CloudModelMeta } from '../../services/cloudModels'
import { useBuildStore } from '../../stores/buildStore'
import { useUserStore } from '../../stores/userStore'

export function MyModels() {
  const { user } = useUserStore()
  const [localModels, setLocalModels] = useState<LocalModelMeta[]>([])
  const [cloudModels, setCloudModels] = useState<CloudModelMeta[]>([])
  const [loadingCloud, setLoadingCloud] = useState(false)

  useEffect(() => {
    setLocalModels(getLocalModelsIndex())
    
    const handleUpdate = () => setLocalModels(getLocalModelsIndex())
    window.addEventListener('knexforge:local-models-updated', handleUpdate)
    return () => window.removeEventListener('knexforge:local-models-updated', handleUpdate)
  }, [])

  useEffect(() => {
    if (user) {
      fetchCloudModels()
    } else {
      setCloudModels([])
    }
  }, [user])

  const fetchCloudModels = async () => {
    setLoadingCloud(true)
    try {
      const models = await getCloudModels()
      setCloudModels(models)
    } catch (err) {
      console.error('Failed to fetch cloud models:', err)
    } finally {
      setLoadingCloud(false)
    }
  }

  const handleOpenLocal = (id: string, title: string) => {
    const data = loadLocalModelData(id)
    if (!data) {
      alert('Could not load model data.')
      return
    }

    const { parts, connections } = parseExportedBuildData(data)

    const buildStore = useBuildStore.getState()
    buildStore.loadBuild(parts, connections)
    buildStore.setCurrentModelMeta(id, title)
    saveLastModelId(id)
    
    window.dispatchEvent(new CustomEvent('knexforge:open-builder'))
  }

  const handleOpenCloud = async (id: string) => {
    try {
      const { parts, connections, title } = await loadCloudModelData(id)
      const buildStore = useBuildStore.getState()
      buildStore.loadBuild(parts, connections)
      buildStore.setCurrentModelMeta(id, title)
      saveLastModelId(id)
      window.dispatchEvent(new CustomEvent('knexforge:open-builder'))
    } catch (err) {
      alert('Failed to load cloud model.')
    }
  }

  const handleDeleteLocal = (id: string) => {
    if (confirm('Delete this local model?')) {
      deleteLocalModel(id)
      setLocalModels(getLocalModelsIndex())
      
      const { currentModelId } = useBuildStore.getState()
      if (currentModelId === id) {
        useBuildStore.getState().setCurrentModelMeta(null, 'Untitled Build')
      }
    }
  }

  const handleDeleteCloud = async (id: string) => {
    if (confirm('Delete this cloud model permanently?')) {
      try {
        await deleteCloudModel(id)
        await fetchCloudModels()
        const { currentModelId } = useBuildStore.getState()
        if (currentModelId === id) {
          useBuildStore.getState().setCurrentModelMeta(null, 'Untitled Build')
        }
      } catch (err) {
        alert('Failed to delete cloud model.')
      }
    }
  }

  const handleNewModel = () => {
    const buildStore = useBuildStore.getState()
    buildStore.clearBuild()
    buildStore.setCurrentModelMeta(null, 'Untitled Build')
    saveLastModelId(null)
    window.dispatchEvent(new CustomEvent('knexforge:open-builder'))
  }

  const renderModelCard = (id: string, title: string, count: number, date: number | string, onOpen: () => void, onDelete: () => void, isCloud: boolean) => (
    <div
      key={id}
      style={{
        background: '#1a1a3e',
        border: `1px solid ${isCloud ? '#4488ff44' : '#2a2a4a'}`,
        borderRadius: 8,
        padding: 20,
        width: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#e0e0ff' }}>{title}</h3>
        {isCloud && <span style={{ fontSize: 10, background: '#4488ff33', color: '#4488ff', padding: '2px 6px', borderRadius: 10 }}>Cloud</span>}
      </div>
      <div style={{ fontSize: 13, color: '#aaa' }}>
        <div>{count} pieces</div>
        <div>{typeof date === 'number' ? new Date(date).toLocaleString() : new Date(date).toLocaleString()}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 10 }}>
        <button
          onClick={onOpen}
          style={{ flex: 1, background: '#2a2a5e', color: '#fff', border: 'none', padding: '8px', borderRadius: 4, cursor: 'pointer' }}
        >
          Open
        </button>
        <button
          onClick={onDelete}
          style={{ background: 'transparent', color: '#ff6666', border: '1px solid #ff6666', padding: '8px 12px', borderRadius: 4, cursor: 'pointer' }}
        >
          Delete
        </button>
      </div>
    </div>
  )

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

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {user && (
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ color: '#4488ff', borderBottom: '1px solid #4488ff33', paddingBottom: 8, marginBottom: 20 }}>Cloud Sync</h3>
            {loadingCloud ? (
              <div style={{ color: '#888' }}>Loading cloud models...</div>
            ) : cloudModels.length === 0 ? (
              <div style={{ color: '#888', fontStyle: 'italic' }}>No models synced to cloud yet.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                {cloudModels.map(m => renderModelCard(m.id, m.title, m.piece_count, m.updated_at, () => handleOpenCloud(m.id), () => handleDeleteCloud(m.id), true))}
              </div>
            )}
          </div>
        )}

        <div>
          <h3 style={{ color: '#8888cc', borderBottom: '1px solid #2a2a4a', paddingBottom: 8, marginBottom: 20 }}>Local Browser Storage</h3>
          {localModels.length === 0 ? (
            <div style={{ color: '#888', fontStyle: 'italic' }}>No local models found.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {localModels.map(m => renderModelCard(m.id, m.title, m.pieceCount, m.updatedAt, () => handleOpenLocal(m.id, m.title), () => handleDeleteLocal(m.id), false))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
