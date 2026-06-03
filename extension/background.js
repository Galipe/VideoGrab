/* ──────────────────────────────────────────────
   VideoGrab — background.js (service worker)
   Menu de contexto: guarda a URL do vídeo e abre o popup,
   que então busca/baixa pelo servidor na nuvem.
   ────────────────────────────────────────────── */

importScripts('config.js'); // expõe VIDEOGRAB_SERVER

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'videograb-download',
    title: 'Baixar com VideoGrab',
    contexts: ['page', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'videograb-download') return;

  const videoUrl = info.linkUrl || info.pageUrl || (tab && tab.url);
  if (!videoUrl) return;

  // Save the URL so the popup picks it up on open.
  await chrome.storage.local.set({ pendingUrl: videoUrl });

  // openPopup() exists in Chrome 127+. If unavailable, fall back to a tab
  // on the cloud web app pre-filled with the URL.
  try {
    await chrome.action.openPopup();
  } catch (_) {
    chrome.tabs.create({ url: `${VIDEOGRAB_SERVER}/?url=${encodeURIComponent(videoUrl)}` });
  }
});
