// ==========================================
//  ⚔️ ROGUE TRADER DASHBOARD - APP.JS
// ==========================================

const API_URL = '/api';

// Estado global
let misionesUrgentes = [];
let criteriosVictoria = { misiones: [], completados: 0, total: 0, porcentaje: 0 };
let misionesOpcionales = [];
let eventosSemana = [];
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

function getHoy() {
    return new Date().toISOString().split('T')[0];
}

function getCategoriaIcon(cat) {
    const icons = {
        'desarrollo': 'code',
        'diseño': 'palette',
        'reunion': 'groups',
        'aprendizaje': 'school',
        'importante': 'star',
        'familia': 'family_restroom',
        'salud': 'fitness_center',
        'ocio': 'sports_esports',
        'critica': 'local_fire_department',
        'financiera': 'payments',
        'hogar': 'home'
    };
    const iconName = icons[cat] || 'push_pin';
    return `<span class="material-symbols-outlined text-sm align-middle mr-1">${iconName}</span>`;
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;

    const icon = type === 'success' ? 'check_circle' : 'error';
    toast.innerHTML = `<span class="material-symbols-outlined text-lg mr-1">${icon}</span>${message}`;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function setLoading(loading) {
    document.getElementById('loading-state').classList.toggle('hidden', !loading);
    document.getElementById('main-content').classList.toggle('hidden', loading);
    document.getElementById('error-state').classList.add('hidden');

    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');

    if (loading) {
        statusText.textContent = 'SYNC...';
        statusDot.classList.remove('bg-green-500', 'bg-red-500');
        statusDot.classList.add('bg-yellow-500');
    } else {
        // Respetar estado del cogitator actual
        const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;
        if (window.WhVaultSync) {
            window.WhVaultSync.updateConnectionStatusUI(cogitatorOnline);
        } else {
            statusText.textContent = cogitatorOnline ? 'NOMINAL' : 'OFFLINE';
            statusDot.classList.remove('bg-yellow-500');
            statusDot.classList.add(cogitatorOnline ? 'bg-green-500' : 'bg-red-500');
        }
    }
}

function showError() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    document.getElementById('error-state').classList.add('flex');

    document.getElementById('status-text').textContent = 'ERROR';
    document.getElementById('status-dot').classList.remove('bg-green-500', 'bg-yellow-500');
    document.getElementById('status-dot').classList.add('bg-red-500');
}

function updateConnectionUI(online) {
    isOfflineMode = !online;
    // Use centralized function from sync-utils.js
    if (window.WhVaultSync && window.WhVaultSync.updateConnectionStatusUI) {
        window.WhVaultSync.updateConnectionStatusUI(online);
    }
}

// ==========================================
//  API CALLS - CACHE-FIRST PATTERN
// ==========================================

async function cargarDatos() {
    try {
        const DB = window.WhVaultDB;

        // 1. CACHE-FIRST: Intentar cargar desde IndexedDB primero
        if (DB) {
            const [urgentesCache, criteriosCache, opcionalesCache, eventosCache] = await Promise.all([
                DB.getCachedData(DB.STORES.MISIONES_URGENTES),
                DB.getCachedData(DB.STORES.MISIONES_CRITERIOS),
                DB.getCachedData(DB.STORES.MISIONES_OPCIONALES),
                DB.getCachedData(DB.STORES.EVENTOS)
            ]);

            const hasCachedData = urgentesCache.data.length > 0 ||
                                  criteriosCache.data.length > 0 ||
                                  opcionalesCache.data.length > 0 ||
                                  eventosCache.data.length > 0;

            if (hasCachedData) {
                console.log('[Cache] Displaying cached data immediately');

                // Mostrar datos cacheados inmediatamente
                misionesUrgentes = urgentesCache.data;
                criteriosVictoria = criteriosCache.data.length > 0
                    ? { misiones: criteriosCache.data, completados: 0, total: criteriosCache.data.length, porcentaje: 0 }
                    : { misiones: [], completados: 0, total: 0, porcentaje: 0 };
                misionesOpcionales = opcionalesCache.data;
                eventosSemana = eventosCache.data;

                // Aplicar operaciones pendientes (rehydration)
                await applyPendingOperationsToData();

                renderAll();
                setLoading(false);

                // Mostrar indicador si datos son stale
                const allFresh = urgentesCache.isFresh && criteriosCache.isFresh && opcionalesCache.isFresh && eventosCache.isFresh;
                updateDataFreshnessUI(!allFresh, urgentesCache.lastUpdate);

                // Siempre actualizar en background para mantener datos frescos
                // (especialmente eventos que pueden cambiar de rango entre visitas)
                console.log('[Cache] Fetching fresh data in background...');
                fetchAndCacheData(true);

                return;
            }
        }

        // 2. NO HAY CACHE - Necesitamos datos de la red/cogitator
        setLoading(true);

        // Siempre intentar fetch (el cogitator puede estar disponible aunque navigator.onLine sea dudoso)
        // fetchAndCacheData maneja el timeout y muestra error apropiado
        await fetchAndCacheData(false);

    } catch (err) {
        console.error('Error cargando datos:', err);
        updateConnectionUI(false);
        showError();
    }
}

