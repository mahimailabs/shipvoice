import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./console.css";
import App from "./App.tsx";
import { Router } from "./demo/router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
