// ==========================================
//  DIRECTIVA DETALLE - DIRECTIVA-DETALLE.JS
// ==========================================

const API_URL = '/api';

// Estado global
let cruzadaActual = null;
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

function formatearFecha(fechaStr) {
    if (!fechaStr) return '';
    const fecha = new Date(fechaStr + 'T00:00:00');
    const dia = String(fecha.getDate()).padStart(2, '0');
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const mes = meses[fecha.getMonth()];
    const año = fecha.getFullYear();
    return `${dia} ${mes} ${año}`;
}

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        id: params.get('id'),
        cruzada: params.get('cruzada')
    };
}

function setLoading(loading) {
    document.getElementById('loading-state').classList.toggle('hidden', !loading);
    document.getElementById('pasos-list').classList.toggle('hidden', loading);
}

function updateConnectionUI(online) {
    isOfflineMode = !online;
    // Use centralized function from sync-utils.js
    if (window.WhVaultSync && window.WhVaultSync.updateConnectionStatusUI) {
        window.WhVaultSync.updateConnectionStatusUI(online);
    }
}

// ==========================================
//  API CALLS
// ==========================================

async function completarPaso(cruzadaNombre, misionId, paso) {
    // Convertir paso a número si es string
    const pasoNum = parseInt(paso);

    // 1. OPTIMISTIC UI - Actualizar inmediatamente
    if (cruzadaActual && cruzadaActual.pasos) {
        const pasoIndex = cruzadaActual.pasos.findIndex(p => p.numero == pasoNum || (cruzadaActual.pasos.indexOf(p) + 1) == pasoNum);
        if (pasoIndex >= 0) {
            cruzadaActual.pasos[pasoIndex].completada = true;
            cruzadaActual.pasosCompletados = (cruzadaActual.pasosCompletados || 0) + 1;
            cruzadaActual.porcentaje = Math.round((cruzadaActual.pasosCompletados / cruzadaActual.totalPasos) * 100);
        }
    }

    showToast(`Paso ${pasoNum} completado`, 'success');
    renderCruzada();

    // 2. VERIFICAR SI COGITATOR ESTÁ ONLINE
    const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;

    if (cogitatorOnline) {
        // ONLINE: Enviar directamente al servidor
        try {
            const fetchFn = window.WhVaultDB?.fetchWithTimeout || fetch;
            const res = await fetchFn(`${API_URL}/cruzadas/${encodeURIComponent(cruzadaNombre)}/completar-paso`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ misionId: misionId || null, paso: pasoNum })
            });
            const data = await res.json();

            if (data.success) {
                console.log('[Cruzada] Step completed directly on server:', pasoNum);
                // Actualizar cache local
                if (window.WhVaultDB) {
                    const cached = await window.WhVaultDB.getByKey(window.WhVaultDB.STORES.CRUZADAS, cruzadaNombre);
                    if (cached && cached.pasos) {
                        const pasoIndex = cached.pasos.findIndex(p => p.numero == pasoNum);
                        if (pasoIndex >= 0) {
                            cached.pasos[pasoIndex].completada = true;
                            await window.WhVaultDB.saveToStore(window.WhVaultDB.STORES.CRUZADAS, [cached]);
                        }
                    }
                }
                return;
            } else {
                throw new Error(data.error || 'Server error');
            }
        } catch (err) {
            console.warn('[Cruzada] Direct send failed, queuing:', err.message);
            if (window.WhVaultDB?.updateCogitatorStatus) {
                window.WhVaultDB.updateCogitatorStatus(false);
            }
            updateConnectionUI(false);
        }
    }

    // OFFLINE (o falló el envío directo): Añadir a cola de sync
    if (window.WhVaultDB) {
        const isDuplicate = await window.WhVaultDB.isDuplicateOperation('completar-paso', {
            cruzadaNombre,
            paso: pasoNum
        });

        if (isDuplicate) {
            console.log('[Sync] Duplicate step completion, skipping queue');
            return;
        }

        await window.WhVaultDB.addToSyncQueue({
            type: 'completar-paso',
            endpoint: `${API_URL}/cruzadas/${encodeURIComponent(cruzadaNombre)}/completar-paso`,
            method: 'POST',
            body: { misionId: misionId || null, paso: pasoNum, cruzadaNombre }
        });

        console.log('[Cruzada] Step queued for sync:', pasoNum);

        if (window.WhVaultSync) {
            await window.WhVaultSync.updatePendingIndicator();
        }
    }
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#10b981' : '#d41132'};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: bold;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

