import { copyFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isEditorBuild = mode === 'editor'
  const editorArtifact = {
    name: 'visiflow-editor-artifact',
    enforce: 'post' as const,
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        if (!isEditorBuild) return html
        return html
          .replace(/<title>[\s\S]*?<\/title>/, '<title>VisiFlow Config Editor</title>')
          .replace(/\s*<script id="visiflow-config" type="application\/json">[\s\S]*?<\/script>/, '')
          .replace('/src/main.tsx', '/src/editor-main.tsx')
      },
    },
    async closeBundle() {
      if (!isEditorBuild) return
      const temporaryOutput = resolve(__dirname, 'dist-editor', 'index.html')
      const finalOutputDirectory = resolve(__dirname, 'dist')
      await mkdir(finalOutputDirectory, { recursive: true })
      await copyFile(temporaryOutput, resolve(finalOutputDirectory, 'config-editor.html'))
      await rm(resolve(__dirname, 'dist-editor'), { recursive: true, force: true })
    },
  }

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      viteSingleFile({ removeViteModuleLoader: true }),
      editorArtifact,
    ],
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      outDir: isEditorBuild ? 'dist-editor' : 'dist',
      emptyOutDir: true,
    },
  }
})
