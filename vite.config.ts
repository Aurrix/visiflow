import { cp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(() => {
  const schemaArtifact = {
    name: 'visiflow-schema-artifact',
    async closeBundle() {
      await cp(resolve(__dirname, 'schemas'), resolve(__dirname, 'dist', 'schemas'), { recursive: true })
      const serviceWorker = await readFile(resolve(__dirname, 'public', 'sw.js'), 'utf8')
      await writeFile(resolve(__dirname, 'dist', 'sw.js'), serviceWorker.replace('__VISIFLOW_BUILD_ID__', Date.now().toString()))
    },
  }

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      viteSingleFile({ removeViteModuleLoader: true }),
      schemaArtifact,
    ],
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
