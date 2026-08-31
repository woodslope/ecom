import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { hydrateBrowserStorage } from "./application/browser-storage";
import "./styles.css";

void hydrateBrowserStorage().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