/**
 * Fetch data from API and cache to IndexedDB
 * @param {boolean} silent - If true, don't update UI (background update)
 */
async function fetchAndCacheData(silent = false) {
    try {
        const DB = window.WhVaultDB;
        const fetchFn = DB?.fetchWithTimeout || fetch;

        const responses = await Promise.all([
            fetchFn(`${API_URL}/misiones/urgentes`),
            fetchFn(`${API_URL}/misiones/criterios-victoria`),
            fetchFn(`${API_URL}/misiones/opcionales`),
            fetchFn(`${API_URL}/eventos/semana?dias=30`)
        ]);

        const [urgentesRes, criteriosRes, opcionalesRes, eventosRes] = await Promise.all(
            responses.map(r => r.json())
        );

        // Check for offline error response
        if (urgentesRes.offline || criteriosRes.offline || opcionalesRes.offline) {
            if (!silent) {
                updateConnectionUI(false);
                showToast('Servidor no disponible', 'error');
            }
            return;
        }

        // Actualizar datos y cachear en IndexedDB
        if (urgentesRes.success && urgentesRes.misiones) {
            misionesUrgentes = urgentesRes.misiones;
            if (DB) await DB.cacheApiData(DB.STORES.MISIONES_URGENTES, urgentesRes.misiones);
        }

        if (criteriosRes.success && criteriosRes.misiones) {
            criteriosVictoria = {
                misiones: criteriosRes.misiones,
                completados: criteriosRes.completados,
                total: criteriosRes.total,
                porcentaje: criteriosRes.porcentaje
            };
            if (DB) await DB.cacheApiData(DB.STORES.MISIONES_CRITERIOS, criteriosRes.misiones);
        }

        if (opcionalesRes.success && opcionalesRes.misiones) {
            misionesOpcionales = opcionalesRes.misiones;
            if (DB) await DB.cacheApiData(DB.STORES.MISIONES_OPCIONALES, opcionalesRes.misiones);
        }

        if (eventosRes.success && eventosRes.eventos) {
            eventosSemana = eventosRes.eventos;
            // Eventos can have duplicate IDs (same event on multiple dates)
            // Generate unique IDs for IndexedDB storage
            if (DB) {
                const eventosWithUniqueIds = eventosRes.eventos.map((e, idx) => ({
                    ...e,
                    id: `${e.id || 'evt'}-${e.fecha || idx}`
                }));
                await DB.cacheApiData(DB.STORES.EVENTOS, eventosWithUniqueIds);
            }
        }

        // Aplicar operaciones pendientes
        await applyPendingOperationsToData();

        if (!silent) {
            renderAll();
            setLoading(false);
        } else {
            // Silent background update - re-render with fresh data
            renderAll();
        }

        // Cogitator está online - actualizar estado
        if (window.WhVaultDB?.updateCogitatorStatus) {
            window.WhVaultDB.updateCogitatorStatus(true);
        }
        updateConnectionUI(true);
        updateDataFreshnessUI(false, Date.now()); // Datos frescos, ocultar indicador

        console.log('[Cache] Data fetched and cached successfully');

    } catch (err) {
        console.error('Error fetching data:', err);

        // Cogitator no disponible - actualizar estado
        if (window.WhVaultDB?.updateCogitatorStatus) {
            window.WhVaultDB.updateCogitatorStatus(false);
        }

        if (!silent) {
            updateConnectionUI(false); // Mostrar COGITATOR OFFLINE
            // Si tenemos caché, mostrar datos cacheados
            const hasCache = await window.WhVaultDB?.hasAnyCachedData();
            if (!hasCache) {
                showError();
            } else {
                showToast('Cogitator no disponible - usando caché', 'error');
            }
        }
    }
}

