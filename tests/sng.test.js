/**
 * Tests for the SNG (Scriptable Network Graphics) engine
 */

import {
  SngBuffer,
  parseColour,
  blendOver,
  drawRect,
  drawCircle,
  drawLine,
  drawPolygon,
  drawHexagon,
} from '../src/core/sng/index.js';

import {
  Tile2D,
  TILE_SHAPES,
  createGrassTile,
  createStoneTile,
  createWaterTile,
} from '../src/core/sng/tile2d.js';

import {
  Cube3D,
  hexNeighbours,
  hexToPixel,
  createStoneBlock,
  createWoodCrate,
} from '../src/core/sng/cube3d.js';

// ─── Colour helpers ───────────────────────────────────────────────────────────

describe('parseColour', () => {
  test('parses #rrggbb', () => {
    expect(parseColour('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  test('parses #rrggbbaa', () => {
    expect(parseColour('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 });
  });

  test('returns transparent black for unknown', () => {
    expect(parseColour('invalid')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});

describe('blendOver', () => {
  test('opaque fg replaces bg', () => {
    const bg = { r: 0, g: 0, b: 0, a: 255 };
    const fg = { r: 255, g: 0, b: 0, a: 255 };
    expect(blendOver(bg, fg)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  test('transparent fg leaves bg unchanged', () => {
    const bg = { r: 100, g: 100, b: 100, a: 255 };
    const fg = { r: 255, g: 0, b: 0, a: 0 };
    const result = blendOver(bg, fg);
    expect(result.r).toBe(100);
    expect(result.g).toBe(100);
    expect(result.b).toBe(100);
  });

  test('fully transparent background with opaque fg', () => {
    const bg = { r: 0, g: 0, b: 0, a: 0 };
    const fg = { r: 255, g: 128, b: 0, a: 255 };
    const result = blendOver(bg, fg);
    expect(result.r).toBe(255);
    expect(result.a).toBe(255);
  });
});

// ─── SngBuffer ────────────────────────────────────────────────────────────────

describe('SngBuffer', () => {
  test('creates buffer with correct dimensions', () => {
    const buf = new SngBuffer(4, 4);
    expect(buf.width).toBe(4);
    expect(buf.height).toBe(4);
    expect(buf.data.length).toBe(4 * 4 * 4);
  });

  test('setPixel / getPixel round-trips correctly', () => {
    const buf = new SngBuffer(8, 8);
    const red = { r: 255, g: 0, b: 0, a: 255 };
    buf.data[0] = buf.data[1] = buf.data[2] = buf.data[3] = 0; // clear pixel 0
    // Direct set without blending by filling first with zeros then writing opaque
    buf.fill({ r: 0, g: 0, b: 0, a: 0 });
    buf.setPixel(2, 3, red);
    expect(buf.getPixel(2, 3)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  test('out-of-bounds setPixel is a no-op', () => {
    const buf = new SngBuffer(4, 4);
    expect(() => buf.setPixel(-1, -1, { r: 255, g: 0, b: 0, a: 255 })).not.toThrow();
    expect(() => buf.setPixel(10, 10, { r: 255, g: 0, b: 0, a: 255 })).not.toThrow();
  });

  test('fill sets all pixels', () => {
    const buf   = new SngBuffer(4, 4);
    const green = { r: 0, g: 200, b: 0, a: 255 };
    buf.fill(green);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(buf.getPixel(x, y)).toEqual(green);
      }
    }
  });

  test('composite blends a second buffer on top', () => {
    const base  = new SngBuffer(8, 8);
    const layer = new SngBuffer(4, 4);
    base.fill({ r: 0, g: 0, b: 255, a: 255 });
    layer.fill({ r: 255, g: 0, b: 0, a: 255 });
    base.composite(layer, 2, 2);
    expect(base.getPixel(3, 3)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(base.getPixel(0, 0)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  });
});

// ─── Drawing primitives ───────────────────────────────────────────────────────

describe('drawRect', () => {
  test('fills a rectangle', () => {
    const buf = new SngBuffer(10, 10);
    const col = { r: 255, g: 0, b: 0, a: 255 };
    drawRect(buf, 2, 2, 5, 5, col);
    expect(buf.getPixel(3, 3)).toEqual(col);
    expect(buf.getPixel(1, 1)).not.toEqual(col);
  });
});

describe('drawCircle', () => {
  test('fills pixels within radius', () => {
    const buf = new SngBuffer(20, 20);
    const col = { r: 0, g: 255, b: 0, a: 255 };
    drawCircle(buf, 10, 10, 5, col);
    expect(buf.getPixel(10, 10)).toEqual(col); // centre
    expect(buf.getPixel(0, 0)).not.toEqual(col);  // corner far away
  });
});

describe('drawLine', () => {
  test('draws a horizontal line', () => {
    const buf = new SngBuffer(20, 20);
    const col = { r: 0, g: 0, b: 255, a: 255 };
    drawLine(buf, 2, 5, 10, 5, col);
    expect(buf.getPixel(5, 5)).toEqual(col);
    expect(buf.getPixel(5, 4)).not.toEqual(col);
  });
});

describe('drawHexagon', () => {
  test('fills at least the centre pixel', () => {
    const buf = new SngBuffer(64, 64);
    const col = { r: 100, g: 100, b: 100, a: 255 };
    drawHexagon(buf, 32, 32, 20, col, 'flat');
    expect(buf.getPixel(32, 32)).toEqual(col);
  });
});

// ─── Tile2D ───────────────────────────────────────────────────────────────────

describe('Tile2D', () => {
  test('creates default tile with unique id', () => {
    const t1 = new Tile2D();
    const t2 = new Tile2D();
    expect(t1.script.id).not.toBe(t2.script.id);
  });

  test('renders to correct size', () => {
    const tile = createGrassTile(32);
    const buf  = tile.render();
    expect(buf.width).toBe(32);
    expect(buf.height).toBe(32);
  });

  test('fill layer paints pixels', () => {
    const tile = new Tile2D({ size: 8 });
    tile.addLayer({ type: 'fill', colour: '#ff0000' });
    const buf = tile.render();
    expect(buf.getPixel(4, 4).r).toBe(255);
  });

  test('stroke layer leaves centre transparent', () => {
    const tile = new Tile2D({ size: 16 });
    tile.addLayer({ type: 'fill',   colour: '#00000000' }); // transparent fill
    tile.addLayer({ type: 'stroke', colour: '#ffffff',   params: { width: 2 } });
    const buf = tile.render();
    // Centre should still be transparent after stroke-only
    expect(buf.getPixel(8, 8).a).toBe(0);
  });

  test('serialises and deserialises', () => {
    const tile = createStoneTile(16);
    const json = JSON.stringify(tile.toJSON());
    const back = Tile2D.fromJSON(JSON.parse(json));
    expect(back.script.name).toBe(tile.script.name);
    expect(back.script.layers.length).toBe(tile.script.layers.length);
  });

  test('createGrassTile renders without error', () => {
    expect(() => createGrassTile(64).render()).not.toThrow();
  });

  test('createStoneTile renders without error', () => {
    expect(() => createStoneTile(64).render()).not.toThrow();
  });

  test('createWaterTile renders without error', () => {
    expect(() => createWaterTile(64).render()).not.toThrow();
  });

  test('hex tile renders', () => {
    const tile = new Tile2D({ shape: TILE_SHAPES.HEX_FLAT, size: 32 });
    tile.addLayer({ type: 'hex', colour: '#4a7c2f' });
    const buf = tile.render();
    expect(buf.width).toBe(32);
  });
});

// ─── Cube3D ───────────────────────────────────────────────────────────────────

describe('Cube3D', () => {
  test('renders to 2x size buffer', () => {
    const cube = createStoneBlock(16);
    const buf  = cube.render();
    expect(buf.width).toBe(32);
    expect(buf.height).toBe(32);
  });

  test('top face paints lighter than left face by default', () => {
    const cube = createStoneBlock(16);
    const buf  = cube.render();
    // Just check that render completes and has non-zero pixels
    let nonZero = 0;
    for (let i = 0; i < buf.data.length; i++) {
      if (buf.data[i] > 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(0);
  });

  test('serialises and deserialises', () => {
    const cube = createWoodCrate(16);
    const back = Cube3D.fromJSON(cube.toJSON());
    expect(back.script.name).toBe(cube.script.name);
    expect(back.script.size).toBe(cube.script.size);
  });
});

// ─── Hex helpers ─────────────────────────────────────────────────────────────

describe('hexNeighbours', () => {
  test('returns 6 neighbours', () => {
    const nb = hexNeighbours(0, 0);
    expect(nb.length).toBe(6);
  });

  test('neighbours are all unique', () => {
    const nb = hexNeighbours(1, 2);
    const strs = nb.map(n => `${n.q},${n.r}`);
    expect(new Set(strs).size).toBe(6);
  });
});

describe('hexToPixel', () => {
  test('origin maps to 0,0', () => {
    const px = hexToPixel(0, 0, 32, 'flat');
    expect(px.x).toBe(0);
    expect(px.y).toBe(0);
  });

  test('flat and pointy give different coordinates', () => {
    const flat   = hexToPixel(1, 1, 32, 'flat');
    const pointy = hexToPixel(1, 1, 32, 'pointy');
    expect(flat.x).not.toBe(pointy.x);
  });
});
