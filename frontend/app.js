/* ──────────────────────────────────────────────
   VideoGrab — app.js
   ────────────────────────────────────────────── */

// Use relative URLs so it works through Cloudflare Tunnel too
const API = '';

// ── State ─────────────────────────────────────
let currentInfo     = null;   // fetched video metadata
let selectedType    = 'video';
let selectedQuality = null;
let activeSSE       = null;
let history         = JSON.parse(localStorage.getItem('vg_history') || '[]');
let hasFfmpeg       = false;
let localMode       = true;

// ── DOM refs ──────────────────────────────────
const urlInput        = document.getElementById('url-input');
const btnFetch        = document.getElementById('btn-fetch');
const infoSection     = document.getElementById('info-section');
const progressSection = document.getElementById('progress-section');
const progressContent = document.getElementById('progress-content');
const thumbWrap       = document.getElementById('thumb-wrap');
const videoTitle      = document.getElementById('video-title');
const metaPills       = document.getElementById('meta-pills');
const qualityGrid     = document.getElementById('quality-grid');
const btnDownload     = document.getElementById('btn-download');
const btnDownloadText = document.getElementById('btn-download-text');
const btnTrim         = document.getElementById('btn-trim');
const tabVideo        = document.getElementById('tab-video');
const tabAudio        = document.getElementById('tab-audio');
const historySec      = document.getElementById('history-section');
const historyList     = document.getElementById('history-list');

// ── Init ──────────────────────────────────────
renderHistory();
checkFFmpegStatus();
checkUrlQueryParam();

async function checkUrlQueryParam() {
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get('url');
  if (urlParam) {
    urlInput.value = urlParam;
    await fetchInfo();
  }
}

// ── FFmpeg status ─────────────────────────────
async function checkFFmpegStatus() {
  try {
    const res = await fetch(`${API}/api/status`);
    const data = await res.json();
    hasFfmpeg = data.ffmpeg;
    localMode = data.local_mode !== false;
    const banner = document.getElementById('ffmpeg-banner');
    if (data.ffmpeg) {
      banner.className = 'ffmpeg-banner ok fade-in';
      banner.innerHTML = `<span>✅</span> FFmpeg detectado — downloads em alta qualidade e recorte disponíveis`;
      banner.style.display = 'flex';
      setTimeout(() => { banner.style.display = 'none'; }, 5000);
    } else {
      banner.className = 'ffmpeg-banner warn fade-in';
      banner.innerHTML = `
        <span>⚠️</span>
        <span>FFmpeg não encontrado — recorte e downloads em alta resolução limitados.
        <a href="https://ffmpeg.org/download.html" target="_blank">Instale o FFmpeg</a> para todas as funcionalidades.</span>`;
      banner.style.display = 'flex';
    }
  } catch (_) { /* server not ready yet */ }
}

// ── Fetch video info ──────────────────────────
btnFetch.addEventListener('click', fetchInfo);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchInfo(); });

async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url) { toast('Cole um link de vídeo primeiro', 'error'); return; }

  setLoading(true);
  infoSection.classList.remove('visible');
  progressSection.classList.remove('visible');
  // Hide trimmer if open
  Trimmer.destroy();

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

  } catch (e) {
    toast('Não foi possível obter informações: ' + e.message, 'error');
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  btnFetch.disabled = on;
  btnFetch.innerHTML = on
    ? '<span class="spinner"></span> <span>Buscando…</span>'
    : '<span>🔍</span><span>Buscar</span>';
}

