'use strict';

/* ==========================================================================
   PORTAL TAYANGAN RASMI & SEMAKAN GURU — MAK 2026 SK RANGGU
   - Strim HLS Terenkripsi AES-128 (Hanya Tayangan Sahaja · Tanpa Muat Turun)
   - Panel Kawalan Admin (Tukar Video, Muat Naik Video, Kawal Sidang & Komen)
   - Ruang Komen & Chat Langsung Guru (Wajib Nama Guru Dahulu)
   ========================================================================== */

const DEFAULT_SESSIONS = {
  s1: {
    id: 's1',
    badge: 'SIDANG 1 · JUMAAT PAGI',
    cardTitle: 'Hari Pertama (Pagi)',
    shortName: 'Sidang 1 (Jumaat Pagi)',
    subtitle: '27 Nov 2026 (Jumaat) · 6.30 Pagi – 10.40 Pagi · Durasi: 59m 42s',
    title: 'MAK 2026 — 1 Jumaat Pagi — Fail Utama (27 Nov 2026 · 6.30 Pagi – 10.40 Pagi)',
    playlist: 'streams/s1/index.m3u8',
    poster: 'posters/s1.jpg',
    durationLabel: '59:42'
  },
  s2: {
    id: 's2',
    badge: 'SIDANG 2 · JUMAAT PETANG',
    cardTitle: 'Hari Pertama (Petang)',
    shortName: 'Sidang 2 (Jumaat Petang)',
    subtitle: '27 Nov 2026 (Jumaat) · 12.50 Tgh Hari – 4.40 Ptg · Durasi: 33m 05s',
    title: 'MAK 2026 — 2 Jumaat Petang — Fail Utama (27 Nov 2026 · 12.50 Tgh Hari – 4.40 Ptg)',
    playlist: 'streams/s2/index.m3u8',
    poster: 'posters/s2.jpg',
    durationLabel: '33:05'
  },
  s3: {
    id: 's3',
    badge: 'SIDANG 3 · SABTU PAGI',
    cardTitle: 'Hari Kedua (Sabtu Pagi)',
    shortName: 'Sidang 3 (Sabtu Pagi)',
    subtitle: '28 Nov 2026 (Sabtu) · 6.40 Pagi – 11.30 Pagi · Durasi: 25m 01s',
    title: 'MAK 2026 — 3 Sabtu Pagi — Fail Utama (28 Nov 2026 · 6.40 Pagi – 11.30 Pagi)',
    playlist: 'streams/s3/index.m3u8',
    poster: 'posters/s3.jpg',
    durationLabel: '25:01'
  }
};

let SESSIONS = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));

const STORAGE_KEYS = {
  TEACHER_PROFILE: 'mak2026_teacher_profile_v1',
  COMMENTS_CACHE: 'mak2026_comments_cache_v1',
  LIVE_CONFIG_CACHE: 'mak2026_live_config_v1',
  ADMIN_SESSION: 'mak2026_admin_auth_v1'
};

const ADMIN_HASH = 'f4cf6f28cd1d68e6394b136e8877ab487018648509770a73153bf0af2b3168d9';

const CLOUD_SYNC_CONFIG = {
  repoApiBase: 'https://api.github.com/repos/momon-ux/mak-2026-tayangan',
  issuesUrl: 'https://api.github.com/repos/momon-ux/mak-2026-tayangan/issues/1',
  issuesCommentsUrl: 'https://api.github.com/repos/momon-ux/mak-2026-tayangan/issues/1/comments',
  rawBaseUrl: 'https://raw.githubusercontent.com/momon-ux/mak-2026-tayangan/main',
  keyBytes: [110, 111, 118, 102, 79, 126, 74, 80, 107, 122, 81, 113, 117, 73, 80, 83, 105, 107, 121, 58, 129, 61, 76, 78, 61, 91, 82, 62, 59, 96, 127, 72, 121, 119, 56, 124, 127, 93, 91, 119]
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let currentSessionId = 's1';
let userHasSwitchedSession = false;
let hlsInstance = null;
let currentBlobUrl = null;
let isSeeking = false;
let teacherProfile = null;
let commentsList = [];
let activeSessionFilter = 'all';
let activeTeacherFilter = '';
let toastTimer = null;
let syncInProgress = false;
let isAdmin = false;
let adminMethod = 'upload';

let livePortalConfig = {
  defaultSession: 's1',
  announcement: '',
  sessions: {},
  resolvedComments: {},
  deletedComments: {}
};

function getCloudHeader() {
  const k = CLOUD_SYNC_CONFIG.keyBytes.map((b) => String.fromCharCode(b - 7)).join('');
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `token ${k}`
  };
}

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
  }, 3800);
}

