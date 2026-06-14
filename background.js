// background.js — перехват всех сетевых запросов

const collected = {
  domains: new Map(),  // domain -> { ips: Set, count, lastSeen, tab }
  ips: new Map(),      // ip -> { domain, count, lastSeen }
  sessions: [],        // история сессий
};

let isRecording = false;
let currentSessionStart = null;

// ─── Утилиты ───────────────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isPrivateIP(ip) {
  return (
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^127\./.test(ip) ||
    /^::1$/.test(ip) ||
    /^fc00:/i.test(ip) ||
    /^fe80:/i.test(ip)
  );
}

function isValidIP(str) {
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(str)) {
    return str.split('.').every(n => parseInt(n) <= 255);
  }
  // IPv6 (упрощённо)
  if (/^[0-9a-f:]+$/i.test(str) && str.includes(':')) {
    return true;
  }
  return false;
}

function now() {
  return new Date().toISOString();
}

// ─── Запись данных ──────────────────────────────────────────────────────────

function recordDomain(domain, ip, tabId, initiator) {
  if (!domain || domain === 'localhost') return;

  if (!collected.domains.has(domain)) {
    collected.domains.set(domain, {
      ips: new Set(),
      count: 0,
      firstSeen: now(),
      lastSeen: now(),
      tabId,
      initiator,
    });
  }
  const entry = collected.domains.get(domain);
  entry.count++;
  entry.lastSeen = now();
  if (ip) entry.ips.add(ip);

  if (ip) recordIP(ip, domain);
}

function recordIP(ip, domain) {
  if (!ip || isPrivateIP(ip)) return;

  if (!collected.ips.has(ip)) {
    collected.ips.set(ip, {
      domains: new Set(),
      count: 0,
      firstSeen: now(),
      lastSeen: now(),
    });
  }
  const entry = collected.ips.get(ip);
  entry.count++;
  entry.lastSeen = now();
  if (domain) entry.domains.add(domain);
}

// ─── Слушатели запросов ──────────────────────────────────────────────────────

chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    if (!isRecording) return;

    const domain = extractDomain(details.url);
    const ip = details.ip;

    if (domain) recordDomain(domain, ip, details.tabId, details.initiator);
    if (ip && isValidIP(ip) && !isPrivateIP(ip)) recordIP(ip, domain);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Фоллбэк через DNS для запросов без IP (кэш, QUIC, etc.)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isRecording) return;
    const domain = extractDomain(details.url);
    if (domain && !collected.domains.has(domain)) {
      recordDomain(domain, null, details.tabId, details.initiator);
    }
  },
  { urls: ['<all_urls>'] }
);

// ─── Динамическая иконка ─────────────────────────────────────────────────────

function setIcon(recording) {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const color = recording ? '#f85149' : '#58a6ff';

  // Круг
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Буква V
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(32, 38);
  ctx.lineTo(64, 90);
  ctx.lineTo(96, 38);
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  chrome.action.setIcon({ imageData });
}



chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {

    case 'getStatus':
      sendResponse({
        isRecording,
        domainsCount: collected.domains.size,
        ipsCount: collected.ips.size,
        sessionStart: currentSessionStart,
      });
      break;

    case 'startRecording':
      isRecording = true;
      currentSessionStart = now();
      setIcon(true);
      sendResponse({ ok: true });
      break;

    case 'stopRecording':
      isRecording = false;
      setIcon(false);
      sendResponse({ ok: true });
      break;

    case 'getData':
      sendResponse(serializeData());
      break;

    case 'clearData':
      collected.domains.clear();
      collected.ips.clear();
      sendResponse({ ok: true });
      break;

    case 'removeDomain':
      collected.domains.delete(msg.domain);
      sendResponse({ ok: true });
      break;

    case 'removeIP':
      collected.ips.delete(msg.ip);
      sendResponse({ ok: true });
      break;
  }
  return true;
});

// ─── Сериализация ────────────────────────────────────────────────────────────

function serializeData() {
  const domains = [];
  for (const [domain, info] of collected.domains) {
    domains.push({
      domain,
      ips: [...info.ips],
      count: info.count,
      firstSeen: info.firstSeen,
      lastSeen: info.lastSeen,
    });
  }
  domains.sort((a, b) => b.count - a.count);

  const ips = [];
  for (const [ip, info] of collected.ips) {
    ips.push({
      ip,
      domains: [...info.domains],
      count: info.count,
      firstSeen: info.firstSeen,
      lastSeen: info.lastSeen,
    });
  }
  ips.sort((a, b) => b.count - a.count);

  return { domains, ips };
}
