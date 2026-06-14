// popup.js

let allData = { domains: [], ips: [] };
let currentFmt = null;
let sessionStart = null;
let timerInterval = null;

const CDN_KEYWORDS = ['google', 'gstatic', 'googleapis', 'doubleclick', 'amazon', 'cloudfront',
  'akamai', 'fastly', 'cloudflare', 'facebook', 'fbcdn', 'instagram', 'twitter', 'twimg'];

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await refresh();
  setupTabs();
  setupButtons();
  setupSearch();
  setupExport();
  setInterval(refresh, 2000);
});

async function refresh() {
  const status = await msg('getStatus');
  const data = await msg('getData');
  allData = data;

  // Update stats
  document.getElementById('domainsCount').textContent = status.domainsCount;
  document.getElementById('ipsCount').textContent = status.ipsCount;

  // Recording state
  const btnToggle = document.getElementById('btnToggle');
  const recIndicator = document.getElementById('recIndicator');
  const recLabel = document.getElementById('recLabel');

  if (status.isRecording) {
    btnToggle.textContent = '⏹ Остановить';
    btnToggle.classList.add('recording');
    recIndicator.classList.add('active');
    recLabel.textContent = 'REC';
    if (!timerInterval) {
      sessionStart = new Date(status.sessionStart);
      timerInterval = setInterval(updateTimer, 1000);
    }
  } else {
    btnToggle.textContent = '▶ Начать запись';
    btnToggle.classList.remove('recording');
    recIndicator.classList.remove('active');
    recLabel.textContent = 'СТОП';
    clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('sessionTime').textContent = '—';
  }

  renderDomains(document.getElementById('searchDomains').value);
  renderIPs(document.getElementById('searchIPs').value);
  if (currentFmt) updatePreview();
}

function updateTimer() {
  if (!sessionStart) return;
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  document.getElementById('sessionTime').textContent = `${m}:${s}`;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

function setupButtons() {
  document.getElementById('btnToggle').addEventListener('click', async () => {
    const status = await msg('getStatus');
    if (status.isRecording) {
      await msg('stopRecording');
    } else {
      await msg('startRecording');
    }
    await refresh();
  });

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (confirm('Очистить все данные?')) {
      await msg('clearData');
      await refresh();
    }
  });

  document.getElementById('btnCopy').addEventListener('click', () => {
    const preview = document.getElementById('exportPreview');
    if (!preview.value) return;
    navigator.clipboard.writeText(preview.value);
    const btn = document.getElementById('btnCopy');
    btn.textContent = '✓ Скопировано!';
    setTimeout(() => btn.textContent = 'Скопировать', 1500);
  });

  document.getElementById('btnDownload').addEventListener('click', () => {
    const preview = document.getElementById('exportPreview');
    if (!preview.value) return;
    const ext = fmtExtension(currentFmt);
    const blob = new Blob([preview.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vpn-routes.${ext}`;
    a.click(); URL.revokeObjectURL(url);
  });
}

function fmtExtension(fmt) {
  const map = { json: 'json', amnezia: 'json', pac: 'pac', wireguard: 'conf', openvpn: 'txt', mikrotik: 'rsc' };
  return map[fmt] || 'txt';
}

// ─── Search ───────────────────────────────────────────────────────────────────

function setupSearch() {
  document.getElementById('searchDomains').addEventListener('input', e => {
    renderDomains(e.target.value);
  });
  document.getElementById('searchIPs').addEventListener('input', e => {
    renderIPs(e.target.value);
  });
}

// ─── Render Lists ─────────────────────────────────────────────────────────────

function renderDomains(filter = '') {
  const list = document.getElementById('domainsList');
  const items = allData.domains.filter(d =>
    !filter || d.domain.includes(filter.toLowerCase())
  );

  if (!items.length) {
    list.innerHTML = '<div class="empty">Нет данных. Начните запись.</div>';
    return;
  }

  list.innerHTML = items.map(d => `
    <div class="list-item">
      <span class="item-name" title="${d.domain}">${d.domain}</span>
      ${d.ips.length ? `<span class="item-ips">${d.ips[0]}</span>` : ''}
      <span class="item-count">${d.count}</span>
      <button class="item-del" data-domain="${d.domain}" title="Удалить">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.item-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await msg('removeDomain', { domain: btn.dataset.domain });
      await refresh();
    });
  });
}