/**
 * Apply pending sync operations to loaded data (rehydration)
 */
async function applyPendingOperationsToData() {
    if (!window.WhVaultSync) return;

    misionesUrgentes = await window.WhVaultSync.applyPendingOperations('completar-mision', misionesUrgentes);
    misionesOpcionales = await window.WhVaultSync.applyPendingOperations('completar-mision', misionesOpcionales);

    // Para criterios de victoria, marcar como completadas las que están en cola
    const completedIds = (await window.WhVaultDB?.getPendingSyncOperations() || [])
        .filter(op => op.type === 'completar-mision')
        .map(op => op.body?.id);

    criteriosVictoria.misiones = criteriosVictoria.misiones.map(m =>
        completedIds.includes(m.id) ? { ...m, completada: true } : m
    );
}

/**
 * Show/hide stale data indicator
 * @param {boolean} isStale - Whether data is stale
 * @param {number|null} lastUpdate - Timestamp of last update
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

    const timeAgo = window.WhVaultDB?.formatLastUpdate(lastUpdate) || 'Unknown';
    const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;
    const statusText = cogitatorOnline ? 'Updating...' : 'Offline';
    const statusColor = cogitatorOnline ? 'text-amber-400' : 'text-amber-500';

    indicator.innerHTML = `
        <span class="material-symbols-outlined text-amber-400 text-sm">schedule</span>
        <span>Cached data from ${timeAgo}</span>
        <span class="${statusColor}">(${statusText})</span>
    `;
}

async function completarMision(id, titulo, xp) {
    // 1. OPTIMISTIC UI - Actualizar inmediatamente
    const misionElement = document.querySelector(`[data-mision-id="${id}"]`);
    if (misionElement) {
        misionElement.classList.add('opacity-50', 'pointer-events-none');
        const checkbox = misionElement.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = true;
    }

    // Remover de arrays locales inmediatamente
    misionesUrgentes = misionesUrgentes.filter(m => m.id !== id);
    criteriosVictoria.misiones = criteriosVictoria.misiones.map(m =>
        m.id === id ? { ...m, completada: true } : m
    );
    misionesOpcionales = misionesOpcionales.filter(m => m.id !== id);

    // Mostrar XP ganado
    showToast(`+${xp || 0} XP`, 'success');

    // Re-render para reflejar cambios
    renderAll();

    // 2. VERIFICAR SI COGITATOR ESTÁ ONLINE
    const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;

    if (cogitatorOnline) {
        // ONLINE: Enviar directamente al servidor
        try {
            const fetchFn = window.WhVaultDB?.fetchWithTimeout || fetch;
            const res = await fetchFn(`${API_URL}/misiones/${encodeURIComponent(id)}/completar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();

            if (data.success) {
                console.log('[Mission] Completed directly on server:', id);
                // Actualizar cache local con datos frescos
                if (window.WhVaultDB) {
                    // Remover de cache local
                    const urgentes = await window.WhVaultDB.getFromStore(window.WhVaultDB.STORES.MISIONES_URGENTES);
                    const opcionales = await window.WhVaultDB.getFromStore(window.WhVaultDB.STORES.MISIONES_OPCIONALES);
                    await window.WhVaultDB.cacheApiData(window.WhVaultDB.STORES.MISIONES_URGENTES, urgentes.filter(m => m.id !== id));
                    await window.WhVaultDB.cacheApiData(window.WhVaultDB.STORES.MISIONES_OPCIONALES, opcionales.filter(m => m.id !== id));
                }
                return;
            } else {
                throw new Error(data.error || 'Server error');
            }
        } catch (err) {
            console.warn('[Mission] Direct send failed, queuing:', err.message);
            // Falló el envío directo - cogitator se desconectó, añadir a cola
            if (window.WhVaultDB?.updateCogitatorStatus) {
                window.WhVaultDB.updateCogitatorStatus(false);
            }
            updateConnectionUI(false);
        }
    }

    // OFFLINE (o falló el envío directo): Añadir a cola de sync
    if (window.WhVaultDB) {
        const isDuplicate = await window.WhVaultDB.isDuplicateOperation('completar-mision', { id });
        if (isDuplicate) {
            console.log('[Sync] Duplicate operation, skipping queue');
            return;
        }

        await window.WhVaultDB.addToSyncQueue({
            type: 'completar-mision',
            endpoint: `${API_URL}/misiones/${encodeURIComponent(id)}/completar`,
            method: 'POST',
            body: { id, titulo, xp }
        });

        console.log('[Mission] Queued for sync:', id);

        // Actualizar indicador de pendientes
        if (window.WhVaultSync) {
            await window.WhVaultSync.updatePendingIndicator();
        }
    }
}

/**
 * Edit mission deadline via native date picker
 */
