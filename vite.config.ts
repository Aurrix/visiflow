import { cp } from 'node:fs/promises'
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
