/**
 * Warhammer Vault - Sync Utilities
 * Funciones compartidas para Background Sync entre pantallas
 */

const SYNC_TAG = 'wh-vault-sync';
const MAX_RETRIES = 3;

// ==========================================
//  BACKGROUND SYNC REGISTRATION
// ==========================================

/**
 * Registrar sync con el Service Worker (con fallback para Safari)
 * @returns {Promise<boolean>} - true si se registró o procesó correctamente
 */
async function requestSync() {
    // Check if Background Sync API is supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register(SYNC_TAG);
            console.log('[Sync] Background sync registered');
            return true;
        } catch (error) {
            console.warn('[Sync] Background sync registration failed:', error);
        }
    }

    // Fallback for browsers without Background Sync (Safari)
    // No verificar navigator.onLine - el cogitator puede estar disponible
    console.log('[Sync] Background Sync not supported, using fallback');
    return await processPendingSync();
}

/**
 * Fallback: procesar cola manualmente cuando no hay Background Sync API
 * @returns {Promise<boolean>} - true si hubo operaciones exitosas
 */
async function processPendingSync() {
    if (!window.WhVaultDB) {
        console.warn('[Sync] WhVaultDB not available');
        return false;
    }

    const operations = await window.WhVaultDB.getPendingSyncOperations();
    console.log(`[Sync] Processing ${operations.length} pending operations`);

    if (operations.length === 0) {
        return false;
    }

    let successCount = 0;
    let cogitatorAvailable = true;

    for (const op of operations) {
        try {
            // Usar fetchWithTimeout para detectar cogitator offline
            const fetchFn = window.WhVaultDB.fetchWithTimeout || fetch;

            const response = await fetchFn(op.endpoint, {
                method: op.method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Sync-Operation': op.id,
                    'X-Client-Timestamp': op.timestamp.toString()
                },
                body: JSON.stringify(op.body)
            });

            const data = await response.json();

            if (data.success) {
                await window.WhVaultDB.removeFromSyncQueue(op.id);
                successCount++;
                console.log(`[Sync] Operation ${op.id} completed successfully`);
            } else {
                console.error(`[Sync] Operation ${op.id} failed:`, data.error);
                const retries = await window.WhVaultDB.incrementSyncRetry(op.id);
                if (retries >= MAX_RETRIES) {
                    console.log(`[Sync] Max retries (${MAX_RETRIES}) reached for ${op.id}, marking as failed`);
                    await window.WhVaultDB.markSyncOperationFailed(op.id);
                }
            }
        } catch (error) {
            console.error(`[Sync] Operation ${op.id} failed:`, error);

            // Si es error de cogitator (timeout, cached, offline), marcar como no disponible
            if (error.message?.includes('COGITATOR') || error.message?.includes('Failed to fetch')) {
                cogitatorAvailable = false;
                console.log('[Sync] Cogitator not available, stopping sync');
                break; // No seguir intentando si cogitator está offline
            }

            const retries = await window.WhVaultDB.incrementSyncRetry(op.id);
            if (retries >= MAX_RETRIES) {
                console.log(`[Sync] Max retries (${MAX_RETRIES}) reached for ${op.id}, marking as failed`);
                await window.WhVaultDB.markSyncOperationFailed(op.id);
            }
        }
    }

    // Actualizar estado de cogitator basado en el resultado
    if (window.WhVaultDB.updateCogitatorStatus) {
        window.WhVaultDB.updateCogitatorStatus(cogitatorAvailable);
    }
    updateConnectionStatusUI(cogitatorAvailable);

    await updatePendingIndicator();
    return successCount > 0;
}

// ==========================================
//  PENDING INDICATOR UI
// ==========================================

/**
 * Actualizar indicador de cambios pendientes en el header
 */