function initSecurityProtections() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  document.addEventListener('dragstart', (e) => {
    e.preventDefault();
    return false;
  });

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
      return false;
    }

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
    wm.textContent = `TAYANGAN RASMI SK RANGGU · MAK 2026 · ${teacherProfile.name}`;
  } else {
    wm.textContent = 'TAYANGAN RASMI SK RANGGU · MAK 2026';
  }
}

/* --------------------------------------------------------------------------
   2. KONFIGURASI LANGSUNG AWAN & PANEL KAWALAN ADMIN (TUKAR VIDEO)
   -------------------------------------------------------------------------- */
function applyLiveConfigToSessions() {
  SESSIONS = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
  const overrides = (livePortalConfig && livePortalConfig.sessions) || {};
  for (const sid of ['s1', 's2', 's3']) {
    if (overrides[sid]) {
      SESSIONS[sid] = {
        ...SESSIONS[sid],
        ...overrides[sid],
        id: sid
      };
    }
    // Kemas kini teks pada kad tab di halaman
    const card = $(`tab-${sid}`);
    if (card) {
      const strong = card.querySelector('strong');
      const small = card.querySelector('small');
      if (strong && SESSIONS[sid].cardTitle) strong.textContent = SESSIONS[sid].cardTitle;
      if (small && SESSIONS[sid].subtitle) small.textContent = SESSIONS[sid].subtitle;
    }
  }

  // Kemas kini banner pengumuman pentadbir
  const annBar = $('live-announcement-bar');
  if (annBar) {
    const annText = String(livePortalConfig.announcement || '').trim();
    if (annText) {
      annBar.innerHTML = `<span>📢 <strong>Makluman Pentadbir MAK 2026:</strong> ${esc(annText)}</span>`;
      annBar.hidden = false;
    } else {
      annBar.hidden = true;
    }
  }

  // Kemas kini tajuk sidang yang sedang aktif
  const cur = SESSIONS[currentSessionId] || SESSIONS.s1;
  if ($('now-playing-badge')) $('now-playing-badge').textContent = cur.badge;
  if ($('now-playing-title')) $('now-playing-title').textContent = cur.title;
  renderAdminSummary();
}

function renderAdminSummary() {
  const box = $('admin-current-summary');
  if (!box) return;
  const defSess = SESSIONS[livePortalConfig.defaultSession || 's1'] || SESSIONS.s1;
  box.innerHTML = `
    <strong>📋 Status Semasa Ketiga-tiga Sidang:</strong>
    <ul style="margin:6px 0 0;padding-left:18px;">
      <li><strong>Sidang Utama:</strong> ${esc(defSess.shortName)}</li>
      <li><strong>Sidang 1:</strong> <code>${esc(SESSIONS.s1.playlist)}</code> (${esc(SESSIONS.s1.durationLabel)})</li>
      <li><strong>Sidang 2:</strong> <code>${esc(SESSIONS.s2.playlist)}</code> (${esc(SESSIONS.s2.durationLabel)})</li>
      <li><strong>Sidang 3:</strong> <code>${esc(SESSIONS.s3.playlist)}</code> (${esc(SESSIONS.s3.durationLabel)})</li>
    </ul>
  `;
}

function populateAdminFormForSession(sid) {
  const s = SESSIONS[sid] || SESSIONS.s1;
  if ($('admin-target-session')) $('admin-target-session').value = sid;
  if ($('admin-video-url')) $('admin-video-url').value = s.playlist || '';
  if ($('admin-session-title')) $('admin-session-title').value = s.title || '';
  if ($('admin-session-duration')) $('admin-session-duration').value = s.durationLabel || '';
  if ($('admin-session-subtitle')) $('admin-session-subtitle').value = s.subtitle || '';
}