async function cargarCruzada() {
    try {
        setLoading(true);

        const { id, cruzada } = getUrlParams();

        // Si no hay ni id ni cruzada, volver a directivas
        if (!id && !cruzada) {
            window.location.href = 'directivas.html';
            return;
        }

        // Si hay una cruzada específica, cargarla directamente
        let endpoint;
        if (cruzada) {
            endpoint = `${API_URL}/cruzadas/${encodeURIComponent(cruzada)}`;
        } else {
            endpoint = `${API_URL}/directivas/${encodeURIComponent(id)}`;
        }

        const res = await fetch(endpoint);
        const isFromCache = res.headers.get('X-From-Cache') === 'true';
        const data = await res.json();

        if (data.offline) {
            updateConnectionUI(false);
            showToast('Modo offline - Sin datos en caché', 'error');
            document.getElementById('loading-state').innerHTML = `
                <div class="text-center">
                    <p class="text-red-500 font-mono text-sm mb-4">/// OFFLINE - NO CACHED DATA ///</p>
                    <a href="directivas.html" class="text-secondary text-sm hover:underline">Back to Directives</a>
                </div>
            `;
            return;
        }

        if (data.success) {
            cruzadaActual = data.cruzada || data.directiva?.cruzadas?.[0];
            if (cruzadaActual) {
                // REHIDRATACIÓN: Aplicar pasos pendientes de completar
                if (window.WhVaultSync && cruzadaActual.titulo) {
                    const pendingSteps = await window.WhVaultSync.getPendingCrusadeSteps(cruzadaActual.titulo);
                    if (pendingSteps.length > 0) {
                        console.log(`[Sync] Applying ${pendingSteps.length} pending steps to crusade`);
                        pendingSteps.forEach(paso => {
                            const pasoIndex = cruzadaActual.pasos?.findIndex(p =>
                                p.numero == paso || (cruzadaActual.pasos.indexOf(p) + 1) == paso
                            );
                            if (pasoIndex >= 0 && cruzadaActual.pasos[pasoIndex]) {
                                cruzadaActual.pasos[pasoIndex].completada = true;
                            }
                        });
                        // Recalcular progreso
                        const completados = cruzadaActual.pasos?.filter(p => p.completada).length || 0;
                        cruzadaActual.pasosCompletados = completados;
                        cruzadaActual.porcentaje = Math.round((completados / cruzadaActual.totalPasos) * 100);
                    }
                }

                renderCruzada();

                if (isFromCache) {
                    updateConnectionUI(false);
                } else {
                    updateConnectionUI(true);
                }
            } else {
                console.error('No crusade found');
                document.getElementById('loading-state').innerHTML = `
                    <div class="text-center">
                        <p class="text-primary font-mono text-sm mb-4">/// NO CRUSADE DATA ///</p>
                        <a href="directivas.html" class="text-secondary text-sm hover:underline">Back to Directives</a>
                    </div>
                `;
            }
        } else {
            console.error('API error:', data.error);
        }

        setLoading(false);

    } catch (err) {
        console.error('Error cargando cruzada:', err);
        updateConnectionUI(false);
        setLoading(false);
    }
}

// ==========================================
//  RENDER FUNCTIONS
// ==========================================

