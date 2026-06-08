/* ──────────────────────────────────────────────
   VideoGrab — popup.js
   Baixador completo: busca info → escolhe qualidade →
   baixa via servidor na nuvem (VIDEOGRAB_SERVER de config.js).
   ────────────────────────────────────────────── */

const API = VIDEOGRAB_SERVER;

// ── State ─────────────────────────────────────
let currentInfo = null;
let currentUrl = '';
let selectedType = 'video';
let selectedQuality = null;
let activeSSE = null;

// ── DOM ───────────────────────────────────────
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const urlInput = document.getElementById('url-input');
const btnFetch = document.getElementById('btn-fetch');
const infoCard = document.getElementById('info-card');
const thumbWrap = document.getElementById('thumb-wrap');
const videoTitle = document.getElementById('video-title');
const metaPills = document.getElementById('meta-pills');
const tabVideo = document.getElementById('tab-video');
const tabAudio = document.getElementById('tab-audio');
const qualityGrid = document.getElementById('quality-grid');
const btnDownload = document.getElementById('btn-download');
const btnDownloadText = document.getElementById('btn-download-text');
const btnTrim = document.getElementById('btn-trim');
const progressCard = document.getElementById('progress-card');
const progressContent = document.getElementById('progress-content');
const footerMsg = document.getElementById('footer-msg');

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
  checkServerStatus();

  // Se havia um download em andamento quando o popup foi fechado, reconecta a ele.
  const resumed = await resumeActiveDownload();
  if (resumed) return;  // mostra o progresso em vez de buscar um novo vídeo

  // Prefer a URL pushed by the context menu, else use the active tab.
  let url = '';
  try {
    const stored = await chrome.storage.local.get('pendingUrl');
    if (stored.pendingUrl) {
      url = stored.pendingUrl;
      await chrome.storage.local.remove('pendingUrl');
    }
  } catch (_) {}

  if (!url) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && /^https?:/.test(tab.url)) url = tab.url;
    } catch (_) {}
  }

  if (url) {
    urlInput.value = url;
    fetchInfo();
  }
}

// ── Server status ─────────────────────────────
async function checkServerStatus() {
  try {
    const res = await fetch(`${API}/api/status`, { cache: 'no-store' });
    if (res.ok) {
      statusBadge.className = 'status-badge online';
      statusText.textContent = 'Online';
    } else {
      setOffline();
    }
  } catch (_) {
    setOffline();
  }
}

function setOffline() {
  statusBadge.className = 'status-badge offline';
  statusText.textContent = 'Offline';
  footerMsg.className = 'msg error';
  footerMsg.textContent = 'Servidor indisponível. Em planos gratuitos pode levar ~30s para acordar — tente novamente.';
}

// ── Fetch info ────────────────────────────────
btnFetch.addEventListener('click', fetchInfo);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchInfo(); });

async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url) { setFooter('Cole um link de vídeo primeiro.', true); return; }

  currentUrl = url;
  setFetching(true);
  infoCard.classList.add('hidden');
  progressCard.classList.add('hidden');

  try {
    const res = await fetch(`${API}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${res.status}`);
    }
    currentInfo = await res.json();
    renderInfo(currentInfo);
    checkServerStatus();
  } catch (e) {
    setFooter('Não foi possível obter informações: ' + e.message, true);
  } finally {
    setFetching(false);
  }
}

function setFetching(on) {
  btnFetch.disabled = on;
  btnFetch.innerHTML = on ? '<span class="spinner"></span>' : '<span>🔍</span>';
}

