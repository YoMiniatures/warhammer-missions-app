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

// ==========================================
//  EDITAR DEADLINE - MODAL FUNCTIONS
// ==========================================

let editingMisionId = null;

/**
 * Open modal to edit mission deadline
 */
function editarDeadline(id, currentDeadline) {
    editingMisionId = id;
    const modal = document.getElementById('modal-editar-deadline');
    const input = document.getElementById('deadline-fecha');

    input.value = currentDeadline || '';
    modal.classList.remove('hidden');

    // Focus on date input after animation
    setTimeout(() => {
        input.focus();
    }, 100);
}

function closeEditDeadlineModal() {
    const modal = document.getElementById('modal-editar-deadline');
    modal.classList.add('hidden');
    editingMisionId = null;
}

async function guardarDeadline() {
    if (!editingMisionId) return;

    const newDeadline = document.getElementById('deadline-fecha').value;
    if (!newDeadline) {
        showToast('Selecciona una fecha', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/misiones/${encodeURIComponent(editingMisionId)}/deadline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deadline: newDeadline })
        });
        const data = await response.json();

        if (data.success) {
            showToast('Deadline actualizado', 'success');
            closeEditDeadlineModal();
            await cargarDatos();
        } else {
            showToast(data.error || 'Error', 'error');
        }
    } catch (error) {
        console.error('[Bridge] Error updating deadline:', error);
        showToast('Error de conexión', 'error');
    }
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

    // Restore bridge view from localStorage
    const savedBridgeView = localStorage.getItem('bridgeView');
    if (savedBridgeView === 'carta-astral' || savedBridgeView === 'semana' || savedBridgeView === 'anual') {
        setBridgeView(savedBridgeView);
    }

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

// ==========================================
//  CARTA ASTRAL - System Overview
// ==========================================

const BRIDGE_VIEWS = ['bridge', 'semana', 'carta-astral', 'anual'];
let _cartaAstralInitialized = false;
let _cartaAstralYear = new Date().getFullYear();
let _cartaAstralCache = {};
let _semanaInitialized = false;
let _semanaCache = null;
let _anualInitialized = false;
let _anualYear = new Date().getFullYear();
let _anualCache = {};

const SYSTEM_NAMES = {
    2025: 'SISTEMA AQUILA',
    2026: 'SISTEMA HIPPARION'
};

const MESES_NOMBRES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

