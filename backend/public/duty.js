// ==========================================
//  DUTY - DAILY RITUALS & MOOD TRACKER
// ==========================================

// Estado de navegación de fechas
let selectedDate = new Date();
let displayedWeekStart = null;
let weekStatus = {}; // { '2026-01-06': { exists: true, diaPerfecto: true }, ... }

// Rutinas del día - se cargan dinámicamente desde /api/config/rutinas
let RITUALS = {};
let RUTINAS_GRUPOS_ORDER = []; // Orden de los grupos para renderizado

// Fallback hardcoded por si la API no responde
const RITUALS_FALLBACK = {
    prioritaria: [
        { id: 'libro-morbidor', titulo: 'Escribir', icon: 'edit_note', completed: false },
    ],
    matutina: [
        { id: 'despertar-6am', titulo: '6AM', icon: 'alarm', completed: false },
        { id: 'agua', titulo: 'Agua', icon: 'water_drop', completed: false },
        { id: 'estiramientos', titulo: 'Stretch', icon: 'self_improvement', completed: false },
        { id: 'pasear-tori-m', titulo: 'Tori', icon: 'pets', completed: false },
        { id: 'revisar-task', titulo: 'Tasks', icon: 'checklist', completed: false },
        { id: 'ducharse', titulo: 'Ducha', icon: 'shower', completed: false },
        { id: 'coger-tupper', titulo: 'Tupper', icon: 'lunch_dining', completed: false },
        { id: 'llegar-pronto', titulo: 'Puntual', icon: 'schedule', completed: false },
        { id: 'mantra', titulo: 'Mantra', icon: 'spa', completed: false },
    ],
    tarde: [
        { id: 'pasear-tori-a', titulo: 'Tori', icon: 'pets', completed: false },
        { id: 'comer-preparado', titulo: 'Comida', icon: 'restaurant', completed: false },
        { id: 'caos-recoger', titulo: 'Orden', icon: 'cleaning_services', completed: false },
    ],
    noche: [
        { id: 'cenar-preparado', titulo: 'Cena', icon: 'dinner_dining', completed: false },
        { id: 'task-mañana', titulo: 'Planear', icon: 'event_note', completed: false },
        { id: 'journal', titulo: 'Journal', icon: 'auto_stories', completed: false },
        { id: 'pasear-tori-n', titulo: 'Tori', icon: 'pets', completed: false },
        { id: 'preparar-ropa', titulo: 'Ropa', icon: 'checkroom', completed: false },
        { id: 'dormir-11pm', titulo: '11PM', icon: 'bedtime', completed: false },
    ]
};

async function cargarConfigRutinas() {
    try {
        const res = await fetch('/api/config/rutinas');
        const data = await res.json();
        if (data.success && data.config) {
            RITUALS = {};
            RUTINAS_GRUPOS_ORDER = Object.keys(data.config.grupos);
            for (const [nombre, grupo] of Object.entries(data.config.grupos)) {
                RITUALS[nombre] = grupo.rutinas.map(key => ({
                    id: key,
                    titulo: data.config.items[key]?.titulo || key,
                    icon: data.config.items[key]?.icon || 'radio_button_unchecked',
                    completed: false
                }));
            }
            console.log('[Config] Rutinas cargadas:', RUTINAS_GRUPOS_ORDER.join(', '));
            return;
        }
    } catch (e) {
        console.warn('[Config] Error cargando rutinas, usando fallback:', e.message);
    }
    // Fallback
    RITUALS = JSON.parse(JSON.stringify(RITUALS_FALLBACK));
    RUTINAS_GRUPOS_ORDER = Object.keys(RITUALS_FALLBACK);
}

// Datos para Mood Allocator (todos empiezan en 0, PSI max = 100)
const MOODS = {
    imperialis: [
        { id: 'disciplina', titulo: 'Disc', icon: 'shield_lock', value: 0 },
        { id: 'fe', titulo: 'Fe', icon: 'church', value: 0 },
        { id: 'deber', titulo: 'Deber', icon: 'gavel', value: 0 },
        { id: 'humildad', titulo: 'Humil', icon: 'hand_bones', value: 0 },
    ],
    warp: [
        { id: 'ira', titulo: 'Wrath', icon: 'whatshot', value: 0, color: 'red' },
        { id: 'decay', titulo: 'Decay', icon: 'coronavirus', value: 0, color: 'green' },
        { id: 'change', titulo: 'Change', icon: 'change_circle', value: 0, color: 'blue' },
        { id: 'excess', titulo: 'Excess', icon: 'nightlife', value: 0, color: 'pink' },
    ]
};

const PSI_MAX = 100;

let isOfflineMode = false;

// ==========================================
//  UTILIDADES
// ==========================================

function getFechaImperial() {
    const now = new Date();
    const dias = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

    const diaSemana = dias[now.getDay()];
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = meses[now.getMonth()];

    return `+++ ${diaSemana} ${dia} ${mes} +++`;
}

function updateHeader() {
    const fechaEl = document.getElementById('fecha-imperial');
    if (fechaEl) {
        fechaEl.textContent = getFechaImperial();
    }
}