async function editarDeadline(id, currentDeadline) {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = currentDeadline || '';
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.top = '0';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
        const newDeadline = input.value;
        input.remove();
        if (!newDeadline) return;

        try {
            const response = await fetch(`/api/misiones/${encodeURIComponent(id)}/deadline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deadline: newDeadline })
            });
            const data = await response.json();
            if (data.success) {
                showToast('Deadline updated', 'success');
                await cargarDatos();
            } else {
                showToast(data.error || 'Error', 'error');
            }
        } catch (error) {
            console.error('[Bridge] Error updating deadline:', error);
            showToast('Connection error', 'error');
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => input.remove(), 200);
    });

    input.showPicker ? input.showPicker() : input.click();
}

// ==========================================
//  RENDER FUNCTIONS
// ==========================================

function renderAll() {
    document.getElementById('fecha-imperial').textContent = getFechaImperial();
    renderTicker();
    renderMisionesUrgentes();
    renderCriteriosVictoria();
    renderMisionesOpcionales();
}

function renderTicker() {
    const container = document.getElementById('ticker-container');
    const content = document.getElementById('ticker-content');

    // Filtrar solo eventos de los próximos 30 días
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const en30Dias = new Date(hoy);
    en30Dias.setDate(en30Dias.getDate() + 30);

    const eventosProximos = eventosSemana.filter(e => {
        if (!e.fecha && !e.deadline) return false;
        const fechaEvento = new Date((e.fecha || e.deadline) + 'T00:00:00');
        return fechaEvento >= hoy && fechaEvento <= en30Dias;
    });

    // Ordenar por fecha
    eventosProximos.sort((a, b) => {
        const fechaA = a.fecha || a.deadline || '';
        const fechaB = b.fecha || b.deadline || '';
        return fechaA.localeCompare(fechaB);
    });

    const items = eventosProximos.map(e => ({
        tipo: 'evento',
        titulo: e.titulo,
        tag: (e.fecha || e.deadline)?.split('-').slice(1).join('/') || 'SOON',
        categoria: e.categoria
    }));

    if (items.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    // Duplicar items para scroll infinito
    const allItems = [...items, ...items];

    content.innerHTML = allItems.map(item => `
        <div class="flex items-center mx-4">
            <span class="text-[#00ff41]/60 text-[10px] mr-2">+++</span>
            <span class="text-xs font-bold font-display uppercase tracking-wide text-[#00ff41]/90" style="text-shadow: 0 0 4px rgba(0,255,65,0.3);">
                ${item.titulo}
            </span>
            <span class="text-[10px] font-mono ml-2 border px-1 rounded-sm bg-[#0a1a0d] text-[#00ff41] border-[#00ff41]/30">
                ${item.tag}
            </span>
            ${item.categoria ? `<span class="text-[#00ff41]/40 text-[10px] font-mono ml-2 uppercase tracking-tight">// ${item.categoria}</span>` : ''}
        </div>
    `).join('');
}

function renderMisionesUrgentes() {
    const container = document.getElementById('misiones-urgentes');
    const countEl = document.getElementById('urgentes-count');

    countEl.textContent = misionesUrgentes.length;

    if (misionesUrgentes.length === 0) {
        container.innerHTML = `
            <div class="py-4 text-center text-gray-500 text-sm font-mono">/// NO URGENT MISSIONS ///</div>
        `;
        return;
    }

    const hoy = getHoy();

    container.innerHTML = misionesUrgentes.map((m, i) => {
        const isFirst = i === 0;
        const esVencida = m.deadline && m.deadline < hoy;
        const esHoy = m.deadline && m.deadline === hoy;
        const icon = getCategoriaIcon(m.categoria);
        const xp = m['puntos-xp'] || 0;

        return `
            <div class="group flex gap-x-3 py-3 px-3 flex-row rounded-sm relative overflow-hidden transition-colors
                ${isFirst ? 'bg-[#261b1d] border border-primary/40' : 'bg-[#1e1617] border border-[#332224]'}"
                data-mision-id="${m.id}">
                ${isFirst ? '<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>' : ''}
                <input type="checkbox"
                    class="cursor-pointer ${isFirst ? 'urgent' : ''}"
                    onchange="completarMision('${m.id}', '${m.titulo.replace(/'/g, "\\'")}', ${xp})">
                <div class="flex flex-col flex-1 min-w-0">
                    <p class="text-sm font-bold leading-normal font-display ${isFirst ? 'text-white' : 'text-gray-200'}">
                        ${icon}${m.titulo}
                    </p>
                    <div class="flex items-center gap-2 mt-1">
                        ${m.deadline ? `
                            <span class="flex items-center gap-1 text-xs font-mono ${esVencida ? 'text-primary' : esHoy ? 'text-orange-400' : 'text-gray-500'}">
                                <span class="material-symbols-outlined text-sm">${esVencida ? 'warning' : esHoy ? 'local_fire_department' : 'calendar_month'}</span>
                                ${esVencida ? 'OVERDUE' : esHoy ? 'TODAY' : m.deadline.split('-').slice(1).join('/')}
                            </span>
                        ` : ''}
                        ${xp ? `<span class="text-[10px] text-secondary font-mono">+${xp}XP</span>` : ''}
                    </div>
                    ${isFirst && m.prioridad === 'alta' ? '<p class="text-primary text-xs font-mono mt-0.5">!! PRIORITY ALPHA !!</p>' : ''}
                </div>
                <button onclick="editarDeadline('${m.id}', '${m.deadline || ''}')" class="self-center opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-500 hover:text-secondary">
                    <span class="material-symbols-outlined text-base">edit_calendar</span>
                </button>
            </div>
        `;
    }).join('');
}

function renderCriteriosVictoria() {
    const container = document.getElementById('criterios-victoria');
    const porcentajeEl = document.getElementById('criterios-porcentaje');

    porcentajeEl.textContent = `${criteriosVictoria.porcentaje}%`;

    if (criteriosVictoria.misiones.length === 0) {
        container.innerHTML = `
            <div class="snap-start shrink-0 w-full text-center text-gray-500 text-sm font-mono py-4">
                /// NO VICTORY CRITERIA ///
            </div>
        `;
        return;
    }

    container.innerHTML = criteriosVictoria.misiones.map(m => {
        const completada = m.completada || m.completado;
        const xp = m['puntos-xp'] || 0;
        // Calcular progreso real basado en si está completado
        const porcentaje = completada ? 100 : 0;

        return `
            <div class="snap-start shrink-0 w-[45%] min-w-[150px] lg:w-full lg:min-w-0 bg-[#1e1617] p-3 border rounded-sm relative overflow-hidden flex flex-col justify-between shadow-md
                ${completada ? 'border-green-500/30' : 'border-[#332224]'}"
                data-mision-id="${m.id}">
                <div class="flex justify-between items-start mb-2 relative z-10">
                    <span class="text-gray-300 text-[10px] font-bold font-display uppercase tracking-wider leading-tight pr-2">
                        ${m.titulo}
                    </span>
                    <span class="text-xs font-mono font-bold ${completada ? 'text-green-500' : 'text-primary'}">
                        ${completada ? '✓' : '○'}
                    </span>
                </div>
                <div class="w-full bg-[#120c0d] h-1.5 rounded-none border border-[#332224]">
                    <div class="h-full relative transition-all ${completada ? 'bg-green-500' : 'bg-primary/30'}"
                        style="width: ${porcentaje}%">
                        <div class="absolute right-0 top-0 bottom-0 w-1 bg-white/20"></div>
                    </div>
                </div>
                ${!completada ? `
                    <button onclick="completarMision('${m.id}', '${m.titulo.replace(/'/g, "\\'")}', ${xp})"
                        class="mt-2 text-[8px] font-mono text-gray-500 hover:text-secondary transition-colors uppercase tracking-wider">
                        [COMPLETE]
                    </button>
                ` : ''}
                <div class="absolute top-0 right-0 w-2 h-2 border-t border-r border-secondary/50"></div>
            </div>
        `;
    }).join('');
}

function renderMisionesOpcionales() {
    const container = document.getElementById('misiones-opcionales');

    if (misionesOpcionales.length === 0) {
        container.innerHTML = `
            <div class="py-4 text-center text-gray-600 text-sm font-mono">/// NO OPTIONAL MISSIONS ///</div>
        `;
        return;
    }

    container.innerHTML = misionesOpcionales.slice(0, 5).map(m => {
        const xp = m['puntos-xp'] || 0;

        return `
            <div class="group flex gap-x-3 py-2 px-2 flex-row border border-transparent rounded-sm hover:bg-[#1e1617] hover:border-[#332224] transition-all opacity-70 hover:opacity-100"
                data-mision-id="${m.id}">
                <input type="checkbox" class="h-4 w-4 mt-1 cursor-pointer"
                    onchange="completarMision('${m.id}', '${m.titulo.replace(/'/g, "\\'")}', ${xp})">
                <p class="text-gray-400 text-sm font-normal leading-normal font-display flex-1">
                    ${m.titulo}
                </p>
                ${xp ? `<span class="text-[9px] text-gray-600 font-mono self-center">+${xp}</span>` : ''}
                <button onclick="editarDeadline('${m.id}', '')" class="self-center opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-500 hover:text-secondary">
                    <span class="material-symbols-outlined text-sm">edit_calendar</span>
                </button>
            </div>
        `;
    }).join('');
}

// ==========================================
//  INIT
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // NO mostrar estado de conexión hasta que el contenido cargue
    // El estado se actualizará en cargarDatos() cuando termine

    // Registrar para cambios de cogitator (servidor de Obsidian)
    if (window.WhVaultDB) {
        window.WhVaultDB.onCogitatorChange(async (online) => {
            updateConnectionUI(online);
            if (online && isOfflineMode) {
                showToast('Cogitator restaurado', 'success');
                // PRIMERO sincronizar cambios pendientes, LUEGO recargar datos
                if (window.WhVaultSync?.processPendingSync) {
                    await window.WhVaultSync.processPendingSync();
                }
                cargarDatos();
            }
        });
    }

    // Cargar memo badge count
    initMemoBadge();

    // Cargar datos iniciales
    cargarDatos();

    // Auto-refresh cada 30 segundos (solo si online)
    setInterval(async () => {
        if (!isOfflineMode) {
            // Primero sincronizar cambios pendientes, luego recargar
            if (window.WhVaultSync?.processPendingSync) {
                await window.WhVaultSync.processPendingSync();
            }
            cargarDatos();
        }
    }, 30000);

    // Actualizar fecha cada minuto
    setInterval(() => {
        document.getElementById('fecha-imperial').textContent = getFechaImperial();
    }, 60000);
});

// ==========================================
//  RECORDADORA (Orbe de Reminiscencia)
// ==========================================

let recordadoraMemos = [];
let editingMemoId = null;

async function abrirRecordadora() {
    document.getElementById('modal-recordadora').classList.remove('hidden');
    document.getElementById('memo-input').value = '';
    editingMemoId = null;
    await cargarMemos();
}

function cerrarRecordadora() {
    document.getElementById('modal-recordadora').classList.add('hidden');
    editingMemoId = null;
}

async function cargarMemos() {
    try {
        recordadoraMemos = await window.WhVaultDB.getAllAvisos();
    } catch (e) {
        console.error('[Recordadora] Error loading:', e);
        recordadoraMemos = [];
    }
    renderMemos();
    updateMemoBadge();
}

function updateMemoBadge() {
    const badge = document.getElementById('memo-badge');
    if (!badge) return;
    if (recordadoraMemos.length > 0) {
        badge.textContent = recordadoraMemos.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderMemos() {
    const container = document.getElementById('memos-list');
    if (!container) return;

    if (recordadoraMemos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-6">
                <span class="material-symbols-outlined text-3xl text-gray-700 block mb-1">bubble_chart</span>
                <p class="text-gray-600 text-xs font-mono">No memoranda inscribed</p>
            </div>
        `;
        return;
    }

    container.innerHTML = recordadoraMemos.map(memo => {
        const texto = memo.titulo || memo.descripcion || '';
        const timeAgo = memo.timestamp ? formatMemoTimeAgo(memo.timestamp) : '';
        return `
            <div class="flex items-start gap-2 p-2 bg-[#0f0f10] border border-[#332224] rounded-sm group hover:border-purple-500/30 transition-colors">
                <span class="material-symbols-outlined text-purple-400/50 text-sm mt-0.5 flex-shrink-0">format_quote</span>
                <div class="flex-1 min-w-0 cursor-pointer" onclick="editarMemo('${memo.id}')">
                    <p class="text-gray-300 text-xs leading-relaxed">${escapeHtmlMemo(texto)}</p>
                    ${timeAgo ? `<p class="text-gray-600 text-[8px] font-mono mt-1">${timeAgo}</p>` : ''}
                </div>
                <button onclick="eliminarMemo('${memo.id}')" class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-primary p-0.5 flex-shrink-0">
                    <span class="material-symbols-outlined text-sm">close</span>
                </button>
            </div>
        `;
    }).join('');
}

