/**
 * Build menu with export and import functionality.
 */

import { useState } from 'react'
import { useBuildStore } from '../stores/buildStore'
import { useUserStore } from '../stores/userStore'
import { sidecarBridge, type ExportedBuildData } from '../services/sidecarBridge'
import { saveCloudModel } from '../services/cloudModels'
import { parseExportedBuildData } from '../services/localModels'

interface BuildMenuProps {
  onExportStart?: () => void
  onExportSuccess?: (data: ExportedBuildData) => void
  onImportStart?: () => void
}

export function BuildMenu({ onExportStart, onExportSuccess }: BuildMenuProps) {
  const { parts, connections, currentModelId, currentModelTitle, stabilityScore, setCurrentModelMeta } = useBuildStore()
  const { user } = useUserStore()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isSavingCloud, setIsSavingCloud] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ExportedBuildData | null>(null)

  const partsList = Object.values(parts)

  const handleCloudSave = async () => {
    if (!user) return
    if (partsList.length === 0) return

    setIsSavingCloud(true)
    try {
      // Use currentModelId if it's a UUID (cloud model)
      const cloudId = currentModelId?.includes('-') ? currentModelId : undefined
      const newId = await saveCloudModel(
        currentModelTitle,
        partsList,
        connections,
        stabilityScore,
        cloudId
      )
      if (!cloudId) {
        setCurrentModelMeta(newId, currentModelTitle)
      }
      alert('Model saved to cloud!')
    } catch (err) {
      alert(`Cloud save failed: ${String(err)}`)
    } finally {
      setIsSavingCloud(false)
    }
  }

  const handleExport = async () => {
    if (partsList.length === 0) {
      setExportError('Cannot export empty build')
      return
    }

    setIsExporting(true)
    setExportError(null)

    onExportStart?.()

    try {
      const result = await sidecarBridge.exportBuild(partsList, connections)

      if (result.success && result.data) {
        // Save to .knx file
        const filename = `build-${new Date().toISOString().slice(0, 10)}.knx`
        await sidecarBridge.saveKnxFile(result.data, filename)
        onExportSuccess?.(result.data)
      } else {
        setExportError(result.error || 'Export failed')
      }
    } catch (err) {
      setExportError(String(err))
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)

    try {
      const result = await sidecarBridge.loadKnxFile(file)

      if (result.success && result.data) {
        setImportPreview(result.data)
      } else {
        alert(`Failed to read file: ${result.error}`)
      }
    } catch (err) {
      alert(`Error reading file: ${String(err)}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleConfirmImport = async (mode: 'replace' | 'append') => {
    if (!importPreview) return

    try {
      const result = await sidecarBridge.loadBuild(importPreview)

      if (result) {
        const { parts, connections } = parseExportedBuildData(importPreview)

        if (mode === 'replace') {
          useBuildStore.getState().loadBuild(parts, connections)
        } else {
          useBuildStore.getState().appendBuild(parts, connections)
        }
        
        setImportPreview(null)
      } else {
        alert('Failed to import build')
      }
    } catch (err) {
      alert(`Error importing: ${String(err)}`)
    }
  }

  const cancelImport = () => {
    setImportPreview(null)
  }

  const buttonStyle: React.CSSProperties = {
    padding: '0 12px',
    height: 30,
    background: '#1a1a3e',
    border: '1px solid #2a2a4a',
    borderRadius: 4,
    color: '#ccc',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.1s',
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px' }}>
      {user && (
        <button
          onClick={handleCloudSave}
          disabled={isSavingCloud || partsList.length === 0}
          style={{
            ...buttonStyle,
            opacity: isSavingCloud || partsList.length === 0 ? 0.5 : 1,
            cursor: isSavingCloud || partsList.length === 0 ? 'default' : 'pointer',
            borderColor: '#4488ff',
            color: '#4488ff',
          }}
        >
          <span>☁️</span>
          {isSavingCloud ? 'Saving...' : 'Cloud Save'}
        </button>
      )}

      <button
        onClick={handleExport}
        disabled={isExporting || partsList.length === 0}
        style={{
          ...buttonStyle,
          opacity: isExporting || partsList.length === 0 ? 0.5 : 1,
          cursor: isExporting || partsList.length === 0 ? 'default' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!isExporting && partsList.length > 0) e.currentTarget.style.background = '#2a2a5e'
        }}
        onMouseLeave={(e) => {
          if (!isExporting && partsList.length > 0) e.currentTarget.style.background = '#1a1a3e'
        }}
      >
        <span>💾</span>
        {isExporting ? 'Exporting...' : 'Export'}
      </button>

      <label
        style={{
          ...buttonStyle,
          opacity: isImporting ? 0.5 : 1,
          cursor: isImporting ? 'default' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!isImporting) e.currentTarget.style.background = '#2a2a5e'
        }}
        onMouseLeave={(e) => {
          if (!isImporting) e.currentTarget.style.background = '#1a1a3e'
        }}
      >
        <input
          type="file"
          accept=".knx"
          onChange={handleImportSelect}
          disabled={isImporting}
          style={{ display: 'none' }}
        />
        <span>📂</span>
        {isImporting ? 'Reading...' : 'Import'}
      </label>

      {exportError && (
        <div
          style={{
            fontSize: 11,
            color: '#ff6666',
            background: 'rgba(255, 0, 0, 0.1)',
            padding: '4px 8px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {exportError}
          <button
            onClick={() => setExportError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ff6666',
              cursor: 'pointer',
              fontSize: 14,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Import preview modal */}
      {importPreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={cancelImport}
        >
          <div
            style={{
              background: '#1a1a2e',
              border: '1px solid #2a2a4a',
              borderRadius: 8,
              padding: 24,
              width: 500,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: '#4488ff', marginBottom: 16 }}>Import Build Preview</h3>
            
            <div style={{ background: '#0f0f23', padding: 12, borderRadius: 6, marginBottom: 20 }}>
              <p style={{ margin: '4px 0', fontSize: 13 }}>
                <strong style={{ color: '#888' }}>Title:</strong> {importPreview.manifest.title || 'Untitled'}
              </p>
              <p style={{ margin: '4px 0', fontSize: 13 }}>
                <strong style={{ color: '#888' }}>Pieces:</strong> {importPreview.manifest.piece_count}
              </p>
              <p style={{ margin: '4px 0', fontSize: 13 }}>
                <strong style={{ color: '#888' }}>Description:</strong> {importPreview.manifest.description || 'No description'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                onClick={cancelImport}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid #2a2a4a',
                  borderRadius: 4,
                  color: '#888',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmImport('append')}
                style={{
                  padding: '8px 16px',
                  background: '#1a1a3e',
                  border: '1px solid #4488ff',
                  borderRadius: 4,
                  color: '#4488ff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Append to Current
              </button>
              <button
                onClick={() => handleConfirmImport('replace')}
                style={{
                  padding: '8px 16px',
                  background: '#4488ff',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Replace Current Build
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