function updateConnectionUI(online) {
    isOfflineMode = !online;
    // Use centralized function from sync-utils.js
    if (window.WhVaultSync && window.WhVaultSync.updateConnectionStatusUI) {
        window.WhVaultSync.updateConnectionStatusUI(online);
    }
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="material-symbols-outlined text-lg mr-1">check_circle</span>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// ==========================================
//  WEEK DAYS CHRONOMETER & NAVIGATION
// ==========================================

function formatDateStr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getSelectedDateStr() {
    return formatDateStr(selectedDate);
}

function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isSameDay(d1, d2) {
    return d1.toDateString() === d2.toDateString();
}

async function fetchWeekStatus(fechaStr) {
    // Si ya sabemos que el cogitator está offline, no intentar
    if (window.WhVaultDB?.getCogitatorStatus && !window.WhVaultDB.getCogitatorStatus()) {
        console.log('[WeekStatus] Cogitator offline, skipping fetch');
        weekStatus = {};
        return;
    }

    try {
        const fetchFn = window.WhVaultDB?.fetchWithTimeout || fetch;
        const res = await fetchFn(`${API_URL}/incursiones/semana/${fechaStr}`);
        const data = await res.json();
        if (data.success) {
            weekStatus = data.dias;
        }
    } catch (error) {
        console.error('Error cargando estado de semana:', error);
        // Actualizar estado de cogitator si falló
        if (window.WhVaultDB?.updateCogitatorStatus) {
            window.WhVaultDB.updateCogitatorStatus(false);
        }
        weekStatus = {};
    }
}

async function renderWeekDays() {
    const container = document.getElementById('week-days');
    const now = new Date();

    // Get Monday of selected date's week
    const monday = getMondayOfWeek(selectedDate);
    displayedWeekStart = monday;

    // Cargar estado de la semana
    await fetchWeekStatus(formatDateStr(monday));

    // Update current day header with selected date
    const dayNamesLong = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const currentDayHeader = document.getElementById('current-day-header');
    if (currentDayHeader) {
        currentDayHeader.textContent = `${dayNamesLong[selectedDate.getDay()]}, ${selectedDate.getDate()} ${monthNames[selectedDate.getMonth()]}`;
    }

    const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

    let html = '';
    for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        const dateStr = formatDateStr(day);

        const isToday = isSameDay(day, now);
        const isSelected = isSameDay(day, selectedDate);
        const isPast = day < now && !isToday;

        // Estado del día desde la API
        const status = weekStatus[dateStr] || { exists: false, diaPerfecto: false };
        const isPerfect = status.diaPerfecto;
        const hasData = status.exists;

        // Icono a mostrar
        let statusIcon = '';
        if (isPerfect) {
            statusIcon = '<span class="material-symbols-outlined text-[10px] text-yellow-400" style="font-variation-settings: \'FILL\' 1;">military_tech</span>';
        } else if (isPast && hasData) {
            statusIcon = '<span class="material-symbols-outlined text-[10px] text-green-500">check</span>';
        }

        // Clases base compactas para que quepan los 7 días
        const baseClass = 'flex flex-col items-center justify-center w-10 h-16 rounded transition-all';

        if (isSelected) {
            html += `
                <button onclick="selectDate('${dateStr}')" class="${baseClass} border-2 border-secondary bg-gradient-to-br from-primary/20 to-surface-dark text-white shadow-[0_0_12px_rgba(212,17,50,0.3)]">
                    <span class="text-[10px] font-bold text-secondary">${dayNames[i]}</span>
                    <span class="text-lg font-display font-bold">${day.getDate()}</span>
                    ${statusIcon || (isToday ? '<div class="h-0.5 w-5 bg-primary mt-0.5"></div>' : '<div class="h-3"></div>')}
                </button>
            `;
        } else if (isToday) {
            html += `
                <button onclick="selectDate('${dateStr}')" class="${baseClass} border border-primary/60 bg-surface-dark text-white hover:border-primary">
                    <span class="text-[10px] font-bold text-primary">${dayNames[i]}</span>
                    <span class="text-lg font-display font-bold">${day.getDate()}</span>
                    ${statusIcon || '<div class="h-0.5 w-4 bg-primary/50 mt-0.5"></div>'}
                </button>
            `;
        } else if (isPast) {
            html += `
                <button onclick="selectDate('${dateStr}')" class="${baseClass} border border-white/10 bg-surface-dark text-gray-500 hover:border-white/30 hover:text-gray-300">
                    <span class="text-[10px] font-bold">${dayNames[i]}</span>
                    <span class="text-lg font-display font-bold">${day.getDate()}</span>
                    ${statusIcon || '<div class="h-3"></div>'}
                </button>
            `;
        } else {
            // Días futuros - bloqueados
            html += `
                <button disabled class="${baseClass} border border-white/5 bg-surface-dark/50 text-gray-600 cursor-not-allowed opacity-50">
                    <span class="text-[10px] font-bold">${dayNames[i]}</span>
                    <span class="text-lg font-display font-bold">${day.getDate()}</span>
                    <span class="material-symbols-outlined text-[10px] text-gray-600">lock</span>
                </button>
            `;
        }
    }

    container.innerHTML = html;
}

