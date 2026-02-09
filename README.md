# Warhammer Missions App

A mobile-first PWA for managing an Obsidian productivity vault themed around Warhammer 40K. View missions, track daily rituals, explore a 3D star system, and manage long-term objectives — all from your phone.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![PWA](https://img.shields.io/badge/PWA-ready-purple)

## Features

- **Offline-first PWA** with Service Worker caching and background sync
- **8-tab navigation** covering all vault operations
- **3D star system** (Three.js) with shader sun, textured planets, and imperial ship
- **Daily ritual tracking** with gamified purity scores
- **Event timeline** with CRT terminal aesthetic
- **Direct vault integration** — reads/writes Obsidian markdown files via gray-matter

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express |
| **Frontend** | Static HTML/CSS/JS (no build step) |
| **Styles** | Tailwind CSS (CDN) + custom CSS |
| **3D** | Three.js r160 (ES module) + custom GLSL shaders |
| **Icons** | Material Symbols |
| **Data** | Obsidian vault markdown files via gray-matter |
| **Storage** | IndexedDB (13 stores) for offline caching |

## Screens

| Tab | Route | Description |
|-----|-------|-------------|
| **Bridge** | `/` | Mission dashboard — urgentes, criterios victoria, opcionales |
| **Auspex** | `/auspex.html` | Event timeline with CRT green terminal theme |
| **Duty** | `/duty.html` | Daily rituals (4 sections) + Mood Allocator (PSI system) |
| **Void** | `/voidmap.html` | 3D star system map with shader sun, skybox, 12 planets |
| **Directivas** | `/directivas.html` | Long-term objectives with crusade progress |
| **Cargo** | `/cargo.html` | Local notepad with offload to vault |
| **Notas** | `/notas.html` | Sacred notes (cuaderno de bitacora) with vault sync |
| **Recor.** | `/recordadora.html` | Orbe de Reminiscencia — local memos/quotes |

Additional pages: `directiva-detalle.html` (crusade roadmap), `planeta-detalle.html` (planet detail with calendar), `install.html` (PWA install guide), `debug.html` (diagnostics).

## Getting Started

### Prerequisites

- **Node.js** >= 18
- An **Obsidian vault** with the expected folder structure and markdown frontmatter (see [Vault Structure](#vault-structure))

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/warhammer-missions-app.git
cd warhammer-missions-app/backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env if you need different ports

# Start the server
npm start
# Or with auto-reload:
npm run dev
```

Open `http://localhost:3001` in your browser.

### Mobile Access (LAN)

1. Ensure your PC and phone are on the same WiFi network
2. Find your PC's local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
3. Open `http://[YOUR-PC-IP]:3001` on your phone

### Remote Access (Tailscale)

The server binds to `0.0.0.0` and works over Tailscale out of the box. Optional HTTPS support via certificates in `backend/certs/`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP server port |
| `HTTPS_PORT` | `3443` | HTTPS server port (if certs present) |

The vault path is resolved relative to the server: `../../warhammer-vault`. Place this repo as a sibling to your Obsidian vault:

```
your-project/
├── warhammer-vault/          # Your Obsidian vault
└── warhammer-missions-app/   # This repo
```

## API Reference

### Missions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/misiones/urgentes` | Missions with deadline today or overdue |
| `GET` | `/api/misiones/criterios-victoria` | Victory criteria missions |
| `GET` | `/api/misiones/opcionales` | Optional missions |
| `POST` | `/api/misiones/:id/completar` | Mark mission complete (auto-updates crusade) |
| `POST` | `/api/misiones/crear` | Create new mission with frontmatter |

### Directives & Crusades
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/directivas` | List directives with crusades and progress |
| `GET` | `/api/directivas/:id` | Directive detail with crusades and missions |
| `GET` | `/api/cruzadas/:nombre` | Crusade detail with steps and deadlines |
| `POST` | `/api/cruzadas/:nombre/completar-paso` | Complete a crusade step |

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/eventos` | Events and vacations for current year |
| `POST` | `/api/eventos/crear` | Create new event in vault |

### Planets
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/planetas?año=YYYY` | List 12 planets for a year |
| `GET` | `/api/planetas/:id?año=YYYY` | Planet detail with missions and XP stats |
| `GET` | `/api/planetas/imagen/:filename` | Serve planet images from vault |
| `POST` | `/api/planetas/:id/estado` | Update planet status |

### Rituals
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config/rutinas` | Routines config (groups, items, display info) |

### Notes & Cargo
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/notas` | List sacred notes |
| `GET` | `/api/notas/:id` | Note detail |
| `POST` | `/api/notas/crear` | Create note in vault |
| `POST` | `/api/notas/offload` | Offload local note to vault |
| `POST` | `/api/cargo/offload` | Offload cargo note to vault |
| `GET` | `/api/avisos` | List avisos from AUSPEX MONITORING |
| `POST` | `/api/avisos/crear` | Create aviso in vault |

## Vault Structure

The app expects an Obsidian vault with this structure:

```
warhammer-vault/
├── 01 - MISIONES ACTIVAS/        # Active missions (.md with frontmatter)
├── 02 - MISIONES COMPLETADAS/    # Completed missions
├── 03 - CRUZADAS/                # Crusade files
├── 14 - CARGO/                   # Cargo offload target
├── 15 - NOTAS SAGRADAS/          # Sacred notes
├── SISTEMA [NAME] - AÑO YYYY/
│   ├── 04 - DIRECTIVAS/          # Year-specific directives
│   └── 05 - INCOMMING TRANSMISSION/
│       ├── AUSPEX MONITORING/    # Avisos
│       ├── EVENTOS ACTIVOS/      # Active events
│       └── EVENTOS COMPLETADOS/  # Past events
└── 00 - Assets/
    └── Attachments/              # Planet images
```

Mission files use YAML frontmatter:

```yaml
---
tipo: mision
directiva: "[[Directive Name]]"
cruzada: "[[Crusade Name]]"
categoria: desarrollo
prioridad: alta
fecha-creacion: 2025-12-29
deadline: 2025-12-31
completada: false
---
```

## PWA Support

The app is a full Progressive Web App:

- **Service Worker** caches all assets for offline use
- **IndexedDB** stores API data locally (13 data stores)
- **Background Sync** queues mutations when offline and replays when back online
- **Install prompt** available on supported browsers

To install as a standalone app, visit `/install.html` for platform-specific instructions.

## Project Structure

```
warhammer-missions-app/
├── backend/
│   ├── server.js              # Express API server (~2900 lines)
│   ├── package.json
│   ├── .env.example           # Environment template
│   ├── certs/                 # Optional TLS certificates
│   ├── tailwind.config.js
│   ├── generate-icons.cjs     # PWA icon generator
│   └── public/                # Static frontend
│       ├── index.html         # Bridge (missions)
│       ├── app.js             # Shared utilities
│       ├── sw.js              # Service Worker
│       ├── db.js              # IndexedDB manager
│       ├── sync-utils.js      # Background sync
│       ├── manifest.json      # PWA manifest
│       ├── [screen].html/js   # Each tab has its own HTML + JS
│       ├── css/
│       │   ├── input.css      # Tailwind input
│       │   └── styles.css     # Custom styles
│       └── assets/
│           ├── icons/         # PWA icons (72-512px)
│           ├── aquila.svg     # App logo
│           ├── ship.glb       # 3D ship model
│           └── skybox.jpg     # Space skybox texture
└── assets/                    # Shared SVG assets
```

## License

MIT

---

*"La victoria pertenece a quien ejecuta."*