function renderCruzada() {
    document.getElementById('fecha-imperial').textContent = getFechaImperial();

    if (!cruzadaActual) return;

    const { titulo, porcentaje, pasos, totalPasos, pasosCompletados, estado, fechaObjetivo } = cruzadaActual;
    const completada = porcentaje === 100;
    const esPendiente = estado === 'pendiente';
    const esInactiva = estado === 'inactiva';
    const noActiva = esPendiente || esInactiva;

    // Update title with crusade name
    document.getElementById('cruzada-titulo').textContent = titulo?.toUpperCase() || 'CRUZADA';

    // Update status box
    document.getElementById('porcentaje-total').textContent = `${porcentaje}%`;
    document.getElementById('paso-actual').textContent = `PASO ${pasosCompletados}/${totalPasos}`;
    document.getElementById('progress-bar').style.width = `${porcentaje}%`;

    // Update badge
    const badge = document.getElementById('estado-badge');
    if (esPendiente) {
        badge.textContent = 'PROGRAMADA';
        badge.className = 'px-2 py-0.5 bg-yellow-900/30 border border-yellow-700 text-yellow-600 text-[10px] font-bold tracking-wider uppercase';
        document.getElementById('pasos-list').classList.add('opacity-60');
    } else if (esInactiva) {
        badge.textContent = 'INACTIVA';
        badge.className = 'px-2 py-0.5 bg-gray-800 border border-gray-600 text-gray-500 text-[10px] font-bold tracking-wider uppercase';
        document.getElementById('pasos-list').classList.add('opacity-60');
    } else if (completada) {
        badge.textContent = 'COMPLETADA';
        badge.className = 'px-2 py-0.5 bg-accent-green/20 border border-accent-green/50 text-accent-green text-[10px] font-bold tracking-wider uppercase';
        document.getElementById('pasos-list').classList.remove('opacity-60');
    } else if (pasosCompletados > 0) {
        badge.textContent = 'EN PROGRESO';
        badge.className = 'px-2 py-0.5 bg-accent-green/10 border border-accent-green/30 text-accent-green text-[10px] font-bold tracking-wider uppercase';
        document.getElementById('pasos-list').classList.remove('opacity-60');
    } else {
        badge.textContent = 'SIN INICIAR';
        badge.className = 'px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-500 text-[10px] font-bold tracking-wider uppercase';
        document.getElementById('pasos-list').classList.remove('opacity-60');
    }

    // Show fecha objetivo if available
    const fechaObjetivoEl = document.getElementById('fecha-objetivo');
    if (fechaObjetivoEl && fechaObjetivo) {
        fechaObjetivoEl.textContent = `META: ${formatearFecha(fechaObjetivo)}`;
        fechaObjetivoEl.classList.remove('hidden');
    }

    // Render pasos
    const container = document.getElementById('pasos-list');
    container.innerHTML = pasos.map((paso, index) => renderPaso(paso, index, pasos.length, titulo)).join('');
}

function renderPaso(paso, index, total, cruzadaTitulo) {
    const { titulo, completada, referencia, deadline, misionId } = paso;
    const numero = String(index + 1).padStart(2, '0');
    const isLast = index === total - 1;

    // Determinar estado visual
    const isCompleted = completada === true;
    const isActive = !isCompleted && (index === 0 || paso.esActivo);

    // Find the first incomplete step - that's the active one
    const activeIndex = paso.activeIndex ?? -1;
    const isCurrentActive = index === activeIndex;

    if (isCompleted) {
        return renderPasoCompletado(numero, titulo, referencia, isLast, deadline);
    } else if (isCurrentActive || (index > 0 && paso.esActivo)) {
        return renderPasoActivo(numero, titulo, referencia, isLast, deadline, cruzadaTitulo, misionId);
    } else {
        return renderPasoPendiente(numero, titulo, referencia, isLast, deadline);
    }
}