async function selectDate(dateStr) {
    selectedDate = new Date(dateStr + 'T12:00:00');
    await renderWeekDays();
    await cargarIncursionFecha(dateStr);
    renderRituals();
    renderMoods();
}

async function navigateWeek(direction) {
    const days = direction * 7;
    selectedDate.setDate(selectedDate.getDate() + days);
    await renderWeekDays();
    await cargarIncursionFecha(getSelectedDateStr());
    renderRituals();
    renderMoods();
}

async function goToToday() {
    selectedDate = new Date();
    await renderWeekDays();
    await cargarIncursionFecha(getSelectedDateStr());
    renderRituals();
    renderMoods();
}

// ==========================================
//  WEEK NAVIGATION (Arrow buttons in HTML)
// ==========================================

// Las flechas están en el HTML y llaman directamente a navigateWeek()
// Esta función se mantiene por compatibilidad pero ya no hace nada
function setupSwipeNavigation() {
    // Navegación mediante flechas en el HTML
    // No se necesita setup adicional
}

// ==========================================
//  DAILY RITUALS
// ==========================================

function isSectionComplete(period) {
    return RITUALS[period] && RITUALS[period].every(r => r.completed);
}

function areAllSectionsComplete() {
    return Object.keys(RITUALS).every(p => isSectionComplete(p));
}

function getCompletedSectionsCount() {
    return Object.keys(RITUALS).filter(p => isSectionComplete(p)).length;
}

function getTotalSectionsCount() {
    return Object.keys(RITUALS).length;
}

function renderRituals() {
    Object.keys(RITUALS).forEach(period => {
        const container = document.getElementById(`rituals-${period}`);
        if (!container) return;

        const column = container.closest('.flex.flex-col') || container.closest('.priority-section');
        const rituals = RITUALS[period];
        const sectionComplete = isSectionComplete(period);

        // Aplicar estilos al contenedor si está completa
        if (column) {
            if (sectionComplete) {
                column.classList.add('section-complete');
                if (period === 'prioritaria') {
                    column.style.borderColor = '#4ade80';
                    column.style.boxShadow = '0 0 25px rgba(74, 222, 128, 0.3), inset 0 0 15px rgba(74, 222, 128, 0.1)';
                } else {
                    column.style.borderColor = '#c5a065';
                    column.style.boxShadow = '0 0 20px rgba(197, 160, 89, 0.3), inset 0 0 15px rgba(197, 160, 89, 0.1)';
                }
            } else {
                column.classList.remove('section-complete');
                column.style.borderColor = '';
                column.style.boxShadow = '';
            }
        }

        // Para la sección prioritaria, render horizontal (card grande)
        if (period === 'prioritaria') {
            container.innerHTML = rituals.map(r => `
                <div class="ritual-card ${r.completed ? 'completed' : ''} w-full rounded-sm py-3 px-4 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="size-8 rounded-full ${r.completed ? 'bg-[#4ade80]/20 border-[#4ade80]' : 'bg-[#d41132]/10 border-[#d41132]/40'} border-2 flex items-center justify-center shadow-inner transition-all">
                            <span class="material-symbols-outlined ${r.completed ? 'text-[#4ade80]' : 'text-[#d41132]/80'} text-lg">${r.icon}</span>
                        </div>
                        <h4 class="text-xs font-bold ${r.completed ? 'text-[#4ade80]' : 'text-gray-200'} tracking-wider uppercase transition-all">${r.titulo}</h4>
                    </div>
                    <div class="completion-seal ${r.completed ? 'completed' : ''} size-6" onclick="toggleRitual('${period}', '${r.id}')">
                        ${r.completed ? '<span class="material-symbols-outlined text-sm text-[#4ade80]">verified</span>' : '<span class="material-symbols-outlined text-sm text-gray-600">radio_button_unchecked</span>'}
                    </div>
                </div>
            `).join('');
        } else {
            // Render vertical estándar para matutina/tarde/noche
            container.innerHTML = rituals.map(r => `
                <div class="ritual-card ${r.completed ? 'completed' : ''} w-full rounded-sm py-3 flex flex-col items-center justify-between gap-2">
                    <div class="size-6 rounded-full ${r.completed ? 'bg-secondary/20 border-secondary' : 'bg-[#1e1415]/60 border-secondary/20'} border flex items-center justify-center shadow-inner transition-all">
                        <span class="material-symbols-outlined ${r.completed ? 'text-secondary' : 'text-secondary/60'} text-sm drop-shadow-[0_0_8px_rgba(197,160,89,0.4)]">${r.icon}</span>
                    </div>
                    <h4 class="text-[8px] font-bold ${r.completed ? 'text-secondary' : 'text-gray-200'} tracking-wider uppercase text-center leading-tight transition-all">${r.titulo}</h4>
                    <div class="completion-seal ${r.completed ? 'completed' : ''} size-4" onclick="toggleRitual('${period}', '${r.id}')">
                        ${r.completed ? '<span class="material-symbols-outlined text-[10px]">verified</span>' : ''}
                    </div>
                </div>
            `).join('');
        }
    });

    // Actualizar el indicador de día perfecto
    updatePerfectDayIndicator();
    updatePsyCapacity();
}

