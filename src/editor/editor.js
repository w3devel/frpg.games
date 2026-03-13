/**
 * VTT Asset Editor — main script
 *
 * Wires together:
 *   - SNG drawing engine
 *   - Game system Prolog rules
 *   - Canvas rendering
 *   - Animation frame management
 *   - Extension storage (save/load assets)
 *   - APNG export via Cloudflare Worker
 */

import { SngBuffer, parseColour, drawRect, drawCircle, drawLine, drawHexagon }
  from '../core/sng/index.js';
import { Tile2D, TILE_SHAPES } from '../core/sng/tile2d.js';
import { Cube3D }              from '../core/sng/cube3d.js';
import { registerSystem, getSystem, query as prologQuery }
  from '../systems/index.js';
import srd521      from '../systems/srd521/index.js';
import pathfinder  from '../systems/pathfinder/index.js';
import blackflag   from '../systems/blackflag/index.js';

// ─── Initialise game systems ─────────────────────────────────────────────────

registerSystem(srd521);
registerSystem(pathfinder);
registerSystem(blackflag);

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  activeTool:   'select',
  fgColour:     '#4a7c2f',
  bgColour:     '#2d5a1b',
  tileSize:     64,
  strokeWidth:  2,
  frameDelay:   100,
  activeSystem: 'srd521',
  mode:         'tile2d',
  frames:       [],   // Array of Tile2D | Cube3D scripts
  activeFrame:  0,
  activeLayer:  -1,
  playing:      false,
  playTimer:    null,
  dirty:        false,
};

// ─── DOM refs ────────────────────────────────────────────────────────────────

const canvas    = /** @type {HTMLCanvasElement} */ (document.getElementById('main-canvas'));
const overlay   = /** @type {HTMLCanvasElement} */ (document.getElementById('overlay-canvas'));
const ctx       = canvas.getContext('2d');
const octx      = overlay.getContext('2d');
const status    = document.getElementById('status-bar');

// ─── Boot ────────────────────────────────────────────────────────────────────

function boot() {
  // Restore settings from extension storage if available
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, settings => {
      if (settings) {
        state.activeSystem = settings.activeSystem ?? 'srd521';
        document.getElementById('sel-system').value = state.activeSystem;
      }
    });
  }

  // Create an initial empty frame
  newAsset();

  bindEvents();
  setStatus('Ready — ' + srd521.name);
}

// ─── Asset management ────────────────────────────────────────────────────────

function newAsset() {
  state.frames = [createEmptyFrame()];
  state.activeFrame = 0;
  state.activeLayer = -1;
  renderActiveFrame();
  updateLayerList();
  updateFrameIndicator();
  document.getElementById('inp-id').value = state.frames[0].script.id;
  document.getElementById('inp-name').value = state.frames[0].script.name;
  state.dirty = false;
}