async function updatePendingIndicator() {
    if (!window.WhVaultDB) return;

    const count = await window.WhVaultDB.getPendingSyncCount();

    // Update badge in status dot
    const badge = document.getElementById('pending-badge');
    const statusDot = document.getElementById('status-dot');

    if (count > 0) {
        // Show badge
        if (badge) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        }
        // Add syncing animation to dot
        if (statusDot) {
            statusDot.classList.add('status-dot-syncing');
        }
    } else {
        // Hide badge
        if (badge) {
            badge.classList.add('hidden');
        }
        // Remove syncing animation
        if (statusDot) {
            statusDot.classList.remove('status-dot-syncing');
        }
    }

    // Siempre actualizar/crear/eliminar la barra según el count
    createPendingBar(count);
}

/**
 * Crear o actualizar barra de cambios pendientes (anclada al header)
 * @param {number} count - Número de cambios pendientes
 */
function createPendingBar(count) {
    let bar = document.getElementById('pending-changes-bar');
    const header = document.querySelector('header');
    if (!header) return;

    if (count === 0) {
        if (bar) bar.remove();
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'pending-changes-bar';
        bar.className = 'bg-amber-900/90 border-b border-amber-700/50 px-3 py-1 flex items-center justify-between';
        header.after(bar);
    }

    bar.innerHTML = `
        <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-amber-400 text-sm animate-pulse">sync</span>
            <span class="text-amber-200 text-[10px] font-mono">
                <span class="pending-count font-bold">${count}</span> pendiente${count > 1 ? 's' : ''}
            </span>
        </div>
        <div class="flex items-center gap-1.5">
            <button onclick="window.WhVaultSync.forceSync()" class="flex items-center gap-1 text-amber-300 text-[10px] font-mono font-bold hover:text-amber-100 px-2 py-0.5 border border-amber-600/50 rounded hover:bg-amber-800/50 active:scale-95 transition-all">
                SYNC
            </button>
            <button onclick="window.WhVaultSync.discardPending()" class="flex items-center text-red-400 text-[10px] hover:text-red-200 px-1.5 py-0.5 border border-red-600/50 rounded hover:bg-red-900/50 active:scale-95 transition-all" title="Descartar pendientes">
                <span class="material-symbols-outlined text-sm">delete</span>
            </button>
        </div>
    `;
}

// ==========================================
//  CONNECTION STATUS UI
// ==========================================

/**
 * Actualizar UI de estado de conexión (centralizado)
 * @param {boolean} online - Estado de conexión al cogitator/servidor
 */
function updateConnectionStatusUI(online) {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');

    if (!statusText) {
        console.warn('[Sync] status-text element not found');
        return;
    }

    // Simple: NOMINAL si cogitator disponible, OFFLINE si no
    if (online) {
        statusText.textContent = 'NOMINAL';
        statusText.classList.remove('text-red-500');
        statusText.classList.add('text-primary');
        if (statusDot) {
            statusDot.classList.remove('bg-red-500', 'bg-yellow-500');
            statusDot.classList.add('bg-green-500');
        }
    } else {
        statusText.textContent = 'OFFLINE';
        statusText.classList.remove('text-primary');
        statusText.classList.add('text-red-500');
        if (statusDot) {
            statusDot.classList.remove('bg-green-500', 'bg-yellow-500');
            statusDot.classList.add('bg-red-500');
        }
    }

    console.log(`[Sync] Connection UI updated: ${online ? 'NOMINAL' : 'OFFLINE'}`);
}

// ==========================================
//  SERVICE WORKER MESSAGE HANDLER
// ==========================================

/**
 * Inicializar listeners de sincronización
 */