function updatePerfectDayIndicator() {
    const indicator = document.getElementById('perfect-day-indicator');
    if (!indicator) return;

    const sectionsComplete = getCompletedSectionsCount();
    const allComplete = areAllSectionsComplete();

    if (allComplete) {
        indicator.classList.remove('hidden');
        indicator.innerHTML = `
            <div class="flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-secondary/20 via-secondary/10 to-secondary/20 border border-secondary/50 rounded-sm shadow-[0_0_25px_rgba(197,160,89,0.3)]">
                <span class="material-symbols-outlined text-secondary text-xl animate-pulse">military_tech</span>
                <span class="text-secondary font-bold text-sm tracking-widest uppercase">DÍA PERFECTO DESBLOQUEADO</span>
                <span class="material-symbols-outlined text-secondary text-xl animate-pulse">military_tech</span>
            </div>
        `;
    } else if (sectionsComplete > 0) {
        indicator.classList.remove('hidden');
        indicator.innerHTML = `
            <div class="flex items-center justify-center gap-2 py-2 px-4 bg-[#1e1617] border border-[#332224] rounded-sm">
                <span class="text-gray-400 font-mono text-xs tracking-wider">${sectionsComplete}/${getTotalSectionsCount()} SECCIONES COMPLETADAS</span>
            </div>
        `;
    } else {
        indicator.classList.add('hidden');
    }
}

async function toggleRitual(period, id) {
    const ritual = RITUALS[period].find(r => r.id === id);
    if (ritual) {
        ritual.completed = !ritual.completed;
        renderRituals();

        // Guardar en backend
        const result = await guardarRitual(id, ritual.completed);

        // Mensajes según el estado
        if (ritual.completed) {
            if (areAllSectionsComplete()) {
                showToast('🏆 ¡DÍA PERFECTO!');
            } else if (isSectionComplete(period)) {
                const sectionNames = { prioritaria: 'PRIORITARIA', matutina: 'MAÑANA', tarde: 'TARDE', noche: 'NOCHE' };
                showToast(`✨ ${sectionNames[period] || period.toUpperCase()} COMPLETADA`);
            } else {
                showToast(`${ritual.titulo} ✓`);
            }
        }

        // Log de XP si hay resultado
        if (result && result.stats) {
            console.log(`XP Total: ${result.stats.xpTotal}, Pureza: ${result.stats.purezaDia}%`);
        }
    }
}

// ==========================================
//  MOOD ALLOCATOR
// ==========================================

// Estado para tracking de drag
let isDragging = false;
let currentMood = null;
let currentType = null;

function getTotalUsed() {
    const imperiumTotal = MOODS.imperialis.reduce((sum, m) => sum + m.value, 0);
    const chaosTotal = MOODS.warp.reduce((sum, m) => sum + m.value, 0);
    return imperiumTotal + chaosTotal;
}

function getPsiAvailable() {
    return PSI_MAX - getTotalUsed();
}

const STEP = 10; // Incrementos de 10%

function updateMoodValue(type, id, newValue) {
    const moods = MOODS[type];
    const mood = moods.find(m => m.id === id);
    if (!mood) return;

    // Redondear a múltiplos de STEP (10%)
    const roundedValue = Math.round(newValue / STEP) * STEP;

    const currentValue = mood.value;
    const psiAvailable = getPsiAvailable();
    const maxAllowed = currentValue + psiAvailable;

    // Limitar al PSI disponible y redondear
    const finalValue = Math.min(Math.max(0, roundedValue), maxAllowed, 100);

    // Solo actualizar si el valor cambió (evita re-renders innecesarios)
    if (mood.value !== finalValue) {
        mood.value = finalValue;
        renderMoods();
        updatePsyCapacity();
    }
}

