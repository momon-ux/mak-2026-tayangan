'use strict';

/* ==========================================================================
   PORTAL TAYANGAN RASMI & SEMAKAN GURU — MAK 2026 SK RANGGU
   - Strim HLS Terenkripsi AES-128 (Hanya Tayangan Sahaja · Tanpa Muat Turun)
   - Ruang Komen & Chat Langsung Guru (Wajib Nama Guru Dahulu)
   ========================================================================== */

const SESSIONS = {
  s1: {
    id: 's1',
    badge: 'SIDANG 1 · JUMAAT PAGI',
    shortName: 'Sidang 1 (Jumaat Pagi)',
    title: 'MAK 2026 — 1 Jumaat Pagi — Fail Utama (27 Nov 2026 · 6.30 Pagi – 10.40 Pagi)',
    playlist: 'streams/s1/index.m3u8',
    poster: 'posters/s1.jpg',
    durationLabel: '59:42'
  },
  s2: {
    id: 's2',
    badge: 'SIDANG 2 · JUMAAT PETANG',
    shortName: 'Sidang 2 (Jumaat Petang)',
    title: 'MAK 2026 — 2 Jumaat Petang — Fail Utama (27 Nov 2026 · 12.50 Tgh Hari – 4.40 Ptg)',
    playlist: 'streams/s2/index.m3u8',
    poster: 'posters/s2.jpg',
    durationLabel: '33:05'
  },
  s3: {
    id: 's3',
    badge: 'SIDANG 3 · SABTU PAGI',
    shortName: 'Sidang 3 (Sabtu Pagi)',
    title: 'MAK 2026 — 3 Sabtu Pagi — Fail Utama (28 Nov 2026 · 6.40 Pagi – 11.30 Pagi)',
    playlist: 'streams/s3/index.m3u8',
    poster: 'posters/s3.jpg',
    durationLabel: '25:01'
  }
};

// Konfigurasi Penyimpanan Komen Langsung Awan (Cloud Sync + Local Backup)
const STORAGE_KEYS = {
  TEACHER_PROFILE: 'mak2026_teacher_profile_v1',
  COMMENTS_CACHE: 'mak2026_comments_cache_v1'
};

// Endpoint Awan dikongsi supaya semua guru & admin melihat komen secara langsung
const CLOUD_SYNC_CONFIG = {
  kvGetUrl: 'https://keyvalue.immanuel.co/api/KeyVal/GetValue/mak2026skrg/komen_guru_v1',
  kvPostUrl: 'https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/mak2026skrg/komen_guru_v1',
  jsonBlobUrl: '' // Diisi jika menggunakan JSONBlob / Apps Script tambahan
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let currentSessionId = 's1';
let hlsInstance = null;
let isSeeking = false;
let teacherProfile = null;
let commentsList = [];
let activeSessionFilter = 'all';
let activeTeacherFilter = '';
let toastTimer = null;
let syncInProgress = false;

/* --------------------------------------------------------------------------
   1. PERLINDUNGAN ANTI-MUAT TURUN & KESELAMATAN LAMAN
   -------------------------------------------------------------------------- */
function showToast(msg) {
  const el = $('security-toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3600);
}

function initSecurityProtections() {
  // Sekat klik kanan di seluruh halaman
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showToast('🔒 Tayangan Rasmi Sahaja — Muat turun atau klik kanan tidak dibenarkan.');
    return false;
  });

  // Sekat seret fail/video/imej
  document.addEventListener('dragstart', (e) => {
    e.preventDefault();
    return false;
  });

  // Sekat pintasan papan kekunci untuk Simpan Laman, Lihat Kod Sumber & DevTools
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    if (
      e.key === 'F12' ||
      (ctrlOrCmd && (key === 's' || key === 'u' || key === 'p')) ||
      (ctrlOrCmd && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
      (e.metaKey && e.altKey && (key === 'i' || key === 'j' || key === 'u'))
    ) {
      e.preventDefault();
      e.stopPropagation();
      showToast('🔒 Mod Tayangan Dilindungi — Simpanan fail & muat turun video dikunci.');
      return false;
    }

    // Pintasan main/jeda menggunakan Spacebar jika tidak sedang menaip di kotak input
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (key === ' ' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) {
      e.preventDefault();
      togglePlayPause();
    }
  });
}

