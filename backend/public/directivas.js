// ==========================================
//  DIRECTIVAS - DIRECTIVAS.JS
// ==========================================

const API_URL = '/api';

// Estado global
let directivas = [];
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
    }
    // No actualizar status aquí - lo maneja updateConnectionUI
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

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
    toast.style.cssText = `
        position: fixed; top: 1rem; left: 50%; transform: translateX(-50%);
        background: ${type === 'error' ? '#d41132' : '#16a34a'}; color: white;
        padding: 0.5rem 1rem; border-radius: 2px; font-size: 0.875rem;
        font-weight: bold; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function getCategoriaIcon(cat) {
    const icons = {
        'desarrollo': 'code',
        'aprendizaje': 'school',
        'legado': 'family_restroom',
        'familia': 'family_restroom',
        'salud': 'fitness_center',
        'financiera': 'payments',
        'biologia': 'biotech',
        'hogar': 'home',
        'ocio': 'sports_esports'
    };
    return icons[cat?.toLowerCase()] || 'flag';
}

// ==========================================
//  API CALLS - CACHE-FIRST PATTERN
// ==========================================

async function cargarDirectivas() {
    try {
        const DB = window.WhVaultDB;
        const cogitatorOnline = DB?.getCogitatorStatus?.() ?? false;

        // 1. CACHE-FIRST: Intentar cargar desde IndexedDB primero
        if (DB) {
            const cached = await DB.getCachedData(DB.STORES.DIRECTIVAS);

            if (cached.data && cached.data.length > 0) {
                console.log('[Cache] Displaying cached directivas immediately');

                directivas = cached.data;
                renderDirectivas();
                setLoading(false);

                // Mostrar indicador si datos son stale
                updateDataFreshnessUI(!cached.isFresh, cached.lastUpdate);

                // Si datos stale, intentar actualizar en background
                if (!cached.isFresh) {
                    console.log('[Cache] Fetching fresh directivas in background...');
                    fetchAndCacheDirectivas(true); // silent = true, actualizará connection UI cuando termine
                } else {
                    // Datos frescos desde cache - verificar estado cogitator sin bloquear
                    DB?.checkCogitatorStatus?.().then(online => {
                        updateConnectionUI(online);
                    });
                }

                return;
            }
        }

        // 2. NO HAY CACHE - Necesitamos datos del cogitator
        setLoading(true);

        if (!cogitatorOnline) {
            updateConnectionUI(false);
            showToast('Cogitator no disponible - No hay datos en caché', 'error');
            showError();
            return;
        }

        // Fetch desde API
        await fetchAndCacheDirectivas(false);

    } catch (err) {
        console.error('Error cargando directivas:', err);
        updateConnectionUI(false);
        showError();
    }
}

/**
 * Fetch directivas from API and cache to IndexedDB
 * @param {boolean} silent - If true, don't update UI (background update)
 */
async function fetchAndCacheDirectivas(silent = false) {
    try {
        const DB = window.WhVaultDB;
        const fetchFn = DB?.fetchWithTimeout || fetch;

        const res = await fetchFn(`${API_URL}/directivas`);
        const data = await res.json();

        if (data.offline) {
            if (!silent) {
                updateConnectionUI(false);
                showToast('Cogitator no disponible', 'error');
            }
            return;
        }

        if (data.success && data.directivas) {
            directivas = data.directivas;
            if (DB) await DB.cacheApiData(DB.STORES.DIRECTIVAS, data.directivas);

            // Cogitator online
            if (DB?.updateCogitatorStatus) {
                DB.updateCogitatorStatus(true);
            }

            if (!silent) {
                renderDirectivas();
                setLoading(false);
            }

            // SIEMPRE actualizar UI de conexión y quitar indicador de cache
            // (incluso en silent, porque datos ya son frescos)
            updateConnectionUI(true);
            updateDataFreshnessUI(false, Date.now());

            console.log('[Cache] Directivas fetched and cached successfully');
        } else if (!silent) {
            showError();
        }

    } catch (err) {
        console.error('Error fetching directivas:', err);

        // Cogitator offline
        if (window.WhVaultDB?.updateCogitatorStatus) {
            window.WhVaultDB.updateCogitatorStatus(false);
        }

        if (!silent) {
            updateConnectionUI(false);
            const hasCache = await window.WhVaultDB?.hasCachedData(window.WhVaultDB.STORES.DIRECTIVAS);
            if (!hasCache) {
                showError();
            }
        }
        // En silent mode, si falla dejamos el indicador de stale visible
    }
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

// ==========================================
//  RENDER FUNCTIONS
// ==========================================

function renderDirectivas() {
    document.getElementById('fecha-imperial').textContent = getFechaImperial();

    const container = document.getElementById('directivas-list');

    if (directivas.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center text-gray-500 text-sm font-mono">/// NO DIRECTIVES FOUND ///</div>
        `;
        return;
    }

    // Ordenar: Main Quest primero, luego Secondary, luego Side, completadas al final
    const ordenadas = [...directivas].sort((a, b) => {
        // Completadas al final
        if (a.porcentaje === 100 && b.porcentaje !== 100) return 1;
        if (b.porcentaje === 100 && a.porcentaje !== 100) return -1;

        // Main Quest primero
        if (a.mainQuest && !b.mainQuest) return -1;
        if (!a.mainQuest && b.mainQuest) return 1;

        // Secondary Quest segundo
        if (a.secondaryQuest && !b.secondaryQuest && !b.mainQuest) return -1;
        if (!a.secondaryQuest && b.secondaryQuest && !a.mainQuest) return 1;

        // Por prioridad
        const prioridadOrden = { 'alta': 0, 'media': 1, 'baja': 2 };
        const prioA = prioridadOrden[a.prioridad] ?? 2;
        const prioB = prioridadOrden[b.prioridad] ?? 2;
        return prioA - prioB;
    });

    container.innerHTML = ordenadas.map(d => renderDirectivaCard(d)).join('');
}