function renderMoods() {
    // Imperialis
    const imperialisContainer = document.getElementById('imperialis-moods');
    imperialisContainer.innerHTML = MOODS.imperialis.map(m => {
        const hasValue = m.value > 0;
        const colorClass = hasValue ? 'text-secondary' : 'text-gray-500';

        return `
            <div class="mood-slider flex flex-col items-center gap-1 h-full flex-1 cursor-pointer select-none"
                 data-type="imperialis" data-id="${m.id}">
                <span class="text-[9px] font-mono ${colorClass} font-bold">${m.value}</span>
                <div class="mood-bar relative w-full flex-1 bg-gradient-to-b from-[#252525] to-[#111111] rounded-sm border border-white/10 overflow-hidden hover:border-secondary/50 transition-colors shadow-inner"
                     data-type="imperialis" data-id="${m.id}">
                    <div class="absolute bottom-0 w-full bg-gradient-to-t from-[#8C7853] via-secondary to-[#e5be6b] transition-all duration-100 pointer-events-none"
                         style="height: ${m.value}%; opacity: ${hasValue ? 0.7 : 0}">
                        <div class="absolute top-0 left-0.5 right-0.5 h-1.5 bg-secondary border border-white/20 shadow-[0_0_8px_rgba(197,160,89,0.5)]"></div>
                    </div>
                </div>
                <div class="flex flex-col items-center justify-center size-5 rounded bg-[#151515] border border-white/10 shadow-inner">
                    <span class="material-symbols-outlined text-[12px] ${hasValue ? 'text-secondary' : 'text-gray-600'}">${m.icon}</span>
                </div>
                <span class="text-[6px] uppercase ${hasValue ? 'text-secondary' : 'text-gray-600'} font-bold tracking-tight">${m.titulo}</span>
            </div>
        `;
    }).join('');

    // The Warp
    const warpContainer = document.getElementById('warp-moods');
    const warpColors = {
        red: { text: 'text-red-500', bar: 'from-[#3f0d0d] via-red-800 to-red-500', label: 'text-red-700', icon: 'text-red-600' },
        green: { text: 'text-green-500', bar: 'from-[#052e16] via-green-800 to-green-500', label: 'text-green-700', icon: 'text-green-600' },
        blue: { text: 'text-blue-400', bar: 'from-[#1e1b4b] via-blue-800 to-blue-400', label: 'text-blue-700', icon: 'text-blue-500' },
        pink: { text: 'text-pink-400', bar: 'from-[#4a044e] via-pink-800 to-pink-400', label: 'text-pink-700', icon: 'text-pink-500' },
    };

    warpContainer.innerHTML = MOODS.warp.map(m => {
        const c = warpColors[m.color];
        const hasValue = m.value > 0;

        return `
            <div class="mood-slider flex flex-col items-center gap-1 h-full flex-1 cursor-pointer select-none"
                 data-type="warp" data-id="${m.id}">
                <span class="text-[9px] font-mono ${hasValue ? c.text : 'text-gray-600'} font-bold">${m.value}</span>
                <div class="mood-bar relative w-full flex-1 bg-black/60 rounded-sm border border-white/10 overflow-hidden hover:border-${m.color}-500/50 transition-colors shadow-inner"
                     data-type="warp" data-id="${m.id}">
                    <div class="absolute bottom-0 w-full bg-gradient-to-t ${c.bar} transition-all duration-100 pointer-events-none"
                         style="height: ${m.value}%; opacity: ${hasValue ? 0.9 : 0}">
                        <div class="absolute top-0 left-0 right-0 h-2 border-y border-${m.color}-500/50 bg-[#1a0505] shadow-[0_0_10px_rgba(255,0,0,0.3)]"></div>
                    </div>
                </div>
                <div class="flex flex-col items-center justify-center size-5 rounded bg-[#151515] border border-white/10 shadow-inner">
                    <span class="material-symbols-outlined text-[12px] ${hasValue ? c.icon : 'text-gray-600'}">${m.icon}</span>
                </div>
                <span class="text-[6px] uppercase ${hasValue ? c.label : 'text-gray-600'} font-bold tracking-tight">${m.titulo}</span>
            </div>
        `;
    }).join('');

    // Añadir event listeners para drag
    setupMoodSliders();
}

let slidersInitialized = false;
let lastClientY = 0;

function setupMoodSliders() {
    // Solo añadir eventos globales una vez
    if (!slidersInitialized) {
        // Mouse events
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('mousemove', handlePointerMove);
        document.addEventListener('mouseup', handlePointerUp);
        document.addEventListener('mouseleave', handlePointerUp);

        // Touch events
        document.addEventListener('touchstart', handlePointerDown, { passive: false });
        document.addEventListener('touchmove', handlePointerMove, { passive: false });
        document.addEventListener('touchend', handlePointerUp);
        document.addEventListener('touchcancel', handlePointerUp);

        slidersInitialized = true;
    }
}

function handlePointerDown(e) {
    const bar = e.target.closest('.mood-bar');
    if (!bar) return;

    e.preventDefault();
    isDragging = true;
    currentType = bar.dataset.type;
    currentMood = bar.dataset.id;

    // Obtener posición inicial
    lastClientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Calcular valor inicial
    calculateAndUpdateValue(bar, lastClientY);
}

function handlePointerMove(e) {
    if (!isDragging || !currentMood) return;

    e.preventDefault();

    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    lastClientY = clientY;

    const bar = document.querySelector(`.mood-bar[data-type="${currentType}"][data-id="${currentMood}"]`);
    if (!bar) return;

    calculateAndUpdateValue(bar, clientY);
}

async function handlePointerUp() {
    if (isDragging && currentMood) {
        // Guardar moods cuando se suelta el slider
        await guardarMoods();
        showToast('Mood guardado');
    }
    isDragging = false;
    currentMood = null;
    currentType = null;
}

function calculateAndUpdateValue(bar, clientY) {
    const rect = bar.getBoundingClientRect();

    // Calcular posición relativa (invertida porque 0 está abajo)
    const relativeY = rect.bottom - clientY;
    const percentage = (relativeY / rect.height) * 100;

    updateMoodValue(currentType, currentMood, percentage);
}

