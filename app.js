'use strict';

/* ==========================================================================
   PORTAL TAYANGAN RASMI & ATURCARA MAJLIS — MAK 2026 SK RANGGU
   - Navigasi Multi-Halaman Kompak (Halaman Tayangan Video & Halaman Aturcara)
   - Mod Slaid Tayangan Skrin Penuh (Fullscreen Presentation Mode)
   - Strim HLS Terenkripsi AES-128 & Kawalan Pentadbir (🔒)
   ========================================================================== */

const DEFAULT_SESSIONS = {
  s1: {
    id: 's1',
    badge: 'SIDANG 1 · JUMAAT PAGI',
    cardTitle: 'Hari Pertama (Pagi)',
    shortName: 'Sidang 1 (Jumaat Pagi)',
    subtitle: '27 Nov 2026 · 6.30 Pagi – 10.40 Pagi (48:02)',
    title: 'MAK 2026 — 1 Jumaat Pagi — Fail Utama (27 Nov 2026 · 6.30 Pagi – 10.40 Pagi)',
    playlist: 'streams/s1/index.m3u8?v=20261124pm',
    poster: 'posters/s1.jpg?v=20261124pm',
    durationLabel: '48:02'
  },
  s2: {
    id: 's2',
    badge: 'SIDANG 2 · JUMAAT PETANG',
    cardTitle: 'Hari Pertama (Petang)',
    shortName: 'Sidang 2 (Jumaat Petang)',
    subtitle: '27 Nov 2026 · 12.50 Tgh Hari – 4.40 Ptg (43:24)',
    title: 'MAK 2026 — 2 Jumaat Petang — Fail Utama (27 Nov 2026 · 12.50 Tgh Hari – 4.40 Ptg)',
    playlist: 'streams/s2/index.m3u8?v=20261124pm',
    poster: 'posters/s2.jpg?v=20261124pm',
    durationLabel: '43:24'
  },
  s3: {
    id: 's3',
    badge: 'SIDANG 3 · SABTU PAGI',
    cardTitle: 'Hari Kedua (Sabtu Pagi)',
    shortName: 'Sidang 3 (Sabtu Pagi)',
    subtitle: '28 Nov 2026 · 6.40 Pagi – 11.30 Pagi (36:40)',
    title: 'MAK 2026 — 3 Sabtu Pagi — Fail Utama (28 Nov 2026 · 6.40 Pagi – 11.30 Pagi)',
    playlist: 'streams/s3/index.m3u8?v=20261124pm',
    poster: 'posters/s3.jpg?v=20261124pm',
    durationLabel: '36:40'
  }
};

let SESSIONS = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));

const STORAGE_KEYS = {
  LIVE_CONFIG_CACHE: 'mak2026_live_config_v1',
  ADMIN_SESSION: 'mak2026_admin_auth_v1'
};

const ADMIN_HASH = 'f4cf6f28cd1d68e6394b136e8877ab487018648509770a73153bf0af2b3168d9';

const CLOUD_SYNC_CONFIG = {
  repoApiBase: 'https://api.github.com/repos/momon-ux/mak-2026-tayangan',
  issuesUrl: 'https://api.github.com/repos/momon-ux/mak-2026-tayangan/issues/1',
  rawBaseUrl: 'https://raw.githubusercontent.com/momon-ux/mak-2026-tayangan/main',
  keyBytes: [110, 111, 118, 102, 79, 126, 74, 80, 107, 122, 81, 113, 117, 73, 80, 83, 105, 107, 121, 58, 129, 61, 76, 78, 61, 91, 82, 62, 59, 96, 127, 72, 121, 119, 56, 124, 127, 93, 91, 119]
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let currentPage = 'tayangan';
let currentSessionId = 's1';
let userHasSwitchedSession = false;
let hlsInstance = null;
let currentBlobUrl = null;
let isSeeking = false;
let activeAturcaraTab = 's1';
let fsIdleTimer = null;
let toastTimer = null;
let isAdmin = false;
let adminMethod = 'upload';

let livePortalConfig = {
  defaultSession: 's1',
  announcement: '',
  sessions: {}
};

function getCloudHeader() {
  const k = CLOUD_SYNC_CONFIG.keyBytes.map((b) => String.fromCharCode(b - 7)).join('');
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `token ${k}`
  };
}

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

