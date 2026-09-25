'use strict';

const ANALYZE_URL = 'http://127.0.0.1:8765/analyze';
const requests = new Map();

function requestKey(sender, id) {
  return `${sender.tab?.id}:${sender.frameId}:${sender.documentId || ''}:${id}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.url?.startsWith('https://h5login.qqchess.qq.com/') !== true || !/^[0-9]{1,12}$/.test(message?.id)) return;
  const key = requestKey(sender, message.id);
  if (message.kind === 'cancel') {
    requests.get(key)?.abort();
    sendResponse({ ok: true });
    return;
  }
  if (message.kind !== 'analyze') return;
  if (typeof message.fen !== 'string' || message.fen.length > 256 || !/^[a-zA-Z1-9/ wb-]+$/.test(message.fen) || ![2000, 5000, 10000].includes(message.timeMs) || requests.has(key)) {
    sendResponse({ status: 400, body: { error: '分析参数无效。' } });
    return;
  }

  const controller = new AbortController();
  requests.set(key, controller);
  const timeout = setTimeout(() => controller.abort(), message.timeMs + 5000);
  fetch(ANALYZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen: message.fen, time_ms: message.timeMs }),
    signal: controller.signal
  })
    .then(async response => ({ status: response.status, body: await response.json() }))
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.name === 'AbortError' ? 'timeout' : 'network' }))
    .finally(() => {
      clearTimeout(timeout);
      requests.delete(key);
    });
  return true;
});
