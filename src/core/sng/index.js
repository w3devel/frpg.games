/**
 * SNG — Scriptable Network Graphics
 *
 * A programmatic 2D/3D graphics engine for VTT asset creation.
 * Generates PNG-compatible pixel data via Canvas and supports
 * compositing tiles, cubes, and animated sprites.
 *
 * SNG is system-agnostic: it understands shapes and layers,
 * not game rules.  Game systems bind to SNG through the
 * `systems/` layer.
 */

export const VERSION = '0.1.0';

/** Colour helpers ------------------------------------------------------- */

/**
 * Parse a CSS colour string and return an [r,g,b,a] Uint8ClampedArray-ready
 * array.  Accepts #rrggbb, #rrggbbaa, rgb(), rgba(), and named keywords
 * already resolved to hex by the caller.
 * @param {string} colour
 * @returns {{r:number,g:number,b:number,a:number}}
 */
export function parseColour(colour) {
  if (colour.startsWith('#')) {
    const hex = colour.slice(1);
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255,
      };
    }
  }
  // Fallback: transparent black
  return { r: 0, g: 0, b: 0, a: 0 };
}

/**
 * Blend two RGBA colours using standard over-compositing (Porter-Duff OVER).
 * @param {{r,g,b,a}} bg
 * @param {{r,g,b,a}} fg
 * @returns {{r,g,b,a}}
 */
export function blendOver(bg, fg) {
  const fa = fg.a / 255;
  const ba = bg.a / 255;
  const oa = fa + ba * (1 - fa);
  if (oa === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: Math.round((fg.r * fa + bg.r * ba * (1 - fa)) / oa),
    g: Math.round((fg.g * fa + bg.g * ba * (1 - fa)) / oa),
    b: Math.round((fg.b * fa + bg.b * ba * (1 - fa)) / oa),
    a: Math.round(oa * 255),
  };
}

/** Canvas abstraction ---------------------------------------------------- */

/**
 * An in-memory RGBA pixel buffer.  Works in both browser (via OffscreenCanvas
 * or regular Canvas) and Node.js (pure-JS fallback).
 */
export class SngBuffer {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** @type {Uint8ClampedArray} RGBA bytes, row-major */
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** Index of the first byte for pixel (x, y). */
  _idx(x, y) {
    return (y * this.width + x) * 4;
  }

  /** Set a pixel from an {r,g,b,a} object, blending over the existing value. */
  setPixel(x, y, colour) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = this._idx(x, y);
    const bg = {
      r: this.data[i],
      g: this.data[i + 1],
      b: this.data[i + 2],
      a: this.data[i + 3],
    };
    const out = blendOver(bg, colour);
    this.data[i]     = out.r;
    this.data[i + 1] = out.g;
    this.data[i + 2] = out.b;
    this.data[i + 3] = out.a;
  }

  /** Get the RGBA object for a pixel. */
  getPixel(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const i = this._idx(x, y);
    return {
      r: this.data[i],
      g: this.data[i + 1],
      b: this.data[i + 2],
      a: this.data[i + 3],
    };
  }

  /** Fill the entire buffer with a single colour. */
  fill(colour) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this._idx(x, y);
        this.data[i]     = colour.r;
        this.data[i + 1] = colour.g;
        this.data[i + 2] = colour.b;
        this.data[i + 3] = colour.a;
      }
    }
  }

  /** Composite another SngBuffer on top of this one at offset (dx, dy). */
  composite(other, dx = 0, dy = 0) {
    for (let y = 0; y < other.height; y++) {
      for (let x = 0; x < other.width; x++) {
        const src = other.getPixel(x, y);
        this.setPixel(x + dx, y + dy, src);
      }
    }
  }

  /**
   * Export to a browser ImageData object.
   * @returns {ImageData}
   */
  toImageData() {
    // ImageData is available in browsers and workers
    return new ImageData(this.data, this.width, this.height);
  }

  /**
   * Export to a data URL via an OffscreenCanvas (browser/worker only).
   * @param {string} [type='image/png']
   * @returns {Promise<string>}
   */
  async toDataURL(type = 'image/png') {
    const canvas = new OffscreenCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(this.toImageData(), 0, 0);
    const blob = await canvas.convertToBlob({ type });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Export to an ArrayBuffer containing raw PNG bytes via OffscreenCanvas.
   * @returns {Promise<ArrayBuffer>}
   */
  async toPNG() {
    const canvas = new OffscreenCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(this.toImageData(), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blob.arrayBuffer();
  }
}

/** Drawing primitives ---------------------------------------------------- */

/**
 * Draw a filled axis-aligned rectangle into a buffer.
 * @param {SngBuffer} buf
 * @param {number} x0  Left edge (inclusive)
 * @param {number} y0  Top edge (inclusive)
 * @param {number} x1  Right edge (exclusive)
 * @param {number} y1  Bottom edge (exclusive)
 * @param {{r,g,b,a}} colour
 */
export function drawRect(buf, x0, y0, x1, y1, colour) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      buf.setPixel(x, y, colour);
    }
  }
}

/**
 * Draw a filled circle using the midpoint algorithm.
 * @param {SngBuffer} buf
 * @param {number} cx  Centre X
 * @param {number} cy  Centre Y
 * @param {number} r   Radius
 * @param {{r,g,b,a}} colour
 */
export function drawCircle(buf, cx, cy, r, colour) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) {
        buf.setPixel(cx + dx, cy + dy, colour);
      }
    }
  }
}

/**
 * Draw a line using Bresenham's algorithm.
 * @param {SngBuffer} buf
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {{r,g,b,a}} colour
 */
export function drawLine(buf, x0, y0, x1, y1, colour) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    buf.setPixel(x, y, colour);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/**
 * Draw a filled convex polygon given an array of {x,y} vertices.
 * Uses scanline rasterisation.
 * @param {SngBuffer} buf
 * @param {Array<{x:number,y:number}>} verts
 * @param {{r,g,b,a}} colour
 */
export function drawPolygon(buf, verts, colour) {
  if (verts.length < 3) return;
  const minY = Math.max(0, Math.floor(Math.min(...verts.map(v => v.y))));
  const maxY = Math.min(buf.height - 1, Math.ceil(Math.max(...verts.map(v => v.y))));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k < xs.length - 1; k += 2) {
      const xStart = Math.max(0, Math.ceil(xs[k]));
      const xEnd   = Math.min(buf.width - 1, Math.floor(xs[k + 1]));
      for (let x = xStart; x <= xEnd; x++) {
        buf.setPixel(x, y, colour);
      }
    }
  }
}

/**
 * Draw a hexagon centred at (cx, cy) with the given size.
 * @param {SngBuffer} buf
 * @param {number} cx
 * @param {number} cy
 * @param {number} size  Distance from centre to vertex
 * @param {{r,g,b,a}} colour
 * @param {'flat'|'pointy'} [orientation='flat']
 */
export function drawHexagon(buf, cx, cy, size, colour, orientation = 'flat') {
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i + (orientation === 'flat' ? 0 : 30);
    const rad = (Math.PI / 180) * angleDeg;
    verts.push({ x: cx + size * Math.cos(rad), y: cy + size * Math.sin(rad) });
  }
  drawPolygon(buf, verts, colour);
}