function renderDirectivaCard(directiva) {
    const { id, titulo, categoria, prioridad, porcentaje, cruzadas, misiones, mainQuest, secondaryQuest, sideQuest } = directiva;
    const completada = porcentaje === 100;

    // Determinar tipo de quest y estilos
    const isMainQuest = mainQuest === true;
    const isSecondaryQuest = secondaryQuest === true;
    const isSideQuest = sideQuest === true;
    const hasQuestType = isMainQuest || isSecondaryQuest || isSideQuest;

    let containerClass, borderColor, titleColor, percentColor, headerBorderColor, questBadge, aquilaFilter, progressBarColor, glowColor;

    if (completada) {
        containerClass = 'bg-gradient-to-b from-[#1a2a1c] to-[#1e1617] border-2 rounded-sm relative group overflow-hidden shadow-[0_0_15px_rgba(15,82,15,0.3)]';
        borderColor = 'border-sickly-green/50';
        headerBorderColor = 'border-sickly-green/30';
        titleColor = 'text-sickly-green-light';
        percentColor = 'text-sickly-green';
        aquilaFilter = 'invert(35%) sepia(50%) saturate(500%) hue-rotate(70deg)'; // Verde
        progressBarColor = 'bg-sickly-green';
        glowColor = 'rgba(15,82,15,0.5)';
        questBadge = `
            <div class="flex items-center gap-1 px-2 py-0.5 bg-sickly-green/20 border border-sickly-green/40 rounded-sm">
                <span class="text-[9px] font-bold text-sickly-green tracking-widest">COMPLETED</span>
            </div>`;
    } else if (isMainQuest) {
        containerClass = 'bg-gradient-to-b from-[#2a1a1c] to-[#1e1617] border-2 rounded-sm relative group overflow-hidden shadow-[0_0_20px_rgba(212,17,50,0.3)]';
        borderColor = 'border-primary/60';
        headerBorderColor = 'border-primary/30';
        titleColor = 'text-white';
        percentColor = 'text-primary';
        aquilaFilter = 'invert(20%) sepia(90%) saturate(2000%) hue-rotate(340deg)'; // Rojo
        progressBarColor = 'bg-gradient-to-r from-primary to-red-500';
        glowColor = 'rgba(212,17,50,0.5)';
        questBadge = `
            <div class="flex items-center gap-1 px-2 py-0.5 bg-primary/20 border border-primary/40 rounded-sm">
                <span class="text-[9px] font-bold text-primary tracking-widest">MAIN QUEST</span>
            </div>`;
    } else if (isSecondaryQuest) {
        containerClass = 'bg-gradient-to-b from-[#2a2418] to-[#1e1617] border-2 rounded-sm relative group overflow-hidden shadow-[0_0_15px_rgba(197,160,101,0.2)]';
        borderColor = 'border-secondary/50';
        headerBorderColor = 'border-secondary/30';
        titleColor = 'text-white';
        percentColor = 'text-secondary';
        aquilaFilter = 'invert(70%) sepia(50%) saturate(400%) hue-rotate(10deg) brightness(90%)'; // Dorado
        progressBarColor = 'bg-gradient-to-r from-secondary to-yellow-600';
        glowColor = 'rgba(197,160,101,0.5)';
        questBadge = `
            <div class="flex items-center gap-1 px-2 py-0.5 bg-secondary/20 border border-secondary/40 rounded-sm">
                <span class="text-[9px] font-bold text-secondary tracking-widest">SECONDARY</span>
            </div>`;
    } else if (isSideQuest) {
        containerClass = 'bg-gradient-to-b from-[#222222] to-[#1a1a1a] border-2 rounded-sm relative group overflow-hidden shadow-[0_0_10px_rgba(100,100,100,0.15)]';
        borderColor = 'border-gray-600/50';
        headerBorderColor = 'border-gray-600/30';
        titleColor = 'text-gray-300';
        percentColor = 'text-gray-400';
        aquilaFilter = 'invert(50%) brightness(80%)'; // Gris
        progressBarColor = 'bg-gradient-to-r from-gray-500 to-gray-600';
        glowColor = 'rgba(100,100,100,0.3)';
        questBadge = `
            <div class="flex items-center gap-1 px-2 py-0.5 bg-gray-700/30 border border-gray-600/40 rounded-sm">
                <span class="text-[9px] font-bold text-gray-400 tracking-widest">SIDE QUEST</span>
            </div>`;
    } else {
        // Sin tipo definido - estilo por defecto
        containerClass = 'bg-[#1e1617] border rounded-sm relative group overflow-hidden';
        borderColor = 'border-[#332224]';
        headerBorderColor = 'border-[#332224]';
        titleColor = 'text-secondary';
        percentColor = 'text-gray-500';
        aquilaFilter = 'invert(50%) brightness(50%)';
        progressBarColor = 'bg-secondary/60';
        glowColor = 'rgba(197,160,101,0.3)';
        questBadge = '';
    }

    // Ordenar cruzadas: activas primero, inactivas/pendientes al final
    const cruzadasOrdenadas = [...cruzadas].sort((a, b) => {
        const aNoActiva = a.estado === 'inactiva' || a.estado === 'pendiente';
        const bNoActiva = b.estado === 'inactiva' || b.estado === 'pendiente';
        if (aNoActiva && !bNoActiva) return 1;
        if (!aNoActiva && bNoActiva) return -1;
        return 0;
    });

    // Renderizar cruzadas
    const cruzadasHTML = cruzadasOrdenadas.map(c => renderCruzadaItem(c, prioridad, completada)).join('');

    // Renderizar misiones (pendientes primero, completadas después)
    const misionesOrdenadas = [...(misiones || [])].sort((a, b) => {
        if (a.completada !== b.completada) return a.completada ? 1 : -1;
        const prioOrder = { critica: 0, alta: 1, media: 2, baja: 3 };
        return (prioOrder[a.prioridad] || 2) - (prioOrder[b.prioridad] || 2);
    });
    const misionesHTML = misionesOrdenadas.map(m => renderMisionItem(m, completada)).join('');

    // Header con águila para todos los tipos de quest
    const aquilaHeader = hasQuestType || completada ? `
        <div class="relative h-16 overflow-hidden border-b ${headerBorderColor}">
            <!-- Aquila background -->
            <div class="absolute inset-0 flex items-start justify-center opacity-[0.12]" style="top: -5px;">
                <img src="/assets/aquila.svg" alt="" class="h-20 w-auto" style="filter: ${aquilaFilter};">
            </div>
            <!-- Content overlay -->
            <div class="absolute inset-0 flex items-center justify-between p-3 z-10">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        ${questBadge}
                    </div>
                    <h3 class="${titleColor} font-bold text-sm font-display tracking-wide uppercase" style="text-shadow: 0 0 8px ${glowColor};">${titulo}</h3>
                </div>
                <div class="flex flex-col items-end">
                    <span class="${percentColor} font-mono text-lg font-bold" style="text-shadow: 0 0 5px ${glowColor};">${porcentaje}%</span>
                    <span class="text-gray-500 text-[9px] font-mono uppercase">${categoria || ''}</span>
                </div>
            </div>
        </div>
    ` : `
        <!-- Standard Header (sin tipo de quest) -->
        <div class="p-3 border-b border-[#332224] flex justify-between items-center">
            <div>
                <h3 class="${titleColor} font-bold text-sm font-display tracking-wide uppercase">${titulo}</h3>
                <span class="text-gray-600 text-[10px] font-mono uppercase">${categoria || 'Sin categoria'}</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="${percentColor} font-mono text-sm font-bold">${porcentaje}%</span>
            </div>
        </div>
    `;

    return `
        <div class="${containerClass} ${borderColor}">
            ${aquilaHeader}

            <!-- Progress bar -->
            <div class="w-full bg-[#120c0d] h-1.5">
                <div class="${progressBarColor} h-full relative transition-all" style="width: ${porcentaje}%">
                    <div class="absolute right-0 top-0 bottom-0 w-0.5 bg-white/30"></div>
                </div>
            </div>

            <!-- Cruzadas list -->
            <div class="p-3 space-y-1">
                ${cruzadasHTML || '<div class="text-gray-600 text-xs font-mono">/// NO CRUSADES ///</div>'}
            </div>

            ${misionesOrdenadas.length > 0 ? (() => {
                const MAX_VISIBLE = 5;
                const pendientes = misionesOrdenadas.filter(m => !m.completada);
                const completadas = misionesOrdenadas.filter(m => m.completada);
                const visibles = pendientes.slice(0, MAX_VISIBLE);
                const ocultas = pendientes.length - MAX_VISIBLE;
                const uniqueId = 'misiones-' + id;
                return `
            <!-- Misiones list -->
            <div class="px-3 pb-3">
                <div class="border-t border-[#332224]/60 pt-2">
                    <div class="flex items-center gap-1.5 mb-1.5">
                        <span class="material-symbols-outlined text-gray-600 text-xs">task_alt</span>
                        <span class="text-[9px] font-mono text-gray-600 tracking-widest uppercase">MISIONES (${completadas.length}/${misionesOrdenadas.length})</span>
                    </div>
                    <div class="space-y-0.5">
                        ${visibles.map(m => renderMisionItem(m, completada)).join('')}
                    </div>
                    ${(ocultas > 0 || completadas.length > 0) ? `
                    <div id="${uniqueId}-extra" class="space-y-0.5 hidden mt-0.5">
                        ${pendientes.slice(MAX_VISIBLE).map(m => renderMisionItem(m, completada)).join('')}
                        ${completadas.length > 0 ? `
                        <div class="flex items-center gap-1.5 mt-1.5 mb-0.5">
                            <span class="material-symbols-outlined text-sickly-green text-xs">check_circle</span>
                            <span class="text-[8px] font-mono text-gray-600 tracking-widest uppercase">COMPLETADAS (${completadas.length})</span>
                        </div>
                        ${completadas.map(m => renderMisionItem(m, completada)).join('')}
                        ` : ''}
                    </div>
                    <button onclick="document.getElementById('${uniqueId}-extra').classList.toggle('hidden'); this.querySelector('span:last-child').textContent = document.getElementById('${uniqueId}-extra').classList.contains('hidden') ? '${ocultas > 0 ? `+${ocultas + completadas.length} más...` : `${completadas.length} completadas...`}' : 'Ocultar';"
                            class="flex items-center gap-1 mt-1 text-[9px] font-mono text-gray-500 hover:text-gray-300 transition-colors">
                        <span class="material-symbols-outlined text-xs">expand_more</span>
                        <span>${ocultas > 0 ? `+${ocultas + completadas.length} más...` : `${completadas.length} completadas...`}</span>
                    </button>
                    ` : ''}
                </div>
            </div>`;
            })() : ''}
        </div>
    `;
}

