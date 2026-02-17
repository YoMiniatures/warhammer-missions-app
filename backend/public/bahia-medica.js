/**
 * Warhammer Vault - Bahía Médica (Medicae Pod)
 * Sistema de gestión de citas médicas con escáner corporal interactivo
 */

console.log('[Bahía Médica] Initializing...');

// ==========================================
//  DATA STRUCTURES
// ==========================================

// Definición de zonas corporales con revisiones recomendadas
const BODY_ZONES = {
    cabeza: {
        title: 'CABEZA / CRÁNEO',
        description: 'Órganos sensoriales, sistema nervioso central, dental',
        icon: 'psychology',
        recommendations: [
            { name: 'Revisión Oftalmológica', frequency: 'yearly', category: 'Ojos' },
            { name: 'Revisión Dental', frequency: 'biannual', category: 'Dental' },
            { name: 'Limpieza Dental', frequency: 'biannual', category: 'Dental' },
            { name: 'Revisión Auditiva', frequency: 'yearly', category: 'Oídos' },
            { name: 'Revisión ORL (Nariz/Garganta)', frequency: 'yearly', category: 'ORL' }
        ]
    },
    torso: {
        title: 'TORSO / PECHO',
        description: 'Corazón, pulmones, columna vertebral, costillas',
        icon: 'favorite',
        recommendations: [
            { name: 'Electrocardiograma (ECG)', frequency: 'yearly', category: 'Corazón' },
            { name: 'Radiografía de Tórax', frequency: 'yearly', category: 'Pulmones' },
            { name: 'Revisión Cardiológica', frequency: 'yearly', category: 'Corazón' },
            { name: 'Revisión de Columna', frequency: 'yearly', category: 'Columna' }
        ]
    },
    abdomen: {
        title: 'ABDOMEN / BELLY',
        description: 'Estómago, hígado, intestinos, riñones, páncreas',
        icon: 'ecg_heart',
        recommendations: [
            { name: 'Ecografía Abdominal', frequency: 'yearly', category: 'Abdomen' },
            { name: 'Analíticas (Hígado/Riñón)', frequency: 'biannual', category: 'Sangre' },
            { name: 'Endoscopia/Colonoscopia', frequency: 'yearly', category: 'Digestivo' },
            { name: 'Revisión Gastroenterológica', frequency: 'yearly', category: 'Digestivo' }
        ]
    },
    pelvis: {
        title: 'PELVIS / GENITALES',
        description: 'Sistema reproductivo, urológico, próstata',
        icon: 'straighten',
        recommendations: [
            { name: 'Revisión Urológica', frequency: 'yearly', category: 'Urología' },
            { name: 'Ecografía Pélvica', frequency: 'yearly', category: 'Pelvis' },
            { name: 'Revisión Ginecológica', frequency: 'yearly', category: 'Ginecología' },
            { name: 'Revisión Próstata (PSA)', frequency: 'yearly', category: 'Próstata' }
        ]
    },
    brazos: {
        title: 'BRAZOS / EXTREMIDADES SUPERIORES',
        description: 'Hombros, codos, brazos, músculos',
        icon: 'accessibility',
        recommendations: [
            { name: 'Revisión Traumatológica', frequency: 'yearly', category: 'Traumatología' },
            { name: 'Radiografía Articulaciones', frequency: 'yearly', category: 'Huesos' },
            { name: 'Revisión Fisioterapia', frequency: 'yearly', category: 'Fisioterapia' }
        ]
    },
    manos: {
        title: 'MANOS / MUÑECAS',
        description: 'Muñecas, manos, dedos, articulaciones',
        icon: 'back_hand',
        recommendations: [
            { name: 'Revisión Reumatológica', frequency: 'yearly', category: 'Reumatología' },
            { name: 'Radiografía de Manos', frequency: 'yearly', category: 'Huesos' },
            { name: 'Revisión Articulaciones', frequency: 'yearly', category: 'Articulaciones' }
        ]
    },
    piernas: {
        title: 'PIERNAS / EXTREMIDADES INFERIORES',
        description: 'Caderas, rodillas, piernas, músculos',
        icon: 'directions_walk',
        recommendations: [
            { name: 'Revisión Traumatológica', frequency: 'yearly', category: 'Traumatología' },
            { name: 'Ecografía Doppler (Circulación)', frequency: 'yearly', category: 'Vascular' },
            { name: 'Radiografía Rodillas/Caderas', frequency: 'yearly', category: 'Huesos' }
        ]
    },
    pies: {
        title: 'PIES / TOBILLOS',
        description: 'Tobillos, pies, dedos, uñas',
        icon: 'emoji_people',
        recommendations: [
            { name: 'Revisión Podológica', frequency: 'yearly', category: 'Podología' },
            { name: 'Revisión Circulación Periférica', frequency: 'yearly', category: 'Vascular' },
            { name: 'Radiografía de Pies', frequency: 'yearly', category: 'Huesos' }
        ]
    }
};

// Estado global
let currentZone = null;
let checkupsData = [];
let condicionesData = [];

// Historial clínico
let historialData = [];
let historialFiltroActivo = 'todos';
let historialSubtipoActivo = 'visita';
const LS_BAHIA_VIEW = 'bahia-view-activa';

// ==========================================
//  INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Bahía Médica] DOM ready');

    // Initialize DB
    await window.WhVaultDB.initDB();

    // Load data
    await loadCheckupsData();
    await loadCondicionesData();
    await loadHistorialData();

    // Update stats
    updateGlobalStats();

    // Setup connection listeners
    setupConnectionListeners();

    // Restore view from localStorage
    setView(localStorage.getItem(LS_BAHIA_VIEW) || 'scanner');

    // Setup fecha imperial
    updateFechaImperial();
    setInterval(updateFechaImperial, 60000);

    console.log('[Bahía Médica] Ready');
});

// ==========================================
//  DATA LOADING
// ==========================================

async function loadCheckupsData() {
    try {
        console.log('[Bahía] Loading checkups from API...');

        const response = await fetch('/api/bahia/checkups');
        const data = await response.json();

        if (data.success) {
            checkupsData = data.checkups || [];
            console.log(`[Bahía] Loaded ${checkupsData.length} checkups`);

            // Cache in IndexedDB
            await window.WhVaultDB.cacheApiData(window.WhVaultDB.STORES.CITAS_MEDICAS, checkupsData);
        } else {
            console.warn('[Bahía] API returned error:', data.error);
            // Try to load from cache
            await loadCheckupsFromCache();
        }
    } catch (error) {
        console.error('[Bahía] Error loading checkups:', error);
        // Load from cache
        await loadCheckupsFromCache();
    }
}

