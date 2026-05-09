'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const WS_URL       = `ws://${location.host}`;
const MAX_POINTS   = 20;
const RECONNECT_MS = 3000;
const MAX_LOG      = 80;

// ── State ─────────────────────────────────────────────────────────────────────
let ws            = null;
let reconnectTimer= null;
let prevReadings  = {};
const knownSensors = {};

// ── Chart Data ────────────────────────────────────────────────────────────────
const labels    = [];
const tempData  = [];
const humData   = [];
const soilData  = [];
const lightData = [];

// ── DOM ───────────────────────────────────────────────────────────────────────
const wsBadge     = document.getElementById('wsBadge');
const wsStatusEl  = document.getElementById('wsStatus');
const clientCount = document.getElementById('clientCount');
const alertBanner = document.getElementById('alertBanner');
const alertText   = document.getElementById('alertText');
const logScroll   = document.getElementById('logScroll');
const rawPacket   = document.getElementById('rawPacket');
const packetTs    = document.getElementById('packetTs');
const footerTime  = document.getElementById('footerTime');
const sensorGrid  = document.getElementById('sensorGrid');
const clearLogBtn = document.getElementById('clearLogBtn');

// ── Chart Defaults ────────────────────────────────────────────────────────────
const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 350 },
  plugins: {
    legend: {
      labels: {
        color: '#6b7280',
        font: { family: 'Inter', size: 11 },
        boxWidth: 10,
        padding: 14,
      },
    },
    tooltip: {
      backgroundColor: '#fff',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      titleColor: '#111827',
      bodyColor: '#4b5563',
      padding: 10,
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    },
  },
  scales: {
    x: {
      ticks: { color: '#9ca3af', font: { size: 10, family: 'JetBrains Mono' }, maxTicksLimit: 6 },
      grid:  { color: '#f3f4f6' },
      border:{ color: '#e5e7eb' },
    },
    y: {
      ticks: { color: '#9ca3af', font: { size: 10, family: 'JetBrains Mono' } },
      grid:  { color: '#f3f4f6' },
      border:{ color: '#e5e7eb' },
    },
  },
};

const tempHumChart = new Chart(
  document.getElementById('tempHumidityChart').getContext('2d'),
  {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temperature (°C)',
          data: tempData,
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234,88,12,0.06)',
          borderWidth: 1.5,
          pointRadius: 2.5,
          pointBackgroundColor: '#ea580c',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Humidity (%)',
          data: humData,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2,132,199,0.06)',
          borderWidth: 1.5,
          pointRadius: 2.5,
          pointBackgroundColor: '#0284c7',
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: CHART_OPTS,
  }
);

const soilLightChart = new Chart(
  document.getElementById('soilLightChart').getContext('2d'),
  {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Soil Moisture (%)',
          data: soilData,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.07)',
          borderWidth: 1.5,
          pointRadius: 2.5,
          pointBackgroundColor: '#16a34a',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Light Level (%)',
          data: lightData,
          borderColor: '#ca8a04',
          backgroundColor: 'rgba(202,138,4,0.05)',
          borderWidth: 1.5,
          pointRadius: 2.5,
          pointBackgroundColor: '#ca8a04',
          tension: 0.4,
          fill: false,
        },
      ],
    },
    options: CHART_OPTS,
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
}

function flip(el) {
  el.classList.remove('flip');
  void el.offsetWidth;
  el.classList.add('flip');
}

