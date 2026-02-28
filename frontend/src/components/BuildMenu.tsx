/**
 * Build menu with export and import functionality.
 */

import { useState } from 'react'
import { useBuildStore } from '../stores/buildStore'
import { sidecarBridge, type ExportedBuildData } from '../services/sidecarBridge'
import type { PartInstance, Connection } from '../types/parts'

interface BuildMenuProps {
  onExportStart?: () => void
  onExportSuccess?: (data: ExportedBuildData) => void
  onImportStart?: () => void
}

export function BuildMenu({ onExportStart, onExportSuccess }: BuildMenuProps) {
  const { parts, connections } = useBuildStore()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ExportedBuildData | null>(null)

  const partsList = Object.values(parts)

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
    setImportFile(file)

    try {
      const result = await sidecarBridge.loadKnxFile(file)

      if (result.success && result.data) {
        setImportPreview(result.data)
      } else {
        alert(`Failed to read file: ${result.error}`)
        setImportFile(null)
      }
    } catch (err) {
      alert(`Error reading file: ${String(err)}`)
      setImportFile(null)
    } finally {
      setIsImporting(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview) return

    try {
      const result = await sidecarBridge.loadBuild(importPreview)

      if (result) {
        // Convert imported data to build store format
        const partsList: PartInstance[] = importPreview.model.parts.map((p) => ({
          instance_id: p.instance_id,
          part_id: p.part_id,
          position: p.position as [number, number, number],
          rotation: p.quaternion as [number, number, number, number],
          color: p.color,
        }))

        const connectionsList: Connection[] = importPreview.model.connections.map((c) => ({
          from_instance: c.from.split('.')[0],
          from_port: c.from.split('.')[1],
          to_instance: c.to.split('.')[0],
          to_port: c.to.split('.')[1],
          joint_type: c.joint_type,
        }))

        useBuildStore.getState().loadBuild(partsList, connectionsList)
        setImportPreview(null)
        setImportFile(null)
      } else {
        alert('Failed to import build')
      }
    } catch (err) {
      alert(`Error importing: ${String(err)}`)
    }
  }

  const cancelImport = () => {
    setImportPreview(null)
    setImportFile(null)
  }

  return (
    <div className="build-menu">
      <button onClick={handleExport} disabled={isExporting || partsList.length === 0}>
        {isExporting ? 'Exporting...' : `Export (${partsList.length} parts)`}
      </button>

      <label className="import-button">
        <input
          type="file"
          accept=".knx"
          onChange={handleImportSelect}
          disabled={isImporting}
          style={{ display: 'none' }}
        />
        {isImporting ? 'Reading...' : 'Import .knx'}
      </label>

      {exportError && (
        <div className="error-message">
          Export error: {exportError}
          <button onClick={() => setExportError(null)}>×</button>
        </div>
      )}

      {/* Import preview modal */}
      {importPreview && (
        <div className="modal-overlay" onClick={cancelImport}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Import Build Preview</h3>
            <div className="preview-info">
              <p><strong>Title:</strong> {importPreview.manifest.title || 'Untitled'}</p>
              <p><strong>Pieces:</strong> {importPreview.manifest.piece_count}</p>
              <p><strong>Description:</strong> {importPreview.manifest.description || 'No description'}</p>
            </div>

            <h4>Parts ({importPreview.model.parts.length}):</h4>
            <ul className="parts-list">
              {importPreview.model.parts.map((p) => (
                <li key={p.instance_id}>
                  {p.part_id} - Position: [{p.position.join(', ')}]
                </li>
              ))}
            </ul>

            <h4>Connections ({importPreview.model.connections.length}):</h4>
            <ul className="connections-list">
              {importPreview.model.connections.map((c, i) => (
                <li key={i}>
                  {c.from} → {c.to} ({c.joint_type})
                </li>
              ))}
            </ul>

            <div className="modal-actions">
              <button onClick={cancelImport} className="btn-secondary">Cancel</button>
              <button onClick={handleConfirmImport} className="btn-primary">
                Replace Current Build
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