// ── Render video info ─────────────────────────
function renderInfo(info) {
  // Thumbnail
  thumbWrap.innerHTML = info.thumbnail
    ? `<img src="${escHtml(info.thumbnail)}" alt="thumbnail" loading="lazy" />`
    : `<div class="thumb-placeholder">🎥</div>`;

  // Title
  videoTitle.textContent = info.title || 'Sem título';
  videoTitle.title = info.title;

  // Pills
  const pills = [];
  if (info.uploader) pills.push({ icon: '👤', text: info.uploader });
  if (info.duration)  pills.push({ icon: '⏱️', text: info.duration });
  if (info.platform)  pills.push({ icon: '🌐', text: info.platform, extra: 'platform-badge' });
  if (info.view_count) pills.push({ icon: '👁️', text: fmtViews(info.view_count) });

  metaPills.innerHTML = pills.map(p =>
    `<span class="pill ${p.extra||''}"><span class="icon">${p.icon}</span>${escHtml(p.text)}</span>`
  ).join('');

  // Reset selection
  selectedType = 'video';
  selectedQuality = null;
  tabVideo.classList.add('active');
  tabAudio.classList.remove('active');
  renderQualityGrid();

  // Auto-select first quality option if available
  const firstQualityBtn = qualityGrid.querySelector('.quality-btn');
  if (firstQualityBtn) {
    firstQualityBtn.click();
  }

  // Trim button: enable only if preview is available AND FFmpeg is installed
  btnTrim.disabled = !(info.preview_available && hasFfmpeg);
  if (!hasFfmpeg) {
    btnTrim.title = 'Instale o FFmpeg para usar o recorte';
  } else if (!info.preview_available) {
    btnTrim.title = 'Preview não disponível para este vídeo';
  } else {
    btnTrim.title = 'Recortar antes de baixar';
  }

  infoSection.classList.add('visible');
  infoSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Tabs ──────────────────────────────────────
tabVideo.addEventListener('click', () => {
  selectedType = 'video';
  tabVideo.classList.add('active');
  tabAudio.classList.remove('active');
  selectedQuality = null;
  renderQualityGrid();
  updateDownloadBtn();
});

tabAudio.addEventListener('click', () => {
  selectedType = 'audio';
  tabAudio.classList.add('active');
  tabVideo.classList.remove('active');
  selectedQuality = null;
  renderQualityGrid();
  updateDownloadBtn();
});

// ── Quality Grid ──────────────────────────────
function renderQualityGrid() {
  if (!currentInfo) return;

  const opts = selectedType === 'video'
    ? currentInfo.formats.video
    : currentInfo.formats.audio;

  qualityGrid.innerHTML = opts.map(opt =>
    `<button class="quality-btn" data-value="${escHtml(opt.value)}" onclick="selectQuality(this,'${escHtml(opt.value)}')">
       <span>${escHtml(opt.label)}</span>
     </button>`
  ).join('');
}

function selectQuality(el, value) {
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedQuality = value;
  updateDownloadBtn();
}

function updateDownloadBtn() {
  const ready = selectedQuality !== null;
  btnDownload.disabled = !ready;
  if (ready) {
    const label = selectedType === 'video'
      ? `Baixar Vídeo (${selectedQuality === 'best' ? 'melhor qualidade' : selectedQuality + 'p'})`
      : `Baixar Áudio MP3`;
    btnDownloadText.textContent = label;
  } else {
    btnDownloadText.textContent = 'Selecione uma qualidade';
  }
}

// ── Trim Button ───────────────────────────────
btnTrim.addEventListener('click', openTrimmer);

function openTrimmer() {
  if (!currentInfo) return;
  const url = urlInput.value.trim();
  const duration = currentInfo.duration_seconds || 0;

  if (!duration) {
    toast('Não foi possível detectar a duração do vídeo', 'error');
    return;
  }

  Trimmer.init(url, duration, onTrimConfirm);
}

function onTrimConfirm(trimStart, trimEnd) {
  // Start a download with trim parameters
  startDownload(trimStart, trimEnd);
}

// ── Download ──────────────────────────────────
btnDownload.addEventListener('click', () => startDownload());

async function startDownload(trimStart = null, trimEnd = null) {
  if (!selectedQuality) {
    toast('Selecione uma qualidade primeiro', 'error');
    return;
  }

  const url = urlInput.value.trim();
  btnDownload.disabled = true;

  const body = {
    url,
    format_type: selectedType,
    quality: selectedQuality,
  };

  // Add trim parameters if provided
  if (trimStart !== null) body.trim_start = trimStart;
  if (trimEnd !== null) body.trim_end = trimEnd;

  try {
    const res = await fetch(`${API}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${res.status}`);
    }

    const { id } = await res.json();
    progressSection.classList.add('visible');
    progressSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    listenProgress(id);

  } catch (e) {
    toast('Falha ao iniciar download: ' + e.message, 'error');
    btnDownload.disabled = false;
  }
}

