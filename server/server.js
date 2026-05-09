/**
 * Smart Agriculture WebSocket Server
 * Simulates IoT sensor data (temperature, humidity, crop health)
 * and broadcasts real-time updates to all connected web clients.
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── HTTP Server (serves static dashboard files) ─────────────────────────────
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, '..', 'client', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

let clientCount = 0;
const sensors = ['Sensor-Alpha', 'Sensor-Beta', 'Sensor-Gamma', 'Sensor-Delta'];

// ─── Plant Health AI Model ────────────────────────────────────────────────────
/**
 * Simple rule-based model that classifies plant health based on
 * temperature, humidity, and soil moisture readings.
 * @returns {{ status: string, confidence: number, alerts: string[] }}
 */
function runHealthModel(temp, humidity, soilMoisture, lightLevel) {
  const alerts = [];
  let score = 100;

  // Temperature checks
  if (temp > 38) { alerts.push('[TEMP] Critical heat stress detected'); score -= 35; }
  else if (temp > 32) { alerts.push('[TEMP] High temperature warning'); score -= 15; }
  else if (temp < 10) { alerts.push('[TEMP] Cold stress warning'); score -= 25; }

  // Humidity checks
  if (humidity < 30) { alerts.push('[HUM] Low humidity — risk of wilting'); score -= 20; }
  else if (humidity > 90) { alerts.push('[HUM] High humidity — fungal risk'); score -= 15; }

  // Soil moisture checks
  if (soilMoisture < 20) { alerts.push('[SOIL] Soil moisture critically low'); score -= 30; }
  else if (soilMoisture > 85) { alerts.push('[SOIL] Waterlogged soil detected'); score -= 20; }

  // Light checks
  if (lightLevel < 15) { alerts.push('[LIGHT] Insufficient light exposure'); score -= 10; }

  score = Math.max(0, score);
  const confidence = Math.round(85 + Math.random() * 10);

  let status;
  if (score >= 75) status = 'Healthy';
  else if (score >= 45) status = 'Warning';
  else status = 'Critical';

  return { status, score, confidence, alerts };
}

// ─── Sensor Data Generator ────────────────────────────────────────────────────
let tick = 0;

function generateSensorData() {
  tick++;
  const sensor = sensors[tick % sensors.length];

  // Simulate realistic sensor readings with slight drift
  const baseTemp = 24 + Math.sin(tick / 20) * 8;
  const temp = parseFloat((baseTemp + (Math.random() - 0.5) * 4).toFixed(1));

  const baseHumidity = 60 + Math.cos(tick / 15) * 20;
  const humidity = parseFloat((baseHumidity + (Math.random() - 0.5) * 6).toFixed(1));

  const soilMoisture = parseFloat((45 + Math.sin(tick / 30) * 25 + (Math.random() - 0.5) * 8).toFixed(1));
  const lightLevel = parseFloat((Math.max(0, 60 + Math.sin(tick / 10) * 40 + (Math.random() - 0.5) * 10)).toFixed(1));
  const co2Level = parseFloat((400 + Math.random() * 200).toFixed(0));

  const model = runHealthModel(temp, humidity, soilMoisture, lightLevel);

  return {
    type: 'sensorUpdate',
    timestamp: new Date().toISOString(),
    sensor,
    readings: { temp, humidity, soilMoisture, lightLevel, co2Level },
    model,
    connectedClients: clientCount,
  };
}

// ─── WebSocket Connection Handler ─────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  clientCount++;
  const clientId = `Client-${Date.now()}`;
  console.log(`[+] ${clientId} connected. Total: ${clientCount}`);

  // Send welcome handshake
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Smart Agriculture IoT Server',
    clientId,
    timestamp: new Date().toISOString(),
  }));

  // Handle client messages
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      console.log(`[MSG] from ${clientId}:`, msg);

      if (msg.type === 'requestSnapshot') {
        ws.send(JSON.stringify(generateSensorData()));
      }
    } catch (e) {
      console.error('Invalid message received:', e.message);
    }
  });

  ws.on('close', () => {
    clientCount--;
    console.log(`[-] ${clientId} disconnected. Total: ${clientCount}`);
  });

  ws.on('error', (err) => {
    console.error(`[ERR] ${clientId}:`, err.message);
  });
});

// ─── Broadcast Loop (every 2 seconds) ────────────────────────────────────────
setInterval(() => {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify(generateSensorData());
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, 2000);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n[AgriSense] Smart Agriculture WebSocket Server running`);
  console.log(`   Dashboard → http://localhost:${PORT}`);
  console.log(`   WebSocket → ws://localhost:${PORT}\n`);
});