function renderCruzadaItem(cruzada, prioridadDirectiva, directivaCompletada) {
    const { id, titulo, porcentaje, totalPasos, pasosCompletados, estado } = cruzada;
    const completada = porcentaje === 100;
    const noActiva = estado === 'inactiva' || estado === 'pendiente';
    const esPendiente = estado === 'pendiente';

    // Determinar colores basados en estado
    let iconColor = 'text-gray-600';
    let titleColor = 'text-gray-300';
    let statsColor = 'text-gray-600';
    let containerClass = '';

    // Si no está activa (inactiva o pendiente), aplicar estilo dimmed
    if (noActiva) {
        iconColor = 'text-gray-700';
        titleColor = 'text-gray-500';
        statsColor = 'text-gray-700';
        containerClass = 'opacity-50';
    } else if (completada) {
        iconColor = 'text-sickly-green';
        titleColor = 'text-white';
        statsColor = 'text-gray-500';
    } else if (porcentaje > 0) {
        iconColor = 'text-sickly-green';
        titleColor = 'text-white';
    }

    // Icono según estado
    const icono = esPendiente ? 'schedule' : (noActiva ? 'pause_circle' : 'swords');

    // Lado derecho: badge grande si noActiva, o círculos de pasos si activa
    let rightSideHTML = '';
    if (noActiva) {
        // Badge grande en lugar de los círculos
        if (esPendiente) {
            rightSideHTML = '<span class="text-[10px] font-mono text-yellow-500 bg-yellow-900/30 px-2 py-1 border border-yellow-700 uppercase tracking-wider">PENDIENTE</span>';
        } else {
            rightSideHTML = '<span class="text-[10px] font-mono text-gray-500 bg-gray-800 px-2 py-1 border border-gray-700 uppercase tracking-wider">INACTIVA</span>';
        }
    } else {
        // Render paso indicators (max 3 visible)
        const maxVisible = 3;
        const pasosHTML = [];
        for (let i = 0; i < Math.min(totalPasos, maxVisible); i++) {
            const isCompleted = i < pasosCompletados;
            const isCurrent = i === pasosCompletados && !completada;

            let pasoClass = 'bg-[#1e1617] border-gray-700 text-gray-600';
            if (isCompleted) {
                pasoClass = 'bg-sickly-green/30 border-sickly-green text-sickly-green-light';
            } else if (isCurrent) {
                pasoClass = 'bg-yellow-600/20 border-yellow-600 text-yellow-500';
            }

            pasosHTML.push(`<div class="size-5 rounded-full ${pasoClass} border flex items-center justify-center text-[10px] font-bold">${i + 1}</div>`);
        }
        rightSideHTML = pasosHTML.join('');
    }

    return `
        <a href="directiva-detalle.html?cruzada=${encodeURIComponent(titulo)}"
           class="flex items-center justify-between group/task hover:bg-[#1e1617] p-2 -mx-2 rounded transition-colors cursor-pointer ${containerClass}">
            <div class="flex items-start gap-2">
                <span class="material-symbols-outlined ${iconColor} text-sm mt-0.5 ${noActiva ? '' : 'group-hover/task:text-primary'} transition-colors">${icono}</span>
                <div class="flex flex-col">
                    <span class="${titleColor} text-xs font-bold">${titulo}</span>
                    <span class="${statsColor} text-[9px] font-mono">${pasosCompletados}/${totalPasos} (${porcentaje}%)</span>
                </div>
            </div>
            <div class="flex gap-1 items-center">
                ${rightSideHTML}
                <span class="material-symbols-outlined text-gray-600 text-sm ml-1 ${noActiva ? '' : 'group-hover/task:text-primary'}">chevron_right</span>
            </div>
        </a>
    `;
}

