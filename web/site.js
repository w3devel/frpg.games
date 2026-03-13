/**
 * Demo site script — frpg.games homepage
 *
 * Runs a live SNG demo on the homepage canvas and detects the extension.
 */

import { SngBuffer, parseColour, drawRect, drawCircle, drawHexagon }
  from '../src/core/sng/index.js';
import { Cube3D } from '../src/core/sng/cube3d.js';
import { createGrassTile, createStoneTile } from '../src/core/sng/tile2d.js';

const demoCanvas = document.getElementById('demo-canvas');

if (demoCanvas) {
  runDemo(demoCanvas);
}

/** Rotating demo that shows different SNG renders. */
async function runDemo(canvas) {
  const ctx = canvas.getContext('2d');
  const SIZE = 256;

  const renders = [
    () => createGrassTile(SIZE).render(),
    () => createStoneTile(SIZE).render(),
    () => {
      const buf = new SngBuffer(SIZE, SIZE);
      drawRect(buf, 0, 0, SIZE, SIZE, parseColour('#1a1a2e'));
      // Draw a hexagonal grid
      for (let q = -2; q <= 2; q++) {
        for (let r = -2; r <= 2; r++) {
          const x = SIZE / 2 + 50 * (3/2) * q;
          const y = SIZE / 2 + 50 * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
          drawHexagon(buf, x, y, 22, parseColour('#0f3460'), 'flat');
          drawHexagon(buf, x, y, 20, parseColour('#16213e'), 'flat');
        }
      }
      return buf;
    },
    () => new Cube3D({
      size: 60,
      top:   { colour: '#c8a060', shade: 1.0 },
      left:  { colour: '#8c6030', shade: 1.0 },
      right: { colour: '#a87840', shade: 1.0 },
    }).render(60),
  ];

  const labels = [
    'D&D SRD 5.2.1 — Grass Tile',
    'Pathfinder 2e — Stone Floor',
    'Black Flag RPG — Hex Grid',
    'Isometric 3D Cube (SNG)',
  ];

  const labelEl = document.getElementById('demo-system');
  let i = 0;

  function paint() {
    const buf = renders[i]();
    const id  = new ImageData(
      buf.data,
      buf.width,
      buf.height
    );

    // Create offscreen at buf size, then scale to 256
    const off = new OffscreenCanvas(buf.width, buf.height);
    off.getContext('2d').putImageData(id, 0, 0);

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(off, 0, 0, SIZE, SIZE);

    if (labelEl) labelEl.textContent = labels[i];
    i = (i + 1) % renders.length;
  }

  paint();
  setInterval(paint, 2000);
}

/** Extension detection */
window.addEventListener('message', event => {
  if (event.data?.frpg && event.data?.type === 'EXTENSION_READY') {
    const el = document.getElementById('ext-status');
    if (el) {
      el.textContent = `✓ Extension connected (v${event.data.payload?.version ?? '?'})`;
      el.classList.add('connected');
    }
  }
});

setTimeout(() => {
  const el = document.getElementById('ext-status');
  if (el && !el.classList.contains('connected')) {
    el.textContent = 'Extension not detected. Install it for full functionality.';
  }
}, 1500);
