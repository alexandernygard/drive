import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// The API runs in `pnpm dev:worker` on :8790; the page calls it directly (as the apps do), with CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One React and component library for the dashboard and the drive package's components.
  resolve: { dedupe: ["react", "react-dom", "@alexandernygard/components", "lucide-react"] },
  server: { port: 5310, strictPort: true },
})