function renderPasoCompletado(numero, titulo, referencia, isLast, deadline) {
    const deadlineHTML = deadline
        ? `<span class="text-[9px] text-gray-500 font-mono flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">event_available</span>${formatearFecha(deadline)}</span>`
        : '';

    return `
        <div class="relative bg-[#111] border border-accent-green/30 hover:border-accent-green/60 transition-all group">
            <div class="absolute inset-0 bg-gradient-to-r from-accent-green/5 to-transparent opacity-50"></div>
            <div class="flex items-center p-3 gap-3 relative z-10">
                <div class="flex flex-col items-center justify-center min-w-[32px]">
                    <div class="w-8 h-8 flex items-center justify-center border border-accent-green text-accent-green bg-[#0a1f16] font-mono text-sm font-bold shadow-[0_0_5px_rgba(16,185,129,0.4)]">
                        ${numero}
                    </div>
                    ${!isLast ? '<div class="h-full w-[1px] bg-accent-green/20 mt-2 absolute -bottom-3 left-[27px] z-0"></div>' : ''}
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-1">
                        <h3 class="text-gray-200 text-sm font-bold uppercase tracking-wide">${titulo}</h3>
                        <span class="material-symbols-outlined text-accent-green text-base">check_circle</span>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-mono text-accent-green uppercase tracking-wider bg-accent-green/10 px-1 py-0.5 border border-accent-green/20">LOGRADO</span>
                        ${referencia ? `<span class="text-[10px] text-gray-500 font-mono">REF: ${referencia}</span>` : ''}
                        ${deadlineHTML}
                    </div>
                </div>
                <div class="flex flex-col gap-1 ml-2 border-l border-gray-800 pl-2">
                    <button class="text-gray-500 hover:text-accent-green transition-colors">
                        <span class="material-symbols-outlined text-lg">edit_note</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderPasoActivo(numero, titulo, referencia, isLast, deadline, cruzadaTitulo, misionId) {
    const deadlineHTML = deadline
        ? `<span class="text-[9px] text-secondary font-mono flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">schedule</span>${formatearFecha(deadline)}</span>`
        : '';

    // Escapar comillas para el onclick
    const cruzadaEscaped = (cruzadaTitulo || '').replace(/'/g, "\\'");
    const misionIdEscaped = (misionId || '').replace(/'/g, "\\'");

    return `
        <div class="relative bg-[#161213] border border-primary/60 shadow-[0_0_15px_rgba(212,17,50,0.15)] group">
            <div class="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-r-[8px] border-t-primary border-r-transparent"></div>
            <div class="absolute bottom-0 left-0 w-0 h-0 border-b-[8px] border-l-[8px] border-b-primary border-l-transparent"></div>
            <div class="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent"></div>
            <div class="flex items-center p-3 gap-3 relative z-10">
                <div class="flex flex-col items-center justify-center min-w-[32px]">
                    <div class="w-8 h-8 flex items-center justify-center border border-primary text-primary bg-[#2a0b10] font-mono text-sm font-bold shadow-[0_0_8px_rgba(212,17,50,0.6)] animate-pulse">
                        ${numero}
                    </div>
                    ${!isLast ? '<div class="h-full w-[1px] bg-gray-800 mt-2 absolute -bottom-3 left-[27px] z-0"></div>' : ''}
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-1">
                        <h3 class="text-white text-sm font-bold uppercase tracking-wide text-glow-red">${titulo}</h3>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-mono text-primary uppercase tracking-wider bg-primary/10 px-1 py-0.5 border border-primary/30">ACTIVO</span>
                        ${deadlineHTML}
                    </div>
                </div>
                <!-- EXECUTE BUTTON - Crosshair style -->
                <button onclick="completarPaso('${cruzadaEscaped}', '${misionIdEscaped}', ${numero})"
                    class="execute-btn group/btn relative w-14 h-14 flex items-center justify-center ml-2">
                    <!-- Outer ring -->
                    <div class="absolute inset-0 border-2 border-accent-green/40 rounded-full group-hover/btn:border-accent-green group-hover/btn:shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-300"></div>
                    <!-- Crosshair lines -->
                    <div class="absolute top-1 left-1/2 w-[2px] h-3 bg-accent-green/60 -translate-x-1/2 group-hover/btn:bg-accent-green transition-all"></div>
                    <div class="absolute bottom-1 left-1/2 w-[2px] h-3 bg-accent-green/60 -translate-x-1/2 group-hover/btn:bg-accent-green transition-all"></div>
                    <div class="absolute left-1 top-1/2 h-[2px] w-3 bg-accent-green/60 -translate-y-1/2 group-hover/btn:bg-accent-green transition-all"></div>
                    <div class="absolute right-1 top-1/2 h-[2px] w-3 bg-accent-green/60 -translate-y-1/2 group-hover/btn:bg-accent-green transition-all"></div>
                    <!-- Inner circle -->
                    <div class="absolute w-6 h-6 border border-accent-green/30 rounded-full group-hover/btn:border-accent-green/60 group-hover/btn:scale-110 transition-all duration-300"></div>
                    <!-- Center icon -->
                    <span class="material-symbols-outlined text-accent-green text-xl group-hover/btn:text-white group-hover/btn:scale-125 transition-all duration-200 z-10">
                        check
                    </span>
                    <!-- Pulse animation on hover -->
                    <div class="absolute inset-0 rounded-full bg-accent-green/0 group-hover/btn:bg-accent-green/10 group-active/btn:bg-accent-green/30 transition-all duration-150"></div>
                </button>
            </div>
            <!-- Bottom action hint -->
            <div class="px-3 pb-2 pt-0 relative z-10">
                <div class="flex items-center justify-end gap-1 text-[9px] text-accent-green/60 font-mono uppercase tracking-widest">
                    <span class="material-symbols-outlined text-[10px]">ads_click</span>
                    <span>Execute to complete</span>
                </div>
            </div>
        </div>
    `;
}

function renderPasoPendiente(numero, titulo, referencia, isLast, deadline) {
    const deadlineHTML = deadline
        ? `<span class="text-[9px] text-gray-600 font-mono flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">event</span>${formatearFecha(deadline)}</span>`
        : '';

    return `
        <div class="relative bg-[#0d0d0d] border border-gray-800 opacity-80 hover:opacity-100 hover:border-gray-600 transition-all group">
            <div class="flex items-center p-3 gap-3 relative z-10">
                <div class="flex flex-col items-center justify-center min-w-[32px]">
                    <div class="w-8 h-8 flex items-center justify-center border border-gray-700 text-gray-500 bg-[#111] font-mono text-sm font-bold">
                        ${numero}
                    </div>
                    ${!isLast ? '<div class="h-full w-[1px] bg-gray-800 mt-2 absolute -bottom-3 left-[27px] z-0"></div>' : ''}
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-1">
                        <h3 class="text-gray-400 text-sm font-medium uppercase tracking-wide">${titulo}</h3>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-mono text-gray-500 uppercase tracking-wider border border-gray-800 px-1 py-0.5">PENDIENTE</span>
                        ${deadlineHTML}
                    </div>
                </div>
                <div class="flex flex-col gap-1 ml-2 border-l border-gray-800 pl-2">
                    <button class="text-gray-600 hover:text-gray-400 transition-colors">
                        <span class="material-symbols-outlined text-lg">lock</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
//  INIT
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // NO mostrar estado de conexión hasta que el contenido cargue
    // El estado se actualizará en cargarCruzada() cuando termine

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
                cargarCruzada();
            }
        });
    }

    cargarCruzada();

    // Actualizar fecha cada minuto
    setInterval(() => {
        document.getElementById('fecha-imperial').textContent = getFechaImperial();
    }, 60000);
});