function updateSecurityWatermark() {
  const wm = $('security-watermark');
  if (!wm) return;
  if (teacherProfile && teacherProfile.name) {
    wm.textContent = `TAYANGAN RASMI SK RANGGU · MAK 2026 · ${teacherProfile.name} · DILARANG MUAT TURUN`;
  } else {
    wm.textContent = 'TAYANGAN RASMI SK RANGGU · MAK 2026 · DILARANG MUAT TURUN';
  }
}

/* --------------------------------------------------------------------------
   2. PEMAIN VIDEO HLS TERENKRIPSI AES-128 (TIADA PAUTAN MP4)
   -------------------------------------------------------------------------- */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseTimestampToSeconds(str) {
  const clean = String(str || '').trim();
  const match = clean.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  if (match[3] !== undefined) {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function setLoader(visible, text) {
  const loader = $('stream-loader');
  const txt = $('loader-text');
  if (txt && text) txt.textContent = text;
  if (loader) loader.hidden = !visible;
}

function loadVideoSession(sessionId, autoPlay = false, seekToSeconds = null) {
  const session = SESSIONS[sessionId] || SESSIONS.s1;
  currentSessionId = session.id;

  // Kemas kini kad tab sidang
  document.querySelectorAll('.session-card').forEach((btn) => {
    const active = btn.dataset.session === session.id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  // Kemas kini bar tajuk panggung
  $('now-playing-badge').textContent = session.badge;
  $('now-playing-title').textContent = session.title;
  $('comment-session-select').value = session.id;

  const video = $('protected-video');
  const stage = $('video-stage');
  video.pause();
  stage.classList.remove('playing');
  video.poster = session.poster;
  $('time-readout').textContent = `00:00 / ${session.durationLabel}`;
  $('live-btn-time').textContent = '00:00';
  $('seek-slider').value = '0';

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  setLoader(true, `Memuatkan strim terenkripsi ${session.shortName}...`);

  const onReady = () => {
    setLoader(false);
    video.playbackRate = Number($('speed-select').value || 1);
    if (seekToSeconds !== null && Number.isFinite(seekToSeconds)) {
      video.currentTime = seekToSeconds;
    }
    if (autoPlay) {
      video.play().catch(() => {});
    }
  };

  if (window.Hls && window.Hls.isSupported()) {
    hlsInstance = new window.Hls({
      enableWorker: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60
    });
    hlsInstance.loadSource(session.playlist);
    hlsInstance.attachMedia(video);
    hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, onReady);
    hlsInstance.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data && data.fatal) {
        setLoader(false);
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          hlsInstance.startLoad();
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          hlsInstance.recoverMediaError();
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = session.playlist;
    video.addEventListener('loadedmetadata', onReady, { once: true });
  } else {
    setLoader(false);
    showToast('⚠️ Pelayar anda tidak menyokong strim HLS. Sila guna Chrome, Safari atau Edge terkini.');
  }
}

function togglePlayPause() {
  const video = $('protected-video');
  if (!video) return;
  if (video.paused || video.ended) {
    video.play().catch(() => {
      showToast('Klik butang Main untuk memulakan tayangan.');
    });
  } else {
    video.pause();
  }
}

function initVideoPlayer() {
  const video = $('protected-video');
  const stage = $('video-stage');
  const seekSlider = $('seek-slider');
  const playBtn = $('btn-play-pause');

  // Pastikan atribut kawalan asal sentiasa dibuang supaya tiada menu muat turun pelayar
  video.removeAttribute('controls');
  const observer = new MutationObserver(() => {
    if (video.hasAttribute('controls')) {
      video.removeAttribute('controls');
    }
  });
  observer.observe(video, { attributes: true, attributeFilter: ['controls'] });

  $('video-shield').addEventListener('click', togglePlayPause);
  playBtn.addEventListener('click', togglePlayPause);

  video.addEventListener('play', () => {
    stage.classList.add('playing');
    playBtn.textContent = '⏸ Jeda';
  });

  video.addEventListener('pause', () => {
    stage.classList.remove('playing');
    playBtn.textContent = '▶ Main';
  });

  video.addEventListener('waiting', () => {
    setLoader(true, 'Menimbal strim tayangan...');
  });

  video.addEventListener('playing', () => {
    setLoader(false);
  });

  video.addEventListener('canplay', () => {
    setLoader(false);
  });

  video.addEventListener('timeupdate', () => {
    const cur = video.currentTime || 0;
    const dur = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : parseTimestampToSeconds(SESSIONS[currentSessionId].durationLabel) || 1;
    const curFormatted = formatTime(cur);
    const durFormatted = formatTime(dur);
    $('time-readout').textContent = `${curFormatted} / ${durFormatted}`;
    $('live-btn-time').textContent = curFormatted;
    if (!isSeeking && dur > 0) {
      seekSlider.value = String(Math.round((cur / dur) * 1000));
    }
  });

  seekSlider.addEventListener('input', () => {
    isSeeking = true;
  });

  seekSlider.addEventListener('change', () => {
    const dur = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : parseTimestampToSeconds(SESSIONS[currentSessionId].durationLabel) || 0;
    if (dur > 0) {
      video.currentTime = (Number(seekSlider.value) / 1000) * dur;
    }
    isSeeking = false;
  });

  $('btn-rewind').addEventListener('click', () => {
    video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
  });

  $('btn-forward').addEventListener('click', () => {
    const dur = video.duration || 99999;
    video.currentTime = Math.min(dur, (video.currentTime || 0) + 10);
  });

  $('btn-mute').addEventListener('click', () => {
    video.muted = !video.muted;
    $('btn-mute').textContent = video.muted ? '🔇' : '🔊';
  });

  $('volume-slider').addEventListener('input', (e) => {
    video.volume = Number(e.target.value);
    video.muted = video.volume === 0;
    $('btn-mute').textContent = video.muted ? '🔇' : '🔊';
  });

  $('speed-select').addEventListener('change', (e) => {
    video.playbackRate = Number(e.target.value || 1);
  });

  $('btn-fullscreen').addEventListener('click', () => {
    // Fullscreen pada kontena stage supaya perisai & tera air kekal melindungi video
    const container = $('panggung');
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  });

  // Butang "Komen Slaid Ini" pada pemain video
  $('btn-comment-timestamp').addEventListener('click', () => {
    video.pause();
    const curFormatted = formatTime(video.currentTime || 0);
    $('comment-session-select').value = currentSessionId;
    $('comment-timestamp-input').value = curFormatted;
    $('ruang-komen').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      if (!teacherProfile || !teacherProfile.name) {
        highlightTeacherNameGate();
      } else {
        $('comment-text-input').focus();
      }
    }, 450);
  });

  // Tukar sidang apabila klik kad sidang
  document.querySelectorAll('.session-card').forEach((card) => {
    card.addEventListener('click', () => {
      const targetId = card.dataset.session;
      if (targetId && targetId !== currentSessionId) {
        loadVideoSession(targetId, true);
      }
    });
  });

  loadVideoSession('s1', false);
}

/* --------------------------------------------------------------------------
   3. PENGESAHAN NAMA GURU WAJIB SEBELUM KOMEN
   -------------------------------------------------------------------------- */
function getInitials(name) {
  const parts = String(name || '')
    .replace(/^(CIKGU|USTAZ|USTAZAH|PUAN|ENCIK|TUAN|PN|EN)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'CG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function normalizeTeacherName(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('ms-MY');
}

function highlightTeacherNameGate() {
  const gateBox = $('teacher-gate-box');
  gateBox.classList.remove('shake');
  void gateBox.offsetWidth; // Reflow untuk animasi
  gateBox.classList.add('shake');
  showToast('⚠️ Sila tulis & sahkan NAMA PENUH anda terlebih dahulu di Langkah 1 supaya senang dikesan siapa yang komen.');
  $('teacher-name-input').focus();
}

function applyTeacherProfileUI() {
  const gateBox = $('teacher-gate-box');
  const unverifiedView = $('gate-unverified-view');
  const verifiedView = $('gate-verified-view');
  const textarea = $('comment-text-input');

  if (teacherProfile && teacherProfile.name) {
    gateBox.classList.add('verified');
    unverifiedView.hidden = true;
    verifiedView.hidden = false;
    $('verified-name-display').textContent = teacherProfile.name;
    $('verified-role-display').textContent = `(${teacherProfile.role || 'Guru'})`;
    $('verified-avatar').textContent = getInitials(teacherProfile.name);
    textarea.placeholder = `Tulis komen atau semakan anda sebagai ${teacherProfile.name} (nyatakan nama murid / kelas / slaid jika berkaitan)...`;
  } else {
    gateBox.classList.remove('verified');
    unverifiedView.hidden = false;
    verifiedView.hidden = true;
    textarea.placeholder = '⚠️ Sila tulis & sahkan NAMA PENUH anda di Langkah 1 di atas terlebih dahulu sebelum menulis komen...';
  }
  updateSecurityWatermark();
}

function saveTeacherProfile(name, role) {
  const cleanName = normalizeTeacherName(name);
  const letterCount = (cleanName.match(/[A-Z]/g) || []).length;
  if (letterCount < 3) {
    highlightTeacherNameGate();
    return false;
  }
  teacherProfile = {
    name: cleanName,
    role: String(role || 'Guru Kelas').trim()
  };
  try {
    localStorage.setItem(STORAGE_KEYS.TEACHER_PROFILE, JSON.stringify(teacherProfile));
  } catch (_) {}
  applyTeacherProfileUI();
  showToast(`✓ Nama disahkan: ${teacherProfile.name}. Anda kini boleh menghantar komen.`);
  return true;
}

function initTeacherGate() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.TEACHER_PROFILE);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.name && parsed.name.length >= 3) {
        teacherProfile = parsed;
        $('teacher-name-input').value = parsed.name;
        $('teacher-role-input').value = parsed.role || 'Guru Kelas';
      }
    }
  } catch (_) {}

  applyTeacherProfileUI();

  $('teacher-gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = saveTeacherProfile(
      $('teacher-name-input').value,
      $('teacher-role-input').value
    );
    if (ok) {
      $('comment-text-input').focus();
    }
  });

  $('btn-change-name').addEventListener('click', () => {
    const currentName = teacherProfile ? teacherProfile.name : '';
    const currentRole = teacherProfile ? teacherProfile.role : 'Guru Kelas';
    teacherProfile = null;
    applyTeacherProfileUI();
    $('teacher-name-input').value = currentName;
    $('teacher-role-input').value = currentRole;
    $('teacher-name-input').focus();
  });

  // Jika guru klik kotak komen sebelum isi nama, minta isi nama dahulu
  $('comment-text-input').addEventListener('focus', () => {
    if (!teacherProfile || !teacherProfile.name) {
      const typedName = normalizeTeacherName($('teacher-name-input').value);
      if ((typedName.match(/[A-Z]/g) || []).length >= 3) {
        saveTeacherProfile(typedName, $('teacher-role-input').value);
      } else {
        highlightTeacherNameGate();
      }
    }
  });
}