function setWsState(state) {
  wsBadge.className = `ws-pill ${state}`;
  wsStatusEl.textContent = { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting...' }[state] || state;
}

function trendHTML(cur, prev, unit) {
  if (prev === undefined) return 'Awaiting data';
  const d = (cur - prev).toFixed(1);
  if (d > 0) return `<span class="trend-up">&#8593; ${Math.abs(d)}${unit}</span> from last`;
  if (d < 0) return `<span class="trend-down">&#8595; ${Math.abs(d)}${unit}</span> from last`;
  return `&#8594; No change`;
}

// ── Log ───────────────────────────────────────────────────────────────────────
function addLog(html, iso = new Date().toISOString()) {
  while (logScroll.children.length >= MAX_LOG) logScroll.removeChild(logScroll.firstChild);
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-time">${fmt(iso)}</span><span class="log-msg">${html}</span>`;
  logScroll.appendChild(el);
  logScroll.scrollTop = logScroll.scrollHeight;
}
clearLogBtn.addEventListener('click', () => { logScroll.innerHTML = ''; });

// ── Sensor Cards ──────────────────────────────────────────────────────────────
const SENSOR_META = {
  'Sensor-Alpha': { letter: 'A', bg: '#f0fdf4', color: '#16a34a' },
  'Sensor-Beta':  { letter: 'B', bg: '#f0f9ff', color: '#0284c7' },
  'Sensor-Gamma': { letter: 'G', bg: '#fefce8', color: '#ca8a04' },
  'Sensor-Delta': { letter: 'D', bg: '#faf5ff', color: '#7c3aed' },
};

function updateSensorCard(name, readings, model) {
  const m = SENSOR_META[name] || { letter: name[0], bg: '#f9fafb', color: '#6b7280' };

  if (!knownSensors[name]) {
    const card = document.createElement('div');
    card.className = 'sensor-card';
    card.id = `sc-${name}`;
    card.innerHTML = `
      <div class="sensor-avatar" style="background:${m.bg};color:${m.color}">${m.letter}</div>
      <div class="sensor-info">
        <div class="sensor-name">${name}</div>
        <div class="sensor-sub" id="sc-${name}-status">--</div>
      </div>
      <div class="sensor-temp" id="sc-${name}-val" style="color:${m.color}">--<small> °C</small></div>
    `;
    sensorGrid.appendChild(card);
    knownSensors[name] = true;
  }

  const statusEl = document.getElementById(`sc-${name}-status`);
  const valEl    = document.getElementById(`sc-${name}-val`);
  if (statusEl) statusEl.textContent = `${model.status} · ${model.confidence}% conf.`;
  if (valEl)   { valEl.innerHTML = `${readings.temp}<small> °C</small>`; flip(valEl); }
}

// ── Health Panel ──────────────────────────────────────────────────────────────
const healthBadge  = document.getElementById('healthBadge');
const healthStatus = document.getElementById('healthStatus');
const healthConf   = document.getElementById('healthConf');
const healthIconSvg= document.getElementById('healthIconSvg');
const scoreLabel   = document.getElementById('scoreLabel');
const scoreFill    = document.getElementById('scoreFill');
const alertsList   = document.getElementById('alertsList');

const HEALTH_SVG = {
  Healthy: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
  Warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  Critical:`<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
};

const SCORE_GRAD = {
  Healthy:  '#16a34a',
  Warning:  '#d97706',
  Critical: '#dc2626',
};

function updateHealthPanel({ status, score, confidence, alerts }) {
  healthBadge.className = `health-status-box ${status}`;
  healthStatus.textContent = status;
  healthConf.textContent   = `Model confidence: ${confidence}%`;
  healthIconSvg.innerHTML  = HEALTH_SVG[status] || HEALTH_SVG.Warning;

  scoreLabel.textContent   = `${score}/100`;
  scoreFill.style.width    = `${score}%`;
  scoreFill.style.background = SCORE_GRAD[status] || SCORE_GRAD.Healthy;

  alertsList.innerHTML = '';
  if (alerts.length === 0) {
    alertsList.innerHTML = '<div class="alert-item nominal">All systems nominal</div>';
  } else {
    alerts.forEach(a => {
      const el = document.createElement('div');
      el.className = 'alert-item';
      el.textContent = a;
      alertsList.appendChild(el);
    });
  }

  if (status === 'Critical') {
    alertBanner.className = 'alert-banner show critical';
    alertText.textContent = `Critical: ${alerts[0] || 'Immediate action required.'}`;
  } else if (status === 'Warning') {
    alertBanner.className = 'alert-banner show warning';
    alertText.textContent = `Warning: ${alerts[0] || 'Monitor conditions closely.'}`;
  } else {
    alertBanner.className = 'alert-banner';
  }
}

// ── KPI Update ────────────────────────────────────────────────────────────────
function updateKPI(valueId, trendId, cur, prev, unit) {
  const vEl = document.getElementById(valueId);
  const tEl = document.getElementById(trendId);
  if (vEl) { vEl.textContent = cur; flip(vEl); }
  if (tEl) tEl.innerHTML = trendHTML(cur, prev, unit);
}

// ── Chart Push ────────────────────────────────────────────────────────────────
function pushChart(iso, temp, hum, soil, light) {
  labels.push(fmt(iso));
  tempData.push(temp); humData.push(hum); soilData.push(soil); lightData.push(light);
  if (labels.length > MAX_POINTS) {
    [labels, tempData, humData, soilData, lightData].forEach(a => a.shift());
  }
  tempHumChart.update('none');
  soilLightChart.update('none');
}

// ── Message Handler ───────────────────────────────────────────────────────────
function handle(data) {
  if (data.type === 'welcome') {
    addLog(`<span class="log-tag info">WS</span> ${data.message} — <b>${data.clientId}</b>`, data.timestamp);
    return;
  }
  if (data.type !== 'sensorUpdate') return;

  const { timestamp, sensor, readings, model, connectedClients } = data;
  const { temp, humidity, soilMoisture, lightLevel, co2Level } = readings;

  updateKPI('tempValue',     'tempTrend',     temp,         prevReadings.temp,    '°C');
  updateKPI('humidityValue', 'humidityTrend', humidity,     prevReadings.humidity, '%');
  updateKPI('soilValue',     'soilTrend',     soilMoisture, prevReadings.soil,    '%');
  updateKPI('lightValue',    'lightTrend',    lightLevel,   prevReadings.light,   '%');
  updateKPI('co2Value',      'co2Trend',      co2Level,     prevReadings.co2,     'ppm');

  pushChart(timestamp, temp, humidity, soilMoisture, lightLevel);
  updateHealthPanel(model);
  updateSensorCard(sensor, readings, model);

  clientCount.textContent = connectedClients;
  rawPacket.textContent   = JSON.stringify(data, null, 2);
  packetTs.textContent    = fmt(timestamp);

  const tag = model.status.toLowerCase();
  addLog(
    `<span class="log-tag ${tag}">${model.status}</span> [${sensor}] T:${temp}°C H:${humidity}% Soil:${soilMoisture}% Score:${model.score}/100`,
    timestamp
  );

  prevReadings = { temp, humidity, soil: soilMoisture, light: lightLevel, co2: co2Level };
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  setWsState('connecting');
  addLog('<span class="log-tag info">WS</span> Establishing connection...');

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setWsState('connected');
    addLog('<span class="log-tag healthy">WS</span> Connection open — full-duplex channel active');
    ws.send(JSON.stringify({ type: 'requestSnapshot' }));
  };

  ws.onmessage = ({ data }) => {
    try { handle(JSON.parse(data)); }
    catch (e) { addLog(`<span class="log-tag critical">ERR</span> Parse error: ${e.message}`); }
  };

  ws.onclose = ({ code }) => {
    setWsState('disconnected');
    addLog(`<span class="log-tag critical">WS</span> Closed (${code}) — reconnecting in ${RECONNECT_MS/1000}s...`);
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
  };

  ws.onerror = () => {
    addLog('<span class="log-tag critical">ERR</span> WebSocket error');
  };
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function tick() { footerTime.textContent = new Date().toLocaleString('en-US', { hour12: false }); }
tick();
setInterval(tick, 1000);

// ── Boot ──────────────────────────────────────────────────────────────────────
connect();
