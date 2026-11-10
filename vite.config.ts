import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './', // relative assets: works under https://<user>.github.io/<repo>/
  plugins: [react(), tailwindcss()],
  build: { sourcemap: false },
})
