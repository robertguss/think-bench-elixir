// Entry point bundled by Phoenix's esbuild (see `config :esbuild` in config/config.exs).
import "phoenix_html"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"

const container = document.getElementById("root")

if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
