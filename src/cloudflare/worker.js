/**
 * Cloudflare Worker — APNG Assembly Service
 *
 * This Worker receives PNG frame data from the browser extension or the
 * frpg.games website and assembles them into an Animated PNG (APNG) using
 * apngasm compiled to WebAssembly via Emscripten.
 *
 * Endpoint: POST /apng
 *
 * Request (multipart/form-data):
 *   frame0, frame1, … : PNG image blobs (in order)
 *   delays            : JSON array of per-frame delays in milliseconds
 *   loops             : number of loops (0 = infinite)
 *
 * Response:
 *   Content-Type: image/apng
 *   Body: APNG binary data
 *
 * CORS: Allows https://frpg.games and browser extension origins.
 *
 * Note: apngasm WASM module is loaded from a KV binding or bundled asset.
 * The actual apngasm WASM binary must be uploaded to Cloudflare KV under
 * the key "apngasm_wasm".  See README for deployment instructions.
 */

const ALLOWED_ORIGINS = [
  'https://frpg.games',
  'https://www.frpg.games',
  // Chrome/Firefox extensions use chrome-extension:// and moz-extension://
  // These are validated by checking the Sec-Fetch-Site header instead.
];

/**
 * Build CORS headers for the response.
 * @param {Request} request
 * @returns {Headers}
 */
function corsHeaders(request) {
  const origin = request.headers.get('Origin') ?? '';
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  });

  if (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://')
  ) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  return headers;
}

/**
 * Parse multipart form data from the request.
 * Cloudflare Workers support request.formData() natively.
 * @param {Request} request
 * @returns {Promise<{frames: ArrayBuffer[], delays: number[], loops: number}>}
 */
async function parseRequest(request) {
  const form = await request.formData();
  const frames = [];
  const delays = JSON.parse(form.get('delays') ?? '[]');
  const loops  = parseInt(form.get('loops') ?? '0', 10);

  let i = 0;
  while (form.has(`frame${i}`)) {
    const blob = form.get(`frame${i}`);
    frames.push(await blob.arrayBuffer());
    i++;
  }

  return { frames, delays, loops };
}

/**
 * Assemble frames into an APNG using the apngasm WASM module.
 *
 * The WASM module must expose:
 *   - apngasm_create()                              → handle
 *   - apngasm_add_frame_from_file(handle, path)     → void
 *   - apngasm_assemble(handle, outPath)             → bool
 *   - apngasm_destroy(handle)                       → void
 *
 * Since WASM filesystem operations are used, frames are written to the
 * WASM virtual FS (MEMFS), assembled, and read back.
 *
 * @param {ArrayBuffer[]} frames
 * @param {number[]}      delays    ms per frame
 * @param {number}        loops
 * @param {WebAssembly.Instance} wasmInstance  (bound from env.APNGASM_WASM)
 * @returns {Promise<ArrayBuffer>}
 */
async function assembleWithWasm(frames, delays, loops, wasmInstance) {
  const { exports, FS } = wasmInstance;

  // Write each PNG frame to the WASM virtual filesystem
  for (let i = 0; i < frames.length; i++) {
    FS.writeFile(`/frame${i}.png`, new Uint8Array(frames[i]));
  }

  // Write delays file (apngasm accepts delays as numerator/denominator pairs)
  const delayPairs = delays.map(ms => `${ms}/1000`).join('\n');
  FS.writeFile('/delays.txt', delayPairs);

  // Call apngasm
  const handle = exports.apngasm_create();
  for (let i = 0; i < frames.length; i++) {
    const delayNum = delays[i] ?? 100;
    exports.apngasm_add_frame_from_file(handle, `/frame${i}.png`, delayNum, 1000);
  }
  exports.apngasm_set_loops(handle, loops);
  const ok = exports.apngasm_assemble(handle, '/output.apng');
  exports.apngasm_destroy(handle);

  if (!ok) throw new Error('apngasm assembly failed');

  // Read back the assembled APNG
  const result = FS.readFile('/output.apng');
  return result.buffer;
}

/**
 * Main Worker fetch handler.
 */
export default {
  /**
   * @param {Request} request
   * @param {Object}  env      Cloudflare bindings (KV, WASM, etc.)
   * @param {Object}  ctx      Execution context
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Health check
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', service: 'frpg-apng' }), {
        headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders(request)) },
      });
    }

    // APNG assembly endpoint
    if (url.pathname === '/apng' && request.method === 'POST') {
      try {
        const { frames, delays, loops } = await parseRequest(request);

        if (frames.length === 0) {
          return new Response('No frames provided', { status: 400, headers: corsHeaders(request) });
        }
        if (frames.length !== delays.length) {
          return new Response('Frame count must match delay count', { status: 400, headers: corsHeaders(request) });
        }

        // Load apngasm WASM from KV binding (env.APNGASM) or fallback
        // In production, deploy the WASM to a KV namespace called APNGASM.
        if (!env.APNGASM) {
          // Development fallback: return first frame as static PNG
          return new Response(frames[0], {
            headers: {
              'Content-Type': 'image/png',
              ...Object.fromEntries(corsHeaders(request)),
            },
          });
        }

        const apng = await assembleWithWasm(frames, delays, loops, env.APNGASM);
        return new Response(apng, {
          headers: {
            'Content-Type': 'image/apng',
            'Content-Disposition': 'attachment; filename="animation.apng"',
            ...Object.fromEntries(corsHeaders(request)),
          },
        });
      } catch (err) {
        return new Response(`Assembly error: ${err.message}`, {
          status: 500,
          headers: corsHeaders(request),
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
