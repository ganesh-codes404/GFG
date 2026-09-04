function showFatalError(err) {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = "";

  const pre = document.createElement("pre");
  pre.style.cssText =
    "position:fixed;inset:0;z-index:99999;overflow:auto;margin:0;" +
    "padding:24px;background:#1a0f28;color:#ffb4b4;" +
    "font-family:monospace;font-size:14px;white-space:pre-wrap;";

  pre.textContent =
    "App failed to start:\n\n" + (err?.stack || err?.message || String(err));

  root.appendChild(pre);
}

// Catch crashes that happen before React ever mounts (e.g. a broken
// import), so the page shows the real error instead of staying blank.
window.addEventListener("error", (e) => showFatalError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatalError(e.reason));

import("./bootstrap.jsx").catch(showFatalError);