/* --------------------------------------------------------------------------
   4. SISTEM KOMEN & PENYEGERAKAN LANGSUNG (CLOUD SYNC + DETECTOR SIAPA KOMEN)
   -------------------------------------------------------------------------- */
function mergeComments(listA, listB) {
  const map = new Map();
  for (const item of [...(listA || []), ...(listB || [])]) {
    if (item && item.id && item.teacherName && item.text) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function loadLocalComments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMMENTS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveLocalComments(list) {
  try {
    localStorage.setItem(STORAGE_KEYS.COMMENTS_CACHE, JSON.stringify(list));
  } catch (_) {}
}

function encodeCloudPayload(comments) {
  // Simpan sehingga 250 komen terkini dalam format Base64 URL-safe
  const slim = comments.slice(0, 250);
  const json = JSON.stringify(slim);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeCloudPayload(str) {
  if (!str || typeof str !== 'string') return [];
  const clean = str.trim().replace(/^"|"$/g, '');
  if (!clean || clean === 'null') return [];
  try {
    const b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function syncCommentsFromCloud(newCommentToPush = null) {
  if (syncInProgress && !newCommentToPush) return;
  syncInProgress = true;
  const indicator = $('sync-indicator');
  try {
    if (CLOUD_SYNC_CONFIG.jsonBlobUrl) {
      const res = await fetch(`${CLOUD_SYNC_CONFIG.jsonBlobUrl}?_=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        const cloudComments = Array.isArray(data && data.comments) ? data.comments : (Array.isArray(data) ? data : []);
        const localComments = loadLocalComments();
        const extra = newCommentToPush ? [newCommentToPush] : [];
        commentsList = mergeComments(mergeComments(cloudComments, localComments), extra);
        saveLocalComments(commentsList);

        if (newCommentToPush || commentsList.length > cloudComments.length) {
          await fetch(CLOUD_SYNC_CONFIG.jsonBlobUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ updatedAt: Date.now(), comments: commentsList.slice(0, 300) })
          });
        }
        if (indicator) {
          const timeStr = new Intl.DateTimeFormat('ms-MY', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }).format(new Date());
          indicator.textContent = `🟢 Disambung secara langsung · Kemas kini: ${timeStr}`;
        }
        return;
      }
    }
  } catch (_) {
    if (indicator) {
      indicator.textContent = '🟡 Mod simpanan langsung aktif';
    }
  } finally {
    syncInProgress = false;
    renderCommentsSection();
  }
}

function formatDateTimeMY(timestamp) {
  try {
    return new Intl.DateTimeFormat('ms-MY', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kuching'
    }).format(new Date(timestamp));
  } catch (_) {
    return new Date(timestamp).toLocaleString('ms-MY');
  }
}

function renderTeacherDetectorChips() {
  const container = $('teacher-chips-container');
  const countsByTeacher = new Map();
  for (const c of commentsList) {
    const name = c.teacherName || 'GURU';
    countsByTeacher.set(name, (countsByTeacher.get(name) || 0) + 1);
  }

  $('stat-total-comments').textContent = String(commentsList.length);
  $('stat-total-teachers').textContent = String(countsByTeacher.size);

  if (countsByTeacher.size === 0) {
    container.innerHTML = '<span style="font-size:0.82rem;color:var(--muted);">Belum ada guru yang menghantar komen.</span>';
    return;
  }

  const allChipActive = activeTeacherFilter === '' ? 'active' : '';
  let html = `<button type="button" class="teacher-chip ${allChipActive}" data-teacher="">Semua Guru <span class="count">${commentsList.length}</span></button>`;

  for (const [name, count] of countsByTeacher.entries()) {
    const isActive = activeTeacherFilter === name ? 'active' : '';
    html += `
      <button type="button" class="teacher-chip ${isActive}" data-teacher="${esc(name)}">
        👤 ${esc(name)} <span class="count">${count}</span>
      </button>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.teacher-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTeacherFilter = btn.dataset.teacher || '';
      renderCommentsSection();
    });
  });
}

function getFilteredComments() {
  const q = ($('comment-search-input').value || '').trim().toLocaleUpperCase('ms-MY');
  return commentsList.filter((c) => {
    if (activeSessionFilter !== 'all' && c.sessionId !== activeSessionFilter) return false;
    if (activeTeacherFilter && c.teacherName !== activeTeacherFilter) return false;
    if (q) {
      const hay = `${c.teacherName} ${c.teacherRole} ${c.category} ${c.text} ${c.videoTimestamp || ''}`.toLocaleUpperCase('ms-MY');
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderCommentsSection() {
  renderTeacherDetectorChips();
  const feed = $('comments-feed');
  const filtered = getFilteredComments();

  if (!filtered.length) {
    feed.innerHTML = `
      <div class="empty-comments">
        <strong>Tiada komen ditemui untuk paparan ini.</strong>
        <p style="margin:6px 0 0;font-size:0.86rem;">Sila sahkan nama penuh anda di Langkah 1 di atas dan hantar maklum balas slaid di ruangan komen.</p>
      </div>
    `;
    return;
  }

  feed.innerHTML = filtered.map((c) => {
    const sess = SESSIONS[c.sessionId] || SESSIONS.s1;
    const hasTime = c.videoTimestamp && parseTimestampToSeconds(c.videoTimestamp) !== null;
    return `
      <article class="comment-card">
        <div class="teacher-avatar" title="${esc(c.teacherName)}">${esc(getInitials(c.teacherName))}</div>
        <div class="comment-body">
          <div class="comment-top">
            <div class="comment-author-wrap">
              <span class="comment-author">${esc(c.teacherName)}</span>
              <span class="comment-role-tag">${esc(c.teacherRole || 'Guru')}</span>
              <span class="comment-category-tag">${esc(c.category || 'Semakan')}</span>
            </div>
            <span class="comment-time-meta">${esc(formatDateTimeMY(c.createdAt))}</span>
          </div>
          <div class="comment-badges-row">
            <span class="comment-sidang-badge">${esc(sess.shortName)}</span>
            ${hasTime ? `
              <button type="button" class="comment-jump-btn" data-jump-session="${esc(c.sessionId)}" data-jump-time="${esc(c.videoTimestamp)}" title="Klik untuk lompat ke minit ${esc(c.videoTimestamp)} dalam video">
                ▶ Lihat Minit ${esc(c.videoTimestamp)}
              </button>
            ` : ''}
          </div>
          <p class="comment-text">${esc(c.text)}</p>
        </div>
      </article>
    `;
  }).join('');

  // Pautan lompat terus ke cap masa video apabila diklik
  feed.querySelectorAll('.comment-jump-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetSession = btn.dataset.jumpSession || 's1';
      const targetTimeStr = btn.dataset.jumpTime || '00:00';
      const targetSeconds = parseTimestampToSeconds(targetTimeStr) || 0;
      $('panggung').scrollIntoView({ behavior: 'smooth' });
      if (targetSession !== currentSessionId) {
        loadVideoSession(targetSession, true, targetSeconds);
      } else {
        const video = $('protected-video');
        video.currentTime = targetSeconds;
        video.play().catch(() => {});
      }
      showToast(`⏱ Melompat ke ${SESSIONS[targetSession].shortName} — Minit ${targetTimeStr}`);
    });
  });
}

function initCommentSystem() {
  commentsList = loadLocalComments();
  renderCommentsSection();

  // Butang Ambil Masa Semasa Video
  $('btn-grab-current-time').addEventListener('click', () => {
    const video = $('protected-video');
    $('comment-timestamp-input').value = formatTime(video.currentTime || 0);
    $('comment-session-select').value = currentSessionId;
    showToast(`⏱ Cap masa ${$('comment-timestamp-input').value} dimasukkan ke borang komen.`);
  });

  // Hantar Komen Guru
  $('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Wajibkan pengesahan nama guru terlebih dahulu
    if (!teacherProfile || !teacherProfile.name) {
      const typedName = normalizeTeacherName($('teacher-name-input').value);
      if ((typedName.match(/[A-Z]/g) || []).length >= 3) {
        const ok = saveTeacherProfile(typedName, $('teacher-role-input').value);
        if (!ok) return;
      } else {
        highlightTeacherNameGate();
        return;
      }
    }

    const text = ($('comment-text-input').value || '').trim();
    if (!text) {
      $('comment-text-input').focus();
      return;
    }

    const sessionId = $('comment-session-select').value || currentSessionId;
    const category = $('comment-category-select').value || 'Semakan Slaid / Ejaan Nama';
    const rawTime = ($('comment-timestamp-input').value || '').trim();
    const videoTimestamp = rawTime || formatTime($('protected-video').currentTime || 0);

    const newComment = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      teacherName: teacherProfile.name,
      teacherRole: teacherProfile.role || 'Guru',
      sessionId,
      category,
      videoTimestamp,
      text,
      createdAt: Date.now()
    };

    commentsList = mergeComments([newComment], commentsList);
    saveLocalComments(commentsList);
    $('comment-text-input').value = '';
    $('comment-timestamp-input').value = '';
    renderCommentsSection();
    showToast(`✓ Terima kasih ${teacherProfile.name}! Komen anda telah direkodkan.`);

    await syncCommentsFromCloud(newComment);
  });

  // Penapis Sidang
  document.querySelectorAll('[data-filter-session]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSessionFilter = btn.dataset.filterSession || 'all';
      document.querySelectorAll('[data-filter-session]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderCommentsSection();
    });
  });

  // Carian Komen
  $('comment-search-input').addEventListener('input', () => {
    renderCommentsSection();
  });

  // Segar Semula Komen dari Awan
  $('btn-refresh-comments').addEventListener('click', () => {
    showToast('🔄 Menyemak komen terkini...');
    syncCommentsFromCloud();
  });

  // Salin Format WhatsApp
  $('btn-copy-whatsapp').addEventListener('click', async () => {
    const filtered = getFilteredComments();
    if (!filtered.length) {
      showToast('Tiada komen untuk disalin.');
      return;
    }
    const lines = [
      '*SENARAI KOMEN & SEMAKAN GURU — MAK 2026 SK RANGGU*',
      `Jumlah Komen: ${filtered.length}`,
      '----------------------------------------'
    ];
    filtered.forEach((c, idx) => {
      const sess = SESSIONS[c.sessionId] || SESSIONS.s1;
      lines.push(
        `${idx + 1}. *${c.teacherName}* (${c.teacherRole})`,
        `   🎬 ${sess.shortName} ${c.videoTimestamp ? `[Minit ${c.videoTimestamp}]` : ''} · _${c.category}_`,
        `   💬 ${c.text}`,
        ''
      );
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showToast('📋 Ringkasan komen berjaya disalin! Sedia ditampal ke WhatsApp.');
    } catch (_) {
      showToast('Tidak dapat menyalin secara automatik. Sila guna butang Muat Turun CSV.');
    }
  });

  // Eksport CSV
  $('btn-export-csv').addEventListener('click', () => {
    const filtered = getFilteredComments();
    if (!filtered.length) {
      showToast('Tiada komen untuk dimuat turun.');
      return;
    }
    const quote = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [
      ['Bil', 'Nama Penuh Guru', 'Peranan / Unit', 'Sidang Video', 'Cap Masa Video', 'Kategori Maklum Balas', 'Isi Komen Guru', 'Tarikh & Masa'],
      ...filtered.map((c, idx) => [
        idx + 1,
        c.teacherName,
        c.teacherRole,
        (SESSIONS[c.sessionId] || SESSIONS.s1).shortName,
        c.videoTimestamp || '-',
        c.category,
        c.text,
        formatDateTimeMY(c.createdAt)
      ])
    ];
    const csvContent = rows.map((r) => r.map(quote).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Rekod-Komen-Guru-MAK-2026-SK-Ranggu.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    showToast('📊 Fail CSV rekod komen guru telah dimuat turun.');
  });

  // Segerakkan komen dari awan setiap 15 saat
  syncCommentsFromCloud();
  setInterval(() => syncCommentsFromCloud(), 15000);
}

/* --------------------------------------------------------------------------
   MULA APLIKASI
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initSecurityProtections();
  initTeacherGate();
  initVideoPlayer();
  initCommentSystem();
});