// ── SSE Progress ──────────────────────────────
function listenProgress(id) {
  if (activeSSE) activeSSE.close();

  renderProgress({ status: 'starting', progress: 0, speed: '', eta: '' });

  const evtSource = new EventSource(`${API}/api/progress/${id}`);
  activeSSE = evtSource;

  evtSource.onmessage = e => {
    const state = JSON.parse(e.data);
    state.download_id = id;
    renderProgress(state);

    if (state.status === 'done') {
      evtSource.close();
      const outputDir = state.output_dir || '';
      addHistory({
        title:     currentInfo?.title || 'Vídeo',
        thumbnail: currentInfo?.thumbnail || '',
        type:      selectedType,
        quality:   selectedQuality,
        dir:       outputDir,
        time:      Date.now(),
      });
      btnDownload.disabled = false;
    } else if (state.status === 'error') {
      evtSource.close();
      btnDownload.disabled = false;
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
    renderProgress({ status: 'error', error: 'Conexão com o servidor perdida.' });
    btnDownload.disabled = false;
  };
}

function renderProgress(state) {
  const { status, progress, speed, eta, error, output_dir } = state;

  if (status === 'starting') {
    progressContent.innerHTML = `
      <div class="progress-header">
        <div class="progress-title"><div class="spinner"></div> Iniciando download…</div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:5%"></div></div>
      <div class="progress-pct">0%</div>`;
    return;
  }

  if (status === 'downloading') {
    progressContent.innerHTML = `
      <div class="progress-header">
        <div class="progress-title"><div class="spinner"></div> Baixando…</div>
        <div class="progress-stats">
          ${speed ? `<span>⚡ ${escHtml(speed)}</span>` : ''}
          ${eta   ? `<span>⏳ ${escHtml(eta)}</span>`   : ''}
        </div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
      <div class="progress-pct">${progress}%</div>`;
    return;
  }

  if (status === 'processing') {
    progressContent.innerHTML = `
      <div class="progress-header">
        <div class="progress-title"><div class="spinner"></div> Processando arquivo…</div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:99%"></div></div>
      <div class="progress-pct">99%</div>`;
    return;
  }

  if (status === 'trimming') {
    progressContent.innerHTML = `
      <div class="progress-header">
        <div class="progress-title"><div class="spinner"></div> ✂️ Recortando vídeo…</div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:99%"></div></div>
      <div class="progress-pct">99%</div>`;
    return;
  }

  if (status === 'done') {
    const dir = output_dir || '';
    const warningHtml = state.warning
      ? `<div class="status-warning">⚠️ ${escHtml(state.warning)}</div>`
      : '';
      
    let actionBtnHtml = '';
    if (localMode) {
      actionBtnHtml = `
        <button class="btn-open-folder" onclick="openFolder('${escAttr(dir)}')">
          📂 Abrir pasta
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="btn-open-folder" onclick="downloadFile('${escAttr(state.download_id)}')">
          📥 Baixar Arquivo
        </button>
      `;
    }

    progressContent.innerHTML = `
      <div class="status-done">
        <div class="icon-big">✅</div>
        <div class="status-info">
          <div class="status-title">Download concluído!</div>
          <div class="status-sub" title="${escHtml(dir)}">${escHtml(localMode ? (dir || 'Arquivo salvo na pasta de downloads') : 'Pronto para download')}</div>
        </div>
        ${actionBtnHtml}
      </div>
      ${warningHtml}`;
    toast('Download concluído! 🎉', 'success');
    return;
  }

  if (status === 'error') {
    progressContent.innerHTML = `
      <div class="status-error">
        <div class="icon-err">❌</div>
        <div>
          <strong>Erro no download</strong><br/>
          ${escHtml(error || 'Ocorreu um erro desconhecido.')}
        </div>
      </div>`;
    toast('Erro no download', 'error');
    return;
  }
}

// ── Open folder ───────────────────────────────
function openFolder(dir) {
  fetch(`${API}/api/open-folder?path=${encodeURIComponent(dir)}`).catch(() => {});
}

function downloadFile(id) {
  window.location.href = `${API}/api/download-file/${id}`;
}

// ── History ───────────────────────────────────
function addHistory(entry) {
  history.unshift(entry);
  if (history.length > 20) history = history.slice(0, 20);
  localStorage.setItem('vg_history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historySec.style.display = 'none';
    return;
  }
  historySec.style.display = 'block';

  historyList.innerHTML = history.slice(0, 6).map(h => `
    <div class="history-item">
      <div class="history-thumb">
        ${h.thumbnail
          ? `<img src="${escHtml(h.thumbnail)}" alt="" loading="lazy" />`
          : '<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;">🎥</div>'}
      </div>
      <div class="history-info">
        <div class="history-title" title="${escHtml(h.title)}">${escHtml(h.title)}</div>
        <div class="history-sub">${new Date(h.time).toLocaleString('pt-BR')}</div>
      </div>
      <span class="history-badge ${h.type === 'video' ? 'badge-video' : 'badge-audio'}">
        ${h.type === 'video' ? '🎞️ Vídeo' : '🎵 Áudio'}
      </span>
    </div>
  `).join('');
}

// ── Toast ─────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// ── Utils ─────────────────────────────────────
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function escAttr(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '/').replace(/'/g, "\\'");
}

function fmtViews(n) {
  if (!n) return '';
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B views';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M views';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K views';
  return n + ' views';
}
