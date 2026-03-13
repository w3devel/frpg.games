/**
 * 2D Tile Creator
 *
 * Builds a single VTT tile — a square (or hexagonal) map cell — using SNG
 * primitives.  Tiles are the basic unit of the grid layer.
 *
 * A tile stores its own SNG script as a structured object so it can be
 * serialised, stored in IndexedDB, and re-rendered at any resolution.
 */

import {
  SngBuffer,
  parseColour,
  drawRect,
  drawCircle,
  drawLine,
  drawHexagon,
} from './index.js';

export const TILE_SHAPES = Object.freeze({
  SQUARE:  'square',
  HEX_FLAT:   'hex-flat',
  HEX_POINTY: 'hex-pointy',
});

/**
 * @typedef {Object} TileLayer
 * @property {string} type    - 'fill' | 'stroke' | 'circle' | 'line' | 'hex'
 * @property {string} colour  - CSS hex colour (#rrggbb or #rrggbbaa)
 * @property {Object} params  - Shape-specific parameters
 */

/**
 * @typedef {Object} TileScript
 * @property {string} id
 * @property {string} name
 * @property {string} shape     - One of TILE_SHAPES
 * @property {number} size      - Tile size in pixels (square), or edge length (hex)
 * @property {TileLayer[]} layers
 * @property {Object} meta      - Free-form metadata (game system data, etc.)
 */

export class Tile2D {
  /**
   * @param {Partial<TileScript>} script
   */
  constructor(script = {}) {
    this.script = {
      id:     script.id     ?? crypto.randomUUID(),
      name:   script.name   ?? 'Unnamed Tile',
      shape:  script.shape  ?? TILE_SHAPES.SQUARE,
      size:   script.size   ?? 64,
      layers: script.layers ?? [],
      meta:   script.meta   ?? {},
    };
  }

  /** Add a layer to this tile's script. */
  addLayer(layer) {
    this.script.layers.push(layer);
    return this;
  }

  /**
   * Render the tile into an SngBuffer.
   * @param {number} [resolution]  Override size in pixels
   * @returns {SngBuffer}
   */
  render(resolution) {
    const size = resolution ?? this.script.size;
    const buf = new SngBuffer(size, size);

    for (const layer of this.script.layers) {
      const colour = parseColour(layer.colour ?? '#00000000');
      switch (layer.type) {
        case 'fill':
          drawRect(buf, 0, 0, size, size, colour);
          break;

        case 'stroke': {
          const w = layer.params?.width ?? 1;
          // Top
          drawRect(buf, 0, 0, size, w, colour);
          // Bottom
          drawRect(buf, 0, size - w, size, size, colour);
          // Left
          drawRect(buf, 0, 0, w, size, colour);
          // Right
          drawRect(buf, size - w, 0, size, size, colour);
          break;
        }

        case 'circle': {
          const r = layer.params?.radius ?? Math.floor(size / 3);
          drawCircle(buf, Math.floor(size / 2), Math.floor(size / 2), r, colour);
          break;
        }

        case 'line': {
          const p = layer.params ?? {};
          drawLine(
            buf,
            p.x0 ?? 0, p.y0 ?? 0,
            p.x1 ?? size - 1, p.y1 ?? size - 1,
            colour
          );
          break;
        }

        case 'hex': {
          const orient =
            this.script.shape === TILE_SHAPES.HEX_POINTY ? 'pointy' : 'flat';
          drawHexagon(
            buf,
            Math.floor(size / 2),
            Math.floor(size / 2),
            Math.floor(size / 2) - 2,
            colour,
            orient
          );
          break;
        }

        default:
          break;
      }
    }

    return buf;
  }

  /** Serialise to plain object (JSON-safe). */
  toJSON() {
    return this.script;
  }

  /** Deserialise from plain object. */
  static fromJSON(obj) {
    return new Tile2D(obj);
  }
}

/**
 * Build a simple grass tile.
 * @param {number} [size=64]
 * @returns {Tile2D}
 */
export function createGrassTile(size = 64) {
  return new Tile2D({ name: 'Grass', size })
    .addLayer({ type: 'fill',   colour: '#4a7c2f' })
    .addLayer({ type: 'stroke', colour: '#2d5a1b', params: { width: 1 } });
}

/**
 * Build a simple stone floor tile.
 * @param {number} [size=64]
 * @returns {Tile2D}
 */
export function createStoneTile(size = 64) {
  return new Tile2D({ name: 'Stone Floor', size })
    .addLayer({ type: 'fill',   colour: '#888888' })
    .addLayer({ type: 'stroke', colour: '#555555', params: { width: 2 } });
}

/**
 * Build a water tile.
 * @param {number} [size=64]
 * @returns {Tile2D}
 */
export function createWaterTile(size = 64) {
  return new Tile2D({ name: 'Water', size })
    .addLayer({ type: 'fill',   colour: '#1a6bb5' })
    .addLayer({ type: 'stroke', colour: '#0e4a82', params: { width: 1 } })
    .addLayer({ type: 'circle', colour: '#3d8fd1aa', params: { radius: Math.floor(size / 4) } });
}