function editarMemo(id) {
    const memo = recordadoraMemos.find(m => m.id === id);
    if (!memo) return;
    editingMemoId = id;
    const input = document.getElementById('memo-input');
    input.value = memo.titulo || memo.descripcion || '';
    input.focus();
}

async function guardarMemo() {
    const input = document.getElementById('memo-input');
    const texto = input.value.trim();
    if (!texto) return;

    try {
        if (editingMemoId) {
            await window.WhVaultDB.addAviso({
                id: editingMemoId,
                titulo: texto,
                descripcion: texto,
                timestamp: Date.now()
            });
        } else {
            await window.WhVaultDB.addAviso({
                titulo: texto,
                descripcion: texto,
                timestamp: Date.now()
            });
        }
        input.value = '';
        editingMemoId = null;
        await cargarMemos();
        showToast('Memorandum sealed', 'success');
    } catch (e) {
        console.error('[Recordadora] Save error:', e);
        showToast('Error saving memorandum', 'error');
    }
}

async function eliminarMemo(id) {
    try {
        await window.WhVaultDB.removeAviso(id);
        await cargarMemos();
    } catch (e) {
        console.error('[Recordadora] Delete error:', e);
    }
}

async function initMemoBadge() {
    try {
        recordadoraMemos = await window.WhVaultDB.getAllAvisos();
        updateMemoBadge();
    } catch (e) { /* ignore */ }
}

