#  Smart Agriculture WebSocket Monitoring System

> **Module 5 — Internet of Things and Model Integration with WebSocket**  
> Real-time IoT dashboard demonstrating full-duplex WebSocket communication between simulated IoT sensors and a live web dashboard.

---

## 📋 Activity Overview

| Field | Details |
|---|---|
| **Activity** | IoT WebSocket Integration Design |
| **Type** | Design + Simulation + Analysis |
| **Duration** | 60–90 minutes |
| **Mode** | Individual or Pair |

---

##  System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    IoT Sensor Layer                      │
│  [Sensor-Alpha] [Sensor-Beta] [Sensor-Gamma] [Sensor-Delta]│
│   Temperature · Humidity · Soil Moisture · Light · CO₂   │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket Frame (JSON)
                       ▼
┌─────────────────────────────────────────────────────────┐
│               WebSocket Server (Node.js)                 │
│  • HTTP server (serves static dashboard)                 │
│  • WS server (ws://localhost:3000)                       │
│  • AI Plant Health Model (rule-based inference)          │
│  • Broadcasts sensor data every 2 seconds                │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (full-duplex)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Web Dashboard (Browser Client)              │
│  • Live KPI cards  • Chart.js real-time graphs           │
│  • AI Health Panel • Sensor node status                  │
│  • Activity Log    • Raw WebSocket packet viewer         │
└─────────────────────────────────────────────────────────┘
```

### Part A — Component Roles

| Component | Protocol | Role |
|---|---|---|
| IoT Sensors (simulated) | Internal | Generate temp, humidity, soil, light, CO₂ data |
| WebSocket Server | WS / HTTP | Routes data, runs AI model, broadcasts to all clients |
| AI Health Model | In-process | Classifies plant health as Healthy / Warning / Critical |
| Web Dashboard | WS (client) | Renders live data, charts, alerts, and model output |

---

## Data Flow (Part B)

```
1. SENSOR DATA GENERATION
   └─ Simulated readings generated every 2 seconds with realistic drift
      (sinusoidal base + random noise for each sensor)

2. WEBSOCKET CONNECTION ESTABLISHMENT
   └─ Client sends HTTP Upgrade request → Server returns 101 Switching Protocols
   └─ Full-duplex TCP tunnel established (ws://localhost:3000)

3. DATA TRANSMISSION
   └─ Server broadcasts JSON frame to ALL connected clients every 2s
   └─ Client can also request immediate snapshot via requestSnapshot message

4. MODEL ANALYSIS
   └─ Plant Health Model runs synchronously on each sensor reading:
      • score = 100 − penalties for out-of-range temp/humidity/soil/light
      • status = Healthy (≥75) | Warning (≥45) | Critical (<45)
      • Confidence: 85–95% (simulated)

5. REAL-TIME DASHBOARD UPDATE
   └─ KPI cards flip with new values
   └─ Charts append new data point, slide left (rolling 20 points)
   └─ Health badge + score bar animate to new state
   └─ Alert banner shown for Warning/Critical status
   └─ Activity log entry added with timestamp
```

---

## Model Integration (Part C)

### Input Data
The model receives four sensor readings per inference cycle:
- **Temperature** (°C)
- **Humidity** (%)
- **Soil Moisture** (%)
- **Light Level** (%)

### WebSocket Delivery
Model predictions are embedded in the **same JSON frame** as the sensor data and pushed to all connected clients:
```json
{
  "type": "sensorUpdate",
  "sensor": "Sensor-Alpha",
  "readings": { "temp": 28.3, "humidity": 65.1, "soilMoisture": 52.4, "lightLevel": 70.2 },
  "model": {
    "status": "Healthy",
    "score": 88,
    "confidence": 92,
    "alerts": []
  }
}
```

### Abnormal Data Response
| Condition | Trigger | Dashboard Response |
|---|---|---|
| `Warning` | Score 45–74 | Yellow badge · Warning banner · Alert items |
| `Critical` | Score < 45 | Red badge · Critical banner · Alert items |
| `Healthy` | Score ≥ 75 | Green badge · No banner · "All systems nominal" |

---

## 💡 Part D — Reflection

WebSocket dramatically improves scalability and performance in IoT systems compared to traditional HTTP polling. With polling, each device or browser client must repeatedly send HTTP requests at fixed intervals—even when no new data exists—causing unnecessary bandwidth consumption, redundant TCP handshakes, and inflated server load. In an IoT network with hundreds or thousands of sensors, this creates exponential overhead. WebSocket solves this by maintaining a single persistent TCP connection per client, through which the server can push updates only when new data is available. This eliminates wasted requests, reduces latency to near-zero, and allows the server to broadcast one message to all clients simultaneously—making it far more efficient at scale. Furthermore, WebSocket's event-driven model aligns naturally with the asynchronous, real-time nature of IoT sensor streams, enabling responsive dashboards and instant alerts without architectural complexity.

---

## Getting Started

### Prerequisites
- **Node.js** v16 or higher

### Installation
```bash
npm install
```

### Run
```bash
npm start
```

Open **http://localhost:3000** in your browser.

---

## Project Structure

```
smart-agriculture-websocket-monitoring-system/
├── server/
│   └── server.js          # WebSocket + HTTP server, AI health model
├── client/
│   ├── index.html         # Dashboard HTML (semantic, accessible)
│   ├── style.css          # Dark-mode design system
│   └── app.js             # WebSocket client, Chart.js, UI logic
├── package.json
└── README.md
```

---

## Assessment Rubric Alignment

| Criteria | Implementation |
|---|---|
| **WebSocket Understanding** | Full handshake → persistent connection → broadcast cycle demonstrated |
| **IoT Integration** | 4 named sensor nodes, 5 sensor readings, realistic data simulation |
| **Model Integration** | Rule-based AI model classifies health; predictions delivered via WS frame |
| **Reflection** | Included above (Part D) |

---

*Built for Module 5 — Internet of Things and Model Integration with WebSocket*