// ── Render info ───────────────────────────────
function renderInfo(info) {
  thumbWrap.innerHTML = info.thumbnail
    ? `<img src="${escHtml(info.thumbnail)}" alt="" />`
    : `<div>🎥</div>`;

  videoTitle.textContent = info.title || 'Sem título';
  videoTitle.title = info.title || '';

  const pills = [];
  if (info.uploader) pills.push(`👤 ${info.uploader}`);
  if (info.duration) pills.push(`⏱️ ${info.duration}`);
  if (info.platform) pills.push(`🌐 ${info.platform}`);
  metaPills.innerHTML = pills.map(p => `<span class="pill">${escHtml(p)}</span>`).join('');

  selectedType = 'video';
  selectedQuality = null;
  tabVideo.classList.add('active');
  tabAudio.classList.remove('active');
  renderQualityGrid();

  const firstBtn = qualityGrid.querySelector('.quality-btn');
  if (firstBtn) firstBtn.click();

  // Trim opens the full web editor (needs the video player UI / FFmpeg server-side)
  if (info.preview_available) {
    btnTrim.classList.remove('hidden');
  } else {
    btnTrim.classList.add('hidden');
  }

  infoCard.classList.remove('hidden');
  setFooter('', false);
}

// ── Tabs ──────────────────────────────────────
tabVideo.addEventListener('click', () => switchTab('video'));
tabAudio.addEventListener('click', () => switchTab('audio'));

function switchTab(type) {
  selectedType = type;
  tabVideo.classList.toggle('active', type === 'video');
  tabAudio.classList.toggle('active', type === 'audio');
  selectedQuality = null;
  renderQualityGrid();
  const firstBtn = qualityGrid.querySelector('.quality-btn');
  if (firstBtn) firstBtn.click();
  updateDownloadBtn();
}

// ── Quality grid ──────────────────────────────
function renderQualityGrid() {
  if (!currentInfo) return;
  const opts = selectedType === 'video' ? currentInfo.formats.video : currentInfo.formats.audio;
  qualityGrid.innerHTML = '';
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quality-btn';
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => selectQuality(btn, opt.value));
    qualityGrid.appendChild(btn);
  });
}

function selectQuality(el, value) {
  qualityGrid.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedQuality = value;
  updateDownloadBtn();
}

function updateDownloadBtn() {
  const ready = selectedQuality !== null;
  btnDownload.disabled = !ready;
  if (ready) {
    btnDownloadText.textContent = selectedType === 'video'
      ? `Baixar vídeo (${selectedQuality === 'best' ? 'melhor' : selectedQuality + 'p'})`
      : 'Baixar áudio MP3';
  } else {
    btnDownloadText.textContent = 'Selecione uma qualidade';
  }
}

// ── Trim (opens full web app) ─────────────────
btnTrim.addEventListener('click', () => {
  chrome.tabs.create({ url: `${API}/?url=${encodeURIComponent(currentUrl)}` });
});

// ── Download ──────────────────────────────────
btnDownload.addEventListener('click', startDownload);

async function startDownload() {
  if (!selectedQuality) { setFooter('Selecione uma qualidade primeiro.', true); return; }
  btnDownload.disabled = true;

  try {
    const res = await fetch(`${API}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: currentUrl,
        format_type: selectedType,
        quality: selectedQuality,
        compress: (document.getElementById('compress-select')?.value) || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${res.status}`);
    }
    const { id } = await res.json();
    await saveActiveDownload(id);
    progressCard.classList.remove('hidden');
    listenProgress(id);
  } catch (e) {
    setFooter('Falha ao iniciar download: ' + e.message, true);
    btnDownload.disabled = false;
  }
}

// ── Persistência do download ativo ────────────
// Permite reabrir o popup e continuar acompanhando o download (o popup é
// destruído ao fechar, mas o servidor segue baixando em segundo plano).
const ACTIVE_KEY = 'activeDownload';
const ACTIVE_MAX_AGE = 6 * 60 * 60 * 1000;  // 6h: descarta registros muito antigos

async function saveActiveDownload(id) {
  try { await chrome.storage.local.set({ [ACTIVE_KEY]: { id, t: Date.now() } }); } catch (_) {}
}
async function clearActiveDownload() {
  try { await chrome.storage.local.remove(ACTIVE_KEY); } catch (_) {}
}