function renderMisionItem(mision, directivaCompletada) {
    const { titulo, completada, prioridad, deadline, criterioVictoria } = mision;

    let iconColor, titleColor, iconName;

    if (completada) {
        iconColor = 'text-sickly-green';
        titleColor = 'text-gray-500 line-through';
        iconName = 'check_circle';
    } else if (criterioVictoria) {
        iconColor = 'text-yellow-500';
        titleColor = 'text-yellow-200';
        iconName = 'star';
    } else {
        iconColor = prioridad === 'critica' ? 'text-primary' : prioridad === 'alta' ? 'text-orange-400' : 'text-gray-500';
        titleColor = 'text-gray-300';
        iconName = 'radio_button_unchecked';
    }

    // Deadline badge
    let deadlineBadge = '';
    if (deadline && !completada) {
        const hoy = new Date();
        const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        const isOverdue = deadline < hoyStr;
        const isToday = deadline === hoyStr;
        if (isOverdue) {
            deadlineBadge = '<span class="text-[8px] font-mono text-primary bg-primary/10 px-1 rounded">OVERDUE</span>';
        } else if (isToday) {
            deadlineBadge = '<span class="text-[8px] font-mono text-yellow-500 bg-yellow-900/20 px-1 rounded">HOY</span>';
        }
    }

    return `
        <div class="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-[#1e1617]/50 transition-colors ${completada ? 'opacity-50' : ''}">
            <span class="material-symbols-outlined ${iconColor} text-sm flex-shrink-0">${iconName}</span>
            <span class="${titleColor} text-[11px] truncate flex-1">${titulo}</span>
            ${deadlineBadge}
        </div>
    `;
}

// ==========================================
//  INIT
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // NO mostrar estado de conexión hasta que el contenido cargue
    // El estado se actualizará en cargarDirectivas() cuando termine

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
                cargarDirectivas();
            }
        });
    }

    // Cargar datos iniciales
    cargarDirectivas();

    // Actualizar fecha cada minuto
    setInterval(() => {
        document.getElementById('fecha-imperial').textContent = getFechaImperial();
    }, 60000);
});
