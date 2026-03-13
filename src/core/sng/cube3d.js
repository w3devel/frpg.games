/**
 * 3D Cube Creator
 *
 * Renders an isometric cube (top-down 3/4 view) for VTT miniatures and
 * objects.  The cube is built by projecting three parallelogram faces
 * (top, left, right) onto an SngBuffer using SNG drawing primitives.
 *
 * Coordinates use the standard isometric convention:
 *   - right face  = positive X axis
 *   - left face   = positive Y axis
 *   - top face    = positive Z axis
 */

import { SngBuffer, parseColour, drawPolygon } from './index.js';

/**
 * @typedef {Object} CubeFace
 * @property {string} colour   CSS hex colour
 * @property {number} [shade]  Multiplier 0–1 applied to r,g,b for shading
 */

/**
 * @typedef {Object} CubeScript
 * @property {string} id
 * @property {string} name
 * @property {number} size      Edge length in pixels for the isometric tile
 * @property {CubeFace} top
 * @property {CubeFace} left
 * @property {CubeFace} right
 * @property {Object} meta
 */

/** Shade an RGBA colour by multiplying rgb by a factor 0–1. */
function shadeColour(c, factor) {
  return {
    r: Math.round(c.r * factor),
    g: Math.round(c.g * factor),
    b: Math.round(c.b * factor),
    a: c.a,
  };
}

export class Cube3D {
  /**
   * @param {Partial<CubeScript>} script
   */
  constructor(script = {}) {
    this.script = {
      id:   script.id   ?? crypto.randomUUID(),
      name: script.name ?? 'Unnamed Cube',
      size: script.size ?? 64,
      top:   script.top   ?? { colour: '#cccccc', shade: 1.0 },
      left:  script.left  ?? { colour: '#888888', shade: 0.75 },
      right: script.right ?? { colour: '#aaaaaa', shade: 0.85 },
      meta:  script.meta  ?? {},
    };
  }

  /**
   * Render the cube into an SngBuffer.
   *
   * The output canvas is (2*size) wide and (2*size) tall, centred so that the
   * cube fits within it.
   *
   * @param {number} [resolution] Override the edge-length
   * @returns {SngBuffer}
   */
  render(resolution) {
    const s  = resolution ?? this.script.size;
    const w  = s * 2;
    const h  = Math.round(s * 2);
    const buf = new SngBuffer(w, h);

    // Isometric offsets — standard 2:1 ratio
    // half-width of a face tile = s, half-height = s/2
    const hw = s;       // half width of a rhombus face
    const hh = s / 2;  // half height of a rhombus face

    // Anchor point: top-centre of cube in screen space
    const ox = w / 2;
    const oy = s / 2;

    /**
     * Screen-space vertices for an isometric rhombus face.
     * Vertices ordered: top, right, bottom, left (clockwise).
     *
     * The 'top' face has its centre at (ox, oy + hh).
     * The cube height (Z) is `s` pixels.
     * Left face drops from the left edge of top down by `s`.
     * Right face drops from the right edge of top down by `s`.
     */

    // Top face vertices
    const topFace = [
      { x: ox,      y: oy },          // top-centre
      { x: ox + hw, y: oy + hh },     // right
      { x: ox,      y: oy + hh * 2 }, // bottom-centre
      { x: ox - hw, y: oy + hh },     // left
    ];

    // Left face vertices (below-left)
    const leftFace = [
      { x: ox - hw, y: oy + hh },          // top-left of top face
      { x: ox,      y: oy + hh * 2 },      // bottom-centre of top face
      { x: ox,      y: oy + hh * 2 + s },  // bottom-right of left face
      { x: ox - hw, y: oy + hh + s },       // bottom-left
    ];

    // Right face vertices (below-right)
    const rightFace = [
      { x: ox,      y: oy + hh * 2 },      // bottom-centre of top face
      { x: ox + hw, y: oy + hh },          // top-right of top face
      { x: ox + hw, y: oy + hh + s },       // bottom-right
      { x: ox,      y: oy + hh * 2 + s },  // bottom-left of right face
    ];

    // Draw faces back-to-front: left, right, top
    const leftCol  = shadeColour(parseColour(this.script.left.colour),  this.script.left.shade  ?? 0.75);
    const rightCol = shadeColour(parseColour(this.script.right.colour), this.script.right.shade ?? 0.85);
    const topCol   = shadeColour(parseColour(this.script.top.colour),   this.script.top.shade   ?? 1.0);

    drawPolygon(buf, leftFace,  leftCol);
    drawPolygon(buf, rightFace, rightCol);
    drawPolygon(buf, topFace,   topCol);

    return buf;
  }

  /** Serialise to plain object. */
  toJSON() {
    return this.script;
  }

  /** Deserialise from plain object. */
  static fromJSON(obj) {
    return new Cube3D(obj);
  }
}

/**
 * Create a simple stone block miniature.
 * @param {number} [size=32]
 * @returns {Cube3D}
 */
export function createStoneBlock(size = 32) {
  return new Cube3D({
    name:  'Stone Block',
    size,
    top:   { colour: '#aaaaaa', shade: 1.0 },
    left:  { colour: '#666666', shade: 1.0 },
    right: { colour: '#888888', shade: 1.0 },
  });
}

/**
 * Create a simple wood crate.
 * @param {number} [size=32]
 * @returns {Cube3D}
 */
export function createWoodCrate(size = 32) {
  return new Cube3D({
    name:  'Wood Crate',
    size,
    top:   { colour: '#c8a060', shade: 1.0 },
    left:  { colour: '#8c6030', shade: 1.0 },
    right: { colour: '#a87840', shade: 1.0 },
  });
}

/**
 * Polyhedron Honeycomb helper
 * -----------------------------------------------------------------------
 * For 3D dungeon environments the map can be built from a honeycomb of
 * hexagonal prisms or other polyhedra rather than squares.  This function
 * returns the six neighbour axial coordinates for a hex cell, enabling
 * callers to tile a 3D space using hex-prism units.
 *
 * Axial coordinates: (q, r) where s = -q - r (cube coordinates reduced).
 *
 * @param {number} q
 * @param {number} r
 * @returns {Array<{q:number,r:number}>}
 */
export function hexNeighbours(q, r) {
  return [
    { q: q + 1, r },
    { q: q - 1, r },
    { q,        r: r + 1 },
    { q,        r: r - 1 },
    { q: q + 1, r: r - 1 },
    { q: q - 1, r: r + 1 },
  ];
}

/**
 * Convert axial hex coordinates to pixel (screen) coordinates.
 * @param {number} q
 * @param {number} r
 * @param {number} size   Hex size in pixels
 * @param {'flat'|'pointy'} [orientation='flat']
 * @returns {{x:number, y:number}}
 */
export function hexToPixel(q, r, size, orientation = 'flat') {
  if (orientation === 'flat') {
    return {
      x: size * (3 / 2) * q,
      y: size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r),
    };
  }
  // pointy-top
  return {
    x: size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
    y: size * (3 / 2) * r,
  };
}