function setBridgeView(view) {
    BRIDGE_VIEWS.forEach(v => {
        const el = document.getElementById(`${v}-view`);
        const pill = document.getElementById(`pill-${v}`);
        if (el) el.classList.toggle('hidden', v !== view);
        if (pill) {
            if (v === view) {
                pill.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold font-mono uppercase tracking-widest transition-all border whitespace-nowrap flex-shrink-0 border-primary bg-primary-dark/30 text-primary';
            } else {
                pill.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold font-mono uppercase tracking-widest transition-all border whitespace-nowrap flex-shrink-0 border-[#2d2d2d] text-gray-500 hover:border-gray-500 hover:text-gray-300';
            }
        }
    });

    // Hide FAB when in carta-astral
    const fab = document.querySelector('.fab');
    if (fab) fab.style.display = view === 'bridge' ? '' : 'none';

    localStorage.setItem('bridgeView', view);

    // Lazy init carta astral
    if (view === 'carta-astral' && !_cartaAstralInitialized) {
        _cartaAstralInitialized = true;
        initCartaAstral();
    }

    // Lazy init semana
    if (view === 'semana' && !_semanaInitialized) {
        _semanaInitialized = true;
        initSemana();
    }

    // Lazy init anual
    if (view === 'anual' && !_anualInitialized) {
        _anualInitialized = true;
        initAnual();
    }
}

async function initCartaAstral() {
    await loadCartaAstralData(_cartaAstralYear);
}

async function loadCartaAstralData(año) {
    const grid = document.getElementById('carta-astral-grid');
    const loading = document.getElementById('carta-astral-loading');

    // Check memory cache
    if (_cartaAstralCache[año]) {
        renderCartaAstral(_cartaAstralCache[año], año);
        return;
    }

    // Show loading
    if (grid) grid.innerHTML = '';
    if (loading) loading.classList.remove('hidden');

    try {
        const DB = window.WhVaultDB;

        // Try IndexedDB cache first
        if (DB) {
            try {
                const cached = await DB.getCachedData(DB.STORES.PLANETAS);
                if (cached && cached.data && cached.data.length > 0) {
                    const planetasAño = cached.data.filter(p => p.año === año);
                    if (planetasAño.length > 0) {
                        _cartaAstralCache[año] = planetasAño;
                        renderCartaAstral(planetasAño, año);
                        if (loading) loading.classList.add('hidden');
                        if (cached.isFresh) return;
                    }
                }
            } catch (e) {
                console.warn('[CartaAstral] Cache read error:', e);
            }
        }

        // Fetch from API
        const res = await fetch(`${API_URL}/planetas?año=${año}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && data.planetas) {
            _cartaAstralCache[año] = data.planetas;

            // Cache in IndexedDB
            if (DB) {
                try {
                    await DB.cacheApiData(DB.STORES.PLANETAS, data.planetas);
                } catch (e) {
                    console.warn('[CartaAstral] Cache write error:', e);
                }
            }

            renderCartaAstral(data.planetas, año);
        }
    } catch (error) {
        console.error('[CartaAstral] Error loading:', error);
        if (!_cartaAstralCache[año]) {
            if (grid) grid.innerHTML = '<div class="col-span-full text-center py-10 text-primary font-mono text-sm">/// AUSPEX FAILURE ///</div>';
        }
    } finally {
        if (loading) loading.classList.add('hidden');
    }
}

function renderCartaAstral(planetas, año) {
    const grid = document.getElementById('carta-astral-grid');
    if (!grid) return;

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const isCurrentYear = año === currentYear;

    // Stats
    const totalMisiones = planetas.reduce((sum, p) => sum + (p.totalMisiones || 0), 0);
    const completadas = planetas.reduce((sum, p) => sum + (p.misionesCompletadas || 0), 0);
    const conquistados = planetas.filter(p => p.estado === 'conquistado').length;
    const progresoGlobal = totalMisiones > 0 ? Math.round((completadas / totalMisiones) * 100) : 0;

    const statComp = document.getElementById('ca-stat-completados');
    const statMis = document.getElementById('ca-stat-misiones');
    const statProg = document.getElementById('ca-stat-progreso');
    if (statComp) statComp.textContent = `${conquistados}/12`;
    if (statMis) statMis.textContent = `${completadas}/${totalMisiones}`;
    if (statProg) statProg.textContent = `${progresoGlobal}%`;

    // Sort by month number
    const sorted = [...planetas].sort((a, b) => (a.numeroMes || 0) - (b.numeroMes || 0));

    grid.innerHTML = sorted.map(p => {
        const mesNum = p.numeroMes || 0;
        const isCurrent = isCurrentYear && mesNum === currentMonth;
        const mesNombre = MESES_NOMBRES[mesNum - 1] || '???';
        const progreso = p.progreso || 0;

        const estadoMap = {
            'conquistado': { label: 'CONQUISTADO', color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30' },
            'en-conquista': { label: 'EN CURSO', color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/30' },
            'bloqueado': { label: 'BLOQUEADO', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30' },
            'pendiente': { label: 'PENDIENTE', color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/20' }
        };
        const estado = estadoMap[p.estado] || estadoMap['pendiente'];

        const progressColor = p.estado === 'conquistado' ? 'bg-green-500' : 'bg-secondary';

        return `
        <a href="planeta-detalle.html?id=${encodeURIComponent(p.id)}&año=${p.año}"
           class="planet-card ${p.estado || 'planificado'} ${isCurrent ? 'current-month' : ''}">
            <div class="flex items-center justify-between mb-2">
                <span class="text-secondary text-lg font-bold font-display">${String(mesNum).padStart(2,'0')}</span>
                ${isCurrent ? '<span class="text-[7px] text-secondary font-mono border border-secondary/30 px-1.5 py-0.5 animate-pulse">NOW</span>' : ''}
            </div>
            <div class="text-white text-xs font-bold truncate mb-0.5" title="${p.nombre}">${p.nombre}</div>
            <div class="text-[8px] text-gray-600 font-mono uppercase mb-2">${mesNombre}</div>
            <span class="inline-block text-[7px] font-mono px-1.5 py-0.5 rounded-sm ${estado.color} ${estado.bg} ${estado.border} border mb-2">${estado.label}</span>
            <div class="flex items-center gap-1.5">
                <div class="flex-1 h-1 bg-[#332224] rounded-full overflow-hidden">
                    <div class="h-full ${progressColor} rounded-full transition-all" style="width:${progreso}%"></div>
                </div>
                <span class="text-[8px] text-gray-500 font-mono">${p.misionesCompletadas || 0}/${p.totalMisiones || 0}</span>
            </div>
        </a>`;
    }).join('');
}

function changeCartaAstralYear(año) {
    _cartaAstralYear = año;

    // Update year pills
    document.querySelectorAll('.carta-year-pill').forEach(btn => {
        const btnYear = parseInt(btn.dataset.year);
        if (btnYear === año) {
            btn.classList.add('carta-year-pill-active');
        } else {
            btn.classList.remove('carta-year-pill-active');
        }
    });

    loadCartaAstralData(año);
}

// ==========================================
//  SEMANA VIEW
// ==========================================

const DIAS_NOMBRES = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];

const CATEGORIA_COLORS = {
    critica: '#dc2626',
    importante: '#ca8a04',
    opcional: '#6b7280'
};

const EVENTO_COLORS = {
    aviso: '#dc143c',
    evento: '#4169e1',
    vacaciones: '#00ced1',
    'cumpleaños': '#ff69b4'
};

async function initSemana() {
    await loadSemanaData();
}

async function loadSemanaData() {
    const content = document.getElementById('semana-content');
    const loading = document.getElementById('semana-loading');

    if (_semanaCache) {
        renderSemana(_semanaCache.misiones, _semanaCache.eventos);
        return;
    }

    if (content) content.innerHTML = '';
    if (loading) loading.classList.remove('hidden');

    try {
        const [misionesRes, eventosRes] = await Promise.all([
            fetch(`${API_URL}/misiones/semana`),
            fetch(`${API_URL}/eventos/semana?dias=14`)
        ]);

        const misionesData = await misionesRes.json();
        const eventosData = await eventosRes.json();

        const misiones = (misionesData.success && misionesData.misiones) ? misionesData.misiones : [];
        const eventos = (eventosData.success && eventosData.eventos) ? eventosData.eventos : [];

        _semanaCache = { misiones, eventos };
        renderSemana(misiones, eventos);
    } catch (error) {
        console.error('[Semana] Error loading:', error);
        if (content) content.innerHTML = '<div class="text-center py-10 text-primary font-mono text-sm">/// AUSPEX FAILURE ///</div>';
    } finally {
        if (loading) loading.classList.add('hidden');
    }
}

function renderSemana(misiones, eventos) {
    const content = document.getElementById('semana-content');
    if (!content) return;
    content.innerHTML = '';

    // Calcular lunes de esta semana
    const ahora = new Date();
    const diaSemana = ahora.getDay(); // 0=dom, 1=lun...
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(ahora);
    lunes.setDate(ahora.getDate() + diffLunes);
    lunes.setHours(0, 0, 0, 0);

    const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

    // Generar 2 semanas
    for (let w = 0; w < 2; w++) {
        const inicioSemana = new Date(lunes);
        inicioSemana.setDate(lunes.getDate() + w * 7);

        const finSemana = new Date(inicioSemana);
        finSemana.setDate(inicioSemana.getDate() + 6);

        // Calcular número de semana ISO
        const numSemana = getISOWeekNumber(inicioSemana);

        // Bloque de semana
        const bloque = document.createElement('div');
        bloque.className = 'semana-bloque';

        // Header
        const header = document.createElement('div');
        header.className = 'semana-bloque-header';
        header.innerHTML = `
            <span class="semana-bloque-titulo">${w === 0 ? '/// ' : ''}SEMANA ${numSemana}${w === 0 ? ' ///' : ''}</span>
            <span class="semana-bloque-rango">${formatDDMM(inicioSemana)} – ${formatDDMM(finSemana)}</span>
        `;
        bloque.appendChild(header);

        // Grid 7 días
        const grid = document.createElement('div');
        grid.className = 'semana-grid';

        for (let d = 0; d < 7; d++) {
            const dia = new Date(inicioSemana);
            dia.setDate(inicioSemana.getDate() + d);
            const fechaStr = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
            const esHoy = fechaStr === hoyStr;
            const esPasado = fechaStr < hoyStr;

            // Filtrar misiones y eventos del día
            const misionesDia = misiones.filter(m => m.deadline === fechaStr);
            const eventosDia = eventos.filter(e => {
                const eFecha = e.fecha || e.deadline;
                return eFecha === fechaStr;
            });

            // Ordenar misiones: criticas → importantes → opcionales
            const ordenCat = { critica: 0, importante: 1, opcional: 2 };
            misionesDia.sort((a, b) => (ordenCat[a.categoria] ?? 3) - (ordenCat[b.categoria] ?? 3));

            // Card del día
            const card = document.createElement('div');
            card.className = `semana-dia${esHoy ? ' dia-hoy' : ''}${esPasado ? ' dia-pasado' : ''}`;

            // Header del día
            const diaHeader = document.createElement('div');
            diaHeader.className = 'semana-dia-header';
            diaHeader.innerHTML = `
                <span class="semana-dia-nombre">${DIAS_NOMBRES[d]}</span>
                <span class="semana-dia-numero">${dia.getDate()}</span>
                ${esHoy ? '<span class="semana-dia-badge">HOY</span>' : ''}
            `;
            card.appendChild(diaHeader);

            // Barra de progreso
            const totalMisiones = misionesDia.length;
            const completadas = misionesDia.filter(m => m.completada).length;
            if (totalMisiones > 0) {
                const progreso = document.createElement('div');
                progreso.className = 'semana-progreso';
                const fill = document.createElement('div');
                fill.className = 'semana-progreso-fill';
                fill.style.width = `${(completadas / totalMisiones) * 100}%`;
                progreso.appendChild(fill);
                card.appendChild(progreso);
            }

            // Items container
            const items = document.createElement('div');
            items.className = 'semana-items';

            // Eventos
            eventosDia.forEach(ev => {
                const tipo = ev.frontmatter?.tipo || ev.tipo || 'evento';
                const color = EVENTO_COLORS[tipo] || '#4169e1';
                const nombre = ev.titulo || ev.id || '???';
                const item = document.createElement('div');
                item.className = 'semana-evento';
                item.style.borderLeftColor = color;
                item.innerHTML = `<span class="semana-evento-nombre">${nombre}</span>`;
                items.appendChild(item);
            });

            // Misiones
            if (misionesDia.length === 0 && eventosDia.length === 0) {
                const vacio = document.createElement('div');
                vacio.className = 'semana-dia-vacio';
                vacio.textContent = '—';
                items.appendChild(vacio);
            } else {
                misionesDia.forEach(m => {
                    const cat = m.categoria || 'opcional';
                    const color = CATEGORIA_COLORS[cat] || '#6b7280';
                    const item = document.createElement('div');
                    item.className = `semana-item${m.completada ? ' completada' : ''}`;
                    item.style.borderLeftColor = color;
                    item.dataset.misionId = m.id;

                    let html = '';
                    if (!m.completada) {
                        html += `<input type="checkbox" class="semana-item-cb" data-id="${m.id}" data-titulo="${(m.titulo || '').replace(/"/g, '&quot;')}" data-xp="${m['puntos-xp'] || 0}">`;
                    }
                    html += `<span class="semana-item-nombre">${m.titulo || m.id}</span>`;
                    if (m['puntos-xp']) {
                        html += `<span class="semana-item-xp">${m['puntos-xp']}</span>`;
                    }
                    item.innerHTML = html;
                    items.appendChild(item);
                });
            }

            card.appendChild(items);
            grid.appendChild(card);
        }

        bloque.appendChild(grid);
        content.appendChild(bloque);
    }

    // Event listeners for checkboxes
    content.querySelectorAll('.semana-item-cb').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            if (!e.target.checked) return;
            const id = e.target.dataset.id;
            const titulo = e.target.dataset.titulo;
            const xp = parseInt(e.target.dataset.xp) || 0;

            const item = e.target.closest('.semana-item');
            if (item) item.classList.add('completada');

            // Update progress bar
            const card = e.target.closest('.semana-dia');
            if (card) {
                const allItems = card.querySelectorAll('.semana-item');
                const doneItems = card.querySelectorAll('.semana-item.completada');
                const bar = card.querySelector('.semana-progreso-fill');
                if (bar && allItems.length > 0) {
                    bar.style.width = `${(doneItems.length / allItems.length) * 100}%`;
                }
            }

            showToast(`+${xp} XP`, 'success');

            try {
                const res = await fetch(`${API_URL}/misiones/${encodeURIComponent(id)}/completar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (!data.success) {
                    console.warn('[Semana] Complete failed:', data.error);
                }
            } catch (err) {
                console.warn('[Semana] Complete error:', err.message);
            }

            // Invalidate cache so next load is fresh
            _semanaCache = null;
        });
    });
}

function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function formatDDMM(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ==========================================
//  ANUAL VIEW - Linear Year Calendar
// ==========================================

const ANUAL_LEGEND = [
    { color: '#dc2626', label: 'Criterio-V.' },
    { color: '#f97316', label: 'Misiones' },
    { color: '#dc143c', label: 'Avisos' },
    { color: '#4169e1', label: 'Eventos' },
    { color: '#00ced1', label: 'Vacaciones' },
    { color: '#ff69b4', label: 'Cumpleaños' }
];

const MESES_CORTOS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const DIAS_SEMANA = ['L','M','X','J','V','S','D'];

async function initAnual() {
    renderAnualLegend();
    await loadAnualData(_anualYear);
}

function renderAnualLegend() {
    const container = document.getElementById('anual-legend');
    if (!container) return;
    container.innerHTML = ANUAL_LEGEND.map(item =>
        `<div class="anual-legend-item"><div class="anual-legend-dot" style="background:${item.color}"></div><span class="anual-legend-label">${item.label}</span></div>`
    ).join('');
}

async function loadAnualData(año) {
    const calendar = document.getElementById('anual-calendar');
    const loading = document.getElementById('anual-loading');

    if (_anualCache[año]) {
        renderAnualCalendar(_anualCache[año], año);
        return;
    }

    if (calendar) calendar.innerHTML = '';
    if (loading) loading.classList.remove('hidden');

    try {
        const res = await fetch(`${API_URL}/calendario/anual?año=${año}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success) {
            _anualCache[año] = data;
            renderAnualCalendar(data, año);
        }
    } catch (error) {
        console.error('[Anual] Error loading:', error);
        if (calendar) calendar.innerHTML = '<div class="text-center py-10 text-primary font-mono text-sm">/// AUSPEX FAILURE ///</div>';
    } finally {
        if (loading) loading.classList.add('hidden');
    }
}

