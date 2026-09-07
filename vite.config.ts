/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: { xlsx: ['xlsx'], supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    exclude: ['tests/**', 'node_modules/**'],
  },
})
