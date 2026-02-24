/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Serves the root parts/ directory at /parts/ in dev,
 * and copies it into the build output for production.
 * Eliminates the need for a duplicated frontend/public/parts/ directory.
 */
function servePartsPlugin(): Plugin {
  const partsDir = path.resolve(__dirname, '..', 'parts')

  return {
    name: 'serve-parts',

    configureServer(server) {
      server.middlewares.use('/parts', (req, res, next) => {
        const filePath = path.join(partsDir, req.url ?? '')
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader('Access-Control-Allow-Origin', '*')
          fs.createReadStream(filePath).pipe(res)
        } else {
          next()
        }
      })
    },

    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist', 'parts')
      copyDirSync(partsDir, outDir)
    },
  }
}

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

export default defineConfig({
  plugins: [react(), servePartsPlugin()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
