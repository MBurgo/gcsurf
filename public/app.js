/**
 * GCSurf — Frontend Application
 *
 * Handles:
 *  - Fetching live conditions from /api/conditions
 *  - Rendering the tide chart (SVG)
 *  - Rendering the beach guide cards
 *  - Generating the "quick take" summary
 */

// ── STATE ───────────────────────────────────────────────────────

let currentConditions = null;

// ── LIVE DATA FETCH ─────────────────────────────────────────────

async function fetchConditions() {
  try {
    const res = await fetch('/api/conditions');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentConditions = await res.json();
    updateUI(currentConditions);
  } catch (err) {
    console.warn('Could not fetch live conditions, using defaults:', err.message);
    // UI stays with placeholder data from HTML
  }
}

function updateUI(data) {
  // Update swell card
  if (data.wave) {
    setText('swell-hs', data.wave.hs?.toFixed(1) ?? '—');
    setText('swell-hmax', `Hmax ${data.wave.hmax?.toFixed(1) ?? '?'}m`);
    setText('swell-tp', data.wave.tp?.toFixed(0) ?? '—');
    setText('swell-sst', data.wave.sst?.toFixed(0) ?? '—');
    if (data.swell?.directionCardinal) {
      setText('swell-dir-cardinal', `${data.swell.directionCardinal} (${data.swell.directionDegrees?.toFixed(0) ?? '?'}°)`);
    }
  }

  // Update weather card
  if (data.weather) {
    setText('wind-speed', data.weather.windSpeedKt ?? '—');
    setText('wind-dir-label', data.weather.windDir ?? '');
    setText('gust-speed', data.weather.gustKt ?? '—');
    setText('gust-dir-label', data.weather.windDir ?? '');
    setText('air-temp', data.weather.airTemp?.toFixed(0) ?? '—');
    setText('humidity-val', data.weather.humidity ?? '—');

    // Update wind classification
    const windType = data.weather.windType;
    const windEl = document.getElementById('wind-type-text');
    if (windEl && windType) {
      const labels = {
        'offshore': { text: 'Offshore', color: 'var(--green)', desc: 'for east-facing beaches' },
        'onshore': { text: 'Onshore', color: 'var(--red)', desc: 'expect choppy conditions' },
        'cross-shore': { text: 'Cross-shore', color: 'var(--yellow)', desc: 'variable conditions' },
        'variable': { text: 'Variable', color: 'var(--text-tertiary)', desc: '' },
      };
      const label = labels[windType] || labels['variable'];
      windEl.innerHTML = `<strong style="color: ${label.color};">${label.text}</strong> ${label.desc}<br>Clean conditions likely this morning`;
    }
  }

  // Update tide info
  if (data.tides) {
    // Could update the tide chart with real predicted data here
    // For now the chart uses mock data; real MSQ interval data would replace tidePoints
  }

  // Update "last updated" timestamp
  if (data.fetchedAt) {
    const ago = getTimeAgo(new Date(data.fetchedAt));
    setText('update-ago', `Updated ${ago}`);
  }

  // Update quick take
  updateQuickTake(data);

  // Re-render beaches with current swell match
  renderBeaches(getFilteredBeaches());
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getTimeAgo(date) {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
}

// ── QUICK TAKE ──────────────────────────────────────────────────

function updateQuickTake(data) {
  const el = document.getElementById('quick-take-content');
  const iconEl = document.getElementById('quick-take-icon');
  if (!el || !data.wave || !data.weather) return;

  const hs = data.wave.hs;
  const windType = data.weather.windType;
  const dir = data.swell?.directionCardinal || '';

  let headline = '';
  let body = '';
  let iconClass = '';

  if (hs >= 1.0 && windType === 'offshore') {
    headline = 'Good conditions for a surf';
    body = `Clean ${hs.toFixed(1)}m ${dir} swell with offshore ${data.weather.windDir} winds. `;
    body += `South-facing points (D-bah, Snapper, Burleigh) will be picking up the most energy from this direction. `;
    body += `Wind may swing onshore later today.`;
    iconClass = '';
  } else if (hs >= 0.8 && windType === 'cross-shore') {
    headline = 'Decent conditions — some texture on it';
    body = `${hs.toFixed(1)}m ${dir} swell with cross-shore ${data.weather.windDir} winds. `;
    body += `Look for beaches with some shelter from the wind. The southern points may still be clean.`;
    iconClass = 'fair';
  } else if (hs < 0.6) {
    headline = 'Small day — longboard or SUP conditions';
    body = `Only ${hs.toFixed(1)}m of swell showing on the buoy. `;
    body += `Sheltered spots like Currumbin Alley or Greenmount might have something fun on a longboard.`;
    iconClass = 'fair';
  } else if (windType === 'onshore') {
    headline = 'Onshore and messy';
    body = `${hs.toFixed(1)}m ${dir} swell but ${data.weather.windDir} onshore winds are making a mess of it. `;
    body += `Best options are sheltered points or wait for the wind to drop.`;
    iconClass = 'poor';
  } else {
    headline = 'Mixed conditions';
    body = `${hs.toFixed(1)}m ${dir} swell with ${data.weather.windDir} winds at ${data.weather.windSpeedKt}kt. Check individual beaches for the best option.`;
    iconClass = 'fair';
  }

  el.innerHTML = `<div class="qt-headline">${headline}</div><div class="qt-body">${body}</div>`;
  if (iconEl) {
    iconEl.className = 'qt-icon' + (iconClass ? ` ${iconClass}` : '');
    iconEl.textContent = iconClass === 'poor' ? '✗' : iconClass === 'fair' ? '~' : '✓';
  }
}

// ── TIDE CHART ──────────────────────────────────────────────────

function renderTideChart() {
  // Mock tide data for Gold Coast Seaway
  // In production, replace with MSQ predicted interval data from KV
  const tidePoints = [
    { hour: 0, height: 0.45, label: "12am" },
    { hour: 0.5, height: 0.40 },
    { hour: 1, height: 0.35 },
    { hour: 1.5, height: 0.32 },
    { hour: 2, height: 0.30 },
    { hour: 2.5, height: 0.31 },
    { hour: 3, height: 0.35, type: "low", label: "3am" },
    { hour: 3.5, height: 0.42 },
    { hour: 4, height: 0.52 },
    { hour: 4.5, height: 0.64 },
    { hour: 5, height: 0.78 },
    { hour: 5.5, height: 0.92 },
    { hour: 6, height: 1.05, label: "6am" },
    { hour: 6.5, height: 1.16 },
    { hour: 7, height: 1.25 },
    { hour: 7.5, height: 1.32 },
    { hour: 8, height: 1.36 },
    { hour: 8.5, height: 1.39 },
    { hour: 9, height: 1.40 },
    { hour: 9.2, height: 1.40, type: "high" },
    { hour: 9.5, height: 1.39 },
    { hour: 10, height: 1.35 },
    { hour: 10.5, height: 1.28 },
    { hour: 11, height: 1.18 },
    { hour: 11.5, height: 1.06 },
    { hour: 12, height: 0.92, label: "12pm" },
    { hour: 12.5, height: 0.78 },
    { hour: 13, height: 0.65 },
    { hour: 13.5, height: 0.53 },
    { hour: 14, height: 0.44 },
    { hour: 14.5, height: 0.38 },
    { hour: 15, height: 0.34, label: "3pm" },
    { hour: 15.3, height: 0.33, type: "low" },
    { hour: 15.5, height: 0.34 },
    { hour: 16, height: 0.40 },
    { hour: 16.5, height: 0.50 },
    { hour: 17, height: 0.62 },
    { hour: 17.5, height: 0.76 },
    { hour: 18, height: 0.90, label: "6pm" },
    { hour: 18.5, height: 1.04 },
    { hour: 19, height: 1.16 },
    { hour: 19.5, height: 1.26 },
    { hour: 20, height: 1.34 },
    { hour: 20.5, height: 1.40 },
    { hour: 21, height: 1.43, label: "9pm" },
    { hour: 21.3, height: 1.44, type: "high" },
    { hour: 21.5, height: 1.43 },
    { hour: 22, height: 1.38 },
    { hour: 22.5, height: 1.30 },
    { hour: 23, height: 1.18 },
    { hour: 23.5, height: 1.04 },
    { hour: 24, height: 0.88, label: "12am" },
  ];

  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;

  const W = 900, H = 200;
  const padT = 36, padB = 40;
  const chartH = H - padT - padB;
  const minH = 0, maxH = 1.8;

  function x(hour) { return (hour / 24) * W; }
  function y(height) { return padT + chartH - ((height - minH) / (maxH - minH)) * chartH; }

  function smoothPath(points) {
    const pts = points.map(p => [x(p.hour), y(p.height)]);
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const t = 0.35;
      d += ` C ${p1[0]+(p2[0]-p0[0])*t},${p1[1]+(p2[1]-p0[1])*t} ${p2[0]-(p3[0]-p1[0])*t},${p2[1]-(p3[1]-p1[1])*t} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  const linePath = smoothPath(tidePoints);
  const fillD = linePath + ` L ${x(24)},${padT+chartH} L ${x(0)},${padT+chartH} Z`;

  // Interpolate current height
  let nowHeight = 0;
  for (let i = 0; i < tidePoints.length - 1; i++) {
    if (tidePoints[i].hour <= nowHour && tidePoints[i+1].hour >= nowHour) {
      const frac = (nowHour - tidePoints[i].hour) / (tidePoints[i+1].hour - tidePoints[i].hour);
      nowHeight = tidePoints[i].height + frac * (tidePoints[i+1].height - tidePoints[i].height);
      break;
    }
  }

  const nx = x(nowHour), ny = y(nowHeight);
  const extremes = tidePoints.filter(p => p.type);
  const nPct = (nowHour/24)*100;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>
    <linearGradient id="tG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0077B6" stop-opacity="0.12"/><stop offset="100%" stop-color="#0077B6" stop-opacity="0.01"/></linearGradient>
    <linearGradient id="lG" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#0077B6" stop-opacity="0.3"/><stop offset="${nPct}%" stop-color="#0077B6" stop-opacity="1"/><stop offset="${nPct+0.5}%" stop-color="#0077B6" stop-opacity="0.25"/><stop offset="100%" stop-color="#0077B6" stop-opacity="0.25"/></linearGradient>
  </defs>`;

  // Grid lines
  [0, 0.5, 1.0, 1.5].forEach(h => {
    const gy = y(h);
    svg += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#E8E8E8" stroke-width="0.5"/>`;
    svg += `<text x="${W-4}" y="${gy-4}" fill="#C0C0C0" font-size="10" font-family="Outfit" text-anchor="end">${h.toFixed(1)}m</text>`;
  });

  svg += `<path d="${fillD}" fill="url(#tG)"/>`;
  svg += `<path d="${linePath}" fill="none" stroke="url(#lG)" stroke-width="2.5" stroke-linecap="round"/>`;

  // Extremes
  extremes.forEach(p => {
    const px = x(p.hour), py = y(p.height);
    const hi = p.type==='high';
    const col = hi ? '#0077B6' : '#9A9A9A';
    svg += `<circle cx="${px}" cy="${py}" r="4" fill="${col}" stroke="white" stroke-width="2"/>`;
    const m = Math.round((p.hour%1)*60), hr = Math.floor(p.hour);
    const ap = hr>=12?'pm':'am', dh = hr>12?hr-12:(hr===0?12:hr);
    svg += `<text x="${px}" y="${hi?py-14:py+20}" fill="${col}" font-size="11" font-family="Outfit" font-weight="600" text-anchor="middle">${p.height.toFixed(1)}m ${hi?'▲':'▼'}</text>`;
    svg += `<text x="${px}" y="${hi?py-3:py+31}" fill="#9A9A9A" font-size="10" font-family="Work Sans" text-anchor="middle">${dh}:${m.toString().padStart(2,'0')}${ap}</text>`;
  });

  // Now marker
  svg += `<line x1="${nx}" y1="${padT}" x2="${nx}" y2="${padT+chartH}" stroke="#0077B6" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>`;
  svg += `<circle cx="${nx}" cy="${ny}" r="6" fill="#0077B6" stroke="white" stroke-width="2.5"/>`;
  svg += `<rect x="${nx-22}" y="${ny-24}" width="44" height="18" rx="4" fill="#0077B6"/>`;
  svg += `<text x="${nx}" y="${ny-12}" fill="white" font-size="10" font-family="Outfit" font-weight="600" text-anchor="middle">NOW</text>`;

  // Time labels
  tidePoints.filter(p=>p.label).forEach(p => {
    svg += `<text x="${x(p.hour)}" y="${padT+chartH+16}" fill="#9A9A9A" font-size="11" font-family="Outfit" text-anchor="middle">${p.label}</text>`;
  });

  svg += `</svg>`;
  document.getElementById('tideChartWrap').innerHTML = svg;

  // Extremes summary
  document.getElementById('tideExtremes').innerHTML = extremes.map(p => {
    const hi = p.type==='high';
    const m = Math.round((p.hour%1)*60), hr = Math.floor(p.hour);
    const ap = hr>=12?'pm':'am', dh = hr>12?hr-12:(hr===0?12:hr);
    return `<div class="tide-extreme"><div class="tide-extreme-icon ${hi?'high':'low'}">${hi?'H':'L'}</div><div class="tide-extreme-info"><div class="te-time">${dh}:${m.toString().padStart(2,'0')} ${ap}</div><div class="te-detail">${hi?'High':'Low'} tide · ${p.height.toFixed(2)}m</div></div></div>`;
  }).join('');
}

// ── BEACH GUIDE ─────────────────────────────────────────────────

const zoneOrder = { south: 0, central: 1, north: 2 };

function getSwellDir() {
  return currentConditions?.wave?.direction ?? 112;
}

function swellMatchText(beach) {
  const dir = getSwellDir();
  const bs = beach.bestSwell;
  if (bs.includes('SE') && dir >= 100 && dir <= 170) return { text: 'Good match for current swell', cls: 'match-good' };
  if (bs.includes('SSE') && dir >= 140 && dir <= 180) return { text: 'Good match for current swell', cls: 'match-good' };
  if (bs.includes('E') && dir >= 70 && dir <= 120) return { text: 'Good match for current swell', cls: 'match-good' };
  if (bs.includes('NE') && dir >= 30 && dir <= 80) return { text: 'Good match for current swell', cls: 'match-good' };
  if (bs.includes('E')) return { text: 'Reasonable match for current swell', cls: 'match-ok' };
  if (bs.includes('NE') && dir > 100) return { text: 'Marginal — prefers more northerly swell', cls: 'match-poor' };
  return { text: 'Reasonable match for current swell', cls: 'match-ok' };
}

let currentFilter = 'all';

function getFilteredBeaches() {
  let filtered = [...beaches].sort((a, b) => zoneOrder[a.zone] - zoneOrder[b.zone]);
  if (currentFilter === 'beginner') filtered = filtered.filter(b => b.level === 'beginner');
  else if (currentFilter !== 'all') filtered = filtered.filter(b => b.zone === currentFilter);
  return filtered;
}

function renderBeaches(list) {
  const grid = document.getElementById('beachGrid');
  grid.innerHTML = list.map(b => {
    const match = swellMatchText(b);
    return `
    <div class="beach-card" onclick="toggleCard(this)">
      <div class="beach-card-main">
        <div class="beach-info">
          <div class="beach-type-icon">${b.zone==='south'?'S':b.zone==='central'?'C':'N'}</div>
          <div class="beach-name-area">
            <div class="beach-name">${b.name}</div>
            <div class="beach-subtitle">${b.subtitle}</div>
          </div>
        </div>
        <div class="beach-card-right">
          <div class="beach-quick-tags">
            ${b.quickTags.map(t => `<span class="qtag ${t.type}">${t.text}</span>`).join('')}
          </div>
          <svg class="expand-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 8 10 12 14 8"/></svg>
        </div>
      </div>
      <div class="beach-detail">
        <div class="swell-hint">
          <strong>Right now:</strong> <span class="${match.cls}">${match.text}</span>.
          Best in <strong>${b.bestSwell}</strong> swell, <strong>${b.bestWind}</strong> wind, <strong>${b.bestTide}</strong>.
        </div>
        <div class="detail-grid" style="margin-top:20px;">
          <div class="detail-section"><h4>About this spot</h4><p>${b.description}</p></div>
          <div class="detail-section"><h4>Best conditions</h4><p>${b.bestConditions}</p></div>
          <div class="detail-section"><h4>The vibe</h4><p>${b.vibe}</p></div>
          <div class="detail-section">
            <h4>Practical info</h4>
            <p><strong>Parking:</strong> ${b.parking}</p>
            <p><strong>Patrol:</strong> ${b.patrol}</p>
            <div class="detail-tags">${b.tags.map(t => `<span class="tag ${t.type}">${t.text}</span>`).join('')}</div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleCard(el) { el.classList.toggle('expanded'); }

function filterBeaches(filter, btn) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = filter;
  renderBeaches(getFilteredBeaches());
}

// ── INIT ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Set current date in header
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
  const headerDate = document.getElementById('header-date');
  if (headerDate) headerDate.textContent = `${dateStr}, ${timeStr}`;

  // Render tide chart
  renderTideChart();

  // Render beaches with default data
  renderBeaches(getFilteredBeaches());

  // Fetch live conditions
  fetchConditions();

  // Refresh every 5 minutes
  setInterval(fetchConditions, 5 * 60 * 1000);
});