async function loadCheckupsFromCache() {
    try {
        const cached = await window.WhVaultDB.getCachedData(window.WhVaultDB.STORES.CITAS_MEDICAS);
        checkupsData = cached.data || [];
        console.log(`[Bahía] Loaded ${checkupsData.length} checkups from cache`);
    } catch (error) {
        console.error('[Bahía] Error loading from cache:', error);
        checkupsData = [];
    }
}

async function loadCondicionesData() {
    try {
        console.log('[Bahía] Loading condiciones from API...');
        const response = await fetch('/api/bahia/condiciones');
        const data = await response.json();
        if (data.success) {
            condicionesData = data.condiciones || [];
            console.log(`[Bahía] Loaded ${condicionesData.length} condiciones`);
            await window.WhVaultDB.cacheApiData(window.WhVaultDB.STORES.CONDICIONES_MEDICAS, condicionesData);
        } else {
            await loadCondicionesFromCache();
        }
    } catch (error) {
        console.error('[Bahía] Error loading condiciones:', error);
        await loadCondicionesFromCache();
    }
}

async function loadCondicionesFromCache() {
    try {
        const cached = await window.WhVaultDB.getCachedData(window.WhVaultDB.STORES.CONDICIONES_MEDICAS);
        condicionesData = cached.data || [];
        console.log(`[Bahía] Loaded ${condicionesData.length} condiciones from cache`);
    } catch (error) {
        condicionesData = [];
    }
}

// ==========================================
//  ZONE SELECTION
// ==========================================

