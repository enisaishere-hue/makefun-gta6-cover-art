// main.js — entry point for Sunset Cover Studio.
// Boots the cover editor once the page is ready.
import { CoverEditor } from "./editor.js";

window.addEventListener("DOMContentLoaded", () => {
  const editor = new CoverEditor();
  editor.start().catch((err) => {
    const note = document.getElementById("statusNote");
    if (note) note.textContent = `The editor did not start: ${err.message}`;
  });
});
