/**
 * Extension Popup Script
 */

/* global chrome */

const EDITOR_PATH = 'src/editor/editor.html';

const statusEl = document.getElementById('status');

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

// ─── Load persisted settings ──────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, settings => {
  if (chrome.runtime.lastError) {
    setStatus('Extension error.');
    return;
  }
  if (settings?.activeSystem) {
    document.getElementById('sel-system').value = settings.activeSystem;
  }
  setStatus('Ready.');
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

document.getElementById('btn-editor').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL(EDITOR_PATH) });
  window.close();
});

document.getElementById('sel-system').addEventListener('change', e => {
  chrome.runtime.sendMessage(
    { type: 'SET_SETTINGS', payload: { activeSystem: e.target.value } },
    () => setStatus(`System set: ${e.target.value}`)
  );
});

document.getElementById('btn-save').addEventListener('click', () => {
  // Send save command to any open editor tab
  chrome.tabs.query({ url: chrome.runtime.getURL(EDITOR_PATH) }, tabs => {
    if (tabs.length === 0) {
      setStatus('No editor open.');
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SAVE_FROM_POPUP' }, r => {
      setStatus(r?.ok ? 'Saved!' : 'Nothing to save.');
    });
  });
});

document.getElementById('btn-load').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LIST_ASSETS' }, r => {
    if (!r?.ok || r.keys.length === 0) {
      setStatus('No saved assets.');
    } else {
      setStatus(`${r.keys.length} asset(s) saved.`);
    }
  });
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage
    ? chrome.runtime.openOptionsPage()
    : chrome.tabs.create({ url: chrome.runtime.getURL('src/editor/editor.html') });
  window.close();
});