function updatePsyCapacity() {
    // PSI = suma de todas las dimensiones (lo USADO)
    const totalUsed = getTotalUsed();

    // Mostrar PSI usado
    document.getElementById('psy-capacity').innerHTML = `${totalUsed}% <span class="text-[10px] text-gray-500 font-normal opacity-70">USED</span>`;
    document.getElementById('psy-bar').style.width = `${totalUsed}%`;

    // Calcular balance Imperium vs Chaos
    const imperiumTotal = MOODS.imperialis.reduce((sum, m) => sum + m.value, 0);
    const chaosTotal = MOODS.warp.reduce((sum, m) => sum + m.value, 0);

    let imperiumPercent, chaosPercent;

    if (totalUsed === 0) {
        // Si no hay nada asignado, mostrar 50/50
        imperiumPercent = 50;
        chaosPercent = 50;
    } else {
        imperiumPercent = Math.round((imperiumTotal / totalUsed) * 100);
        chaosPercent = 100 - imperiumPercent;
    }

    document.getElementById('imperium-bar').style.width = `${imperiumPercent}%`;
    document.getElementById('chaos-bar').style.width = `${chaosPercent}%`;
    document.getElementById('imperium-percent').textContent = `Imperium ${imperiumPercent}%`;
    document.getElementById('chaos-percent').textContent = `Chaos ${chaosPercent}%`;
}

// ==========================================
//  API INTEGRATION
// ==========================================

const API_URL = '/api';

async function cargarIncursionFecha(fechaStr) {
    try {
        const DB = window.WhVaultDB;

        // 1. CACHE-FIRST: Intentar cargar desde IndexedDB primero
        if (DB) {
            const cached = await DB.getCachedIncursion(fechaStr);

            if (cached.data) {
                console.log('[Cache] Displaying cached incursion for', fechaStr);

                // Aplicar datos cacheados a RITUALS y MOODS
                applyIncursionData(cached.data);

                // Aplicar operaciones pendientes (rehydration)
                await applyPendingIncursionOps(fechaStr);

                renderRituals();
                renderMoods();

                // Mostrar indicador si datos son stale
                updateDataFreshnessUI(!cached.isFresh, cached.lastUpdate);

                // Si datos stale, intentar actualizar en background
                if (!cached.isFresh) {
                    console.log('[Cache] Fetching fresh incursion in background...');
                    fetchAndCacheIncursion(fechaStr, true); // silent = true, actualizará connection UI cuando termine
                } else {
                    // Datos frescos desde cache - verificar estado cogitator sin bloquear
                    DB?.checkCogitatorStatus?.().then(online => {
                        updateConnectionUI(online);
                    });
                }

                return;
            }
        }

        // 2. NO HAY CACHE - Intentar fetch (fetchWithTimeout maneja timeout si cogitator no disponible)
        await fetchAndCacheIncursion(fechaStr, false);

        // Si no hay datos después del fetch, resetear
        const allZero = Object.values(RITUALS).flat().every(r => !r.completed) &&
                        MOODS.imperialis.every(m => m.value === 0) &&
                        MOODS.warp.every(m => m.value === 0);

        if (allZero) {
            resetRitualsAndMoods();
            renderRituals();
            renderMoods();
        }

    } catch (error) {
        console.error('Error cargando incursión:', error);
        updateConnectionUI(false);
        resetRitualsAndMoods();
        renderRituals();
        renderMoods();
    }
}

/**
 * Fetch incursion from API and cache to IndexedDB
 * @param {string} fechaStr - Date string (YYYY-MM-DD)
 * @param {boolean} silent - If true, don't update UI (background update)
 */
async function fetchAndCacheIncursion(fechaStr, silent = false) {
    try {
        const DB = window.WhVaultDB;
        const fetchFn = DB?.fetchWithTimeout || fetch;

        const res = await fetchFn(`${API_URL}/incursion/${fechaStr}`);
        const data = await res.json();

        if (data.offline) {
            if (!silent) {
                updateConnectionUI(false);
            }
            return;
        }

        if (data.success && data.data) {
            const incursion = data.data;

            // Cache to IndexedDB
            if (DB) {
                await DB.cacheIncursionData(fechaStr, incursion);
            }

            // Cogitator online
            if (DB?.updateCogitatorStatus) {
                DB.updateCogitatorStatus(true);
            }

            // Apply to UI (only if not silent)
            if (!silent) {
                applyIncursionData(incursion);
                await applyPendingIncursionOps(fechaStr);
                renderRituals();
                renderMoods();
            }

            updateConnectionUI(true);

            // Solo actualizar UI de freshness si no es silent
            if (!silent) {
                updateDataFreshnessUI(false, Date.now());
            }

            console.log('[Cache] Incursion fetched and cached for', fechaStr);
        }

    } catch (error) {
        console.error('Error fetching incursion:', error);

        // Cogitator offline
        if (window.WhVaultDB?.updateCogitatorStatus) {
            window.WhVaultDB.updateCogitatorStatus(false);
        }

        if (!silent) {
            updateConnectionUI(false);
        }
    }
}

