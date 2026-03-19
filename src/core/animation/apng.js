/**
 * APNG Animation Pipeline
 *
 * Manages the creation of Animated PNG (APNG) files from SNG frame sequences.
 *
 * Pipeline:
 *   1. Render a sequence of SngBuffer frames using SNG primitives.
 *   2. Encode each frame as PNG (browser: OffscreenCanvas; worker: wasm).
 *   3. Assemble frames into an APNG via the Cloudflare Worker endpoint
 *      (which runs apngasm compiled to WASM via Emscripten).
 *   4. Return the final APNG as an ArrayBuffer (or Blob/URL).
 *
 * When running inside the browser extension the Cloudflare Worker URL is
 * stored in extension storage.  When running on the frpg.games demo site the
 * URL is the same-origin API route.
 */

/**
 * @typedef {Object} AnimFrame
 * @property {import('../sng/index.js').SngBuffer} buffer  The rendered frame
 * @property {number} delay   Frame display duration in milliseconds
 * @property {number} [loops] Number of times to loop (0 = infinite, default)
 */

/**
 * Encode a single SngBuffer to a PNG ArrayBuffer.
 * Requires OffscreenCanvas (browser or worker context).
 * @param {import('../sng/index.js').SngBuffer} buf
 * @returns {Promise<ArrayBuffer>}
 */
export async function frameToPNG(buf) {
  const canvas = new OffscreenCanvas(buf.width, buf.height);
  const ctx = canvas.getContext('2d');
  const id  = new ImageData(buf.data, buf.width, buf.height);
  ctx.putImageData(id, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

/**
 * Assemble a list of PNG frames into an APNG by calling the Cloudflare Worker.
 *
 * The worker accepts a multipart/form-data POST with fields:
 *   - frame0, frame1, … : PNG file blobs
 *   - delays             : JSON array of millisecond delays
 *   - loops              : number of animation loops (0 = infinite)
 *
 * @param {ArrayBuffer[]} pngFrames   PNG bytes for each frame
 * @param {number[]}      delays      Delay per frame in ms
 * @param {number}        loops       0 = infinite
 * @param {string}        workerURL   URL of the Cloudflare Worker
 * @returns {Promise<ArrayBuffer>}    APNG bytes
 */
export async function assembleAPNG(pngFrames, delays, loops = 0, workerURL) {
  const form = new FormData();
  for (let i = 0; i < pngFrames.length; i++) {
    const blob = new Blob([pngFrames[i]], { type: 'image/png' });
    form.append(`frame${i}`, blob, `frame${i}.png`);
  }
  form.append('delays', JSON.stringify(delays));
  form.append('loops',  String(loops));

  const resp = await fetch(workerURL, { method: 'POST', body: form });
  if (!resp.ok) {
    throw new Error(`APNG worker error: ${resp.status} ${resp.statusText}`);
  }
  return resp.arrayBuffer();
}

/**
 * High-level helper: render frames, encode PNGs, assemble APNG.
 *
 * @param {AnimFrame[]} frames
 * @param {string} workerURL
 * @returns {Promise<ArrayBuffer>} APNG bytes
 */
export async function createAPNG(frames, workerURL) {
  const pngs   = await Promise.all(frames.map(f => frameToPNG(f.buffer)));
  const delays = frames.map(f => f.delay);
  const loops  = frames[0]?.loops ?? 0;
  return assembleAPNG(pngs, delays, loops, workerURL);
}

/**
 * Sprite-sheet slicing
 *
 * Given a sprite-sheet SngBuffer (rows × cols of equal-sized frames),
 * return an array of per-frame SngBuffer slices.
 *
 * @param {import('../sng/index.js').SngBuffer} sheet
 * @param {number} frameW
 * @param {number} frameH
 * @returns {import('../sng/index.js').SngBuffer[]}
 */
export function sliceSpriteSheet(sheet, frameW, frameH) {
  const { SngBuffer } = /** @type {any} */ (sheet.constructor);
  const cols = Math.floor(sheet.width  / frameW);
  const rows = Math.floor(sheet.height / frameH);
  const frames = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Create a new buffer of frame size
      const fb = Object.create(sheet);
      fb.width  = frameW;
      fb.height = frameH;
      fb.data   = new Uint8ClampedArray(frameW * frameH * 4);

      for (let y = 0; y < frameH; y++) {
        for (let x = 0; x < frameW; x++) {
          const srcIdx = ((row * frameH + y) * sheet.width + (col * frameW + x)) * 4;
          const dstIdx = (y * frameW + x) * 4;
          fb.data[dstIdx]     = sheet.data[srcIdx];
          fb.data[dstIdx + 1] = sheet.data[srcIdx + 1];
          fb.data[dstIdx + 2] = sheet.data[srcIdx + 2];
          fb.data[dstIdx + 3] = sheet.data[srcIdx + 3];
        }
      }
      frames.push(fb);
    }
  }
  return frames;
}

/**
 * Build a simple 4-frame walking animation for a miniature.
 * Colours alternate to simulate motion (placeholder; real use passes real art).
 *
 * @param {number} size     Frame size in pixels
 * @param {{r,g,b,a}} colour  Base colour of the mini
 * @returns {AnimFrame[]}
 */
export function buildWalkCycle(size, colour) {
  const { SngBuffer, drawCircle, drawRect } =
    /** @type {any} */ (globalThis.__sngInternals__ ?? {});

  if (!SngBuffer) {
    // When SNG internals are not injected (e.g. tests), return placeholder frames
    return Array.from({ length: 4 }, (_, i) => ({
      buffer: { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) },
      delay:  100,
      loops:  0,
    }));
  }

  return Array.from({ length: 4 }, (_, i) => {
    const buf = new SngBuffer(size, size);
    const offset = [-2, 0, 2, 0][i];
    drawCircle(buf, size / 2, size / 2 + offset, size / 3, colour);
    return { buffer: buf, delay: 100, loops: 0 };
  });
}
