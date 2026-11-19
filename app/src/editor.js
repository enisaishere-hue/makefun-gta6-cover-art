// editor.js — the editor wiring for Sunset Cover Studio.
//
// Owns the cover model, the control panel, and the live preview canvas.
// Pointer input on the preview edits the selected panel directly:
// click a panel to select it, drag to move its photo, scroll to zoom it.
// All drawing goes through renderCover in cover.js, so the preview is
// exactly what the PNG export produces.

import {
  CAPTION_COLORS,
  EXPORT_SIZES,
  GRADES,
  LAYOUTS,
  createDefaultModel,
  ensureDisplayFont,
  layoutPanels,
  loadPhotoFromFile,
  loadPhotoFromUrl,
  panelAtPoint,
  renderCover,
  renderCoverToBlob,
} from "./cover.js";

const SAMPLE_PHOTOS = ["samples/pier.jpg", "samples/boulevard.jpg"];

function $(id) {
  return document.getElementById(id);
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

export class CoverEditor {
  constructor() {
    this.model = createDefaultModel();
    this.selectedPanel = 0;
    this.sampleIndex = 0;
    this.previewCanvas = $("previewCanvas");
    this.previewCtx = this.previewCanvas.getContext("2d");
    this.dragging = null;
    this.exporting = false;
  }

  // ---- startup -------------------------------------------------------

  async start() {
    this.buildControlButtons();
    this.bindControls();
    this.bindPreviewInput();
    await ensureDisplayFont();
    await this.applyUrlParams();
    this.redraw();
  }

  // URL parameters: demo mode and the shot parameters the screenshots use.
  // ?demo=1 loads a sample photo and a default caption.
  // ?photo=pier&caption=WORDS&layout=split&grade=vice-sunset&size=wide
  // ?shot=cover shows the cover alone, without the editor chrome.
  async applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get("shot");
    if (shot === "cover") document.body.classList.add("cover-only");
    const photo = params.get("photo");
    const caption = params.get("caption");
    const subtitle = params.get("subtitle");
    const layout = params.get("layout");
    const grade = params.get("grade");
    const size = params.get("size");
    if (layout && LAYOUTS.some((l) => l.id === layout)) this.model.layout = layout;
    if (grade && GRADES.some((g) => g.id === grade)) this.model.grade = grade;
    if (size && EXPORT_SIZES.some((s) => s.id === size)) this.model.sizeId = size;
    if (caption) this.model.title = caption;
    if (subtitle) this.model.subtitle = subtitle;
    if (params.get("demo") === "1" || photo) {
      const sample = photo
        ? `samples/${photo}.jpg`
        : SAMPLE_PHOTOS[this.sampleIndex];
      try {
        const img = await loadPhotoFromUrl(sample);
        this.setPanelPhoto(0, img);
      } catch (err) {
        this.showStatus(`Sample photo did not load: ${err.message}`);
      }
    }
    this.syncControls();
  }

  // ---- controls ------------------------------------------------------

  buildControlButtons() {
    this.buildButtonRow($("layoutRow"), LAYOUTS, "layout", (id) => {
      this.model.layout = id;
      this.selectedPanel = 0;
      this.syncControls();
      this.redraw();
    });
    this.buildButtonRow($("gradeRow"), GRADES, "grade", (id) => {
      this.model.grade = id;
      this.syncControls();
      this.redraw();
    });
    this.buildButtonRow($("sizeRow"), EXPORT_SIZES, "size", (id) => {
      this.model.sizeId = id;
      this.syncControls();
      this.redraw();
    });
    this.buildButtonRow(
      $("positionRow"),
      [
        { id: "top", label: "Top" },
        { id: "center", label: "Centre" },
        { id: "bottom", label: "Bottom" },
      ],
      "position",
      (id) => {
        this.model.captionPosition = id;
        this.syncControls();
        this.redraw();
      }
    );
    this.buildButtonRow($("colorRow"), CAPTION_COLORS, "color", (id) => {
      const found = CAPTION_COLORS.find((c) => c.id === id);
      if (found) this.model.titleColor = found.value;
      this.syncControls();
      this.redraw();
    });
  }

  buildButtonRow(container, items, group, onPick) {
    container.innerHTML = "";
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.dataset.group = group;
      button.dataset.value = item.id;
      button.textContent = item.label;
      button.title = item.hint || item.label;
      if (item.value) button.style.setProperty("--swatch", item.value);
      button.addEventListener("click", () => onPick(item.id));
      container.appendChild(button);
    }
  }

  bindControls() {
    $("titleInput").addEventListener("input", (e) => {
      this.model.title = e.target.value;
      this.redraw();
    });
    $("subtitleInput").addEventListener("input", (e) => {
      this.model.subtitle = e.target.value;
      this.redraw();
    });
    $("titleSize").addEventListener("input", (e) => {
      this.model.titleScale = Number(e.target.value);
      this.redraw();
    });
    $("outlineToggle").addEventListener("change", (e) => {
      this.model.titleOutline = e.target.checked;
      this.redraw();
    });
    $("glowToggle").addEventListener("change", (e) => {
      this.model.titleGlow = e.target.checked;
      this.redraw();
    });
    $("fillAllToggle").addEventListener("change", (e) => {
      this.model.fillAll = e.target.checked;
      this.redraw();
    });
    $("zoomSlider").addEventListener("input", (e) => {
      this.selectedSlot().zoom = Number(e.target.value);
      this.redraw();
    });
    $("rotateSlider").addEventListener("input", (e) => {
      this.selectedSlot().rotation = Number(e.target.value);
      this.redraw();
    });
    $("photoInput").addEventListener("change", (e) => {
      this.addPhotos(e.target.files);
      e.target.value = "";
    });
    $("replaceInput").addEventListener("change", (e) => {
      this.addPhotos(e.target.files, this.selectedPanel);
      e.target.value = "";
    });
    $("sampleButton").addEventListener("click", () => this.loadNextSample());
    $("exportButton").addEventListener("click", () => this.exportCover());
  }

  syncControls() {
    $("titleInput").value = this.model.title;
    $("subtitleInput").value = this.model.subtitle;
    $("titleSize").value = String(this.model.titleScale);
    $("outlineToggle").checked = this.model.titleOutline;
    $("glowToggle").checked = this.model.titleGlow;
    $("fillAllToggle").checked = this.model.fillAll;
    const slot = this.selectedSlot();
    $("zoomSlider").value = String(slot.zoom);
    $("rotateSlider").value = String(slot.rotation);
    $("panelLabel").textContent = `Panel ${this.selectedPanel + 1} of ${layoutPanels(this.model.layout).length}`;
    document.querySelectorAll(".choice").forEach((button) => {
      const group = button.dataset.group;
      const value = button.dataset.value;
      const active =
        (group === "layout" && value === this.model.layout) ||
        (group === "grade" && value === this.model.grade) ||
        (group === "size" && value === this.model.sizeId) ||
        (group === "position" && value === this.model.captionPosition) ||
        (group === "color" &&
          CAPTION_COLORS.find((c) => c.id === value)?.value === this.model.titleColor);
      button.classList.toggle("active", active);
    });
  }

  // ---- photos ----------------------------------------------------------

  selectedSlot() {
    return this.model.panels[this.selectedPanel];
  }

  setPanelPhoto(index, img) {
    this.model.panels[index].photo = img;
    this.model.panels[index].zoom = 1;
    this.model.panels[index].panX = 0;
    this.model.panels[index].panY = 0;
    this.model.panels[index].rotation = 0;
    this.syncControls();
    this.redraw();
  }

  async addPhotos(fileList, onlyPanel) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) {
      this.showStatus("Pick an image file to add a photo.");
      return;
    }
    const count = layoutPanels(this.model.layout).length;
    for (let i = 0; i < files.length; i++) {
      const target =
        onlyPanel !== undefined ? onlyPanel : (this.selectedPanel + i) % count;
      try {
        const img = await loadPhotoFromFile(files[i]);
        this.setPanelPhoto(target, img);
      } catch (err) {
        this.showStatus(err.message);
      }
    }
  }

  async loadNextSample() {
    const url = SAMPLE_PHOTOS[this.sampleIndex % SAMPLE_PHOTOS.length];
    this.sampleIndex += 1;
    try {
      const img = await loadPhotoFromUrl(url);
      this.setPanelPhoto(0, img);
      this.showStatus(`Loaded sample photo ${url.split("/").pop()}.`);
    } catch (err) {
      this.showStatus(`Sample photo did not load: ${err.message}`);
    }
  }

  // ---- preview input ---------------------------------------------------

  bindPreviewInput() {
    const canvas = this.previewCanvas;
    canvas.addEventListener("pointerdown", (e) => {
      const point = this.eventToCoverPoint(e);
      const hit = panelAtPoint(
        this.model, point.x, point.y,
        this.previewCanvas.width, this.previewCanvas.height
      );
      if (hit >= 0) {
        this.selectedPanel = hit;
        this.syncControls();
        this.dragging = { x: point.x, y: point.y, moved: false };
        canvas.setPointerCapture(e.pointerId);
        this.redraw();
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const point = this.eventToCoverPoint(e);
      const panels = layoutPanels(this.model.layout);
      const panel = panels[this.selectedPanel];
      const slot = this.selectedSlot();
      const pw = panel.w * this.previewCanvas.width;
      const ph = panel.h * this.previewCanvas.height;
      slot.panX = clamp(slot.panX + (point.x - this.dragging.x) / pw, -0.6, 0.6);
      slot.panY = clamp(slot.panY + (point.y - this.dragging.y) / ph, -0.6, 0.6);
      this.dragging.x = point.x;
      this.dragging.y = point.y;
      this.dragging.moved = true;
      this.redraw();
    });
    canvas.addEventListener("pointerup", () => {
      this.dragging = null;
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const slot = this.selectedSlot();
      slot.zoom = clamp(slot.zoom * Math.exp(-e.deltaY * 0.0012), 1, 4);
      $("zoomSlider").value = String(slot.zoom);
      this.redraw();
    }, { passive: false });
    canvas.addEventListener("dragover", (e) => e.preventDefault());
    canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      const point = this.eventToCoverPoint(e);
      const hit = panelAtPoint(
        this.model, point.x, point.y,
        this.previewCanvas.width, this.previewCanvas.height
      );
      this.addPhotos(e.dataTransfer.files, hit >= 0 ? hit : undefined);
    });
  }

  eventToCoverPoint(e) {
    const rect = this.previewCanvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.previewCanvas.width,
      y: ((e.clientY - rect.top) / rect.height) * this.previewCanvas.height,
    };
  }

  // ---- drawing ---------------------------------------------------------

  currentSize() {
    return EXPORT_SIZES.find((s) => s.id === this.model.sizeId) || EXPORT_SIZES[2];
  }

  redraw() {
    const size = this.currentSize();
    let w;
    let h;
    if (document.body.classList.contains("cover-only")) {
      // Cover-only mode fills the whole window, so a screenshot of the
      // window is a screenshot of the cover at the window's size.
      w = window.innerWidth;
      h = window.innerHeight;
    } else {
      const maxSide = 1100;
      const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
      w = Math.round(size.width * scale);
      h = Math.round(size.height * scale);
    }
    if (this.previewCanvas.width !== w || this.previewCanvas.height !== h) {
      this.previewCanvas.width = w;
      this.previewCanvas.height = h;
    }
    renderCover(this.previewCtx, this.model, w, h);
    // Selected-panel outline, drawn in preview pixels.
    const panels = layoutPanels(this.model.layout);
    const panel = panels[this.selectedPanel];
    if (panel && !document.body.classList.contains("cover-only")) {
      this.previewCtx.save();
      this.previewCtx.strokeStyle = "#ffd166";
      this.previewCtx.lineWidth = 3;
      this.previewCtx.setLineDash([10, 6]);
      if (panel.clip) {
        this.previewCtx.beginPath();
        panel.clip.forEach(([fx, fy], i) => {
          const px = fx * w;
          const py = fy * h;
          if (i === 0) this.previewCtx.moveTo(px, py);
          else this.previewCtx.lineTo(px, py);
        });
        this.previewCtx.closePath();
        this.previewCtx.stroke();
      } else {
        this.previewCtx.strokeRect(
          panel.x * w + 2, panel.y * h + 2,
          panel.w * w - 4, panel.h * h - 4
        );
      }
      this.previewCtx.restore();
    }
    const sizeNote = $("sizeNote");
    if (sizeNote) sizeNote.textContent = `Preview ${w} × ${h} — export is ${size.width} × ${size.height}.`;
  }

  // ---- export ----------------------------------------------------------

  async exportCover() {
    if (this.exporting) return;
    this.exporting = true;
    const button = $("exportButton");
    button.disabled = true;
    button.textContent = "Rendering…";
    try {
      const size = this.currentSize();
      const blob = await renderCoverToBlob(this.model, size.width, size.height);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sunset-cover-${size.width}x${size.height}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.showStatus(`Exported ${size.width} × ${size.height} PNG.`);
    } catch (err) {
      this.showStatus(`Export failed: ${err.message}`);
    } finally {
      this.exporting = false;
      button.disabled = false;
      button.textContent = "Export PNG";
    }
  }

  showStatus(message) {
    const note = $("statusNote");
    if (note) note.textContent = message;
  }
}
