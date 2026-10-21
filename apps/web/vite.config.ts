import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// The API runs in `pnpm dev:worker` on :8790; the page calls it directly (as the apps do), with CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5310, strictPort: true },
})
