// cover.js — the cover renderer for Sunset Cover Studio.
//
// One pure drawing routine, renderCover, draws a finished cover onto any
// 2D canvas context. The editor preview and the PNG export call the same
// routine with the same model, so what you see is what you download.
// No network is used here: photos come from Image objects the editor
// loaded from the user's own machine or from the bundled samples.

export const EXPORT_SIZES = [
  { id: "square", label: "1080 × 1080 · square post", width: 1080, height: 1080 },
  { id: "portrait", label: "1080 × 1350 · portrait post", width: 1080, height: 1350 },
  { id: "wide", label: "1920 × 1080 · wide post", width: 1920, height: 1080 },
];

export const LAYOUTS = [
  { id: "hero", label: "Hero", hint: "One photo, full bleed" },
  { id: "strips", label: "Strips", hint: "Three vertical strips" },
  { id: "split", label: "Split", hint: "Big panel + two stacked" },
  { id: "grid", label: "Grid", hint: "Four-panel grid" },
  { id: "diagonal", label: "Diagonal", hint: "Diagonal split" },
];

export const GRADES = [
  { id: "vice-sunset", label: "Vice Sunset", hint: "Warm orange-pink, golden light" },
  { id: "neon-night", label: "Neon Night", hint: "Magenta and cyan glow" },
  { id: "teal-gold", label: "Teal Gold", hint: "Teal shadows, gold highlights" },
  { id: "mono-noir", label: "Mono Noir", hint: "Black and white, film grain" },
];

export const CAPTION_COLORS = [
  { id: "white", value: "#ffffff", label: "White" },
  { id: "gold", value: "#ffd166", label: "Gold" },
  { id: "pink", value: "#ff5e8a", label: "Pink" },
  { id: "cyan", value: "#6ef3ff", label: "Cyan" },
  { id: "black", value: "#111111", label: "Black" },
];

// A panel slot in a layout, in fractions of the cover (0..1).
// clip is null for a rectangle, or an array of [x, y] fraction points.
function panelRect(x, y, w, h, clip) {
  return { x, y, w, h, clip: clip || null };
}

export function layoutPanels(layoutId) {
  const g = 0.018; // gutter between panels, fraction of width
  switch (layoutId) {
    case "strips": {
      const w = (1 - 2 * g) / 3;
      return [
        panelRect(0, 0, w, 1),
        panelRect(w + g, 0, w, 1),
        panelRect(2 * (w + g), 0, w, 1),
      ];
    }
    case "split": {
      const left = 0.6;
      const right = 1 - left - g;
      const half = (1 - g) / 2;
      return [
        panelRect(0, 0, left, 1),
        panelRect(left + g, 0, right, half),
        panelRect(left + g, half + g, right, half),
      ];
    }
    case "grid": {
      const w = (1 - g) / 2;
      const h = (1 - g) / 2;
      return [
        panelRect(0, 0, w, h),
        panelRect(w + g, 0, w, h),
        panelRect(0, h + g, w, h),
        panelRect(w + g, h + g, w, h),
      ];
    }
    case "diagonal": {
      return [
        panelRect(0, 0, 1, 1, [[0, 0], [1, 0], [1, 0.34], [0, 0.74]]),
        panelRect(0, 0, 1, 1, [[0, 0.74], [1, 0.34], [1, 1], [0, 1]]),
      ];
    }
    case "hero":
    default:
      return [panelRect(0, 0, 1, 1)];
  }
}

export function createDefaultModel() {
  return {
    layout: "split",
    grade: "vice-sunset",
    sizeId: "wide",
    title: "SUNSET HEIST",
    subtitle: "A story in neon and gold",
    titleScale: 1.0, // multiplies the default title size
    titleColor: "#ffffff",
    titleOutline: true,
    titleGlow: true,
    captionPosition: "bottom",
    fillAll: true,
    panels: [
      { photo: null, zoom: 1, panX: 0, panY: 0, rotation: 0 },
      { photo: null, zoom: 1, panX: 0, panY: 0, rotation: 0 },
      { photo: null, zoom: 1, panX: 0, panY: 0, rotation: 0 },
      { photo: null, zoom: 1, panX: 0, panY: 0, rotation: 0 },
    ],
  };
}