async function fetchLiveConfigFromCloud(isInitial = false) {
  try {
    const res = await fetch(`${CLOUD_SYNC_CONFIG.issuesUrl}?_=${Date.now()}`, {
      method: 'GET',
      headers: getCloudHeader(),
      cache: 'no-store'
    });
    if (!res.ok) return;
    const issue = await res.json();
    const body = String(issue.body || '');
    const match = body.match(/CONFIG_JSON:(\{[\s\S]*\})/);
    if (match) {
      const parsed = JSON.parse(match[1]);
      const oldPlaylist = (SESSIONS[currentSessionId] && SESSIONS[currentSessionId].playlist) || '';
      livePortalConfig = {
        defaultSession: parsed.defaultSession || 's1',
        announcement: parsed.announcement || '',
        sessions: parsed.sessions || {},
        resolvedComments: parsed.resolvedComments || {},
        deletedComments: parsed.deletedComments || {}
      };
      try {
        localStorage.setItem(STORAGE_KEYS.LIVE_CONFIG_CACHE, JSON.stringify(livePortalConfig));
      } catch (_) {}
      applyLiveConfigToSessions();

      const newPlaylist = (SESSIONS[currentSessionId] && SESSIONS[currentSessionId].playlist) || '';
      if (isInitial && !userHasSwitchedSession && livePortalConfig.defaultSession && livePortalConfig.defaultSession !== currentSessionId) {
        loadVideoSession(livePortalConfig.defaultSession, false);
      } else if (oldPlaylist && newPlaylist && oldPlaylist !== newPlaylist) {
        loadVideoSession(currentSessionId, false);
      }
      if ($('admin-default-session')) $('admin-default-session').value = livePortalConfig.defaultSession || 's1';
      if ($('admin-announcement-input')) $('admin-announcement-input').value = livePortalConfig.announcement || '';
    }
  } catch (_) {}
}

async function saveLiveConfigToCloud() {
  const payload = `Saluran storan masa nyata untuk komen dan konfigurasi video MAK 2026.\nCONFIG_JSON:${JSON.stringify(livePortalConfig)}`;
  const res = await fetch(CLOUD_SYNC_CONFIG.issuesUrl, {
    method: 'PATCH',
    headers: {
      ...getCloudHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: payload })
  });
  if (!res.ok) {
    throw new Error('Gagal menyimpan konfigurasi ke awan GitHub.');
  }
  try {
    localStorage.setItem(STORAGE_KEYS.LIVE_CONFIG_CACHE, JSON.stringify(livePortalConfig));
  } catch (_) {}
  applyLiveConfigToSessions();
}

function fileToBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 45));
      }
    };
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca fail video.'));
    reader.readAsDataURL(file);
  });
}

async function uploadVideoFileToGitHub(file, sessionId, onProgress) {
  const maxBytes = 95 * 1024 * 1024; // 95 MB had GitHub Contents API melalui pelayar
  if (file.size > maxBytes) {
    throw new Error(
      `Saiz fail ini ialah ${(file.size / (1024 * 1024)).toFixed(1)} MB (melebihi had 95 MB muat naik terus pelayar). Sila dwi-klik aplikasi "Tukar-Video-Admin-MAK2026.command" di Desktop Mac anda untuk menukar video besar (1GB–5GB) ke strim HLS secara automatik.`
    );
  }
  if (onProgress) onProgress(10, 'Membaca fail video...');
  const b64Content = await fileToBase64(file, (p) => onProgress && onProgress(p, 'Menyediakan fail untuk muat naik...'));

  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `uploads/video_${sessionId}_${Date.now()}.${ext}`;
  if (onProgress) onProgress(55, 'Memuat naik fail video ke GitHub momon-ux...');

  const res = await fetch(`${CLOUD_SYNC_CONFIG.repoApiBase}/contents/${fileName}`, {
    method: 'PUT',
    headers: {
      ...getCloudHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `Admin: Tukar video ${SESSIONS[sessionId].shortName} (${file.name})`,
      content: b64Content,
      branch: 'main'
    })
  });

  if (!res.ok) {
    throw new Error('Muat naik ke GitHub gagal. Jika fail terlalu besar, sila guna Tukar-Video-Admin-MAK2026.command di Desktop.');
  }
  if (onProgress) onProgress(100, 'Muat naik selesai!');
  return `${CLOUD_SYNC_CONFIG.rawBaseUrl}/${fileName}`;
}

