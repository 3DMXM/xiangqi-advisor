(() => {
  'use strict';

  const active = new Set();
  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window || message?.source !== 'xqa-extension-page' || !/^[0-9]{1,12}$/.test(message.id)) return;
    const { id } = message;
    if (message.kind === 'cancel') {
      active.delete(id);
      chrome.runtime.sendMessage({ kind: 'cancel', id }).catch(() => {});
      return;
    }
    if (message.kind !== 'analyze' || active.has(id)) return;
    active.add(id);
    chrome.runtime.sendMessage({ kind: 'analyze', id, fen: message.fen, timeMs: message.timeMs })
      .then(result => {
        if (active.delete(id)) window.postMessage({ source: 'xqa-extension-bridge', kind: 'analysis-result', id, ...result }, location.origin);
      })
      .catch(() => {
        if (active.delete(id)) window.postMessage({ source: 'xqa-extension-bridge', kind: 'analysis-result', id, error: 'network' }, location.origin);
      });
  });
})();
