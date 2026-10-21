import { Toaster, TooltipProvider } from "@alexandernygard/components"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./index.css"

const theme = (() => {
  try {
    return localStorage.getItem("drive.theme")
  } catch {
    return null
  }
})()
if (theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster position="bottom-center" />
    </TooltipProvider>
  </StrictMode>,
)