/* --------------------------------------------------------------------------
   1. NAVIGASI MULTI-HALAMAN ("BUKA PAGE LAIN" — TAYANGAN vs ATURCARA)
   -------------------------------------------------------------------------- */
function switchPage(pageId, updateHash = true) {
  const target = pageId === 'aturcara' ? 'aturcara' : 'tayangan';
  currentPage = target;

  const pageTayangan = $('page-tayangan');
  const pageAturcara = $('page-aturcara');
  if (pageTayangan) {
    pageTayangan.hidden = target !== 'tayangan';
    pageTayangan.classList.toggle('active', target === 'tayangan');
  }
  if (pageAturcara) {
    pageAturcara.hidden = target !== 'aturcara';
    pageAturcara.classList.toggle('active', target === 'aturcara');
  }

  document.querySelectorAll('.page-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pageTarget === target);
  });

  if (target === 'aturcara') {
    const video = $('protected-video');
    if (video && !video.paused) {
      video.pause();
    }
    setAturcaraTab(currentSessionId);
  }

  if (updateHash) {
    try {
      const nextHash = `#${target}`;
      if (window.location.hash !== nextHash) {
        history.pushState(null, '', nextHash);
      }
    } catch (_) {}
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setAturcaraTab(tabId) {
  activeAturcaraTab = ['s1', 's2', 's3'].includes(tabId) ? tabId : 's1';
  document.querySelectorAll('.aturcara-tab-btn').forEach((btn) => {
    const isMatch = btn.dataset.aturcaraTab === activeAturcaraTab;
    btn.classList.toggle('active', isMatch);
    btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
  });
  document.querySelectorAll('[data-aturcara-panel]').forEach((panel) => {
    const pid = panel.dataset.aturcaraPanel;
    const visible = pid === activeAturcaraTab;
    panel.hidden = !visible;
    panel.classList.toggle('active', visible);
  });
}

function initPageNavigation() {
  document.querySelectorAll('.page-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchPage(btn.dataset.pageTarget || 'tayangan');
    });
  });

  if ($('btn-open-current-aturcara')) {
    $('btn-open-current-aturcara').addEventListener('click', () => {
      if (isCinemaFullscreen()) {
        exitCinemaFullscreen();
      }
      setAturcaraTab(currentSessionId);
      switchPage('aturcara');
    });
  }

  document.querySelectorAll('.aturcara-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.aturcaraTab || 's1';
      setAturcaraTab(tab);
      if (tab !== currentSessionId) {
        userHasSwitchedSession = true;
        loadVideoSession(tab, false);
      }
    });
  });

  document.querySelectorAll('[data-play-session]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.playSession || 's1';
      userHasSwitchedSession = true;
      switchPage('tayangan');
      loadVideoSession(sid, true);
    });
  });

  document.querySelectorAll('[data-fullscreen-session]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.fullscreenSession || 's1';
      userHasSwitchedSession = true;
      switchPage('tayangan');
      if (sid !== currentSessionId) {
        loadVideoSession(sid, true);
      } else {
        const video = $('protected-video');
        if (video && video.paused) {
          video.play().catch(() => {});
        }
      }
      enterCinemaFullscreen();
    });
  });

  const initialHash = (window.location.hash || '').replace('#', '').toLowerCase();
  if (initialHash === 'aturcara' || initialHash === 'aturcara-majlis') {
    switchPage('aturcara', false);
  }

  window.addEventListener('hashchange', () => {
    const h = (window.location.hash || '').replace('#', '').toLowerCase();
    if (h === 'aturcara' || h === 'aturcara-majlis') {
      if (currentPage !== 'aturcara') switchPage('aturcara', false);
    } else if (h === 'tayangan' || h === '') {
      if (currentPage !== 'tayangan') switchPage('tayangan', false);
    }
  });
}

