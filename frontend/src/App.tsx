import { KnexViewer } from './components/Viewer/KnexViewer'
import { PartPalette } from './components/PartPalette'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import './App.css'

export default function App() {
  useKeyboardShortcuts()

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <PartPalette />
      <div style={{ flex: 1, position: 'relative' }}>
        <KnexViewer />
      </div>
    </div>
  )
}