function renderIPs(filter = '') {
  const list = document.getElementById('ipsList');
  const items = allData.ips.filter(i =>
    !filter || i.ip.includes(filter)
  );

  if (!items.length) {
    list.innerHTML = '<div class="empty">Нет IP адресов.</div>';
    return;
  }

  list.innerHTML = items.map(i => `
    <div class="list-item">
      <span class="item-name" title="${i.ip}">${i.ip}</span>
      <span class="item-ips">${i.domains[0] || ''}</span>
      <span class="item-count">${i.count}</span>
      <button class="item-del" data-ip="${i.ip}" title="Удалить">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.item-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await msg('removeIP', { ip: btn.dataset.ip });
      await refresh();
    });
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────

function setupExport() {
  document.querySelectorAll('.btn-export').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-export').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFmt = btn.dataset.fmt;
      updatePreview();
    });
  });

  ['filterPrivate', 'filterGoogle', 'onlyIPs'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (currentFmt) updatePreview();
    });
  });
}

function getFilteredData() {
  const filterGoogle = document.getElementById('filterGoogle').checked;

  const domains = allData.domains.filter(d => {
    if (filterGoogle && CDN_KEYWORDS.some(k => d.domain.includes(k))) return false;
    return true;
  });

  const ips = allData.ips.filter(i => {
    if (filterGoogle && i.domains.some(d => CDN_KEYWORDS.some(k => d.includes(k)))) return false;
    return true;
  });

  return { domains, ips };
}

function updatePreview() {
  const { domains, ips } = getFilteredData();
  const onlyIPs = document.getElementById('onlyIPs').checked;
  let text = '';
  let count = 0;

  switch (currentFmt) {
    case 'plain-domains':
      text = domains.map(d => d.domain).join('\n');
      count = domains.length;
      break;

    case 'plain-ips':
      text = ips.map(i => i.ip).join('\n');
      count = ips.length;
      break;

    case 'cidr':
      text = ips.map(i => `${i.ip}/32`).join('\n');
      count = ips.length;
      break;

    case 'wireguard':
      const wgRoutes = [
        ...ips.map(i => `${i.ip}/32`),
        ...(!onlyIPs ? domains.map(d => `# ${d.domain}`) : [])
      ];
      count = ips.length;
      text = `[Peer]
# Маршруты через VPN туннель
# Сгенерировано VPN Route Collector ${new Date().toLocaleString('ru')}

AllowedIPs = ${wgRoutes.filter(r => !r.startsWith('#')).join(', ')}

# Домены (для split DNS / hosts):
${!onlyIPs ? domains.map(d => `# ${d.domain}`).join('\n') : ''}`;
      break;

    case 'openvpn':
      text = [
        `# OpenVPN маршруты — ${new Date().toLocaleString('ru')}`,
        `# Добавьте в client.conf или используйте --route`,
        '',
        ...ips.map(i => `route ${i.ip} 255.255.255.255`),
        '',
        (!onlyIPs ? [
          '# Домены для DNS:',
          ...domains.map(d => `# dhcp-option DOMAIN-SEARCH ${d.domain}`)
        ] : []).join('\n')
      ].join('\n');
      count = ips.length;
      break;

    case 'mikrotik':
      text = [
        `# MikroTik RouterOS script — ${new Date().toLocaleString('ru')}`,
        `/ip firewall address-list`,
        ...ips.map(i => `add address=${i.ip} list=VPN_ROUTES comment="${i.domains[0] || ''}"`),
        '',
        (!onlyIPs ? [
          '# DNS записи:',
          ...domains.map(d => `/ip dns static add name="${d.domain}" address=${d.ips[0] || '0.0.0.0'} comment="vpn-route"`)
        ] : []).join('\n')
      ].join('\n');
      count = ips.length + (onlyIPs ? 0 : domains.length);
      break;

    case 'json':
      text = JSON.stringify({ domains, ips, exportedAt: new Date().toISOString() }, null, 2);
      count = domains.length + ips.length;
      break;

    case 'amnezia': {
      // Each domain paired with its first known IP
      const entries = [];
      for (const d of domains) {
        const ip = d.ips[0] || ips.find(i => i.domains.includes(d.domain))?.ip || '';
        if (ip) entries.push({ hostname: d.domain, ip });
      }
      // Also add IPs that have no domain match
      for (const i of ips) {
        if (!entries.some(e => e.ip === i.ip)) {
          entries.push({ hostname: i.domains[0] || i.ip, ip: i.ip });
        }
      }
      text = JSON.stringify(entries, null, 4)
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .trim();
      // Wrap in array brackets for valid JSON
      text = '[\n' + text + '\n]';
      count = entries.length;
      break;
    }

    case 'pac':
      const pacDomains = domains.map(d => `"${d.domain}"`).join(',\n    ');
      text = `// PAC файл — Proxy Auto-Configuration
// Сгенерировано ${new Date().toLocaleString('ru')}

var PROXY = "SOCKS5 127.0.0.1:1080"; // Замените на ваш адрес
var DIRECT = "DIRECT";

var VPN_DOMAINS = [
    ${pacDomains}
];

function FindProxyForURL(url, host) {
    // Убираем www.
    var h = host.replace(/^www\\./, '');
    
    for (var i = 0; i < VPN_DOMAINS.length; i++) {
        if (h === VPN_DOMAINS[i] || h.endsWith('.' + VPN_DOMAINS[i])) {
            return PROXY;
        }
    }
    return DIRECT;
}`;
      count = domains.length;
      break;
  }

  document.getElementById('exportPreview').value = text;
  document.getElementById('previewCount').textContent = `(${count})`;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function msg(action, extra = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...extra }, resolve);
  });
}