function initAdminPanel() {
  // Muat konfigurasi tempatan terlebih dahulu jika ada
  try {
    const cachedCfg = localStorage.getItem(STORAGE_KEYS.LIVE_CONFIG_CACHE);
    if (cachedCfg) {
      const parsed = JSON.parse(cachedCfg);
      if (parsed && typeof parsed === 'object') {
        livePortalConfig = { ...livePortalConfig, ...parsed };
        applyLiveConfigToSessions();
      }
    }
    if (sessionStorage.getItem(STORAGE_KEYS.ADMIN_SESSION) === 'true') {
      isAdmin = true;
    }
  } catch (_) {}

  const panel = $('admin-panel');
  const loginView = $('admin-login-view');
  const dashView = $('admin-dashboard-view');

  const syncAdminView = () => {
    loginView.hidden = isAdmin;
    dashView.hidden = !isAdmin;
    if (isAdmin) {
      populateAdminFormForSession($('admin-target-session').value || currentSessionId);
      $('admin-default-session').value = livePortalConfig.defaultSession || 's1';
      $('admin-announcement-input').value = livePortalConfig.announcement || '';
      renderAdminSummary();
    }
    renderCommentsSection();
  };

  $('btn-toggle-admin').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    syncAdminView();
    if (!panel.hidden) {
      panel.scrollIntoView({ behavior: 'smooth' });
      if (!isAdmin) $('admin-pin-input').focus();
    }
  });

  $('btn-close-admin-login').addEventListener('click', () => {
    panel.hidden = true;
  });

  $('btn-close-admin-dash').addEventListener('click', () => {
    panel.hidden = true;
  });

  $('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = String($('admin-pin-input').value || '').trim().toUpperCase();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
    const hashHex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hashHex === ADMIN_HASH) {
      isAdmin = true;
      try {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, 'true');
      } catch (_) {}
      $('admin-pin-input').value = '';
      syncAdminView();
      showToast('🔓 Log masuk Pentadbir berjaya! Anda kini boleh menukar video dan mengurus komen.');
    } else {
      showToast('⚠️ Kod akses pentadbir tidak sah. Sila cuba semula.');
      $('admin-pin-input').select();
    }
  });

  $('btn-admin-logout').addEventListener('click', () => {
    isAdmin = false;
    try {
      sessionStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
    } catch (_) {}
    syncAdminView();
    panel.hidden = true;
    showToast('🚪 Anda telah log keluar daripada mod Admin.');
  });

  // Tukar sidang dalam dropdown admin
  $('admin-target-session').addEventListener('change', (e) => {
    populateAdminFormForSession(e.target.value);
  });

  // Tukar tab kaedah (Muat Naik Fail vs Guna Pautan URL)
  document.querySelectorAll('.method-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      adminMethod = tab.dataset.method || 'upload';
      document.querySelectorAll('.method-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $('admin-method-upload').hidden = adminMethod !== 'upload';
      $('admin-method-url').hidden = adminMethod !== 'url';
    });
  });

  // Apabila Admin memilih fail video baharu, kira durasi secara automatik
  $('admin-video-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const tempVid = document.createElement('video');
    tempVid.preload = 'metadata';
    tempVid.onloadedmetadata = () => {
      if (Number.isFinite(tempVid.duration) && tempVid.duration > 0) {
        $('admin-session-duration').value = formatTime(tempVid.duration);
      }
      URL.revokeObjectURL(tempVid.src);
    };
    tempVid.src = URL.createObjectURL(file);
  });

  // Simpan & Tukar Video Sidang
  $('admin-video-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const targetSid = $('admin-target-session').value || 's1';
    const saveBtn = $('btn-admin-save-video');
    const progWrap = $('admin-upload-progress-wrap');
    const progBar = $('admin-upload-bar-fill');
    const progTxt = $('admin-upload-status-text');

    try {
      saveBtn.disabled = true;
      let finalVideoUrl = ($('admin-video-url').value || '').trim();

      if (adminMethod === 'upload') {
        const file = $('admin-video-file').files && $('admin-video-file').files[0];
        if (file) {
          progWrap.hidden = false;
          finalVideoUrl = await uploadVideoFileToGitHub(file, targetSid, (pct, msg) => {
            progBar.style.width = `${pct}%`;
            if (msg) progTxt.textContent = `${msg} (${pct}%)`;
          });
          $('admin-video-url').value = finalVideoUrl;
        }
      }

      if (!finalVideoUrl) {
        throw new Error('Sila pilih fail video baharu atau masukkan pautan video/strim.');
      }

      livePortalConfig.sessions = livePortalConfig.sessions || {};
      livePortalConfig.sessions[targetSid] = {
        playlist: finalVideoUrl,
        title: ($('admin-session-title').value || '').trim() || DEFAULT_SESSIONS[targetSid].title,
        durationLabel: ($('admin-session-duration').value || '').trim() || DEFAULT_SESSIONS[targetSid].durationLabel,
        subtitle: ($('admin-session-subtitle').value || '').trim() || DEFAULT_SESSIONS[targetSid].subtitle
      };

      await saveLiveConfigToCloud();
      loadVideoSession(targetSid, true);
      $('admin-video-file').value = '';
      showToast(`✅ Video ${SESSIONS[targetSid].shortName} berjaya ditukar & dikemas kini secara LIVE kepada semua guru!`);
    } catch (err) {
      showToast(`⚠️ ${err.message || 'Gagal menukar video.'}`);
    } finally {
      saveBtn.disabled = false;
      setTimeout(() => {
        progWrap.hidden = true;
      }, 2000);
    }
  });

  // Pulihkan Video Asal Sidang
  $('btn-admin-reset-video').addEventListener('click', async () => {
    if (!isAdmin) return;
    const targetSid = $('admin-target-session').value || 's1';
    if (livePortalConfig.sessions && livePortalConfig.sessions[targetSid]) {
      delete livePortalConfig.sessions[targetSid];
    }
    try {
      await saveLiveConfigToCloud();
      populateAdminFormForSession(targetSid);
      loadVideoSession(targetSid, false);
      showToast(`🔄 Video asal ${SESSIONS[targetSid].shortName} telah dipulihkan.`);
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });

  // Simpan Tetapan Tayangan Utama & Pengumuman
  $('btn-admin-save-broadcast').addEventListener('click', async () => {
    if (!isAdmin) return;
    livePortalConfig.defaultSession = $('admin-default-session').value || 's1';
    livePortalConfig.announcement = ($('admin-announcement-input').value || '').trim();
    try {
      await saveLiveConfigToCloud();
      loadVideoSession(livePortalConfig.defaultSession, false);
      showToast('📡 Tetapan tayangan utama & pengumuman telah diaktifkan kepada semua guru!');
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });
}

/* --------------------------------------------------------------------------
   3. PEMAIN VIDEO HLS & MP4 TERLINDUNG (TIADA PAUTAN MUAT TURUN)
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

  document.querySelectorAll('.session-card').forEach((btn) => {
    const active = btn.dataset.session === session.id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  $('now-playing-badge').textContent = session.badge;
  $('now-playing-title').textContent = session.title;
  $('comment-session-select').value = session.id;
  if (isAdmin && $('admin-target-session')) {
    populateAdminFormForSession(session.id);
  }

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
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  const sourceUrl = String(session.playlist || '').trim();
  const isHlsSource = /\.m3u8(\?|$)/i.test(sourceUrl);

  setLoader(true, `Memuatkan strim tayangan ${session.shortName}...`);

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

  if (isHlsSource) {
    if (window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      });
      hlsInstance.loadSource(sourceUrl);
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
      video.src = sourceUrl;
      video.addEventListener('loadedmetadata', onReady, { once: true });
    } else {
      setLoader(false);
      showToast('⚠️ Pelayar anda tidak menyokong strim HLS.');
    }
  } else {
    // Jika Admin memuat naik fail .mp4 baharu, bungkus dalam Blob URL supaya tiada pautan fail terus pada elemen <video>
    fetch(sourceUrl)
      .then((r) => {
        if (!r.ok) throw new Error('Direct stream fallback');
        return r.blob();
      })
      .then((blob) => {
        currentBlobUrl = URL.createObjectURL(blob);
        video.src = currentBlobUrl;
        video.addEventListener('loadedmetadata', onReady, { once: true });
      })
      .catch(() => {
        video.src = sourceUrl;
        video.addEventListener('loadedmetadata', onReady, { once: true });
      });
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

  document.querySelectorAll('.session-card').forEach((card) => {
    card.addEventListener('click', () => {
      const targetId = card.dataset.session;
      if (targetId && targetId !== currentSessionId) {
        userHasSwitchedSession = true;
        loadVideoSession(targetId, true);
      }
    });
  });

  loadVideoSession(livePortalConfig.defaultSession || 's1', false);
}

/* --------------------------------------------------------------------------
   4. PENGESAHAN NAMA GURU WAJIB SEBELUM KOMEN
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
  void gateBox.offsetWidth;
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
   5. SISTEM KOMEN & PENYEGERAKAN LANGSUNG (CLOUD SYNC + MODERASI ADMIN)
   -------------------------------------------------------------------------- */
function mergeComments(listA, listB) {
  const deletedMap = (livePortalConfig && livePortalConfig.deletedComments) || {};
  const map = new Map();
  for (const item of [...(listA || []), ...(listB || [])]) {
    if (item && item.id && item.teacherName && item.text && !deletedMap[item.id]) {
      const existing = map.get(item.id);
      map.set(item.id, existing ? { ...existing, ...item } : item);
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

async function syncCommentsFromCloud(newCommentToPush = null) {
  if (syncInProgress && !newCommentToPush) return;
  syncInProgress = true;
  const indicator = $('sync-indicator');
  try {
    await fetchLiveConfigFromCloud(false);

    if (newCommentToPush) {
      await fetch(CLOUD_SYNC_CONFIG.issuesCommentsUrl, {
        method: 'POST',
        headers: {
          ...getCloudHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: JSON.stringify(newCommentToPush)
        })
      });
    }

    const res = await fetch(`${CLOUD_SYNC_CONFIG.issuesCommentsUrl}?per_page=100&_=${Date.now()}`, {
      method: 'GET',
      headers: getCloudHeader(),
      cache: 'no-store'
    });
    if (res.ok) {
      const items = await res.json();
      const cloudComments = [];
      if (Array.isArray(items)) {
        for (const item of items) {
          try {
            const parsed = JSON.parse(item.body || '');
            if (parsed && parsed.id && parsed.teacherName && parsed.text) {
              parsed.ghCommentId = item.id;
              cloudComments.push(parsed);
            }
          } catch (_) {}
        }
      }
      const localComments = loadLocalComments();
      commentsList = mergeComments(cloudComments, localComments);
      saveLocalComments(commentsList);

      if (indicator) {
        const timeStr = new Intl.DateTimeFormat('ms-MY', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).format(new Date());
        indicator.textContent = `🟢 Disambung secara langsung · Kemas kini: ${timeStr}`;
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
  const deletedMap = (livePortalConfig && livePortalConfig.deletedComments) || {};
  const q = ($('comment-search-input').value || '').trim().toLocaleUpperCase('ms-MY');
  return commentsList.filter((c) => {
    if (deletedMap[c.id]) return false;
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
  const resolvedMap = (livePortalConfig && livePortalConfig.resolvedComments) || {};

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
    const isResolved = !!resolvedMap[c.id];
    return `
      <article class="comment-card">
        <div class="teacher-avatar" title="${esc(c.teacherName)}">${esc(getInitials(c.teacherName))}</div>
        <div class="comment-body">
          <div class="comment-top">
            <div class="comment-author-wrap">
              <span class="comment-author">${esc(c.teacherName)}</span>
              <span class="comment-role-tag">${esc(c.teacherRole || 'Guru')}</span>
              <span class="comment-category-tag">${esc(c.category || 'Semakan')}</span>
              ${isResolved ? '<span class="comment-resolved-badge">✓ Telah Dikemas Kini oleh Admin</span>' : ''}
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
            ${isAdmin ? `
              <div class="comment-admin-actions">
                <button type="button" class="btn-admin-comment" data-resolve-id="${esc(c.id)}">
                  ${isResolved ? '↩ Batal Tanda Selesai' : '✅ Tanda Selesai Dibaiki'}
                </button>
                <button type="button" class="btn-admin-comment danger" data-delete-id="${esc(c.id)}" data-gh-id="${esc(c.ghCommentId || '')}">
                  🗑️ Padam
                </button>
              </div>
            ` : ''}
          </div>
          <p class="comment-text">${esc(c.text)}</p>
        </div>
      </article>
    `;
  }).join('');

  feed.querySelectorAll('.comment-jump-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetSession = btn.dataset.jumpSession || 's1';
      const targetTimeStr = btn.dataset.jumpTime || '00:00';
      const targetSeconds = parseTimestampToSeconds(targetTimeStr) || 0;
      $('panggung').scrollIntoView({ behavior: 'smooth' });
      userHasSwitchedSession = true;
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

  // Butang Moderasi Admin: Tanda Selesai
  feed.querySelectorAll('[data-resolve-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!isAdmin) return;
      const cid = btn.dataset.resolveId;
      livePortalConfig.resolvedComments = livePortalConfig.resolvedComments || {};
      if (livePortalConfig.resolvedComments[cid]) {
        delete livePortalConfig.resolvedComments[cid];
      } else {
        livePortalConfig.resolvedComments[cid] = true;
      }
      renderCommentsSection();
      try {
        await saveLiveConfigToCloud();
        showToast('✓ Status semakan komen telah dikemas kini.');
      } catch (_) {}
    });
  });

  // Butang Moderasi Admin: Padam Komen
  feed.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!isAdmin) return;
      const cid = btn.dataset.deleteId;
      const ghId = btn.dataset.ghId;
      livePortalConfig.deletedComments = livePortalConfig.deletedComments || {};
      livePortalConfig.deletedComments[cid] = true;
      commentsList = commentsList.filter((item) => item.id !== cid);
      saveLocalComments(commentsList);
      renderCommentsSection();
      try {
        if (ghId) {
          await fetch(`${CLOUD_SYNC_CONFIG.repoApiBase}/issues/comments/${ghId}`, {
            method: 'DELETE',
            headers: getCloudHeader()
          });
        }
        await saveLiveConfigToCloud();
        showToast('🗑️ Komen telah dipadam oleh Admin.');
      } catch (_) {}
    });
  });
}

