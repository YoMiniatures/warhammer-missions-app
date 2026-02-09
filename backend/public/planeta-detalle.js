// ==========================================
//  PLANETA DETALLE - PLANETA-DETALLE.JS
// ==========================================

const API_URL = '/api';

// ==========================================
//  UTILIDADES
// ==========================================

function getFechaImperial() {
    const now = new Date();
    const dias = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

    const diaSemana = dias[now.getDay()];
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = meses[now.getMonth()];

    return `+++ ${diaSemana} ${dia} ${mes} +++`;
}

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        id: params.get('id'),
        año: parseInt(params.get('año')) || new Date().getFullYear()
    };
}

function setLoading(loading) {
    document.getElementById('loading-state').classList.toggle('hidden', !loading);
    document.getElementById('error-state').classList.add('hidden');
    document.getElementById('main-content').classList.toggle('hidden', loading);
}

function showError() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    document.getElementById('error-state').classList.add('flex');
    document.getElementById('main-content').classList.add('hidden');
}

function showToast(message, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
    if (type === 'success') toast.style.background = '#10b981';
    toast.innerHTML = `<span class="material-symbols-outlined text-sm mr-1">${type === 'error' ? 'error' : 'check_circle'}</span>${message}`;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ==========================================
//  DATA LOADING
// ==========================================

async function cargarPlanetaDetalle() {
    const { id, año } = getUrlParams();
    if (!id) { showError(); return; }

    try {
        setLoading(true);

        // Fetch from API (no cache for detail - always fresh)
        const res = await fetch(`${API_URL}/planetas/${encodeURIComponent(id)}?año=${año}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && data.planeta) {
            renderPlaneta(data.planeta);
            setLoading(false);
        } else {
            showError();
        }
    } catch (error) {
        console.error('[PlanetaDetalle] Error:', error);
        showError();
    }
}

// ==========================================
//  RENDER PLANET
// ==========================================

function renderPlaneta(planeta) {
    // Update header
    document.getElementById('planet-name').textContent = planeta.nombre;

    // Estado badge (clickable)
    updateEstadoBadge(planeta.estado);

    // Stats
    document.getElementById('stat-progress').textContent = `${planeta.progreso}%`;
    document.getElementById('stat-missions').textContent = `${planeta.misionesCompletadas}/${planeta.totalMisiones}`;
    document.getElementById('stat-xp').textContent = planeta.stats.xpEarned;

    // Progress bar
    document.getElementById('progress-bar').style.width = `${planeta.progreso}%`;
    document.getElementById('progress-label').textContent = `${planeta.progreso}% CONQUERED`;
    document.getElementById('xp-label').textContent = `XP: ${planeta.stats.xpEarned}/${planeta.stats.xpTotal}`;

    // Objetivo
    if (planeta.objetivoMes) {
        document.getElementById('objetivo-section').classList.remove('hidden');
        document.getElementById('objetivo-text').textContent = planeta.objetivoMes;
    }

    // Calendar
    renderCalendar(planeta);

    // Missions
    renderMissions(planeta.misiones || []);
}

// ==========================================
//  CALENDAR RENDERING
// ==========================================

function renderCalendar(planeta) {
    const container = document.getElementById('calendar-container');
    const DAYS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];

    // Day headers
    let html = DAYS.map(d => `<div class="calendar-day-header">${d}</div>`).join('');

    // Parse dates
    const start = new Date(planeta.fechaInicio + 'T00:00:00');
    const end = new Date(planeta.fechaFin + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get first day of month (Monday=0 based)
    let firstDayOfWeek = start.getDay() - 1; // Sunday=0 -> Monday-based
    if (firstDayOfWeek < 0) firstDayOfWeek = 6; // Sunday becomes 6

    // Build mission map by day
    const missionsByDay = {};
    if (planeta.misiones) {
        planeta.misiones.forEach(m => {
            if (m.deadline) {
                const day = parseInt(m.deadline.split('-')[2]);
                if (!missionsByDay[day]) missionsByDay[day] = [];
                missionsByDay[day].push(m);
            }
        });
    }

    // Empty cells before first day
    for (let i = 0; i < firstDayOfWeek; i++) {
        html += '<div class="calendar-day-header"></div>';
    }

    // Days of month
    const daysInMonth = end.getDate();
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(start);
        currentDate.setDate(day);

        const isToday = currentDate.getTime() === today.getTime() && start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
        const isPast = currentDate < today;
        const missions = missionsByDay[day] || [];
        const hasCompleted = missions.some(m => m.completada);
        const hasActive = missions.some(m => !m.completada);

        let dayClass = 'calendar-day';
        if (isToday) dayClass += ' calendar-day-today';
        else if (isPast) dayClass += ' calendar-day-past';

        let dotsHtml = '';
        if (hasCompleted) dotsHtml += '<div class="mission-dot bg-green-500" style="left:calc(50% - 5px)"></div>';
        if (hasActive) dotsHtml += '<div class="mission-dot bg-amber-500" style="left:calc(50% + 1px)"></div>';

        html += `<div class="${dayClass}">
            <span class="text-gray-300 ${isToday ? 'text-secondary font-bold' : ''}">${day}</span>
            ${missions.length > 0 ? `<span class="text-[7px] text-gray-500 font-mono">${missions.length}</span>` : ''}
            ${dotsHtml}
        </div>`;
    }

    container.innerHTML = html;
}

// ==========================================
//  MISSIONS LIST RENDERING
// ==========================================

function renderMissions(misiones) {
    const container = document.getElementById('missions-list');
    const countEl = document.getElementById('missions-count');
    const noMissions = document.getElementById('no-missions');

    countEl.textContent = misiones.length;

    if (misiones.length === 0) {
        noMissions.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }

    noMissions.classList.add('hidden');

    // Category icons
    function getCategoriaIcon(cat) {
        const icons = {
            'critica': 'priority_high',
            'importante': 'arrow_upward',
            'opcional': 'more_horiz',
            'desarrollo': 'code',
            'salud': 'favorite',
            'finanzas': 'payments',
            'social': 'group',
            'hogar': 'home',
            'aprendizaje': 'school',
            'creatividad': 'brush'
        };
        return icons[(cat || '').toLowerCase()] || 'task_alt';
    }

    // Sort: active first (by deadline), then completed
    const sorted = [...misiones].sort((a, b) => {
        if (a.completada !== b.completada) return a.completada ? 1 : -1;
        return (a.deadline || '').localeCompare(b.deadline || '');
    });

    container.innerHTML = sorted.map(m => {
        const prioColor = { 'alta': 'text-red-400', 'media': 'text-amber-400', 'baja': 'text-gray-400' }[m.prioridad] || 'text-gray-400';
        const catIcon = getCategoriaIcon(m.categoria);

        return `
        <div class="flex items-center gap-3 p-3 bg-[#1a1718] border border-[#332224] ${m.completada ? 'opacity-50' : ''}">
            <span class="material-symbols-outlined ${m.completada ? 'text-green-500' : prioColor} text-lg flex-shrink-0">
                ${m.completada ? 'check_circle' : catIcon}
            </span>
            <div class="flex-1 min-w-0">
                <div class="text-white text-sm ${m.completada ? 'line-through text-gray-400' : ''} truncate">${m.titulo || m.id}</div>
                <div class="flex items-center gap-2 mt-0.5">
                    ${m.deadline ? `<span class="text-[9px] text-gray-500 font-mono">${m.deadline.split('-')[2]}/${m.deadline.split('-')[1]}</span>` : ''}
                    ${m['puntos-xp'] ? `<span class="text-[9px] text-amber-400/60 font-mono">${m['puntos-xp']}XP</span>` : ''}
                    ${m.categoria ? `<span class="text-[9px] text-gray-500 font-mono uppercase">${m.categoria}</span>` : ''}
                </div>
            </div>
            ${m['criterio-victoria'] ? '<span class="material-symbols-outlined text-amber-400 text-sm flex-shrink-0">military_tech</span>' : ''}
        </div>`;
    }).join('');
}

// ==========================================
//  ESTADO MANAGEMENT
// ==========================================

const ESTADO_CONFIG = {
    'conquistado': { text: 'CONQUERED', class: 'text-green-400 border-green-400/30' },
    'en-conquista': { text: 'IN CONQUEST', class: 'text-amber-400 border-amber-400/30' },
    'bloqueado': { text: 'BLOCKED', class: 'text-red-400 border-red-400/30' },
    'pendiente': { text: 'PENDING', class: 'text-gray-400 border-gray-400/30' }
};

let currentEstado = 'pendiente';

function updateEstadoBadge(estado) {
    currentEstado = estado;
    const badge = document.getElementById('estado-badge');
    const textEl = document.getElementById('estado-text');
    const ec = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente;

    // Handle both old HTML (plain span) and new HTML (button with estado-text child)
    if (textEl) {
        textEl.textContent = ec.text;
        badge.className = `text-[10px] font-mono px-2 py-0.5 border cursor-pointer hover:bg-[#261e1f] transition-colors flex items-center gap-1 ${ec.class}`;
    } else if (badge) {
        badge.textContent = ec.text;
        badge.className = `text-[10px] font-mono px-2 py-0.5 border ${ec.class}`;
    }

    // Highlight current estado in modal
    document.querySelectorAll('.estado-option').forEach(btn => {
        if (btn.dataset.estado === estado) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function openEstadoSelector() {
    document.getElementById('estado-modal').classList.remove('hidden');
}

function closeEstadoSelector() {
    document.getElementById('estado-modal').classList.add('hidden');
}

async function cambiarEstado(nuevoEstado) {
    if (nuevoEstado === currentEstado) {
        closeEstadoSelector();
        return;
    }

    const { id, año } = getUrlParams();
    if (!id) return;

    try {
        const res = await fetch(`${API_URL}/planetas/${encodeURIComponent(id)}/estado?año=${año}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado, año })
        });

        const data = await res.json();

        if (data.success) {
            updateEstadoBadge(nuevoEstado);
            closeEstadoSelector();
            showToast(`Status changed to ${ESTADO_CONFIG[nuevoEstado].text}`, 'success');
        } else {
            showToast(data.error || 'Failed to update', 'error');
        }
    } catch (error) {
        console.error('[PlanetaDetalle] Error changing estado:', error);
        showToast('Connection error', 'error');
    }
}

// ==========================================
//  INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Init DB
    if (window.WhVaultDB) {
        try { await window.WhVaultDB.init(); } catch (e) { console.warn('[PlanetaDetalle] DB init error:', e); }
    }

    // Load planet detail
    cargarPlanetaDetalle();

    // Connection status
    if (window.WhVaultSync) {
        window.WhVaultSync.updateConnectionStatusUI(navigator.onLine);
        window.addEventListener('online', () => window.WhVaultSync.updateConnectionStatusUI(true));
        window.addEventListener('offline', () => window.WhVaultSync.updateConnectionStatusUI(false));
    }
});