/* --------------------------------------------------------------------------
   2. PERLINDUNGAN LAMAN & PINTASAN PAPAN KEKUNCI TAYANGAN SLAID
   -------------------------------------------------------------------------- */
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
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    if (inField) return;

    if (currentPage === 'tayangan') {
      if ((key === ' ' || key === 'k') && tag !== 'BUTTON') {
        e.preventDefault();
        togglePlayPause();
        wakeFullscreenControls();
      } else if (key === 'f' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault();
        toggleCinemaFullscreen();
      } else if (e.key === 'ArrowLeft' && !ctrlOrCmd && !e.altKey) {
        const video = $('protected-video');
        if (video) {
          e.preventDefault();
          video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
          wakeFullscreenControls();
        }
      } else if (e.key === 'ArrowRight' && !ctrlOrCmd && !e.altKey) {
        const video = $('protected-video');
        if (video) {
          e.preventDefault();
          const dur = video.duration || 99999;
          video.currentTime = Math.min(dur, (video.currentTime || 0) + 10);
          wakeFullscreenControls();
        }
      } else if (e.key === 'Escape') {
        const container = $('panggung');
        if (container && container.classList.contains('is-fullscreen')) {
          exitCinemaFullscreen();
        }
      }
    }
  });
}

/* --------------------------------------------------------------------------
   3. KONFIGURASI AWAN & PANEL KAWALAN ADMIN (🔒)
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
    const card = $(`tab-${sid}`);
    if (card) {
      const strong = card.querySelector('strong');
      const small = card.querySelector('small');
      if (strong && SESSIONS[sid].cardTitle) strong.textContent = SESSIONS[sid].cardTitle;
      if (small && SESSIONS[sid].subtitle) small.textContent = SESSIONS[sid].subtitle;
    }
  }

  const annBar = $('live-announcement-bar');
  if (annBar) {
    const annText = String(livePortalConfig.announcement || '').trim();
    if (annText) {
      annBar.innerHTML = `<span>📢 <strong>Makluman MAK 2026:</strong> ${esc(annText)}</span>`;
      annBar.hidden = false;
    } else {
      annBar.hidden = true;
    }
  }

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
        sessions: parsed.sessions || {}
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
  const payload = `Saluran storan konfigurasi video MAK 2026.\nCONFIG_JSON:${JSON.stringify(livePortalConfig)}`;
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
  const maxBytes = 95 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      `Saiz fail ini ialah ${(file.size / (1024 * 1024)).toFixed(1)} MB (melebihi had 95 MB pelayar). Sila dwi-klik aplikasi "Tukar-Video-Admin-MAK2026.command" di Desktop Mac anda.`
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
  };

  $('btn-toggle-admin').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    syncAdminView();
    if (!panel.hidden && !isAdmin) {
      $('admin-pin-input').focus();
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
      showToast('🔓 Akses dibenarkan.');
    } else {
      showToast('⚠️ Kod akses tidak sah.');
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
    showToast('🚪 Log keluar berjaya.');
  });

  $('admin-target-session').addEventListener('change', (e) => {
    populateAdminFormForSession(e.target.value);
  });

  document.querySelectorAll('.method-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      adminMethod = tab.dataset.method || 'upload';
      document.querySelectorAll('.method-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $('admin-method-upload').hidden = adminMethod !== 'upload';
      $('admin-method-url').hidden = adminMethod !== 'url';
    });
  });

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
        throw new Error('Sila pilih fail video baharu atau masukkan pautan strim.');
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
      showToast(`✅ Video ${SESSIONS[targetSid].shortName} berjaya dikemas kini secara LIVE!`);
    } catch (err) {
      showToast(`⚠️ ${err.message || 'Gagal menukar video.'}`);
    } finally {
      saveBtn.disabled = false;
      setTimeout(() => {
        progWrap.hidden = true;
      }, 2000);
    }
  });

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

  $('btn-admin-save-broadcast').addEventListener('click', async () => {
    if (!isAdmin) return;
    livePortalConfig.defaultSession = $('admin-default-session').value || 's1';
    livePortalConfig.announcement = ($('admin-announcement-input').value || '').trim();
    try {
      await saveLiveConfigToCloud();
      loadVideoSession(livePortalConfig.defaultSession, false);
      showToast('📡 Tetapan tayangan utama telah diaktifkan!');
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });
}

/* --------------------------------------------------------------------------
   4. PEMAIN VIDEO HLS & MOD SLAID TAYANGAN SKRIN PENUH (FULLSCREEN)
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

function isCinemaFullscreen() {
  const container = $('panggung');
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    (container && container.classList.contains('is-fullscreen'))
  );
}

function updateFullscreenButtonsUI() {
  const fs = isCinemaFullscreen();
  const btnBottom = $('btn-fullscreen');
  const btnTop = $('btn-topbar-fullscreen');
  if (btnBottom) {
    btnBottom.textContent = fs ? '✕ Keluar Skrin Penuh' : '⛶ Skrin Penuh';
  }
  if (btnTop) {
    btnTop.textContent = fs ? '✕ Keluar Skrin Penuh' : '⛶ Tayang Skrin Penuh';
  }
  if (!fs) {
    const container = $('panggung');
    if (container) container.classList.remove('fs-idle');
    clearTimeout(fsIdleTimer);
  } else {
    wakeFullscreenControls();
  }
}

function wakeFullscreenControls() {
  const container = $('panggung');
  if (!container) return;
  container.classList.remove('fs-idle');
  clearTimeout(fsIdleTimer);
  if (!isCinemaFullscreen()) return;
  const video = $('protected-video');
  if (video && !video.paused && !video.ended) {
    fsIdleTimer = setTimeout(() => {
      if (isCinemaFullscreen() && !video.paused) {
        container.classList.add('fs-idle');
      }
    }, 2400);
  }
}

function enterCinemaFullscreen() {
  const container = $('panggung');
  const video = $('protected-video');
  if (!container) return;

  if (container.requestFullscreen) {
    container.requestFullscreen().catch(() => {
      container.classList.add('is-fullscreen');
      document.body.style.overflow = 'hidden';
      updateFullscreenButtonsUI();
    });
  } else if (container.webkitRequestFullscreen) {
    try {
      container.webkitRequestFullscreen();
    } catch (_) {
      container.classList.add('is-fullscreen');
      document.body.style.overflow = 'hidden';
      updateFullscreenButtonsUI();
    }
  } else {
    container.classList.add('is-fullscreen');
    document.body.style.overflow = 'hidden';
    updateFullscreenButtonsUI();
    if (video && video.webkitEnterFullscreen && /iPhone|iPod/i.test(navigator.userAgent)) {
      try {
        video.webkitEnterFullscreen();
      } catch (_) {}
    }
  }

  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
  updateFullscreenButtonsUI();
}

function exitCinemaFullscreen() {
  const container = $('panggung');
  if (container && container.classList.contains('is-fullscreen')) {
    container.classList.remove('is-fullscreen', 'fs-idle');
    document.body.style.overflow = '';
  }
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
  if (screen.orientation && screen.orientation.unlock) {
    try {
      screen.orientation.unlock();
    } catch (_) {}
  }
  updateFullscreenButtonsUI();
}

function toggleCinemaFullscreen() {
  if (isCinemaFullscreen()) {
    exitCinemaFullscreen();
  } else {
    enterCinemaFullscreen();
  }
}

function loadVideoSession(sessionId, autoPlay = false, seekToSeconds = null) {
  const session = SESSIONS[sessionId] || SESSIONS.s1;
  currentSessionId = session.id;

  document.querySelectorAll('.session-card').forEach((btn) => {
    const active = btn.dataset.session === session.id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  setAturcaraTab(session.id);

  if ($('now-playing-badge')) $('now-playing-badge').textContent = session.badge;
  if ($('now-playing-title')) $('now-playing-title').textContent = session.title;
  if (isAdmin && $('admin-target-session')) {
    populateAdminFormForSession(session.id);
  }

  const video = $('protected-video');
  const stage = $('video-stage');
  video.pause();
  stage.classList.remove('playing');
  video.poster = session.poster;
  $('time-readout').textContent = `00:00 / ${session.durationLabel}`;
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
  const container = $('panggung');

  video.removeAttribute('controls');
  const observer = new MutationObserver(() => {
    if (video.hasAttribute('controls')) {
      video.removeAttribute('controls');
    }
  });
  observer.observe(video, { attributes: true, attributeFilter: ['controls'] });

  $('video-shield').addEventListener('click', () => {
    togglePlayPause();
    wakeFullscreenControls();
  });
  $('video-shield').addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggleCinemaFullscreen();
  });
  playBtn.addEventListener('click', () => {
    togglePlayPause();
    wakeFullscreenControls();
  });

  if (container) {
    ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'click'].forEach((evt) => {
      container.addEventListener(evt, wakeFullscreenControls, { passive: true });
    });
  }

  document.addEventListener('fullscreenchange', updateFullscreenButtonsUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtonsUI);

  video.addEventListener('play', () => {
    stage.classList.add('playing');
    playBtn.textContent = '⏸ Jeda';
    wakeFullscreenControls();
  });

  video.addEventListener('pause', () => {
    stage.classList.remove('playing');
    playBtn.textContent = '▶ Main';
    wakeFullscreenControls();
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
    if (!isSeeking && dur > 0) {
      seekSlider.value = String(Math.round((cur / dur) * 1000));
    }
  });

  seekSlider.addEventListener('input', () => {
    isSeeking = true;
    wakeFullscreenControls();
  });

  seekSlider.addEventListener('change', () => {
    const dur = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : parseTimestampToSeconds(SESSIONS[currentSessionId].durationLabel) || 0;
    if (dur > 0) {
      video.currentTime = (Number(seekSlider.value) / 1000) * dur;
    }
    isSeeking = false;
    wakeFullscreenControls();
  });

  $('btn-rewind').addEventListener('click', () => {
    video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
    wakeFullscreenControls();
  });

  $('btn-forward').addEventListener('click', () => {
    const dur = video.duration || 99999;
    video.currentTime = Math.min(dur, (video.currentTime || 0) + 10);
    wakeFullscreenControls();
  });

  $('btn-mute').addEventListener('click', () => {
    video.muted = !video.muted;
    $('btn-mute').textContent = video.muted ? '🔇' : '🔊';
    wakeFullscreenControls();
  });

  $('volume-slider').addEventListener('input', (e) => {
    video.volume = Number(e.target.value);
    video.muted = video.volume === 0;
    $('btn-mute').textContent = video.muted ? '🔇' : '🔊';
    wakeFullscreenControls();
  });

  $('speed-select').addEventListener('change', (e) => {
    video.playbackRate = Number(e.target.value || 1);
    wakeFullscreenControls();
  });

  $('btn-fullscreen').addEventListener('click', toggleCinemaFullscreen);
  if ($('btn-topbar-fullscreen')) {
    $('btn-topbar-fullscreen').addEventListener('click', toggleCinemaFullscreen);
  }

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
  fetchLiveConfigFromCloud(true);
}

/* --------------------------------------------------------------------------
   MULA APLIKASI
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initSecurityProtections();
  initAdminPanel();
  initPageNavigation();
  initVideoPlayer();
});