/**
 * Apply incursion data to RITUALS and MOODS
 */
function applyIncursionData(incursion) {
    // Actualizar RITUALS
    Object.keys(RITUALS).forEach(period => {
        RITUALS[period].forEach(ritual => {
            ritual.completed = incursion[ritual.id] === true;
        });
    });

    // Actualizar MOODS imperialis
    MOODS.imperialis.forEach(mood => {
        const key = `imperio-${mood.id}`;
        mood.value = incursion[key] || 0;
    });

    // Actualizar MOODS warp
    const warpKeyMap = { 'ira': 'khorne', 'decay': 'nurgle', 'change': 'tzeentch', 'excess': 'slaanesh' };
    MOODS.warp.forEach(mood => {
        const key = `caos-${warpKeyMap[mood.id]}`;
        mood.value = incursion[key] || 0;
    });
}

/**
 * Apply pending sync operations (rehydration)
 */
async function applyPendingIncursionOps(fechaStr) {
    if (!window.WhVaultDB) return;

    const pending = await window.WhVaultDB.getPendingSyncOperations();

    // Aplicar rituales pendientes
    const ritualOps = pending.filter(op =>
        op.type === 'toggle-ritual' &&
        op.body?.fecha === fechaStr
    );
    ritualOps.forEach(op => {
        Object.keys(RITUALS).forEach(period => {
            const ritual = RITUALS[period].find(r => r.id === op.body?.id);
            if (ritual) {
                ritual.completed = op.body?.completed;
            }
        });
    });

    // Aplicar moods pendientes (usar el más reciente)
    const warpKeyMap = { 'ira': 'khorne', 'decay': 'nurgle', 'change': 'tzeentch', 'excess': 'slaanesh' };
    const moodOps = pending.filter(op =>
        op.type === 'update-mood' &&
        op.body?.fecha === fechaStr
    );
    if (moodOps.length > 0) {
        const lastMoodOp = moodOps[moodOps.length - 1];
        const pendingMoods = lastMoodOp.body?.moods || {};

        MOODS.imperialis.forEach(mood => {
            const key = `imperio-${mood.id}`;
            if (pendingMoods[key] !== undefined) {
                mood.value = pendingMoods[key];
            }
        });

        MOODS.warp.forEach(mood => {
            const key = `caos-${warpKeyMap[mood.id]}`;
            if (pendingMoods[key] !== undefined) {
                mood.value = pendingMoods[key];
            }
        });
    }

    console.log('[Sync] Applied pending operations to loaded data');
}

/**
 * Reset rituals and moods to default values
 */
function resetRitualsAndMoods() {
    Object.keys(RITUALS).forEach(period => {
        RITUALS[period].forEach(ritual => {
            ritual.completed = false;
        });
    });

    MOODS.imperialis.forEach(mood => { mood.value = 0; });
    MOODS.warp.forEach(mood => { mood.value = 0; });
}

/**
 * Show/hide stale data indicator
 */
function updateDataFreshnessUI(isStale, lastUpdate) {
    let indicator = document.getElementById('data-freshness');

    if (!isStale) {
        if (indicator) indicator.remove();
        return;
    }

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'data-freshness';
        indicator.className = 'fixed bottom-16 left-0 right-0 bg-amber-900/90 border-t border-amber-700/50 px-3 py-1 flex items-center justify-center gap-2 text-amber-200 text-[10px] font-mono z-40';
        document.body.appendChild(indicator);
    }

    const timeAgo = window.WhVaultDB?.formatLastUpdate(lastUpdate) || 'No cache';
    const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;
    const statusText = cogitatorOnline ? 'Updating...' : 'Offline';
    const statusColor = cogitatorOnline ? 'text-amber-400' : 'text-amber-500';

    indicator.innerHTML = `
        <span class="material-symbols-outlined text-amber-400 text-sm">schedule</span>
        <span>Cached data from ${timeAgo}</span>
        <span class="${statusColor}">(${statusText})</span>
    `;
}

// Alias para compatibilidad
async function cargarIncursionHoy() {
    const hoy = formatDateStr(new Date());
    return cargarIncursionFecha(hoy);
}

