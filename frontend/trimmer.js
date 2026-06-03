/* ──────────────────────────────────────────────
   VideoGrab — trimmer.js
   Video preview & trim controls
   ────────────────────────────────────────────── */

const Trimmer = (() => {
  // DOM element references (resolved in init)
  let els = {};
  let video = null;

  // State
  let _duration = 0;
  let _trimStart = 0;
  let _trimEnd = 0;
  let _dragging = null;   // 'start' | 'end' | 'playhead' | null
  let _animFrame = null;
  let _isActive = false;
  let _onTrimConfirm = null;
  let _listenersAttached = false;

  // ── Public API ────────────────────────────────

  function init(videoUrl, durationSeconds, onConfirm) {
    // Clean up previous instance
    if (_isActive) destroy();

    _onTrimConfirm = onConfirm;
    _duration = durationSeconds || 0;
    _trimStart = 0;
    _trimEnd = _duration;
    _isActive = true;

    // Resolve DOM
    els = {
      section:      document.getElementById('trimmer-section'),
      video:        document.getElementById('trim-video'),
      timeline:     document.getElementById('trim-timeline'),
      region:       document.getElementById('trim-region'),
      handleStart:  document.getElementById('handle-start'),
      handleEnd:    document.getElementById('handle-end'),
      playhead:     document.getElementById('trim-playhead'),
      startTime:    document.getElementById('trim-start-time'),
      endTime:      document.getElementById('trim-end-time'),
      clipDuration: document.getElementById('trim-clip-duration'),
      currentTime:  document.getElementById('current-time-display'),
      playPauseBtn: document.getElementById('trim-play-pause'),
      downloadBtn:  document.getElementById('btn-trim-download'),
      downloadText: document.getElementById('btn-trim-download-text'),
    };

    video = els.video;

    // Set video source via preview proxy
    const previewSrc = `/api/preview?url=${encodeURIComponent(videoUrl)}`;
    video.src = previewSrc;
    video.load();

    // When metadata arrives, use the real duration
    video.onloadedmetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        _duration = video.duration;
        _trimEnd = _duration;
        _updateUI();
      }
    };

    video.onerror = () => {
      console.warn('Trimmer: preview video failed to load');
    };

    // Attach event listeners (only once)
    if (!_listenersAttached) {
      _attachListeners();
      _listenersAttached = true;
    }

    // Show section
    els.section.classList.add('visible');
    els.section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Start animation loop for UI updates
    _startUpdateLoop();
    _updateUI();
  }

  function destroy() {
    _isActive = false;
    if (_animFrame) {
      cancelAnimationFrame(_animFrame);
      _animFrame = null;
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (els.section) {
      els.section.classList.remove('visible');
    }
  }

  function getTrimRange() {
    return { start: _trimStart, end: _trimEnd };
  }

  // ── Event Listeners ───────────────────────────

  function _attachListeners() {
    // Timeline mouse/touch for seeking & dragging
    document.getElementById('trim-timeline')
      .addEventListener('mousedown', _onTimelineDown);
    document.getElementById('trim-timeline')
      .addEventListener('touchstart', _onTimelineDown, { passive: false });
    document.addEventListener('mousemove', _onTimelineMove);
    document.addEventListener('touchmove', _onTimelineMove, { passive: false });
    document.addEventListener('mouseup', _onTimelineUp);
    document.addEventListener('touchend', _onTimelineUp);

    // Handle drags (stop propagation so timeline click doesn't fire)
    document.getElementById('handle-start').addEventListener('mousedown', (e) => {
      e.stopPropagation(); _dragging = 'start';
    });
    document.getElementById('handle-start').addEventListener('touchstart', (e) => {
      e.stopPropagation(); e.preventDefault(); _dragging = 'start';
    }, { passive: false });
    document.getElementById('handle-end').addEventListener('mousedown', (e) => {
      e.stopPropagation(); _dragging = 'end';
    });
    document.getElementById('handle-end').addEventListener('touchstart', (e) => {
      e.stopPropagation(); e.preventDefault(); _dragging = 'end';
    }, { passive: false });

    // Playback controls
    document.getElementById('trim-play-pause').addEventListener('click', _togglePlayPause);
    document.getElementById('frame-back').addEventListener('click', () => _seekDelta(-1 / 30));
    document.getElementById('frame-forward').addEventListener('click', () => _seekDelta(1 / 30));
    document.getElementById('skip-back-5').addEventListener('click', () => _seekDelta(-5));
    document.getElementById('skip-forward-5').addEventListener('click', () => _seekDelta(5));

    // Set markers
    document.getElementById('set-start').addEventListener('click', _setTrimStartHere);
    document.getElementById('set-end').addEventListener('click', _setTrimEndHere);

    // Download clip
    document.getElementById('btn-trim-download').addEventListener('click', () => {
      if (_onTrimConfirm) _onTrimConfirm(_trimStart, _trimEnd);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', _onKeyDown);
  }

  function _onKeyDown(e) {
    if (!_isActive) return;
    // Don't capture if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        _togglePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        _seekDelta(e.shiftKey ? -5 : -1 / 30);
        break;
      case 'ArrowRight':
        e.preventDefault();
        _seekDelta(e.shiftKey ? 5 : 1 / 30);
        break;
      case 'i':
      case 'I':
        _setTrimStartHere();
        break;
      case 'o':
      case 'O':
        _setTrimEndHere();
        break;
    }
  }

  // ── Timeline Interaction ──────────────────────

  function _onTimelineDown(e) {
    if (!_isActive) return;
    if (_dragging) return; // Handle drag takes priority
    e.preventDefault();
    _dragging = 'playhead';
    _seekToPointer(e);
  }

  function _onTimelineMove(e) {
    if (!_isActive || !_dragging) return;
    e.preventDefault();
    _seekToPointer(e);
  }

  function _onTimelineUp() {
    _dragging = null;
  }

  function _seekToPointer(e) {
    const rect = document.getElementById('trim-timeline').getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    const t = pct * _duration;

    if (_dragging === 'start') {
      _trimStart = Math.max(0, Math.min(t, _trimEnd - 0.5));
      video.currentTime = _trimStart;
    } else if (_dragging === 'end') {
      _trimEnd = Math.min(_duration, Math.max(t, _trimStart + 0.5));
      video.currentTime = _trimEnd;
    } else if (_dragging === 'playhead') {
      video.currentTime = t;
    }
    _updateUI();
  }

  // ── Playback Controls ─────────────────────────

  function _togglePlayPause() {
    if (!video) return;
    if (video.paused) {
      // Start from trim region if outside
      if (video.currentTime < _trimStart || video.currentTime >= _trimEnd) {
        video.currentTime = _trimStart;
      }
      video.play();
      els.playPauseBtn.textContent = '⏸';
    } else {
      video.pause();
      els.playPauseBtn.textContent = '▶';
    }
  }

  function _seekDelta(seconds) {
    if (!video) return;
    video.pause();
    els.playPauseBtn.textContent = '▶';
    let t = video.currentTime + seconds;
    t = Math.max(0, Math.min(_duration, t));
    video.currentTime = t;
    _updateUI();
  }

  function _setTrimStartHere() {
    if (!video) return;
    _trimStart = Math.max(0, Math.min(video.currentTime, _trimEnd - 0.5));
    _updateUI();
  }

  function _setTrimEndHere() {
    if (!video) return;
    _trimEnd = Math.min(_duration, Math.max(video.currentTime, _trimStart + 0.5));
    _updateUI();
  }

  // ── UI Updates ────────────────────────────────

  function _updateUI() {
    if (!_duration || !els.timeline) return;

    const startPct = (_trimStart / _duration) * 100;
    const endPct = (_trimEnd / _duration) * 100;
    const currentPct = ((video?.currentTime || 0) / _duration) * 100;

    // Position handles
    els.handleStart.style.left = startPct + '%';
    els.handleEnd.style.left = endPct + '%';

    // Region highlight
    els.region.style.left = startPct + '%';
    els.region.style.width = (endPct - startPct) + '%';

    // Playhead
    els.playhead.style.left = currentPct + '%';

    // Time displays
    els.startTime.textContent = _fmtTime(_trimStart);
    els.endTime.textContent = _fmtTime(_trimEnd);
    els.clipDuration.textContent = _fmtTime(_trimEnd - _trimStart);
    els.currentTime.textContent = _fmtTime(video?.currentTime || 0);

    // Download button text
    els.downloadText.textContent = `Baixar clip (${_fmtTime(_trimEnd - _trimStart)})`;

    // Constrain playback to trim region
    if (video && !video.paused && video.currentTime >= _trimEnd) {
      video.pause();
      video.currentTime = _trimEnd;
      els.playPauseBtn.textContent = '▶';
    }
  }

  function _startUpdateLoop() {
    function loop() {
      if (_isActive && video && !video.paused) {
        _updateUI();
      }
      _animFrame = requestAnimationFrame(loop);
    }
    if (_animFrame) cancelAnimationFrame(_animFrame);
    loop();
  }

  function _fmtTime(seconds) {
    if (seconds == null || !isFinite(seconds) || seconds < 0) return '0:00.00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);

    let str = '';
    if (h > 0) str += h + ':' + String(m).padStart(2, '0');
    else str += m;
    str += ':' + String(s).padStart(2, '0');
    str += '.' + String(cs).padStart(2, '0');
    return str;
  }

  // ── Public interface ──────────────────────────
  return { init, destroy, getTrimRange };
})();
