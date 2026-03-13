/**
 * Content script — injected into https://frpg.games/*
 *
 * Bridges the extension's asset storage with the web page so that assets
 * created in the editor can be pushed to or pulled from the website without
 * requiring an API key.
 */

/* global chrome */

/**
 * Listen for postMessage events from the frpg.games page.
 * The page sends structured messages; we relay them to the background worker.
 */
window.addEventListener('message', event => {
  // Only accept messages from the same origin
  if (event.origin !== 'https://frpg.games' && event.origin !== window.location.origin) return;
  if (!event.data || typeof event.data !== 'object') return;

  const { frpg, type, payload, id } = event.data;
  if (frpg !== true) return;  // Ignore unrelated messages

  chrome.runtime.sendMessage({ type, payload }, response => {
    // Reply to page with correlation id
    window.postMessage({ frpg: true, id, response }, window.location.origin);
  });
});

/**
 * Announce the extension presence to the page so it can show "Extension
 * connected" UI and enable save/load buttons.
 */
window.postMessage(
  { frpg: true, type: 'EXTENSION_READY', payload: { version: chrome.runtime.getManifest().version } },
  window.location.origin
);