async function guardarRitual(id, completed) {
    const fechaStr = getSelectedDateStr();

    // VERIFICAR SI COGITATOR ESTÁ ONLINE
    const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;

    if (cogitatorOnline) {
        // ONLINE: Enviar directamente al servidor
        try {
            const fetchFn = window.WhVaultDB?.fetchWithTimeout || fetch;
            const res = await fetchFn(`${API_URL}/incursion/ritual/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed, fecha: fechaStr })
            });
            const data = await res.json();

            if (data.success) {
                console.log('[Ritual] Saved directly on server:', id);
                // Actualizar cache local
                if (window.WhVaultDB) {
                    const cached = await window.WhVaultDB.getCachedIncursion(fechaStr);
                    if (cached.data) {
                        cached.data[id] = completed;
                        await window.WhVaultDB.cacheIncursionData(fechaStr, cached.data);
                    }
                }
                return data;
            } else {
                throw new Error(data.error || 'Server error');
            }
        } catch (err) {
            console.warn('[Ritual] Direct send failed, queuing:', err.message);
            if (window.WhVaultDB?.updateCogitatorStatus) {
                window.WhVaultDB.updateCogitatorStatus(false);
            }
            updateConnectionUI(false);
        }
    }

    // OFFLINE (o falló el envío directo): Añadir a cola de sync
    if (window.WhVaultDB) {
        const isDuplicate = await window.WhVaultDB.isDuplicateOperation('toggle-ritual', {
            id,
            fecha: fechaStr
        });

        if (!isDuplicate) {
            await window.WhVaultDB.addToSyncQueue({
                type: 'toggle-ritual',
                endpoint: `${API_URL}/incursion/ritual/${id}`,
                method: 'POST',
                body: { id, completed, fecha: fechaStr }
            });

            console.log('[Ritual] Queued for sync:', id);

            if (window.WhVaultSync) {
                await window.WhVaultSync.updatePendingIndicator();
            }
        }
    }

    return { success: true };
}

// Debounce para moods
let moodSaveTimeout = null;

async function guardarMoods() {
    const moods = {};
    const fechaStr = getSelectedDateStr();

    // Imperialis
    MOODS.imperialis.forEach(mood => {
        const key = `imperio-${mood.id}`;
        moods[key] = mood.value;
    });

    // Warp - mapear IDs del frontend a keys del backend
    const warpKeyMap = { 'ira': 'khorne', 'decay': 'nurgle', 'change': 'tzeentch', 'excess': 'slaanesh' };
    MOODS.warp.forEach(mood => {
        const key = `caos-${warpKeyMap[mood.id]}`;
        moods[key] = mood.value;
    });

    // VERIFICAR SI COGITATOR ESTÁ ONLINE
    const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;

    if (cogitatorOnline) {
        // ONLINE: Enviar directamente al servidor
        try {
            const fetchFn = window.WhVaultDB?.fetchWithTimeout || fetch;
            const res = await fetchFn(`${API_URL}/incursion/mood`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moods, fecha: fechaStr })
            });
            const data = await res.json();

            if (data.success) {
                console.log('[Mood] Saved directly on server');
                // Actualizar cache local
                if (window.WhVaultDB) {
                    const cached = await window.WhVaultDB.getCachedIncursion(fechaStr);
                    if (cached.data) {
                        Object.assign(cached.data, moods);
                        await window.WhVaultDB.cacheIncursionData(fechaStr, cached.data);
                    }
                }
                return data;
            } else {
                throw new Error(data.error || 'Server error');
            }
        } catch (err) {
            console.warn('[Mood] Direct send failed, queuing:', err.message);
            if (window.WhVaultDB?.updateCogitatorStatus) {
                window.WhVaultDB.updateCogitatorStatus(false);
            }
            updateConnectionUI(false);
        }
    }

    // OFFLINE (o falló el envío directo): Añadir a cola de sync
    if (window.WhVaultDB) {
        // Para moods, reemplazamos la operación pendiente anterior de la misma fecha
        const pending = await window.WhVaultDB.getPendingSyncOperations();
        const existingMoodOp = pending.find(op =>
            op.type === 'update-mood' &&
            op.body?.fecha === fechaStr
        );

        if (existingMoodOp) {
            await window.WhVaultDB.removeFromSyncQueue(existingMoodOp.id);
        }

        await window.WhVaultDB.addToSyncQueue({
            type: 'update-mood',
            endpoint: `${API_URL}/incursion/mood`,
            method: 'POST',
            body: { moods, fecha: fechaStr }
        });

        console.log('[Mood] Queued for sync');

        if (window.WhVaultSync) {
            await window.WhVaultSync.updatePendingIndicator();
        }
    }

    return { success: true };
}

// ==========================================
//  INIT
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // NO mostrar estado de conexión hasta que el contenido cargue
    // El estado se actualizará en cargarIncursionFecha() cuando termine

    // Registrar para cambios de cogitator (servidor de Obsidian)
    if (window.WhVaultDB) {
        window.WhVaultDB.onCogitatorChange(async (online) => {
            updateConnectionUI(online);
            if (online && isOfflineMode) {
                showToast('Cogitator restaurado');
                // PRIMERO sincronizar cambios pendientes, LUEGO recargar datos
                if (window.WhVaultSync?.processPendingSync) {
                    await window.WhVaultSync.processPendingSync();
                }
                const hoy = formatDateStr(new Date());
                cargarIncursionFecha(hoy);
            }
        });
    }

    // Cargar configuración de rutinas desde API (antes de todo)
    await cargarConfigRutinas();

    updateHeader();
    await renderWeekDays();
    setupSwipeNavigation();

    // Cargar datos del día actual
    const hoy = formatDateStr(new Date());
    await cargarIncursionFecha(hoy);

    // Luego renderizar con los datos cargados
    renderRituals();
    renderMoods();

    // Update header every minute
    setInterval(updateHeader, 60000);
});

// Make functions available globally
window.toggleRitual = toggleRitual;
window.selectDate = selectDate;
window.navigateWeek = navigateWeek;
window.goToToday = goToToday;
