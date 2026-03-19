/**
 * Extension Service Worker (Manifest V3 background)
 *
 * Handles:
 *   - Extension installation and upgrade
 *   - Opening the asset editor on command
 *   - Proxying APNG assembly requests to the Cloudflare Worker
 *   - Persisting extension settings in chrome.storage.sync
 */

const EDITOR_PATH  = 'src/editor/editor.html';
const DEFAULT_WORKER_URL = 'https://apng.frpg.games/apng';

// ─── Install / Upgrade ────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ─── Command handler ─────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(command => {
  if (command === 'open-editor') {
    openEditor();
  }
});

chrome.action.onClicked.addListener(() => {
  openEditor();
});

function openEditor() {
  chrome.tabs.create({ url: chrome.runtime.getURL(EDITOR_PATH) });
}

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.sync.get(['workerURL', 'activeSystem'], data => {
        sendResponse({
          workerURL:    data.workerURL    ?? DEFAULT_WORKER_URL,
          activeSystem: data.activeSystem ?? 'srd521',
        });
      });
      return true; // async response

    case 'SET_SETTINGS':
      chrome.storage.sync.set(message.payload, () => {
        sendResponse({ ok: true });
      });
      return true;

    case 'ASSEMBLE_APNG': {
      // Relay to Cloudflare Worker
      chrome.storage.sync.get(['workerURL'], async data => {
        const url = data.workerURL ?? DEFAULT_WORKER_URL;
        try {
          const result = await proxyAPNG(message.payload, url);
          sendResponse({ ok: true, data: result });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      });
      return true;
    }

    case 'SAVE_ASSET': {
      const { key, value } = message.payload;
      chrome.storage.local.set({ [key]: value }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'LOAD_ASSET': {
      chrome.storage.local.get([message.payload.key], data => {
        sendResponse({ ok: true, data: data[message.payload.key] ?? null });
      });
      return true;
    }

    case 'LIST_ASSETS': {
      chrome.storage.local.get(null, data => {
        const keys = Object.keys(data).filter(k => k.startsWith('asset:'));
        sendResponse({ ok: true, keys });
      });
      return true;
    }

    default:
      sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
  }
});

// ─── APNG relay ───────────────────────────────────────────────────────────────

/**
 * Forward APNG assembly request to the Cloudflare Worker.
 * @param {{ frames: number[][], delays: number[], loops: number }} payload
 *   frames: array of PNG bytes (as JS arrays of integers)
 * @param {string} workerURL
 * @returns {Promise<number[]>} APNG bytes as array
 */
async function proxyAPNG(payload, workerURL) {
  const form = new FormData();
  for (let i = 0; i < payload.frames.length; i++) {
    const bytes = new Uint8Array(payload.frames[i]);
    const blob  = new Blob([bytes], { type: 'image/png' });
    form.append(`frame${i}`, blob, `frame${i}.png`);
  }
  form.append('delays', JSON.stringify(payload.delays));
  form.append('loops',  String(payload.loops ?? 0));

  const resp = await fetch(workerURL, { method: 'POST', body: form });
  if (!resp.ok) {
    throw new Error(`Worker responded ${resp.status}: ${await resp.text()}`);
  }
  const buf  = await resp.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}