// Seeded random: the film grain looks the same on every render, so the
// preview and the exported PNG match pixel for pixel.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
function makeGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement("canvas");
  tile.width = 140;
  tile.height = 140;
  const tctx = tile.getContext("2d");
  const image = tctx.createImageData(140, 140);
  const rand = mulberry32(20261119);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  tctx.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

function clipPanelPath(ctx, panel, width, height) {
  ctx.beginPath();
  if (panel.clip) {
    panel.clip.forEach(([fx, fy], i) => {
      const px = fx * width;
      const py = fy * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  } else {
    ctx.rect(panel.x * width, panel.y * height, panel.w * width, panel.h * height);
  }
  ctx.clip();
}

function drawPhotoInPanel(ctx, panel, slot, width, height, gradeId) {
  const px = panel.x * width;
  const py = panel.y * height;
  const pw = panel.w * width;
  const ph = panel.h * height;
  const photo = slot.photo;
  ctx.save();
  clipPanelPath(ctx, panel, width, height);
  if (photo) {
    const base = Math.max(pw / photo.naturalWidth, ph / photo.naturalHeight);
    const scale = base * slot.zoom;
    const cx = px + pw / 2 + slot.panX * pw;
    const cy = py + ph / 2 + slot.panY * ph;
    ctx.translate(cx, cy);
    ctx.rotate((slot.rotation * Math.PI) / 180);
    if (gradeId === "mono-noir") ctx.filter = "grayscale(1) contrast(1.06)";
    ctx.drawImage(
      photo,
      (-photo.naturalWidth * scale) / 2,
      (-photo.naturalHeight * scale) / 2,
      photo.naturalWidth * scale,
      photo.naturalHeight * scale
    );
    ctx.filter = "none";
  } else {
    // Empty slot: a dark placeholder so the layout still reads.
    const grad = ctx.createLinearGradient(px, py, px + pw, py + ph);
    grad.addColorStop(0, "#2b2b3a");
    grad.addColorStop(1, "#17171f");
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `600 ${Math.round(Math.min(pw, ph) * 0.055)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Drop a photo here", px + pw / 2, py + ph / 2);
  }
  ctx.restore();
  // Hairline edge between panels.
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(1, width * 0.002);
  clipPanelPath(ctx, panel, width, height);
  ctx.stroke();
  ctx.restore();
}

function applyGradeTint(ctx, gradeId, width, height) {
  ctx.save();
  if (gradeId === "vice-sunset") {
    const warm = ctx.createLinearGradient(0, 0, width, height);
    warm.addColorStop(0, "rgba(255, 170, 60, 0.16)");
    warm.addColorStop(0.55, "rgba(255, 110, 80, 0.10)");
    warm.addColorStop(1, "rgba(255, 45, 120, 0.20)");
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, width, height);
    const sun = ctx.createRadialGradient(
      width * 0.72, height * 0.2, 0,
      width * 0.72, height * 0.2, width * 0.55
    );
    sun.addColorStop(0, "rgba(255, 200, 90, 0.22)");
    sun.addColorStop(1, "rgba(255, 200, 90, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);
  } else if (gradeId === "neon-night") {
    const magenta = ctx.createRadialGradient(
      width * 0.15, height * 0.1, 0,
      width * 0.15, height * 0.1, width * 0.7
    );
    magenta.addColorStop(0, "rgba(255, 40, 160, 0.28)");
    magenta.addColorStop(1, "rgba(255, 40, 160, 0)");
    const cyan = ctx.createRadialGradient(
      width * 0.9, height * 0.95, 0,
      width * 0.9, height * 0.95, width * 0.7
    );
    cyan.addColorStop(0, "rgba(0, 220, 255, 0.26)");
    cyan.addColorStop(1, "rgba(0, 220, 255, 0)");
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = magenta;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = cyan;
    ctx.fillRect(0, 0, width, height);
  } else if (gradeId === "teal-gold") {
    const teal = ctx.createLinearGradient(0, 0, 0, height);
    teal.addColorStop(0, "rgba(0, 140, 140, 0.20)");
    teal.addColorStop(1, "rgba(0, 60, 80, 0.26)");
    const gold = ctx.createRadialGradient(
      width * 0.5, height * 0.15, 0,
      width * 0.5, height * 0.15, width * 0.6
    );
    gold.addColorStop(0, "rgba(255, 200, 90, 0.20)");
    gold.addColorStop(1, "rgba(255, 200, 90, 0)");
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = teal;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, width, height);
  } else if (gradeId === "mono-noir") {
    const light = ctx.createRadialGradient(
      width * 0.5, height * 0.42, 0,
      width * 0.5, height * 0.42, width * 0.75
    );
    light.addColorStop(0, "rgba(255,255,255,0.10)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

function applyVignetteAndGrain(ctx, gradeId, width, height) {
  const vig = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.42,
    width / 2, height / 2, Math.max(width, height) * 0.75
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, gradeId === "mono-noir" ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.30)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
  const tile = makeGrainTile();
  const pattern = ctx.createPattern(tile, "repeat");
  ctx.save();
  ctx.globalAlpha = gradeId === "mono-noir" ? 0.10 : 0.05;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function wrapCaptionLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth || !line) line = trial;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function captionBand(ctx, model, width, height) {
  const pos = model.captionPosition;
  const bandH = height * 0.34;
  const bandY = pos === "top" ? 0 : pos === "center" ? (height - bandH) / 2 : height - bandH;
  const scrim = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  if (pos === "top") {
    scrim.addColorStop(0, "rgba(0,0,0,0.62)");
    scrim.addColorStop(1, "rgba(0,0,0,0)");
  } else if (pos === "center") {
    scrim.addColorStop(0, "rgba(0,0,0,0)");
    scrim.addColorStop(0.5, "rgba(0,0,0,0.55)");
    scrim.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    scrim.addColorStop(0, "rgba(0,0,0,0)");
    scrim.addColorStop(1, "rgba(0,0,0,0.66)");
  }
  ctx.fillStyle = scrim;
  ctx.fillRect(0, bandY, width, bandH);
  return { bandY, bandH };
}

function drawCaption(ctx, model, width, height) {
  const title = (model.title || "").trim().toUpperCase();
  const subtitle = (model.subtitle || "").trim();
  if (!title && !subtitle) return;
  const { bandY, bandH } = captionBand(ctx, model, width, height);
  const margin = width * 0.045;
  const maxTextW = width - margin * 2;
  const glowColor =
    model.grade === "neon-night"
      ? "#ff2ea6"
      : model.grade === "teal-gold"
        ? "#ffcf5c"
        : model.grade === "mono-noir"
          ? "#ffffff"
          : "#ff7a3d";

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Measure the title first, shrinking it until it wraps to at most 2 lines.
  let titleLines = [];
  let size = 0;
  let lineH = 0;
  if (title) {
    size = width * 0.105 * model.titleScale;
    ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    ctx.letterSpacing = `${Math.round(size * 0.02)}px`;
    while (size > width * 0.04 && wrapCaptionLines(ctx, title, maxTextW).length > 2) {
      size *= 0.92;
      ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    }
    titleLines = wrapCaptionLines(ctx, title, maxTextW);
    lineH = size * 1.02;
  }

  // Measure the subtitle.
  let subLines = [];
  let subSize = 0;
  let subLineH = 0;
  if (subtitle) {
    subSize = Math.max(10, width * 0.028 * model.titleScale);
    ctx.font = `700 ${subSize}px Anton, "Arial Narrow", sans-serif`;
    ctx.letterSpacing = `${Math.round(subSize * 0.14)}px`;
    subLines = wrapCaptionLines(ctx, subtitle.toUpperCase(), maxTextW);
    subLineH = subSize * 1.35;
  }

  // Stack the whole caption block, then anchor it inside its band so
  // nothing ever runs off the cover.
  const gap = title && subtitle ? size * 0.30 : 0;
  const blockH = titleLines.length * lineH + gap + subLines.length * subLineH;
  let blockTop;
  if (model.captionPosition === "top") blockTop = bandY + bandH * 0.16;
  else if (model.captionPosition === "center") blockTop = bandY + (bandH - blockH) / 2;
  else blockTop = height - height * 0.035 - blockH;

  let y = blockTop + lineH;
  for (const line of titleLines) {
    ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    ctx.letterSpacing = `${Math.round(size * 0.02)}px`;
    ctx.save();
    if (model.titleGlow) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = size * 0.22;
    }
    if (model.titleOutline) {
      ctx.lineWidth = Math.max(1.5, size * 0.075);
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(10, 8, 16, 0.9)";
      ctx.strokeText(line, margin, y);
    }
    ctx.fillStyle = model.titleColor;
    ctx.fillText(line, margin, y);
    ctx.restore();
    y += lineH;
  }
  // Anchor the subtitle to the measured block, not to the loop cursor:
  // the loop above already advanced one line height past the last line.
  y = blockTop + titleLines.length * lineH + gap;
  ctx.font = `700 ${subSize}px Anton, "Arial Narrow", sans-serif`;
  ctx.letterSpacing = `${Math.round(subSize * 0.14)}px`;
  for (const line of subLines) {
    const baseline = y + subSize;
    ctx.save();
    ctx.lineWidth = Math.max(1, subSize * 0.09);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(10, 8, 16, 0.85)";
    ctx.strokeText(line, margin, baseline);
    ctx.fillStyle = "#ffd166";
    ctx.fillText(line, margin, baseline);
    ctx.restore();
    y += subLineH;
  }
  ctx.restore();
}

// Draw the whole cover. Panels first, then the colour grade, then the
// caption, then a thin poster frame. Deterministic for a fixed model.
export function renderCover(ctx, model, width, height) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101018";
  ctx.fillRect(0, 0, width, height);
  const panels = layoutPanels(model.layout);
  const sharedPhoto = model.fillAll ? model.panels[0].photo : null;
  panels.forEach((panel, i) => {
    const slot = model.panels[i] || model.panels[0];
    const photo = model.fillAll ? sharedPhoto : slot.photo;
    const view = model.fillAll
      ? { photo, zoom: slot.zoom, panX: slot.panX, panY: slot.panY, rotation: slot.rotation }
      : slot;
    drawPhotoInPanel(ctx, panel, view, width, height, model.grade);
  });
  applyGradeTint(ctx, model.grade, width, height);
  applyVignetteAndGrain(ctx, model.grade, width, height);
  drawCaption(ctx, model, width, height);
  // Thin poster frame.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(2, width * 0.004);
  ctx.strokeRect(
    width * 0.012, height * 0.012,
    width * 0.976, height * 0.976
  );
  ctx.restore();
}

export function loadPhotoFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file is not a photo"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function loadPhotoFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

export async function ensureDisplayFont() {
  try {
    await document.fonts.load('64px Anton');
    await document.fonts.ready;
  } catch (err) {
    // The poster falls back to a narrow system font; never block the app.
  }
}

// Render a cover offscreen and return it as a PNG blob.
export async function renderCoverToBlob(model, width, height) {
  await ensureDisplayFont();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  renderCover(canvas.getContext("2d"), model, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
      "image/png"
    );
  });
}

// Hit-test a point (in cover pixels) against the layout's panels.
// Returns the panel index, or -1 when the point is outside every panel.
export function panelAtPoint(model, x, y, width, height) {
  const panels = layoutPanels(model.layout);
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    if (p.clip) {
      let inside = false;
      const pts = p.clip.map(([fx, fy]) => [fx * width, fy * height]);
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [ax, ay] = pts[a];
        const [bx, by] = pts[b];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
          inside = !inside;
        }
      }
      if (inside) return i;
    } else if (
      x >= p.x * width && x <= (p.x + p.w) * width &&
      y >= p.y * height && y <= (p.y + p.h) * height
    ) {
      return i;
    }
  }
  return -1;
}
