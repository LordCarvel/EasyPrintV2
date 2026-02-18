import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const pagesBase = repository ? `/${repository}/` : '/'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? pagesBase : '/',
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  }
})