function renderAnualCalendar(data, año) {
    const calendar = document.getElementById('anual-calendar');
    if (!calendar) return;
    calendar.innerHTML = '';

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const isCurrentYear = año === today.getFullYear();
    const totalCols = 42;

    // === WEEKDAY HEADER ROW ===
    const headerRow = document.createElement('div');
    headerRow.className = 'anual-header-row';

    const emptyHeader = document.createElement('div');
    emptyHeader.style.cssText = 'display:flex;align-items:center;justify-content:center;color:#c5a065;font-size:8px;font-family:monospace;font-weight:bold;';
    emptyHeader.textContent = 'MES';
    headerRow.appendChild(emptyHeader);

    for (let w = 0; w < 6; w++) {
        DIAS_SEMANA.forEach((dia, idx) => {
            const label = document.createElement('div');
            label.className = `anual-weekday${idx >= 5 ? ' weekend' : ''}`;
            label.textContent = dia;
            headerRow.appendChild(label);
        });
    }
    calendar.appendChild(headerRow);

    // === 12 MONTH ROWS ===
    const planetaMap = {};
    (data.planetas || []).forEach(p => { planetaMap[p.numeroMes] = p; });

    for (let mes = 1; mes <= 12; mes++) {
        const monthRow = document.createElement('div');
        monthRow.className = 'anual-month-row';

        // --- Month label ---
        const planeta = planetaMap[mes];
        const monthLabel = document.createElement('div');
        monthLabel.className = 'anual-month-label';

        let imgHtml = '';
        if (planeta && planeta.image) {
            const imgFile = typeof planeta.image === 'string' ? planeta.image.replace(/[\[\]]/g, '').trim() : '';
            if (imgFile) {
                imgHtml = `<img src="/api/planetas/imagen/${encodeURIComponent(imgFile)}" class="anual-month-img" onerror="this.style.display='none'" alt="">`;
            }
        }

        monthLabel.innerHTML = `${imgHtml}<div class="anual-month-text"><div>${MESES_CORTOS[mes - 1]}</div>${planeta ? `<div style="font-size:7px;color:#666;font-weight:normal">${planeta.nombre}</div>` : ''}</div>`;

        if (planeta) {
            monthLabel.addEventListener('click', () => {
                window.location.href = `planeta-detalle.html?id=${encodeURIComponent(planeta.id)}&año=${año}`;
            });
        }
        monthRow.appendChild(monthLabel);

        // --- Day cells ---
        const firstDay = new Date(año, mes - 1, 1);
        const daysInMonth = new Date(año, mes, 0).getDate();
        let firstWeekday = firstDay.getDay();
        firstWeekday = firstWeekday === 0 ? 7 : firstWeekday; // 1=Mon..7=Sun

        // Empty cells before day 1
        for (let i = 0; i < firstWeekday - 1; i++) {
            const empty = document.createElement('div');
            empty.className = 'anual-day empty';
            monthRow.appendChild(empty);
        }

        // Day cells
        for (let dia = 1; dia <= daysInMonth; dia++) {
            const fechaStr = `${año}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const dateObj = new Date(año, mes - 1, dia);
            const weekday = dateObj.getDay();
            const isWeekend = weekday === 0 || weekday === 6;
            const isToday = isCurrentYear && fechaStr === todayStr;

            const dayItems = data.dias?.[fechaStr] || [];
            const hasItems = dayItems.length > 0;
            const inVacation = (data.vacaciones || []).some(v => fechaStr >= v.fechaInicio && fechaStr <= v.fechaFin);

            const cell = document.createElement('div');
            cell.className = `anual-day${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}${hasItems ? ' has-items' : ''}`;

            const numEl = document.createElement('div');
            numEl.className = 'anual-day-num';
            numEl.textContent = dia;
            cell.appendChild(numEl);

            if (hasItems) {
                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'anual-dots-container';
                const visibleItems = dayItems.slice(0, 4);
                visibleItems.forEach(item => {
                    const dot = document.createElement('div');
                    dot.className = 'anual-dot';
                    dot.style.background = item.color;
                    dotsContainer.appendChild(dot);
                });
                if (dayItems.length > 4) {
                    const moreDot = document.createElement('div');
                    moreDot.className = 'anual-dot';
                    moreDot.style.cssText = 'background:#888;width:3px;height:3px;';
                    dotsContainer.appendChild(moreDot);
                }
                cell.appendChild(dotsContainer);
            }

            if (inVacation) {
                const bar = document.createElement('div');
                bar.className = 'anual-vacation-bar';
                cell.appendChild(bar);
            }

            if (hasItems || inVacation) {
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showAnualDayPopup(e, fechaStr, dayItems, data.vacaciones || [], año, mes, dia);
                });
            }

            monthRow.appendChild(cell);
        }

        // Empty cells after last day
        const cellsUsed = (firstWeekday - 1) + daysInMonth;
        for (let i = cellsUsed; i < totalCols; i++) {
            const empty = document.createElement('div');
            empty.className = 'anual-day empty';
            monthRow.appendChild(empty);
        }

        calendar.appendChild(monthRow);
    }
}

function changeAnualYear(año) {
    _anualYear = año;
    document.querySelectorAll('[data-anual-year]').forEach(btn => {
        const btnYear = parseInt(btn.dataset.anualYear);
        if (btnYear === año) {
            btn.classList.add('carta-year-pill-active');
        } else {
            btn.classList.remove('carta-year-pill-active');
        }
    });
    loadAnualData(año);
}

let _anualPopup = null;

function showAnualDayPopup(event, fechaStr, items, vacaciones, año, mes, dia) {
    closeAnualPopup();

    const popup = document.createElement('div');
    popup.className = 'anual-popup';
    popup.id = 'anual-day-popup';

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const date = new Date(año, mes - 1, dia);
    const dayName = dayNames[date.getDay()];

    popup.innerHTML = `<div class="anual-popup-header">${dayName} ${dia} ${MESES_NOMBRES[mes - 1]} ${año}</div>`;

    const vacacionesDia = vacaciones.filter(v => fechaStr >= v.fechaInicio && fechaStr <= v.fechaFin);
    const allItems = [
        ...vacacionesDia.map(v => ({ color: '#00ced1', titulo: v.titulo, tipo: 'vacaciones' })),
        ...items
    ];

    if (allItems.length === 0) {
        popup.innerHTML += '<div style="color:#666;font-size:10px;font-family:monospace;">Sin eventos</div>';
    } else {
        allItems.forEach(item => {
            const el = document.createElement('div');
            el.className = 'anual-popup-item';
            el.innerHTML = `<div class="anual-popup-dot" style="background:${item.color}"></div><span>${item.titulo || 'Sin título'}</span>`;
            popup.appendChild(el);
        });
    }

    document.body.appendChild(popup);
    _anualPopup = popup;

    const rect = event.target.closest('.anual-day').getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - popupRect.width / 2;
    let top = rect.bottom + 8;

    if (left < 8) left = 8;
    if (left + popupRect.width > window.innerWidth - 8) left = window.innerWidth - popupRect.width - 8;
    if (top + popupRect.height > window.innerHeight - 8) top = rect.top - popupRect.height - 8;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    setTimeout(() => {
        document.addEventListener('click', closeAnualPopup, { once: true });
    }, 10);
}

function closeAnualPopup() {
    if (_anualPopup) {
        _anualPopup.remove();
        _anualPopup = null;
    }
}
