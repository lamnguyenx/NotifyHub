import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9070,
    proxy: {
      '/api': 'http://localhost:9080',
      '/events': {
        target: 'http://localhost:9080',
        ws: true
      }
    }
  },
  build: {
    outDir: 'static',
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
})