function initCommentSystem() {
  commentsList = loadLocalComments();
  renderCommentsSection();

  $('btn-grab-current-time').addEventListener('click', () => {
    const video = $('protected-video');
    $('comment-timestamp-input').value = formatTime(video.currentTime || 0);
    $('comment-session-select').value = currentSessionId;
    showToast(`⏱ Cap masa ${$('comment-timestamp-input').value} dimasukkan ke borang komen.`);
  });

  $('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

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

  document.querySelectorAll('[data-filter-session]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSessionFilter = btn.dataset.filterSession || 'all';
      document.querySelectorAll('[data-filter-session]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderCommentsSection();
    });
  });

  $('comment-search-input').addEventListener('input', () => {
    renderCommentsSection();
  });

  $('btn-refresh-comments').addEventListener('click', () => {
    showToast('🔄 Menyemak komen & konfigurasi terkini...');
    syncCommentsFromCloud();
  });

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

  fetchLiveConfigFromCloud(true).then(() => syncCommentsFromCloud());
  setInterval(() => syncCommentsFromCloud(), 15000);
}

/* --------------------------------------------------------------------------
   MULA APLIKASI
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initSecurityProtections();
  initAdminPanel();
  initTeacherGate();
  initVideoPlayer();
  initCommentSystem();
});