function initSyncListeners() {
    // Listen for messages from Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('[Sync] Message from SW:', event.data);

            if (event.data.type === 'sync-complete') {
                console.log(`[Sync] Sync complete: ${event.data.successCount} succeeded, ${event.data.failCount} failed`);
                updatePendingIndicator();

                // Trigger data reload if available
                if (typeof cargarDatos === 'function') {
                    cargarDatos();
                }
            }

            if (event.data.type === 'operation-success') {
                console.log(`[Sync] Operation synced: ${event.data.operationId} (${event.data.type})`);
            }
        });
    }

    // Network status listeners
    window.addEventListener('online', () => {
        console.log('[Sync] Network restored, checking cogitator...');
        // Verificar si el cogitator está disponible
        if (window.WhVaultDB?.checkCogitatorStatus) {
            window.WhVaultDB.checkCogitatorStatus().then(cogitatorOnline => {
                updateConnectionStatusUI(cogitatorOnline);
                if (cogitatorOnline) {
                    setTimeout(() => requestSync(), 1000);
                }
            });
        } else {
            updateConnectionStatusUI(true);
            setTimeout(() => requestSync(), 1000);
        }
    });

    window.addEventListener('offline', () => {
        console.log('[Sync] Network lost');
        updateConnectionStatusUI(false);
    });

    // Cogitator status listener (servidor disponible aunque haya red)
    // Solo actualiza UI - el sync lo manejan las páginas individuales
    if (window.WhVaultDB?.onCogitatorChange) {
        window.WhVaultDB.onCogitatorChange((cogitatorOnline) => {
            console.log(`[Sync] Cogitator status changed: ${cogitatorOnline ? 'ONLINE' : 'OFFLINE'}`);
            updateConnectionStatusUI(cogitatorOnline);
            // Las páginas individuales manejan el sync cuando reconectan
        });
    }

    // Subscribe to pending changes
    if (window.WhVaultDB) {
        window.WhVaultDB.onPendingChanges(() => {
            updatePendingIndicator(); // Esto ya crea/actualiza/elimina la barra
        });
    }

    // Check pending on load
    updatePendingIndicator();

    // Set initial connection state based on cogitator
    const initialStatus = window.WhVaultDB?.getCogitatorStatus?.() ?? navigator.onLine;
    updateConnectionStatusUI(initialStatus);

    // Periodic health check cada 30 segundos para detectar cambios de conexión
    // (el browser no siempre dispara eventos offline correctamente)
    setInterval(async () => {
        if (window.WhVaultDB?.checkCogitatorStatus) {
            const wasOnline = window.WhVaultDB.getCogitatorStatus?.() ?? true;
            const isOnline = await window.WhVaultDB.checkCogitatorStatus();

            // Solo actualizar UI si cambió
            if (wasOnline !== isOnline) {
                console.log(`[Sync] Periodic check: cogitator ${isOnline ? 'RESTORED' : 'LOST'}`);
                updateConnectionStatusUI(isOnline);
            }
        }
    }, 30000);

    // Check cogitator cuando la página vuelve a ser visible (usuario vuelve al tab)
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && window.WhVaultDB?.checkCogitatorStatus) {
            console.log('[Sync] Page visible, checking cogitator...');
            const isOnline = await window.WhVaultDB.checkCogitatorStatus();
            updateConnectionStatusUI(isOnline);
        }
    });

    console.log('[Sync] Listeners initialized');
}

/**
 * Force sync manually (called from UI button)
 */
async function forceSync() {
    console.log('[Sync] Force sync requested');

    // Primero verificar si cogitator está disponible
    let cogitatorOnline = false;
    if (window.WhVaultDB?.checkCogitatorStatus) {
        cogitatorOnline = await window.WhVaultDB.checkCogitatorStatus();
    } else {
        cogitatorOnline = navigator.onLine;
    }

    if (!cogitatorOnline) {
        showSyncToast('Cogitator no disponible', 'error');
        updateConnectionStatusUI(false);
        return false;
    }

    showSyncToast('Sincronizando...', 'info');

    const success = await processPendingSync();

    if (success) {
        showSyncToast('Sincronizado', 'success');
        // Después de sync exitoso, actualizar UI
        updateConnectionStatusUI(true);
    } else {
        const count = await window.WhVaultDB?.getPendingSyncCount() || 0;
        if (count === 0) {
            showSyncToast('Todo sincronizado', 'success');
            updateConnectionStatusUI(true);
        } else {
            showSyncToast('Error al sincronizar', 'error');
        }
    }

    return success;
}