async function resumeActiveDownload() {
  let active;
  try {
    const s = await chrome.storage.local.get(ACTIVE_KEY);
    active = s[ACTIVE_KEY];
  } catch (_) { return false; }

  if (!active || !active.id) return false;
  if (active.t && Date.now() - active.t > ACTIVE_MAX_AGE) {
    await clearActiveDownload();
    return false;
  }

  progressCard.classList.remove('hidden');
  renderProgress({ status: 'starting' });
  listenProgress(active.id, true);
  return true;
}

// ── SSE progress ──────────────────────────────
function listenProgress(id, resuming = false) {
  if (activeSSE) activeSSE.close();
  if (!resuming) renderProgress({ status: 'starting' });

  let gotMessage = false;
  const es = new EventSource(`${API}/api/progress/${id}`);
  activeSSE = es;

  es.onmessage = e => {
    gotMessage = true;
    const state = JSON.parse(e.data);
    renderProgress(state);
    if (state.status === 'done') {
      es.close();
      deliverFile(id);
      clearActiveDownload();
      btnDownload.disabled = false;
    } else if (state.status === 'error') {
      es.close();
      clearActiveDownload();
      btnDownload.disabled = false;
    }
  };

  es.onerror = () => {
    es.close();
    btnDownload.disabled = false;
    if (resuming && !gotMessage) {
      // O servidor não conhece mais este download (reiniciou ou expirou): limpa.
      clearActiveDownload();
      progressCard.classList.add('hidden');
      return;
    }
    renderProgress({ status: 'error', error: 'Conexão com o servidor perdida.' });
    clearActiveDownload();
  };
}

// ── Deliver file to the user's machine ────────
function deliverFile(id) {
  // The cloud server saves the file then serves it once via this endpoint
  // (and deletes it afterward). chrome.downloads streams it to disk.
  const fileUrl = `${API}/api/download-file/${id}`;
  try {
    chrome.downloads.download({ url: fileUrl });
  } catch (_) {
    // Fallback: open in a new tab
    chrome.tabs.create({ url: fileUrl });
  }
}

function renderProgress(state) {
  const { status, progress = 0, speed, eta, error, warning } = state;

  if (status === 'starting') {
    progressContent.innerHTML = `<div class="progress-title"><span class="spinner"></span> Iniciando…</div>`;
    return;
  }
  if (status === 'downloading') {
    progressContent.innerHTML = `
      <div class="progress-title"><span class="spinner"></span> Baixando no servidor…</div>
      <div class="progress-stats">
        ${speed ? `<span>⚡ ${escHtml(speed)}</span>` : ''}
        ${eta ? `<span>⏳ ${escHtml(eta)}</span>` : ''}
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
      <div class="progress-pct">${progress}%</div>`;
    return;
  }
  if (status === 'processing' || status === 'trimming' || status === 'compressing') {
    const label = status === 'trimming' ? '✂️ Recortando…'
                : status === 'compressing' ? '🗜️ Comprimindo… (pode demorar)'
                : 'Processando…';
    progressContent.innerHTML = `
      <div class="progress-title"><span class="spinner"></span> ${label}</div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:99%"></div></div>
      <div class="progress-pct">99%</div>`;
    return;
  }
  if (status === 'done') {
    progressContent.innerHTML = `
      <div class="status-done">
        <span class="icon-big">✅</span>
        <div>
          <div style="font-weight:600;">Pronto! Baixando o arquivo…</div>
          <div style="font-size:11px;color:var(--text-muted);">Confira a barra de downloads do navegador.</div>
        </div>
      </div>
      ${warning ? `<div class="status-warning">⚠️ ${escHtml(warning)}</div>` : ''}`;
    return;
  }
  if (status === 'error') {
    progressContent.innerHTML = `
      <div class="status-error">
        <span style="font-size:20px;">❌</span>
        <div><strong>Erro no download</strong><br/>${escHtml(error || 'Erro desconhecido.')}</div>
      </div>`;
    return;
  }
}

// ── Utils ─────────────────────────────────────
function setFooter(msg, isError) {
  footerMsg.className = isError ? 'msg error' : 'msg';
  footerMsg.textContent = msg;
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