function selectZone(zoneName) {
    console.log(`[Bahía] Selected zone: ${zoneName}`);

    currentZone = zoneName;
    const zoneData = BODY_ZONES[zoneName];

    if (!zoneData) {
        console.error(`[Bahía] Unknown zone: ${zoneName}`);
        return;
    }

    // Hide pod view
    document.getElementById('pod-view').classList.add('hidden');

    // Show zone view with animation
    const zoneView = document.getElementById('zone-view');
    zoneView.classList.remove('hidden');
    setTimeout(() => {
        zoneView.classList.add('active');
    }, 50);

    // Update zone header
    document.getElementById('zone-title').textContent = zoneData.title;
    document.getElementById('zone-description').textContent = zoneData.description;
    document.getElementById('zone-icon').textContent = zoneData.icon;

    // Render condiciones slots
    renderCondicionesSlots(zoneName);

    // Render zone content (checkups)
    renderZoneContent(zoneName, zoneData);

    // Highlight zone in overlay
    document.querySelectorAll('.zone-overlay').forEach(el => {
        if (el.dataset.zone === zoneName) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

function backToPod() {
    console.log('[Bahía] Returning to pod view');

    currentZone = null;

    // Hide zone view
    const zoneView = document.getElementById('zone-view');
    zoneView.classList.remove('active');
    setTimeout(() => {
        zoneView.classList.add('hidden');
    }, 400);

    // Show pod view
    document.getElementById('pod-view').classList.remove('hidden');

    // Remove zone highlights
    document.querySelectorAll('.zone-overlay').forEach(el => {
        el.classList.remove('active');
    });
}

// ==========================================
//  ZONE CONTENT RENDERING
// ==========================================

function renderZoneContent(zoneName, zoneData) {
    const container = document.getElementById('zone-content');

    // Filter checkups for this zone
    const zoneCheckups = checkupsData.filter(c => c.zone === zoneName);

    // Próximas citas
    const upcomingCheckups = zoneCheckups.filter(c => !c.completed && new Date(c.date) >= new Date());
    const pastCheckups = zoneCheckups.filter(c => !c.completed && new Date(c.date) < new Date());

    let html = '';

    // Botón añadir revisión
    html += `
        <div class="flex justify-between items-center mb-4">
            <h4 class="text-secondary text-sm font-bold tracking-widest uppercase">Revisiones Programadas</h4>
            <button onclick="openAddCheckupModal('${zoneName}')" class="flex items-center gap-1 px-3 py-1.5 bg-medical-green/20 border border-medical-green/50 hover:bg-medical-green/30 transition-colors">
                <span class="material-symbols-outlined text-medical-green text-sm">add</span>
                <span class="text-medical-green text-xs font-bold uppercase tracking-wider">Añadir</span>
            </button>
        </div>
    `;

    // Upcoming checkups
    if (upcomingCheckups.length > 0) {
        html += `<div class="space-y-2 mb-4">`;
        upcomingCheckups.forEach(checkup => {
            html += renderCheckupCard(checkup);
        });
        html += `</div>`;
    }

    // Overdue checkups
    if (pastCheckups.length > 0) {
        html += `
            <div class="mb-4">
                <h4 class="text-red-500 text-xs font-bold tracking-widest uppercase mb-2 flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm">warning</span>
                    Revisiones Atrasadas
                </h4>
                <div class="space-y-2">
        `;
        pastCheckups.forEach(checkup => {
            html += renderCheckupCard(checkup, true);
        });
        html += `</div></div>`;
    }

    // Revisiones recomendadas
    html += `
        <div class="mt-6">
            <h4 class="text-secondary text-xs font-bold tracking-widest uppercase mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">recommend</span>
                Revisiones Recomendadas
            </h4>
            <div class="space-y-2">
    `;

    zoneData.recommendations.forEach(rec => {
        const frequencyText = {
            'yearly': 'Anual',
            'biannual': 'Semestral',
            'quarterly': 'Trimestral',
            'monthly': 'Mensual'
        }[rec.frequency] || rec.frequency;

        html += `
            <div class="checkup-item rounded p-3">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="text-white text-sm font-bold">${rec.name}</div>
                        <div class="text-gray-400 text-xs mt-1 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[10px]">schedule</span>
                            <span>${frequencyText}</span>
                            <span class="text-secondary">• ${rec.category}</span>
                        </div>
                    </div>
                    <button onclick="quickAddCheckup('${zoneName}', '${rec.name}', '${rec.frequency}')"
                            class="flex items-center justify-center size-8 bg-medical-green/20 border border-medical-green/50 hover:bg-medical-green/30 transition-colors">
                        <span class="material-symbols-outlined text-medical-green text-sm">add</span>
                    </button>
                </div>
            </div>
        `;
    });

    html += `</div></div>`;

    // No checkups message
    if (zoneCheckups.length === 0) {
        html += `
            <div class="text-center py-8 text-gray-500 text-sm font-mono">
                No hay revisiones programadas para esta zona
            </div>
        `;
    }

    container.innerHTML = html;
}

function renderCheckupCard(checkup, overdue = false) {
    const date = new Date(checkup.date);
    const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = checkup.time || '';

    return `
        <div class="checkup-item ${overdue ? 'overdue' : ''} rounded p-3">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="text-white text-sm font-bold">${checkup.name}</div>
                    <div class="text-gray-400 text-xs mt-1 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[10px]">event</span>
                        <span>${dateStr} ${timeStr}</span>
                    </div>
                    ${checkup.doctor ? `<div class="text-gray-500 text-xs mt-1">${checkup.doctor}</div>` : ''}
                    ${checkup.notes ? `<div class="text-gray-500 text-xs mt-1 italic">${checkup.notes}</div>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="editCheckup('${checkup.id}')" class="text-medical-green hover:text-medical-green/70">
                        <span class="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button onclick="deleteCheckup('${checkup.id}')" class="text-red-500 hover:text-red-400">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
//  MODAL HANDLING
// ==========================================

function openAddCheckupModal(zoneName) {
    document.getElementById('checkup-zone').value = zoneName;
    document.getElementById('checkup-name').value = '';
    document.getElementById('checkup-date').value = '';
    document.getElementById('checkup-time').value = '09:00';
    document.getElementById('checkup-doctor').value = '';
    document.getElementById('checkup-notes').value = '';
    document.getElementById('checkup-frequency').value = 'none';

    const modal = document.getElementById('modal-checkup');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeCheckupModal() {
    const modal = document.getElementById('modal-checkup');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function quickAddCheckup(zoneName, name, frequency) {
    document.getElementById('checkup-zone').value = zoneName;
    document.getElementById('checkup-name').value = name;
    document.getElementById('checkup-date').value = '';
    document.getElementById('checkup-time').value = '09:00';
    document.getElementById('checkup-doctor').value = '';
    document.getElementById('checkup-notes').value = '';
    document.getElementById('checkup-frequency').value = frequency;

    const modal = document.getElementById('modal-checkup');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Focus on date field
    setTimeout(() => {
        document.getElementById('checkup-date').focus();
    }, 100);
}

async function saveCheckup() {
    const zone = document.getElementById('checkup-zone').value;
    const name = document.getElementById('checkup-name').value.trim();
    const date = document.getElementById('checkup-date').value;
    const time = document.getElementById('checkup-time').value;
    const doctor = document.getElementById('checkup-doctor').value.trim();
    const notes = document.getElementById('checkup-notes').value.trim();
    const frequency = document.getElementById('checkup-frequency').value;

    if (!name || !date) {
        showToast('Completa los campos requeridos', 'error');
        return;
    }

    const checkup = {
        id: generateId(),
        zone: zone,
        name: name,
        date: date,
        time: time,
        doctor: doctor,
        notes: notes,
        frequency: frequency,
        completed: false,
        created: new Date().toISOString()
    };

    try {
        // Save to backend
        const response = await fetch('/api/bahia/checkups/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(checkup)
        });

        const data = await response.json();

        if (data.success) {
            // Add to local data
            checkupsData.push(checkup);

            // Update cache
            await window.WhVaultDB.cacheApiData(window.WhVaultDB.STORES.CITAS_MEDICAS, checkupsData);

            showToast('Revisión añadida correctamente', 'success');
            closeCheckupModal();

            // Refresh zone view if we're in it
            if (currentZone === zone) {
                const zoneData = BODY_ZONES[zone];
                renderZoneContent(zone, zoneData);
            }

            // Update global stats
            updateGlobalStats();
        } else {
            showToast(data.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        console.error('[Bahía] Error saving checkup:', error);

        // Queue for sync if offline
        await window.WhVaultDB.addToSyncQueue({
            type: 'create-checkup',
            endpoint: '/api/bahia/checkups/crear',
            method: 'POST',
            body: checkup
        });

        // Add to local data anyway
        checkupsData.push(checkup);
        await window.WhVaultDB.cacheApiData(window.WhVaultDB.STORES.CITAS_MEDICAS, checkupsData);

        showToast('Revisión añadida (pendiente sync)', 'warning');
        closeCheckupModal();

        if (currentZone === zone) {
            const zoneData = BODY_ZONES[zone];
            renderZoneContent(zone, zoneData);
        }

        updateGlobalStats();
    }
}

async function deleteCheckup(checkupId) {
    if (!confirm('¿Eliminar esta revisión?')) return;

    try {
        const response = await fetch(`/api/bahia/checkups/${checkupId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            // Remove from local data
            checkupsData = checkupsData.filter(c => c.id !== checkupId);

            // Update cache
            await window.WhVaultDB.cacheApiData(window.WhVaultDB.STORES.CITAS_MEDICAS, checkupsData);

            showToast('Revisión eliminada', 'success');

            // Refresh current zone view
            if (currentZone) {
                const zoneData = BODY_ZONES[currentZone];
                renderZoneContent(currentZone, zoneData);
            }

            updateGlobalStats();
        }
    } catch (error) {
        console.error('[Bahía] Error deleting checkup:', error);
        showToast('Error al eliminar', 'error');
    }
}

// ==========================================
//  STATS
// ==========================================

function updateGlobalStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Próxima cita
    const upcoming = checkupsData
        .filter(c => !c.completed && new Date(c.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const proxima = document.getElementById('proxima-cita-global');
    if (upcoming.length > 0) {
        const nextDate = new Date(upcoming[0].date);
        const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        proxima.textContent = diffDays === 0 ? 'Hoy' : diffDays === 1 ? 'Mañana' : `${diffDays} días`;
        proxima.classList.add('text-medical-green');
    } else {
        proxima.textContent = '--';
        proxima.classList.remove('text-medical-green');
    }

    // Total revisiones
    document.getElementById('total-checkups').textContent = checkupsData.length;

    // Pendientes/atrasadas
    const overdue = checkupsData.filter(c => !c.completed && new Date(c.date) < today);
    const pendingEl = document.getElementById('pending-checkups');
    pendingEl.textContent = overdue.length;
    if (overdue.length > 0) {
        pendingEl.classList.add('text-red-500', 'font-bold');
    } else {
        pendingEl.classList.remove('text-red-500', 'font-bold');
    }

    // Health score (simple calculation)
    const totalRecommended = Object.values(BODY_ZONES).reduce((sum, zone) => sum + zone.recommendations.length, 0);
    const score = totalRecommended > 0 ? Math.round((checkupsData.length / totalRecommended) * 100) : 100;
    const scoreEl = document.getElementById('health-score');
    scoreEl.textContent = `${Math.min(score, 100)}%`;

    if (score >= 80) {
        scoreEl.classList.add('text-medical-green');
        scoreEl.classList.remove('text-yellow-500', 'text-red-500');
        document.getElementById('overall-status').textContent = 'Status: Optimal';
    } else if (score >= 50) {
        scoreEl.classList.add('text-yellow-500');
        scoreEl.classList.remove('text-medical-green', 'text-red-500');
        document.getElementById('overall-status').textContent = 'Status: Atención Recomendada';
    } else {
        scoreEl.classList.add('text-red-500');
        scoreEl.classList.remove('text-medical-green', 'text-yellow-500');
        document.getElementById('overall-status').textContent = 'Status: Revisar Urgente';
    }
}

// ==========================================
//  UTILITIES
// ==========================================

function generateId() {
    return 'checkup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    if (type === 'error') {
        toast.style.background = '#ef4444';
    } else if (type === 'warning') {
        toast.style.background = '#f59e0b';
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function updateFechaImperial() {
    const now = new Date();
    const day = String(now.getDate()).padStart(3, '0');
    const month = String(now.getMonth() + 1).padStart(3, '0');
    const year = now.getFullYear();
    const imperialDate = `${day}.${month}.${year}.M3`;

    const el = document.getElementById('fecha-imperial');
    if (el) el.textContent = imperialDate;
}

// ==========================================
//  CONNECTION STATUS
// ==========================================

function setupConnectionListeners() {
    // Network status
    window.WhVaultDB.onConnectionChange((online) => {
        console.log('[Bahía] Network:', online ? 'ONLINE' : 'OFFLINE');
    });

    // Cogitator status (backend)
    window.WhVaultDB.onCogitatorChange((online) => {
        console.log('[Bahía] Cogitator:', online ? 'ONLINE' : 'OFFLINE');
        updateStatusUI(online);
    });

    // Check cogitator on load
    window.WhVaultDB.checkCogitatorStatus();

    // Periodic check
    setInterval(() => {
        window.WhVaultDB.checkCogitatorStatus();
    }, 30000);

    // Sync queue changes
    window.WhVaultDB.onPendingChanges((count) => {
        const badge = document.getElementById('pending-badge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    });
}

function updateStatusUI(online) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const desktopDot = document.getElementById('desktop-status-dot');

    if (statusDot) {
        statusDot.className = `absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-[#221618] ${
            online ? 'bg-green-500' : 'bg-red-500'
        }`;
    }

    if (statusText) {
        statusText.textContent = online ? 'NOMINAL' : 'OFFLINE';
    }

    if (desktopDot) {
        desktopDot.className = `size-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`;
    }
}

console.log('[Bahía Médica] Script loaded');

// ==========================================
//  CONDICIONES MÉDICAS (LESIONES / AFECCIONES)
// ==========================================

function renderCondicionesSlots(zoneName) {
    const container = document.getElementById('condiciones-slots');
    if (!container) return;

    // Actualizar zona hidden para el modal
    const zonaHiddenEl = document.getElementById('condicion-zona');
    if (zonaHiddenEl) zonaHiddenEl.value = zoneName;

    const zonaCondiciones = condicionesData.filter(c => c.zona === zoneName && !c.completada);
    const SLOT_COUNT = 4;

    let html = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
        const condicion = zonaCondiciones[i];
        if (condicion) {
            const esPermanente = condicion.permanente;
            const borderColor = esPermanente ? '#dc2626' : '#f59e0b';
            const bgColor = esPermanente ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.08)';
            const badgeColor = esPermanente ? '#dc2626' : '#f59e0b';
            const badgeBg = esPermanente ? 'rgba(220,38,38,0.2)' : 'rgba(245,158,11,0.2)';
            const badgeText = esPermanente ? 'PERMANENTE' : 'PASAJERA';
            const severityColor = condicion.severidad === 'grave' ? '#dc2626' : condicion.severidad === 'moderada' ? '#f97316' : '#22c55e';

            html += `
            <div class="condicion-slot relative p-2.5" style="background:${bgColor}; border: 1.5px solid ${borderColor}; border-radius: 4px; min-height: 90px;">
                <div class="flex items-start justify-between gap-1 mb-1.5">
                    <span class="text-white text-xs font-semibold leading-tight flex-1">${condicion.nombre}</span>
                    <button onclick="deleteCondicion('${condicion.id}')" class="text-gray-600 hover:text-red-400 flex-shrink-0" title="Eliminar">
                        <span class="material-symbols-outlined" style="font-size:14px">close</span>
                    </button>
                </div>
                <div class="flex items-center gap-1.5 mb-1">
                    <span class="text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider" style="background:${badgeBg}; color:${badgeColor};">${badgeText}</span>
                    <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" style="background:${severityColor}" title="${condicion.severidad}"></span>
                </div>
                ${condicion.fechaInicio ? `<div class="text-gray-500 text-[9px] font-mono">${condicion.fechaInicio}</div>` : ''}
                ${!esPermanente ? `<button onclick="resolverCondicion('${condicion.id}')" class="mt-1 text-[9px] text-amber-500 hover:text-amber-300 font-bold uppercase tracking-wider">✓ Resolver</button>` : ''}
            </div>`;
        } else {
            // Slot vacío
            html += `
            <div class="condicion-slot-empty flex items-center justify-center cursor-pointer"
                style="min-height:90px; border: 1.5px dashed rgba(107,114,128,0.4); border-radius:4px; background: rgba(107,114,128,0.04);"
                onclick="openAddCondicionModal()">
                <span class="material-symbols-outlined text-gray-600 hover:text-gray-400" style="font-size:22px">add_circle</span>
            </div>`;
        }
    }

    // Si hay más de 4, mostrar contador
    if (zonaCondiciones.length > SLOT_COUNT) {
        html += `<div class="col-span-2 text-center text-gray-500 text-xs py-1">+${zonaCondiciones.length - SLOT_COUNT} más condiciones</div>`;
    }

    container.innerHTML = html;
}

function openAddCondicionModal() {
    const zona = currentZone;
    if (!zona) return;

    // Reset form
    document.getElementById('condicion-nombre').value = '';
    document.getElementById('condicion-severidad').value = 'leve';
    document.getElementById('condicion-notas').value = '';
    document.getElementById('condicion-fecha-resolucion').value = '';
    document.getElementById('condicion-editar-id').value = '';

    // Set today as default fecha-inicio
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    document.getElementById('condicion-fecha-inicio').value = `${yyyy}-${mm}-${dd}`;

    // Set zona
    document.getElementById('condicion-zona').value = zona;

    // Default type: lesión
    setTipoCondicion('lesion');

    // Show modal
    const modal = document.getElementById('modal-condicion');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeCondicionModal() {
    const modal = document.getElementById('modal-condicion');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function setTipoCondicion(tipo) {
    document.getElementById('condicion-tipo').value = tipo;

    const btnLesion = document.getElementById('tipo-lesion-btn');
    const btnAfeccion = document.getElementById('tipo-afeccion-btn');
    const resolucionGrupo = document.getElementById('condicion-resolucion-grupo');

    if (tipo === 'lesion') {
        btnLesion.style.borderColor = '#dc2626';
        btnLesion.style.background = 'rgba(220,38,38,0.25)';
        btnLesion.style.color = '#fca5a5';
        btnAfeccion.style.borderColor = 'rgba(75,85,99,0.5)';
        btnAfeccion.style.background = 'rgba(75,85,99,0.1)';
        btnAfeccion.style.color = '#9ca3af';
        resolucionGrupo.classList.add('hidden');
    } else {
        btnAfeccion.style.borderColor = '#f59e0b';
        btnAfeccion.style.background = 'rgba(245,158,11,0.25)';
        btnAfeccion.style.color = '#fcd34d';
        btnLesion.style.borderColor = 'rgba(75,85,99,0.5)';
        btnLesion.style.background = 'rgba(75,85,99,0.1)';
        btnLesion.style.color = '#9ca3af';
        resolucionGrupo.classList.remove('hidden');
    }
}

async function saveCondicion() {
    const tipo = document.getElementById('condicion-tipo').value;
    const zona = document.getElementById('condicion-zona').value;
    const nombre = document.getElementById('condicion-nombre').value.trim();
    const severidad = document.getElementById('condicion-severidad').value;
    const fechaInicio = document.getElementById('condicion-fecha-inicio').value;
    const notas = document.getElementById('condicion-notas').value.trim();
    const fechaResolucion = document.getElementById('condicion-fecha-resolucion').value;

    if (!nombre) {
        showToast('Introduce un nombre para la condición', 'error');
        return;
    }

    const id = `${tipo}_${Date.now()}`;
    const condicion = {
        id, tipo, zona, nombre,
        permanente: tipo === 'lesion',
        fechaInicio: fechaInicio || null,
        severidad,
        notas,
        fechaResolucionEstimada: tipo === 'afeccion' ? fechaResolucion : null,
    };

    try {
        const response = await fetch('/api/bahia/condiciones/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(condicion)
        });
        const data = await response.json();

        if (data.success) {
            condicionesData.push({ ...condicion, completada: false, fechaCreacion: condicion.fechaInicio });
            renderCondicionesSlots(zona);
            closeCondicionModal();
            showToast('Condición registrada correctamente', 'success');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('[Bahía] Error saving condicion:', error);
        // Offline: add to sync queue
        await window.WhVaultDB.addToSyncQueue({
            id: `sync_${Date.now()}`,
            type: 'create-condicion',
            endpoint: '/api/bahia/condiciones/crear',
            method: 'POST',
            body: condicion,
            timestamp: Date.now(),
            status: 'pending'
        });
        // Add locally for immediate display
        condicionesData.push({ ...condicion, completada: false, fechaCreacion: condicion.fechaInicio });
        renderCondicionesSlots(zona);
        closeCondicionModal();
        showToast('Guardado offline - se sincronizará al conectar', 'warning');
    }
}

async function resolverCondicion(id) {
    try {
        const response = await fetch(`/api/bahia/condiciones/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completada: true })
        });
        const data = await response.json();
        if (data.success) {
            const idx = condicionesData.findIndex(c => c.id === id);
            if (idx !== -1) condicionesData[idx].completada = true;
            renderCondicionesSlots(currentZone);
            showToast('Afección marcada como resuelta', 'success');
        }
    } catch (error) {
        console.error('[Bahía] Error resolviendo condicion:', error);
        showToast('Error al resolver la condición', 'error');
    }
}

async function deleteCondicion(id) {
    if (!confirm('¿Eliminar esta condición?')) return;
    try {
        const response = await fetch(`/api/bahia/condiciones/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            condicionesData = condicionesData.filter(c => c.id !== id);
            renderCondicionesSlots(currentZone);
            showToast('Condición eliminada', 'success');
        }
    } catch (error) {
        console.error('[Bahía] Error eliminando condicion:', error);
        showToast('Error al eliminar', 'error');
    }
}

// ==========================================
//  EDIT MODE FOR OVERLAY POSITIONING
// ==========================================

let editMode = false;
let selectedOverlay = null;
let dragData = { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };
let panelDragData = { isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 };

function toggleEditMode() {
    editMode = !editMode;
    const btn = document.getElementById('edit-mode-btn');
    const controls = document.getElementById('edit-controls');
    const overlays = document.querySelectorAll('.zone-overlay');

    if (editMode) {
        btn.classList.add('active');
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 20px; vertical-align: middle;">check_circle</span> EDIT MODE ON';

        // Enable edit mode on all overlays
        overlays.forEach(overlay => {
            overlay.classList.add('edit-mode');
            // Disable normal click behavior in edit mode
            overlay.onclick = (e) => {
                e.stopPropagation();
                selectOverlayForEdit(overlay);
            };

            // Enable dragging
            overlay.onmousedown = startDrag;
        });
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 20px; vertical-align: middle;">edit</span> EDIT MODE';
        controls.classList.remove('active');

        // Restore normal behavior
        overlays.forEach(overlay => {
            overlay.classList.remove('edit-mode', 'edit-selected');
            overlay.onclick = function() {
                const zone = this.dataset.zone;
                if (zone) selectZone(zone);
            };
            overlay.onmousedown = null;
        });

        selectedOverlay = null;
    }
}

function selectOverlayForEdit(overlay) {
    if (!editMode) return;

    // Deselect previous
    if (selectedOverlay) {
        selectedOverlay.classList.remove('edit-selected');
    }

    // Select new
    selectedOverlay = overlay;
    overlay.classList.add('edit-selected');

    // Show controls
    const controls = document.getElementById('edit-controls');
    controls.classList.add('active');

    // Update control values
    updateControlValues();
}

function deselectOverlay() {
    if (selectedOverlay) {
        selectedOverlay.classList.remove('edit-selected');
        selectedOverlay = null;
    }
    document.getElementById('edit-controls').classList.remove('active');
}

function updateControlValues() {
    if (!selectedOverlay) return;

    const style = selectedOverlay.style;
    const computedStyle = window.getComputedStyle(selectedOverlay);

    // Get zone name
    const zoneName = selectedOverlay.querySelector('.zone-label')?.textContent || 'Unknown';
    document.getElementById('edit-zone-name').value = zoneName;

    // Get position
    const top = style.top || '0%';
    const left = style.left || style.right ? `right: ${style.right}` : '50%';
    document.getElementById('edit-position').value = `top: ${top}, left: ${left}`;

    // Get rotation from transform
    const transform = style.transform || '';
    const rotateMatch = transform.match(/rotate\(([^)]+)\)/);
    const rotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;
    document.getElementById('edit-rotation').value = rotation;

    // Get size
    const width = parseInt(style.width) || parseInt(computedStyle.width);
    const height = parseInt(style.height) || parseInt(computedStyle.height);
    document.getElementById('edit-width').value = width;
    document.getElementById('edit-height').value = height;
}

function adjustRotation(delta) {
    if (!selectedOverlay) return;

    const currentRotation = parseFloat(document.getElementById('edit-rotation').value) || 0;
    const newRotation = currentRotation + delta;
    document.getElementById('edit-rotation').value = newRotation;

    // Apply rotation while preserving other transforms
    const style = selectedOverlay.style;
    const transform = style.transform || '';

    // Remove existing rotate and add new one
    let newTransform = transform.replace(/rotate\([^)]+\)/g, '').trim();
    newTransform = `${newTransform} rotate(${newRotation}deg)`.trim();

    selectedOverlay.style.transform = newTransform;
    updateControlValues();
}

function adjustSize(dimension, delta) {
    if (!selectedOverlay) return;

    const inputId = dimension === 'width' ? 'edit-width' : 'edit-height';
    const currentSize = parseInt(document.getElementById(inputId).value) || 0;
    const newSize = Math.max(10, currentSize + delta); // Minimum 10px

    document.getElementById(inputId).value = newSize;
    selectedOverlay.style[dimension] = `${newSize}px`;

    updateControlValues();
}

function startDrag(e) {
    if (!editMode || !selectedOverlay) return;

    e.preventDefault();
    dragData.isDragging = true;
    dragData.startX = e.clientX;
    dragData.startY = e.clientY;

    // Get current position
    const rect = selectedOverlay.getBoundingClientRect();
    const parent = selectedOverlay.parentElement.getBoundingClientRect();

    dragData.startLeft = ((rect.left + rect.width / 2 - parent.left) / parent.width) * 100;
    dragData.startTop = (rect.top - parent.top) / parent.height * 100;

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
}

function drag(e) {
    if (!dragData.isDragging || !selectedOverlay) return;

    const deltaX = e.clientX - dragData.startX;
    const deltaY = e.clientY - dragData.startY;

    const parent = selectedOverlay.parentElement.getBoundingClientRect();
    const deltaXPercent = (deltaX / parent.width) * 100;
    const deltaYPercent = (deltaY / parent.height) * 100;

    const newLeft = dragData.startLeft + deltaXPercent;
    const newTop = dragData.startTop + deltaYPercent;

    selectedOverlay.style.left = `${newLeft}%`;
    selectedOverlay.style.top = `${newTop}%`;
    selectedOverlay.style.right = ''; // Clear right if using left

    updateControlValues();
}

function stopDrag() {
    dragData.isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
}

function copyOverlayCSS() {
    if (!selectedOverlay) return;

    const style = selectedOverlay.style;
    const zoneName = selectedOverlay.querySelector('.zone-label')?.textContent || 'Unknown';

    // Build CSS string
    const css = `/* ${zoneName} */
position: absolute;
top: ${style.top};
left: ${style.left || (style.right ? `right: ${style.right}` : '50%')};
width: ${style.width};
height: ${style.height};
transform: ${style.transform};`;

    // Copy to clipboard
    navigator.clipboard.writeText(css).then(() => {
        showToast('✓ CSS copiado al portapapeles');
        console.log('[Edit Mode] Copied CSS:\n', css);
    }).catch(err => {
        console.error('[Edit Mode] Failed to copy:', err);
        showToast('✗ Error al copiar CSS');
    });
}

// Make edit controls panel draggable
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('edit-controls');
    const header = document.getElementById('edit-controls-header');

    if (!panel || !header) return;

    header.addEventListener('mousedown', (e) => {
        panelDragData.isDragging = true;
        panelDragData.startX = e.clientX;
        panelDragData.startY = e.clientY;

        // Get current position
        const rect = panel.getBoundingClientRect();
        panelDragData.initialX = rect.left;
        panelDragData.initialY = rect.top;

        document.addEventListener('mousemove', dragPanel);
        document.addEventListener('mouseup', stopDragPanel);
    });
});

function dragPanel(e) {
    if (!panelDragData.isDragging) return;

    const deltaX = e.clientX - panelDragData.startX;
    const deltaY = e.clientY - panelDragData.startY;

    const panel = document.getElementById('edit-controls');
    const newX = panelDragData.initialX + deltaX;
    const newY = panelDragData.initialY + deltaY;

    panel.style.left = `${newX}px`;
    panel.style.bottom = 'auto';
    panel.style.top = `${newY}px`;
    panel.style.transform = 'none';
}

function stopDragPanel() {
    panelDragData.isDragging = false;
    document.removeEventListener('mousemove', dragPanel);
    document.removeEventListener('mouseup', stopDragPanel);
}

// ==========================================
//  HISTORIAL CLÍNICO
// ==========================================

// Colores e iconos por subtipo
const HISTORIAL_CONFIG = {
    visita:      { color: '#3b82f6', label: 'VISITA',      icon: 'local_hospital' },
    medicamento: { color: '#22c55e', label: 'MEDICAMENTO',  icon: 'medication' },
    analisis:    { color: '#f59e0b', label: 'ANÁLISIS',     icon: 'biotech' },
    vacuna:      { color: '#a855f7', label: 'VACUNA',       icon: 'vaccines' },
};

// Meses abreviados para agrupación
const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/**
 * Carga el historial desde la API o cache
 */
async function loadHistorialData() {
    try {
        const año = new Date().getFullYear();
        const response = await fetch(`/api/bahia/historial?ano=${año}`);
        const data = await response.json();
        if (data.success) {
            historialData = data.historial || [];
            await window.WhVaultDB.saveToStore(window.WhVaultDB.STORES.HISTORIAL_MEDICO, historialData);
        }
    } catch (error) {
        console.warn('[Bahía] Error cargando historial, usando cache:', error.message);
        await loadHistorialFromCache();
    }
    renderHistorialList();
}

async function loadHistorialFromCache() {
    try {
        const cached = await window.WhVaultDB.getFromStore(window.WhVaultDB.STORES.HISTORIAL_MEDICO);
        historialData = cached || [];
    } catch (e) {
        historialData = [];
    }
}

/**
 * Toggle entre vista SCANNER e HISTORIAL
 */
function setView(view) {
    const podView = document.getElementById('pod-view');
    const zoneView = document.getElementById('zone-view');
    const historialView = document.getElementById('historial-view');
    const fabCheckup = document.getElementById('fab-add');
    const fabHistorial = document.getElementById('fab-historial');
    const btnScanner = document.getElementById('btn-scanner');
    const btnHistorial = document.getElementById('btn-historial');
    if (!podView || !historialView) return;

    if (view === 'historial') {
        podView.classList.add('hidden');
        zoneView?.classList.add('hidden');
        historialView.classList.remove('hidden');
        fabCheckup?.classList.add('hidden');
        fabHistorial?.classList.remove('hidden');
        // Estilos botones toggle
        btnScanner?.classList.remove('border-medical-green', 'bg-medical-green/10', 'text-medical-green');
        btnScanner?.classList.add('border-[#2d2d2d]', 'text-gray-500');
        btnHistorial?.classList.add('border-blue-500', 'bg-blue-500/10', 'text-blue-400');
        btnHistorial?.classList.remove('border-[#2d2d2d]', 'text-gray-500');
        localStorage.setItem(LS_BAHIA_VIEW, 'historial');
        renderHistorialList();
    } else {
        historialView.classList.add('hidden');
        fabHistorial?.classList.add('hidden');
        podView.classList.remove('hidden');
        // Restaurar FAB checkup si estamos en zona
        if (currentZone) {
            fabCheckup?.classList.remove('hidden');
        }
        // Estilos botones toggle
        btnHistorial?.classList.remove('border-blue-500', 'bg-blue-500/10', 'text-blue-400');
        btnHistorial?.classList.add('border-[#2d2d2d]', 'text-gray-500');
        btnScanner?.classList.add('border-medical-green', 'bg-medical-green/10', 'text-medical-green');
        btnScanner?.classList.remove('border-[#2d2d2d]', 'text-gray-500');
        localStorage.setItem(LS_BAHIA_VIEW, 'scanner');
    }
}

/**
 * Activa un filtro de subtipo y re-renderiza
 */
function setHistorialFiltro(filtro) {
    historialFiltroActivo = filtro;
    // Actualizar estilos de botones
    document.querySelectorAll('.historial-filtro-btn').forEach(btn => {
        const f = btn.dataset.filtro;
        if (f === filtro) {
            btn.classList.add('border-white/20', 'text-white', 'bg-white/10');
            btn.classList.remove('border-[#2d2d2d]', 'text-gray-500');
        } else {
            btn.classList.remove('border-white/20', 'text-white', 'bg-white/10');
            btn.classList.add('border-[#2d2d2d]', 'text-gray-500');
        }
    });
    renderHistorialList();
}

/**
 * Renderiza el timeline de historial agrupado por mes
 */
function renderHistorialList() {
    const container = document.getElementById('historial-list');
    const emptyState = document.getElementById('historial-empty');
    if (!container) return;

    // Filtrar
    let items = historialData;
    if (historialFiltroActivo !== 'todos') {
        items = items.filter(h => h.subtipo === historialFiltroActivo);
    }

    if (items.length === 0) {
        container.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }
    emptyState?.classList.add('hidden');

    // Agrupar por mes
    const grupos = {};
    items.forEach(h => {
        const fecha = h.fecha || '';
        const parts = fecha.split('-');
        const key = parts.length >= 2
            ? `${MESES_ES[parseInt(parts[1], 10) - 1] || '?'} ${parts[0]}`
            : 'Sin fecha';
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(h);
    });

    let html = '';
    for (const [mes, entradas] of Object.entries(grupos)) {
        html += `<div class="text-[10px] font-mono text-gray-600 tracking-widest uppercase mt-3 mb-2 flex items-center gap-2">
            <div class="flex-1 h-px bg-gradient-to-r from-[#2d2d2d] to-transparent"></div>
            <span>${mes}</span>
            <div class="flex-1 h-px bg-gradient-to-l from-[#2d2d2d] to-transparent"></div>
        </div>`;
        entradas.forEach(h => {
            html += renderHistorialCard(h);
        });
    }

    container.innerHTML = html;
}

/**
 * Genera HTML de una card del historial
 */
function renderHistorialCard(h) {
    const cfg = HISTORIAL_CONFIG[h.subtipo] || HISTORIAL_CONFIG.visita;
    const fechaParts = (h.fecha || '').split('-');
    const fechaStr = fechaParts.length === 3
        ? `${parseInt(fechaParts[2])} ${MESES_ES[parseInt(fechaParts[1], 10) - 1] || '?'}`
        : h.fecha || '';

    // Línea de detalle específico por subtipo
    let detalle = '';
    if (h.subtipo === 'visita' && (h.medico || h.especialidad)) {
        detalle = [h.medico, h.especialidad].filter(Boolean).join(' · ');
    } else if (h.subtipo === 'medicamento' && h.nombreMedicamento) {
        detalle = `${h.nombreMedicamento}${h.dosis ? ` — ${h.dosis}` : ''}${h.pauta ? ` (${h.pauta})` : ''}`;
    } else if (h.subtipo === 'analisis' && h.tipoAnalisis) {
        detalle = `${h.tipoAnalisis}${h.resultado ? ` → ${h.resultado}` : ''}`;
    } else if (h.subtipo === 'vacuna' && h.nombreVacuna) {
        detalle = h.nombreVacuna;
    }

    const zonaTag = h.condicionZona
        ? `<span style="background:rgba(255,255,255,0.06); color:#9ca3af; font-size:0.6em; padding:1px 6px; border-radius:3px; font-family:monospace; letter-spacing:1px; text-transform:uppercase;">${h.condicionZona}</span>`
        : '';

    return `
        <div class="relative rounded-lg p-3 mb-2 cursor-pointer hover:opacity-90 transition-opacity group"
             style="background: rgba(20,18,18,0.9); border: 1.5px solid ${cfg.color}22; border-left: 3px solid ${cfg.color};"
             onclick="openHistorialDetalle('${h.id}')">
            <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="material-symbols-outlined text-base flex-shrink-0" style="color: ${cfg.color};">${cfg.icon}</span>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span style="background: ${cfg.color}22; color: ${cfg.color}; font-size:0.55em; font-weight:700; padding:1px 5px; border-radius:2px; letter-spacing:1px; text-transform:uppercase; font-family:monospace;">${cfg.label}</span>
                            ${zonaTag}
                        </div>
                        <p class="text-white text-sm font-semibold leading-snug mt-0.5 truncate">${h.titulo || '(sin título)'}</p>
                        ${detalle ? `<p class="text-gray-400 text-xs mt-0.5 truncate">${detalle}</p>` : ''}
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <p class="text-gray-500 text-[10px] font-mono">${fechaStr}</p>
                    <button onclick="event.stopPropagation(); deleteHistorial('${h.id}')"
                        class="opacity-0 group-hover:opacity-100 transition-opacity mt-1 text-gray-600 hover:text-red-400">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>
            </div>
            ${h.notas ? `<p class="text-gray-500 text-[10px] mt-1.5 italic line-clamp-1">${h.notas}</p>` : ''}
        </div>
    `;
}

/**
 * Abre el modal de nueva entrada de historial
 * @param {string|null} condicionId - ID de condición a preseleccionar
 * @param {string|null} condicionZona - Zona de la condición
 */
function openHistorialModal(condicionId = null, condicionZona = null) {
    const modal = document.getElementById('modal-historial');
    if (!modal) return;

    // Resetear formulario
    document.getElementById('hist-titulo').value = '';
    document.getElementById('hist-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('hist-notas').value = '';
    document.getElementById('hist-medico').value = '';
    document.getElementById('hist-especialidad').value = '';
    document.getElementById('hist-diagnostico').value = '';
    document.getElementById('hist-tratamiento').value = '';
    document.getElementById('hist-nombre-medicamento').value = '';
    document.getElementById('hist-dosis').value = '';
    document.getElementById('hist-pauta').value = '';
    document.getElementById('hist-fecha-fin').value = '';
    document.getElementById('hist-tipo-analisis').value = '';
    document.getElementById('hist-resultado').value = '';
    document.getElementById('hist-nombre-vacuna').value = '';
    document.getElementById('hist-siguiente-dosis').value = '';

    // Poblar selector de condiciones
    const select = document.getElementById('hist-condicion-select');
    if (select) {
        select.innerHTML = '<option value="">— Ninguna —</option>';
        condicionesData.filter(c => !c.completada).forEach(c => {
            const opt = document.createElement('option');
            opt.value = `${c.id}||${c.zona || ''}`;
            opt.textContent = `${c.nombre || c.id} — ${c.zona || 'sin zona'}`;
            if (condicionId && c.id === condicionId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    // Activar subtipo por defecto
    setSubtipoHistorial('visita');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeHistorialModal() {
    const modal = document.getElementById('modal-historial');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Cambia el subtipo activo en el modal y muestra/oculta campos
 */
function setSubtipoHistorial(subtipo) {
    historialSubtipoActivo = subtipo;
    const subtipos = ['visita', 'medicamento', 'analisis', 'vacuna'];
    const colores = { visita: '#3b82f6', medicamento: '#22c55e', analisis: '#f59e0b', vacuna: '#a855f7' };

    subtipos.forEach(s => {
        const btn = document.getElementById(`hist-btn-${s}`);
        const campos = document.getElementById(`hist-campos-${s}`);
        if (btn) {
            if (s === subtipo) {
                btn.style.borderColor = colores[s];
                btn.style.color = colores[s];
                btn.style.background = `${colores[s]}18`;
            } else {
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.style.background = '';
            }
        }
        if (campos) {
            campos.classList.toggle('hidden', s !== subtipo);
        }
    });
}

/**
 * Guarda una nueva entrada del historial
 */
async function saveHistorial() {
    const titulo = document.getElementById('hist-titulo')?.value?.trim();
    const fecha = document.getElementById('hist-fecha')?.value;
    const notas = document.getElementById('hist-notas')?.value?.trim();
    const subtipo = historialSubtipoActivo;

    if (!titulo || !fecha) {
        showToast('Título y fecha son obligatorios', 'error');
        return;
    }

    const id = `historial_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // Leer condición vinculada
    const condSelect = document.getElementById('hist-condicion-select')?.value || '';
    const [condicionId, condicionZona] = condSelect ? condSelect.split('||') : [null, null];

    // Recoger campos por subtipo
    const entry = {
        id, subtipo, fecha, titulo, notas: notas || '',
        condicionId: condicionId || null,
        condicionZona: condicionZona || null,
        medico: document.getElementById('hist-medico')?.value?.trim() || null,
        especialidad: document.getElementById('hist-especialidad')?.value?.trim() || null,
        diagnostico: document.getElementById('hist-diagnostico')?.value?.trim() || null,
        tratamiento: document.getElementById('hist-tratamiento')?.value?.trim() || null,
        nombreMedicamento: document.getElementById('hist-nombre-medicamento')?.value?.trim() || null,
        dosis: document.getElementById('hist-dosis')?.value?.trim() || null,
        pauta: document.getElementById('hist-pauta')?.value?.trim() || null,
        fechaFin: document.getElementById('hist-fecha-fin')?.value || null,
        tipoAnalisis: document.getElementById('hist-tipo-analisis')?.value?.trim() || null,
        resultado: document.getElementById('hist-resultado')?.value?.trim() || null,
        nombreVacuna: document.getElementById('hist-nombre-vacuna')?.value?.trim() || null,
        siguienteDosis: document.getElementById('hist-siguiente-dosis')?.value || null,
        completada: false,
    };

    closeHistorialModal();

    try {
        const response = await fetch('/api/bahia/historial/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
        });
        const data = await response.json();
        if (data.success) {
            historialData.unshift(entry);
            await window.WhVaultDB.saveToStore(window.WhVaultDB.STORES.HISTORIAL_MEDICO, historialData);
            showToast('Entrada registrada', 'success');
        } else {
            showToast(data.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        // Offline: añadir a sync queue
        await window.WhVaultDB.addToSyncQueue({
            type: 'crear-historial',
            endpoint: '/api/bahia/historial/crear',
            method: 'POST',
            body: entry,
        });
        historialData.unshift(entry);
        await window.WhVaultDB.saveToStore(window.WhVaultDB.STORES.HISTORIAL_MEDICO, historialData);
        showToast('Guardado offline — se sincronizará al reconectar', 'warning');
    }

    renderHistorialList();
}

/**
 * Elimina una entrada del historial
 */
async function deleteHistorial(id) {
    if (!confirm('¿Eliminar esta entrada del historial?')) return;
    try {
        const response = await fetch(`/api/bahia/historial/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success || response.ok) {
            historialData = historialData.filter(h => h.id !== id);
            await window.WhVaultDB.saveToStore(window.WhVaultDB.STORES.HISTORIAL_MEDICO, historialData);
            showToast('Entrada eliminada', 'success');
            renderHistorialList();
        }
    } catch (error) {
        showToast('Error al eliminar', 'error');
    }
}

/**
 * Placeholder para detalle (se puede expandir en el futuro)
 */
function openHistorialDetalle(id) {
    // Por ahora muestra las notas en un toast o se puede expandir el card inline
    const entry = historialData.find(h => h.id === id);
    if (entry && entry.notas) {
        showToast(entry.notas.substring(0, 100), 'info');
    }
}