function createEmptyFrame() {
  if (state.mode === 'cube3d') {
    return new Cube3D({ size: state.tileSize });
  }
  return new Tile2D({
    shape: state.mode === 'hex' ? TILE_SHAPES.HEX_FLAT : TILE_SHAPES.SQUARE,
    size:  state.tileSize,
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderActiveFrame() {
  const frame = state.frames[state.activeFrame];
  if (!frame) return;

  const buf = frame.render(state.tileSize);
  const imageData = new ImageData(buf.data, buf.width, buf.height);

  // Resize canvas if needed
  if (canvas.width !== buf.width || canvas.height !== buf.height) {
    canvas.width  = buf.width;
    canvas.height = buf.height;
    overlay.width  = buf.width;
    overlay.height = buf.height;
  }

  // Scale up for display (always render at at least 256px for visibility)
  const display = Math.max(256, Math.min(512, buf.width * 4));
  canvas.style.width  = `${display}px`;
  canvas.style.height = `${display}px`;
  overlay.style.width  = `${display}px`;
  overlay.style.height = `${display}px`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(imageData, 0, 0);
}

function renderCombatShape(shapeKey) {
  const system = getSystem(state.activeSystem);
  if (!system) return;
  const shape = system.combatShapes?.[shapeKey];
  if (!shape) { octx.clearRect(0, 0, overlay.width, overlay.height); return; }

  octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.strokeStyle = 'rgba(233,69,96,0.8)';
  octx.fillStyle   = 'rgba(233,69,96,0.15)';
  octx.lineWidth   = 2;

  const cx = overlay.width / 2;
  const cy = overlay.height / 2;
  const scale = overlay.width / state.tileSize;  // px per ft? — normalised

  if (shape.shape === 'circle' || shape.shape === 'burst' || shape.shape === 'emanation') {
    const r = (shape.radius / 5) * (overlay.width / 8) * scale;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.fill();
    octx.stroke();
  } else if (shape.shape === 'cone') {
    const len = (shape.length / 5) * (overlay.width / 8) * scale;
    const half = (shape.angle / 2) * Math.PI / 180;
    octx.beginPath();
    octx.moveTo(cx, cy);
    octx.arc(cx, cy, len, -Math.PI / 2 - half, -Math.PI / 2 + half);
    octx.closePath();
    octx.fill();
    octx.stroke();
  } else if (shape.shape === 'line') {
    const len = (shape.length / 5) * (overlay.width / 8) * scale;
    const hw  = Math.max(2, (shape.width / 5) * scale);
    octx.fillRect(cx - hw / 2, cy - len, hw, len);
    octx.strokeRect(cx - hw / 2, cy - len, hw, len);
  }
}

// ─── Thumb rendering ─────────────────────────────────────────────────────────

function renderThumb(frame, size = 40) {
  const buf    = frame.render(size);
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(buf.data, size, size), 0, 0);
  canvas.className = 'frame-thumb';
  return canvas;
}

function updateFrameStrip() {
  const strip = document.getElementById('frame-strip');
  strip.innerHTML = '';
  state.frames.forEach((f, i) => {
    const thumb = renderThumb(f);
    if (i === state.activeFrame) thumb.classList.add('active');
    thumb.addEventListener('click', () => { state.activeFrame = i; renderActiveFrame(); updateFrameIndicator(); updateFrameStrip(); });
    strip.appendChild(thumb);
  });
}

// ─── Layers ──────────────────────────────────────────────────────────────────

function updateLayerList() {
  const list  = document.getElementById('layer-list');
  list.innerHTML = '';
  const frame = state.frames[state.activeFrame];
  if (!frame || !frame.script.layers) return;
  frame.script.layers.forEach((layer, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${layer.type} — ${layer.colour}`;
    if (i === state.activeLayer) li.classList.add('active');
    li.addEventListener('click', () => { state.activeLayer = i; updateLayerList(); });
    list.appendChild(li);
  });
}

// ─── Drawing (canvas interaction) ────────────────────────────────────────────

let isDrawing = false;

canvas.addEventListener('mousedown', e => {
  if (state.activeTool === 'select') return;
  isDrawing = true;
  applyTool(e);
});

canvas.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  applyTool(e);
});

canvas.addEventListener('mouseup', () => { isDrawing = false; });

function applyTool(e) {
  const frame = state.frames[state.activeFrame];
  if (!frame || !frame.script) return;

  const layer = {
    type:   state.activeTool,
    colour: state.fgColour,
    params: {
      width:  state.strokeWidth,
      radius: Math.floor(state.tileSize / 4),
    },
  };

  if (typeof frame.addLayer === 'function') {
    frame.addLayer(layer);
    state.dirty = true;
    renderActiveFrame();
    updateLayerList();
  }
}

// ─── Frame timeline controls ──────────────────────────────────────────────────

function updateFrameIndicator() {
  document.getElementById('frame-indicator').textContent =
    `${state.activeFrame + 1} / ${state.frames.length}`;
}

// ─── Save / Load ─────────────────────────────────────────────────────────────

async function saveAsset() {
  const frame = state.frames[state.activeFrame];
  if (!frame) return;
  const key   = `asset:${frame.script.id}`;
  const value = JSON.stringify(state.frames.map(f => f.toJSON()));

  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'SAVE_ASSET', payload: { key, value } }, r => {
      setStatus(r?.ok ? 'Saved to extension storage.' : `Save error: ${r?.error}`);
    });
  } else {
    localStorage.setItem(key, value);
    setStatus('Saved to localStorage.');
  }
  state.dirty = false;
}

async function loadAssets() {
  const modal = document.getElementById('modal-assets');
  const list  = document.getElementById('asset-list');
  list.innerHTML = '';

  const populate = entries => {
    if (!entries || entries.length === 0) {
      list.innerHTML = '<li><em>No saved assets.</em></li>';
    } else {
      entries.forEach(({ key, value }) => {
        const li = document.createElement('li');
        const frames = JSON.parse(value);
        li.textContent = frames[0]?.name ?? key;
        li.addEventListener('click', () => {
          state.frames = frames.map(f => f.top && f.left ? Cube3D.fromJSON(f) : Tile2D.fromJSON(f));
          state.activeFrame = 0;
          renderActiveFrame();
          updateLayerList();
          updateFrameIndicator();
          updateFrameStrip();
          modal.close();
          setStatus(`Loaded: ${li.textContent}`);
        });
        list.appendChild(li);
      });
    }
    modal.showModal();
  };

  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'LIST_ASSETS' }, async r => {
      if (!r?.ok) { populate([]); return; }
      const entries = await Promise.all(r.keys.map(k =>
        new Promise(res =>
          chrome.runtime.sendMessage({ type: 'LOAD_ASSET', payload: { key: k } }, d =>
            res({ key: k, value: d?.data ?? 'null' })
          )
        )
      ));
      populate(entries);
    });
  } else {
    const entries = Object.keys(localStorage)
      .filter(k => k.startsWith('asset:'))
      .map(k => ({ key: k, value: localStorage.getItem(k) }));
    populate(entries);
  }
}

// ─── Export PNG ───────────────────────────────────────────────────────────────

async function exportPNG() {
  const frame = state.frames[state.activeFrame];
  if (!frame) return;
  const buf = frame.render(state.tileSize);
  const offscreen = new OffscreenCanvas(buf.width, buf.height);
  const oc = offscreen.getContext('2d');
  oc.putImageData(new ImageData(buf.data, buf.width, buf.height), 0, 0);
  const blob = await offscreen.convertToBlob({ type: 'image/png' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${frame.script.name ?? 'asset'}.png`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('PNG exported.');
}

// ─── Export APNG ─────────────────────────────────────────────────────────────

async function exportAPNG() {
  setStatus('Assembling APNG…');
  const pngs   = [];
  const delays = [];

  for (const frame of state.frames) {
    const buf = frame.render(state.tileSize);
    const offscreen = new OffscreenCanvas(buf.width, buf.height);
    const oc = offscreen.getContext('2d');
    oc.putImageData(new ImageData(buf.data, buf.width, buf.height), 0, 0);
    const blob = await offscreen.convertToBlob({ type: 'image/png' });
    pngs.push(Array.from(new Uint8Array(await blob.arrayBuffer())));
    delays.push(state.frameDelay);
  }

  const payload = { frames: pngs, delays, loops: 0 };

  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'ASSEMBLE_APNG', payload }, r => {
      if (!r?.ok) { setStatus(`APNG error: ${r?.error}`); return; }
      const blob2 = new Blob([new Uint8Array(r.data)], { type: 'image/apng' });
      const url   = URL.createObjectURL(blob2);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = 'animation.apng';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('APNG exported.');
    });
  } else {
    setStatus('APNG export requires the browser extension.');
  }
}

// ─── Prolog query ─────────────────────────────────────────────────────────────

function runPrologQuery() {
  const input  = document.getElementById('inp-prolog').value.trim();
  const output = document.getElementById('prolog-result');
  if (!input) return;
  try {
    const results = prologQuery(input, 20);
    if (results.length === 0) {
      output.textContent = 'false.';
    } else {
      output.textContent = results
        .map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`)
        .join('\n');
    }
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
}

// ─── Playback ────────────────────────────────────────────────────────────────

function togglePlay() {
  state.playing = !state.playing;
  document.getElementById('btn-play').textContent = state.playing ? '⏹ Stop' : '▶ Play';
  if (state.playing) {
    step();
  } else {
    clearTimeout(state.playTimer);
  }
}

function step() {
  if (!state.playing) return;
  state.activeFrame = (state.activeFrame + 1) % state.frames.length;
  renderActiveFrame();
  updateFrameIndicator();
  updateFrameStrip();
  state.playTimer = setTimeout(step, state.frameDelay);
}

// ─── Event binding ────────────────────────────────────────────────────────────

function bindEvents() {
  // Toolbar
  document.getElementById('btn-new').addEventListener('click', () => newAsset());
  document.getElementById('btn-save').addEventListener('click', () => saveAsset());
  document.getElementById('btn-load').addEventListener('click', () => loadAssets());
  document.getElementById('btn-export-png').addEventListener('click',  () => exportPNG());
  document.getElementById('btn-export-apng').addEventListener('click', () => exportAPNG());

  // System / mode selects
  document.getElementById('sel-system').addEventListener('change', e => {
    state.activeSystem = e.target.value;
    setStatus(`System: ${getSystem(state.activeSystem)?.name ?? state.activeSystem}`);
  });
  document.getElementById('sel-mode').addEventListener('change', e => {
    state.mode = e.target.value;
    newAsset();
  });

  // Tools
  document.querySelectorAll('button.tool').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('button.tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTool = btn.dataset.tool;
    });
  });

  // Colour pickers
  document.getElementById('colour-fg').addEventListener('input', e => { state.fgColour = e.target.value; });
  document.getElementById('colour-bg').addEventListener('input', e => { state.bgColour = e.target.value; });

  // Size inputs
  document.getElementById('inp-size').addEventListener('change', e => {
    state.tileSize = parseInt(e.target.value, 10);
    renderActiveFrame();
  });
  document.getElementById('inp-stroke').addEventListener('change', e => {
    state.strokeWidth = parseInt(e.target.value, 10);
  });
  document.getElementById('inp-delay').addEventListener('change', e => {
    state.frameDelay = parseInt(e.target.value, 10);
  });

  // Asset name
  document.getElementById('inp-name').addEventListener('input', e => {
    const frame = state.frames[state.activeFrame];
    if (frame?.script) { frame.script.name = e.target.value; state.dirty = true; }
  });

  // Prolog
  document.getElementById('btn-query').addEventListener('click', () => runPrologQuery());
  document.getElementById('inp-prolog').addEventListener('keydown', e => {
    if (e.key === 'Enter') runPrologQuery();
  });

  // Combat shape
  document.getElementById('btn-show-shape').addEventListener('click', () => {
    const key = document.getElementById('sel-shape').value;
    renderCombatShape(key);
  });

  // Layer management
  document.getElementById('btn-add-layer').addEventListener('click', () => {
    const frame = state.frames[state.activeFrame];
    if (!frame || !frame.addLayer) return;
    frame.addLayer({ type: state.activeTool || 'fill', colour: state.fgColour, params: {} });
    renderActiveFrame();
    updateLayerList();
    state.dirty = true;
  });
  document.getElementById('btn-del-layer').addEventListener('click', () => {
    const frame = state.frames[state.activeFrame];
    if (!frame?.script?.layers || state.activeLayer < 0) return;
    frame.script.layers.splice(state.activeLayer, 1);
    state.activeLayer = -1;
    renderActiveFrame();
    updateLayerList();
    state.dirty = true;
  });

  // Frame controls
  document.getElementById('btn-add-frame').addEventListener('click', () => {
    state.frames.push(createEmptyFrame());
    state.activeFrame = state.frames.length - 1;
    renderActiveFrame();
    updateFrameIndicator();
    updateFrameStrip();
  });
  document.getElementById('btn-del-frame').addEventListener('click', () => {
    if (state.frames.length <= 1) return;
    state.frames.splice(state.activeFrame, 1);
    state.activeFrame = Math.min(state.activeFrame, state.frames.length - 1);
    renderActiveFrame();
    updateFrameIndicator();
    updateFrameStrip();
  });
  document.getElementById('btn-prev-frame').addEventListener('click', () => {
    state.activeFrame = (state.activeFrame - 1 + state.frames.length) % state.frames.length;
    renderActiveFrame();
    updateFrameIndicator();
    updateFrameStrip();
  });
  document.getElementById('btn-next-frame').addEventListener('click', () => {
    state.activeFrame = (state.activeFrame + 1) % state.frames.length;
    renderActiveFrame();
    updateFrameIndicator();
    updateFrameStrip();
  });
  document.getElementById('btn-play').addEventListener('click', () => togglePlay());

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') { e.preventDefault(); saveAsset(); }
      if (e.key === 'n') { e.preventDefault(); newAsset(); }
    }
  });

  // Warn before unload if dirty
  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setStatus(msg) {
  if (status) status.textContent = msg;
}

// ─── Launch ──────────────────────────────────────────────────────────────────

boot();