/**
 * Show toast notification for sync status
 */
function showSyncToast(message, type = 'info') {
    // Use existing showToast if available
    if (typeof showToast === 'function') {
        showToast(message, type);
        return;
    }

    // Fallback toast
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-mono z-50 transition-all ${
        type === 'success' ? 'bg-green-900/90 text-green-200 border border-green-600' :
        type === 'error' ? 'bg-red-900/90 text-red-200 border border-red-600' :
        'bg-yellow-900/90 text-yellow-200 border border-yellow-600'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

/**
 * Discard all pending sync operations (mark as failed)
 */
async function discardPending() {
    if (!window.WhVaultDB) return;

    const operations = await window.WhVaultDB.getPendingSyncOperations();
    if (operations.length === 0) {
        showSyncToast('No hay pendientes', 'info');
        return;
    }

    console.log(`[Sync] Discarding ${operations.length} pending operations`);

    for (const op of operations) {
        await window.WhVaultDB.markSyncOperationFailed(op.id);
    }

    showSyncToast(`${operations.length} descartado${operations.length > 1 ? 's' : ''}`, 'success');
    await updatePendingIndicator();
}

// ==========================================
//  REHIDRATACIÓN DE ESTADO
// ==========================================

/**
 * Aplicar operaciones pendientes a datos cargados (para rehidratación después de F5)
 * @param {string} type - Tipo de operación a aplicar
 * @param {Array} data - Datos originales del servidor/caché
 * @returns {Promise<Array>} - Datos con operaciones pendientes aplicadas
 */
async function applyPendingOperations(type, data) {
    if (!window.WhVaultDB) return data;

    const pending = await window.WhVaultDB.getPendingSyncOperations();
    const relevantOps = pending.filter(op => op.type === type);

    if (relevantOps.length === 0) return data;

    console.log(`[Sync] Applying ${relevantOps.length} pending ${type} operations to loaded data`);

    // Crear copia para no mutar original
    let result = [...data];

    switch (type) {
        case 'completar-mision':
            // Filtrar misiones que están en cola de completar
            const completedIds = relevantOps.map(op => op.body?.id);
            result = result.filter(m => !completedIds.includes(m.id));
            break;

        case 'toggle-ritual':
            // Aplicar estado de rituales pendientes
            relevantOps.forEach(op => {
                const ritual = result.find(r => r.id === op.body?.id);
                if (ritual) {
                    ritual.completed = op.body?.completed;
                }
            });
            break;

        case 'update-mood':
            // Para moods, usar el último valor pendiente
            if (relevantOps.length > 0) {
                const lastMoodOp = relevantOps[relevantOps.length - 1];
                // El caller debe manejar esto según su estructura de datos
                result = lastMoodOp.body?.moods || result;
            }
            break;
    }

    return result;
}

/**
 * Obtener pasos de cruzada pendientes de completar
 * @param {string} cruzadaNombre - Nombre de la cruzada
 * @returns {Promise<number[]>} - Array de números de paso pendientes
 */
async function getPendingCrusadeSteps(cruzadaNombre) {
    if (!window.WhVaultDB) return [];

    const pending = await window.WhVaultDB.getPendingSyncOperations();
    return pending
        .filter(op => op.type === 'completar-paso' && op.body?.cruzadaNombre === cruzadaNombre)
        .map(op => op.body?.paso);
}

// ==========================================
//  EXPORT
// ==========================================

window.WhVaultSync = {
    requestSync,
    processPendingSync,
    updatePendingIndicator,
    updateConnectionStatusUI,
    initSyncListeners,
    forceSync,
    discardPending,
    applyPendingOperations,
    getPendingCrusadeSteps
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncListeners);
} else {
    initSyncListeners();
}

console.log('[Sync] sync-utils.js loaded');