function escapeHtmlMemo(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatMemoTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(timestamp).toLocaleDateString('es-ES');
}

// ==========================================
//  CREAR MISIÓN - MODAL FUNCTIONS
// ==========================================

function openCreateMisionModal() {
    const modal = document.getElementById('modal-crear-mision');
    modal.classList.remove('hidden');

    // Set default deadline to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('mision-deadline').value = today;

    // Clear other fields
    document.getElementById('mision-titulo').value = '';
    document.getElementById('mision-categoria').value = '';
    document.getElementById('mision-prioridad').value = '';
    document.getElementById('mision-xp').value = '100';
    document.getElementById('mision-dificultad').value = '';
    document.getElementById('mision-tiempo').value = '';
    document.getElementById('mision-criterio').checked = false;
    document.getElementById('mision-descripcion').value = '';

    // Focus on title input
    setTimeout(() => {
        document.getElementById('mision-titulo').focus();
    }, 100);
}

function closeCreateMisionModal() {
    const modal = document.getElementById('modal-crear-mision');
    modal.classList.add('hidden');
}

async function crearMision() {
    const titulo = document.getElementById('mision-titulo').value.trim();
    if (!titulo) {
        showToast('El título es requerido', 'error');
        return;
    }

    const misionData = {
        titulo,
        categoria: document.getElementById('mision-categoria').value || null,
        prioridad: document.getElementById('mision-prioridad').value || null,
        deadline: document.getElementById('mision-deadline').value || null,
        'puntos-xp': parseInt(document.getElementById('mision-xp').value) || 100,
        dificultad: document.getElementById('mision-dificultad').value || null,
        'tiempo-estimado': document.getElementById('mision-tiempo').value || null,
        'criterio-victoria': document.getElementById('mision-criterio').checked,
        descripcion: document.getElementById('mision-descripcion').value.trim() || ''
    };

    try {
        const response = await fetch(`${API_URL}/misiones/crear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(misionData)
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Misión "${titulo}" creada`, 'success');
            closeCreateMisionModal();

            // Reload missions to show the new one
            await cargarDatos();
        } else {
            showToast(data.error || 'Error al crear misión', 'error');
        }
    } catch (error) {
        console.error('Error creando misión:', error);
        showToast('Error de conexión', 'error');
    }
}
