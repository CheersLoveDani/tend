import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import App from "./App";

if (/android/i.test(navigator.userAgent)) document.documentElement.setAttribute("data-android", "");

async function start() {
  // Plain-browser preview (npm run dev): stand in for the Rust side.
  if (!("__TAURI_INTERNALS__" in window)) (await import("./lib/mock")).installMock();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
