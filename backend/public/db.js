/**
 * Warhammer Vault - IndexedDB Utility
 * Almacenamiento local para modo offline
 */

const DB_NAME = 'wh-vault-db';
const DB_VERSION = 11; // v11: Historial Médico store

// Stores
const STORES = {
    MISIONES_URGENTES: 'misiones-urgentes',
    MISIONES_CRITERIOS: 'misiones-criterios',
    MISIONES_OPCIONALES: 'misiones-opcionales',
    DIRECTIVAS: 'directivas',
    CRUZADAS: 'cruzadas',
    EVENTOS: 'eventos',
    INCURSIONES: 'incursiones', // Cache de datos diarios (duty.js)
    SYNC_META: 'sync-meta',
    SYNC_QUEUE: 'sync-queue', // Cola de operaciones pendientes
    CARGO: 'cargo', // Bloc de notas local para offload a Obsidian
    NOTAS_SAGRADAS: 'notas-sagradas', // Cuaderno de bitácora
    AVISOS: 'avisos', // Recordadora - memorándums imperiales
    PLANETAS: 'planetas', // VoidMap - planetas del sistema
    REVIEWS: 'reviews', // Inquisición - reviews semanales
    CITAS_MEDICAS: 'citas-medicas', // Bahía Médica - checkups médicos
    CONDICIONES_MEDICAS: 'condiciones-medicas', // Bahía Médica - lesiones y afecciones
    HISTORIAL_MEDICO: 'historial-medico' // Bahía Médica - historial clínico
};

// Freshness threshold: 5 minutes
const FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;

let db = null;

/**
 * Initialize IndexedDB
 */
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[DB] Error opening database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('[DB] Database opened successfully');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            console.log('[DB] Upgrading database...');

            // Create object stores
            Object.values(STORES).forEach(storeName => {
                if (!database.objectStoreNames.contains(storeName)) {
                    if (storeName === STORES.SYNC_META) {
                        database.createObjectStore(storeName, { keyPath: 'key' });
                    } else if (storeName === STORES.CRUZADAS) {
                        database.createObjectStore(storeName, { keyPath: 'nombre' });
                    } else if (storeName === STORES.SYNC_QUEUE) {
                        // Cola de sincronización con índices
                        const store = database.createObjectStore(storeName, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('type', 'type', { unique: false });
                        store.createIndex('status', 'status', { unique: false });
                    } else if (storeName === STORES.CARGO) {
                        // Cargo store para notas locales
                        const store = database.createObjectStore(storeName, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('status', 'status', { unique: false });
                    } else if (storeName === STORES.NOTAS_SAGRADAS) {
                        // Notas sagradas - cuaderno de bitácora
                        const store = database.createObjectStore(storeName, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('tipo', 'tipo', { unique: false });
                    } else if (storeName === STORES.AVISOS) {
                        // Avisos (recordadora) store
                        const store = database.createObjectStore(storeName, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('subtipo', 'subtipo', { unique: false });
                    } else if (storeName === STORES.INCURSIONES) {
                        // Incursiones store con fecha como key (para duty.js)
                        database.createObjectStore(storeName, { keyPath: 'fecha' });
                    } else {
                        database.createObjectStore(storeName, { keyPath: 'id' });
                    }
                    console.log(`[DB] Created store: ${storeName}`);
                }
            });
        };
    });
}

/**
 * Save data to a store
 */
async function saveToStore(storeName, data) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        // Clear existing data and add new
        store.clear();

        if (Array.isArray(data)) {
            data.forEach(item => {
                store.add(item);
            });
        } else {
            store.add(data);
        }

        transaction.oncomplete = () => {
            console.log(`[DB] Saved ${Array.isArray(data) ? data.length : 1} items to ${storeName}`);
            resolve();
        };

        transaction.onerror = () => {
            console.error(`[DB] Error saving to ${storeName}:`, transaction.error);
            reject(transaction.error);
        };
    });
}

/**
 * Get all data from a store
 */
async function getFromStore(storeName) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
            console.log(`[DB] Retrieved ${request.result.length} items from ${storeName}`);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error(`[DB] Error reading from ${storeName}:`, request.error);
            reject(request.error);
        };
    });
}

/**
 * Get single item by key
 */
async function getByKey(storeName, key) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

/**
 * Save sync metadata (last sync time, etc.)
 */
async function saveSyncMeta(key, value) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.SYNC_META, 'readwrite');
        const store = transaction.objectStore(STORES.SYNC_META);
        store.put({ key, value, timestamp: Date.now() });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Get sync metadata
 */
async function getSyncMeta(key) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.SYNC_META, 'readonly');
        const store = transaction.objectStore(STORES.SYNC_META);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Check if we have cached data
 */
async function hasCachedData(storeName) {
    try {
        const data = await getFromStore(storeName);
        return data && data.length > 0;
    } catch {
        return false;
    }
}

/**
 * Clear all cached data
 */
async function clearAllData() {
    await initDB();
    return new Promise((resolve, reject) => {
        const storeNames = Object.values(STORES);
        const transaction = db.transaction(storeNames, 'readwrite');

        storeNames.forEach(storeName => {
            transaction.objectStore(storeName).clear();
        });

        transaction.oncomplete = () => {
            console.log('[DB] All data cleared');
            resolve();
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Clear a single store
 */
async function clearStore(storeName) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();

        transaction.oncomplete = () => {
            console.log(`[DB] Store cleared: ${storeName}`);
            resolve();
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

// ==========================================
//  CACHE-FIRST DATA FUNCTIONS
// ==========================================

/**
 * Save API data to IndexedDB with timestamp
 * @param {string} storeName - Store to save to
 * @param {Array} data - Data array from API
 * @returns {Promise<void>}
 */
async function cacheApiData(storeName, data) {
    await saveToStore(storeName, data);
    await saveSyncMeta(`${storeName}-lastUpdate`, Date.now());
    console.log(`[Cache] Saved ${Array.isArray(data) ? data.length : 1} items to ${storeName}`);
}

/**
 * Get cached data with freshness info
 * @param {string} storeName - Store to read from
 * @returns {Promise<{data: Array, lastUpdate: number|null, isFresh: boolean}>}
 */
async function getCachedData(storeName) {
    const data = await getFromStore(storeName);
    const meta = await getSyncMeta(`${storeName}-lastUpdate`);
    const lastUpdate = meta?.value || null;

    // Consider data "fresh" if updated within threshold
    const isFresh = lastUpdate && (Date.now() - lastUpdate) < FRESHNESS_THRESHOLD_MS;

    return { data, lastUpdate, isFresh };
}

/**
 * Save incursion data for a specific date (duty.js)
 * @param {string} fecha - Date string (YYYY-MM-DD)
 * @param {Object} data - Incursion data (rituals, moods, etc.)
 */
async function cacheIncursionData(fecha, data) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.INCURSIONES, 'readwrite');
        const store = transaction.objectStore(STORES.INCURSIONES);

        const record = {
            fecha: fecha,
            data: data,
            timestamp: Date.now()
        };

        store.put(record);

        transaction.oncomplete = () => {
            console.log(`[Cache] Saved incursion data for ${fecha}`);
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Get cached incursion data for a specific date
 * @param {string} fecha - Date string (YYYY-MM-DD)
 * @returns {Promise<{data: Object|null, lastUpdate: number|null, isFresh: boolean}>}
 */
async function getCachedIncursion(fecha) {
    await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.INCURSIONES, 'readonly');
        const store = transaction.objectStore(STORES.INCURSIONES);
        const request = store.get(fecha);

        request.onsuccess = () => {
            const record = request.result;
            if (record) {
                const isFresh = (Date.now() - record.timestamp) < FRESHNESS_THRESHOLD_MS;
                resolve({
                    data: record.data,
                    lastUpdate: record.timestamp,
                    isFresh: isFresh
                });
            } else {
                resolve({ data: null, lastUpdate: null, isFresh: false });
            }
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Get last update timestamp for a store (for UI display)
 * @param {string} storeName - Store name
 * @returns {Promise<number|null>}
 */
async function getLastUpdateTime(storeName) {
    const meta = await getSyncMeta(`${storeName}-lastUpdate`);
    return meta?.value || null;
}

/**
 * Format last update timestamp for display
 * @param {number} timestamp - Unix timestamp in ms
 * @returns {string} - Human readable string
 */
function formatLastUpdate(timestamp) {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Check if any data store has cached data
 * @returns {Promise<boolean>}
 */
async function hasAnyCachedData() {
    const stores = [
        STORES.MISIONES_URGENTES,
        STORES.MISIONES_CRITERIOS,
        STORES.MISIONES_OPCIONALES,
        STORES.DIRECTIVAS,
        STORES.EVENTOS
    ];

    for (const store of stores) {
        if (await hasCachedData(store)) {
            return true;
        }
    }
    return false;
}

// ==========================================
//  SYNC QUEUE FUNCTIONS
// ==========================================

/**
 * Generar UUID para operaciones
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Agregar operación a la cola de sync
 * @param {Object} operation - { type, endpoint, method, body }
 * @returns {Promise<string>} - ID de la operación
 */
async function addToSyncQueue(operation) {
    await initDB();

    const syncOperation = {
        id: generateUUID(),
        type: operation.type,
        endpoint: operation.endpoint,
        method: operation.method || 'POST',
        body: operation.body,
        timestamp: Date.now(),
        retries: 0,
        status: 'pending'
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
        const store = transaction.objectStore(STORES.SYNC_QUEUE);
        store.add(syncOperation);

        transaction.oncomplete = () => {
            console.log(`[SyncQueue] Added operation: ${syncOperation.type} (${syncOperation.id})`);
            notifyPendingChanges();
            resolve(syncOperation.id);
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Obtener todas las operaciones pendientes ordenadas por timestamp
 */
async function getPendingSyncOperations() {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.SYNC_QUEUE, 'readonly');
        const store = transaction.objectStore(STORES.SYNC_QUEUE);
        const index = store.index('timestamp');
        const request = index.getAll();

        request.onsuccess = () => {
            const pending = request.result.filter(op => op.status !== 'failed');
            resolve(pending);
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtener conteo de operaciones pendientes
 */
async function getPendingSyncCount() {
    const operations = await getPendingSyncOperations();
    return operations.length;
}

/**
 * Eliminar operación de la cola (cuando se sincroniza exitosamente)
 */
async function removeFromSyncQueue(id) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
        const store = transaction.objectStore(STORES.SYNC_QUEUE);
        store.delete(id);

        transaction.oncomplete = () => {
            console.log(`[SyncQueue] Removed operation: ${id}`);
            notifyPendingChanges();
            resolve();
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Marcar operación como fallida (después de max reintentos)
 */
async function markSyncOperationFailed(id) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
        const store = transaction.objectStore(STORES.SYNC_QUEUE);
        const request = store.get(id);

        request.onsuccess = () => {
            const op = request.result;
            if (op) {
                op.status = 'failed';
                store.put(op);
            }
        };

        transaction.oncomplete = () => {
            notifyPendingChanges();
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Incrementar contador de reintentos
 */
async function incrementSyncRetry(id) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
        const store = transaction.objectStore(STORES.SYNC_QUEUE);
        const request = store.get(id);

        request.onsuccess = () => {
            const op = request.result;
            if (op) {
                op.retries += 1;
                store.put(op);
                resolve(op.retries);
            } else {
                resolve(0);
            }
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Verificar si existe operación duplicada
 */
async function isDuplicateOperation(type, body) {
    const pending = await getPendingSyncOperations();

    // Para misiones: comparar por ID de misión
    if (type === 'completar-mision') {
        return pending.some(op =>
            op.type === type &&
            op.body?.id === body?.id
        );
    }

    // Para pasos de cruzada: comparar por cruzada + paso
    if (type === 'completar-paso') {
        return pending.some(op =>
            op.type === type &&
            op.body?.cruzadaNombre === body?.cruzadaNombre &&
            op.body?.paso === body?.paso
        );
    }

    // Para rituales: comparar por id + fecha
    if (type === 'toggle-ritual') {
        return pending.some(op =>
            op.type === type &&
            op.body?.id === body?.id &&
            op.body?.fecha === body?.fecha
        );
    }

    // Para moods: siempre permitir (último valor gana)
    return false;
}

/**
 * Obtener operación por ID
 */
async function getSyncOperationById(id) {
    await initDB();
    return getByKey(STORES.SYNC_QUEUE, id);
}

// ==========================================
//  PENDING CHANGES NOTIFICATIONS
// ==========================================

const pendingChangesListeners = [];

function onPendingChanges(callback) {
    pendingChangesListeners.push(callback);
}

async function notifyPendingChanges() {
    const count = await getPendingSyncCount();
    pendingChangesListeners.forEach(cb => cb(count));
}

// ==========================================
//  CARGO FUNCTIONS
// ==========================================

/**
 * Agregar item de cargo (nota local)
 * @param {Object} item - { title, content }
 * @returns {Promise<string>} - ID del item
 */
async function addCargoItem(item) {
    await initDB();

    const cargoItem = {
        id: generateUUID(),
        title: item.title || 'Sin título',
        content: item.content || '',
        timestamp: Date.now(),
        status: 'pending' // pending, offloading, offloaded, failed
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.CARGO, 'readwrite');
        const store = transaction.objectStore(STORES.CARGO);
        store.add(cargoItem);

        transaction.oncomplete = () => {
            console.log(`[Cargo] Added item: ${cargoItem.title} (${cargoItem.id})`);
            resolve(cargoItem.id);
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Obtener todos los items de cargo
 */
async function getAllCargoItems() {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.CARGO, 'readonly');
        const store = transaction.objectStore(STORES.CARGO);
        const index = store.index('timestamp');
        const request = index.getAll();

        request.onsuccess = () => {
            // Ordenar por timestamp (más reciente primero)
            const items = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(items);
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtener items de cargo pendientes (no offloaded)
 */
async function getPendingCargoItems() {
    const items = await getAllCargoItems();
    return items.filter(item => item.status === 'pending' || item.status === 'failed');
}

/**
 * Obtener conteo de cargo pendiente
 */
async function getPendingCargoCount() {
    const items = await getPendingCargoItems();
    return items.length;
}

/**
 * Actualizar estado de item de cargo
 */
async function updateCargoStatus(id, status) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.CARGO, 'readwrite');
        const store = transaction.objectStore(STORES.CARGO);
        const request = store.get(id);

        request.onsuccess = () => {
            const item = request.result;
            if (item) {
                item.status = status;
                store.put(item);
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Eliminar item de cargo
 */
async function removeCargoItem(id) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.CARGO, 'readwrite');
        const store = transaction.objectStore(STORES.CARGO);
        store.delete(id);

        transaction.oncomplete = () => {
            console.log(`[Cargo] Removed item: ${id}`);
            resolve();
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Eliminar todos los items de cargo offloaded
 */
async function clearOffloadedCargo() {
    const items = await getAllCargoItems();
    const offloaded = items.filter(item => item.status === 'offloaded');

    for (const item of offloaded) {
        await removeCargoItem(item.id);
    }

    console.log(`[Cargo] Cleared ${offloaded.length} offloaded items`);
}

/**
 * Limpiar todo el cargo
 */
async function clearAllCargo() {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.CARGO, 'readwrite');
        const store = transaction.objectStore(STORES.CARGO);
        store.clear();

        transaction.oncomplete = () => {
            console.log('[Cargo] All items cleared');
            resolve();
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

// ==========================================
//  NOTAS SAGRADAS FUNCTIONS
// ==========================================

/**
 * Agregar nota sagrada
 * @param {Object} nota - { title, content, tipo }
 * @returns {Promise<string>} - ID de la nota
 */
async function addNota(nota) {
    await initDB();

    const notaItem = {
        id: nota.id || generateUUID(),
        title: nota.title || 'Sin designación',
        content: nota.content || '',
        tipo: nota.tipo || 'parchment', // parchment | metallic
        timestamp: nota.timestamp || Date.now(),
        pendingSync: nota.pendingSync || false,
        cachedFromApi: nota.cachedFromApi || false
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.NOTAS_SAGRADAS, 'readwrite');
        const store = transaction.objectStore(STORES.NOTAS_SAGRADAS);
        store.put(notaItem); // Use put to allow upsert

        transaction.oncomplete = () => {
            console.log(`[Notas] Added/Cached: ${notaItem.title} (${notaItem.id})`);
            resolve(notaItem.id);
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Obtener todas las notas sagradas (más reciente primero)
 */
async function getAllNotas() {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.NOTAS_SAGRADAS, 'readonly');
        const store = transaction.objectStore(STORES.NOTAS_SAGRADAS);
        const request = store.getAll();

        request.onsuccess = () => {
            const items = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(items);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtener nota por ID
 */
async function getNotaById(id) {
    await initDB();
    return getByKey(STORES.NOTAS_SAGRADAS, id);
}

/**
 * Actualizar nota sagrada
 */
async function updateNota(id, updates) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.NOTAS_SAGRADAS, 'readwrite');
        const store = transaction.objectStore(STORES.NOTAS_SAGRADAS);
        const request = store.get(id);

        request.onsuccess = () => {
            const nota = request.result;
            if (nota) {
                Object.assign(nota, updates, { updatedAt: Date.now() });
                store.put(nota);
            }
        };

        transaction.oncomplete = () => {
            console.log(`[Notas] Updated: ${id}`);
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Eliminar nota sagrada
 */
async function removeNota(id) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.NOTAS_SAGRADAS, 'readwrite');
        const store = transaction.objectStore(STORES.NOTAS_SAGRADAS);
        store.delete(id);

        transaction.oncomplete = () => {
            console.log(`[Notas] Removed: ${id}`);
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Obtener conteo de notas sagradas
 */
async function getNotasCount() {
    const notas = await getAllNotas();
    return notas.length;
}

// ==========================================
//  AVISOS (Recordadora) functions
// ==========================================

/**
 * Guardar aviso en IndexedDB (cache o local)
 */
async function addAviso(aviso) {
    await initDB();

    const avisoItem = {
        id: aviso.id || generateUUID(),
        titulo: aviso.titulo || 'Sin título',
        subtipo: aviso.subtipo || 'puntual',
        recurrencia: aviso.recurrencia || 'no',
        fecha: aviso.fecha || null,
        'dia-del-mes': aviso['dia-del-mes'] || null,
        'dia-de-la-semana': aviso['dia-de-la-semana'] || null,
        hora: aviso.hora || '09:00',
        categoria: aviso.categoria || 'general',
        prioridad: aviso.prioridad || 'media',
        icono: aviso.icono || '📌',
        activo: aviso.activo !== false,
        descripcion: aviso.descripcion || '',
        timestamp: aviso.timestamp || Date.now(),
        cachedFromApi: aviso.cachedFromApi || false
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.AVISOS, 'readwrite');
        const store = transaction.objectStore(STORES.AVISOS);
        store.put(avisoItem);

        transaction.oncomplete = () => {
            console.log(`[Avisos] Cached: ${avisoItem.titulo} (${avisoItem.id})`);
            resolve(avisoItem.id);
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Obtener todos los avisos cacheados
 */
async function getAllAvisos() {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.AVISOS, 'readonly');
        const store = transaction.objectStore(STORES.AVISOS);
        const request = store.getAll();

        request.onsuccess = () => {
            const items = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(items);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Eliminar aviso cacheado
 */
async function removeAviso(id) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.AVISOS, 'readwrite');
        const store = transaction.objectStore(STORES.AVISOS);
        store.delete(id);

        transaction.oncomplete = () => {
            console.log(`[Avisos] Removed: ${id}`);
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Limpiar todos los avisos cacheados
 */
async function clearAvisos() {
    await initDB();
    return clearStore(STORES.AVISOS);
}

// Connection status utilities
let isOnline = navigator.onLine;
let isCogitatorOnline = true; // Servidor de Obsidian disponible
const connectionListeners = [];
const cogitatorListeners = [];

// Timeout para fetch requests (3 segundos)
const FETCH_TIMEOUT_MS = 3000;

/**
 * Fetch con timeout - evita esperas largas si el servidor no responde
 * También detecta respuestas de cache del Service Worker (cogitator offline)
 */
async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        // Detectar si la respuesta viene del cache del SW (cogitator offline)
        if (response.headers.get('X-From-Cache') === 'true') {
            console.log('[FetchTimeout] Response from SW cache - cogitator offline');
            throw new Error('COGITATOR_CACHED');
        }

        // Detectar respuesta offline explícita del SW
        if (response.headers.get('X-Offline') === 'true') {
            console.log('[FetchTimeout] SW returned offline response');
            throw new Error('COGITATOR_OFFLINE');
        }

        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('COGITATOR_TIMEOUT');
        }
        throw error;
    }
}

/**
 * Verifica si el cogitator (servidor Obsidian) está disponible
 */
async function checkCogitatorStatus() {
    try {
        const response = await fetchWithTimeout('/api/health', {}, 2000);
        const wasOffline = !isCogitatorOnline;
        isCogitatorOnline = response.ok;

        if (wasOffline && isCogitatorOnline) {
            console.log('[Cogitator] Connection restored!');
            cogitatorListeners.forEach(cb => cb(true));
        }

        return isCogitatorOnline;
    } catch (error) {
        const wasOnline = isCogitatorOnline;
        isCogitatorOnline = false;

        if (wasOnline) {
            // Log específico según el tipo de error
            const errorType = error.message || 'unknown';
            if (errorType.includes('CACHED')) {
                console.log('[Cogitator] Connection lost - SW returning cached data');
            } else if (errorType.includes('TIMEOUT')) {
                console.log('[Cogitator] Connection lost - server timeout');
            } else {
                console.log('[Cogitator] Connection lost - server unavailable');
            }
            cogitatorListeners.forEach(cb => cb(false));
        }

        return false;
    }
}

/**
 * Actualiza estado de conexión de red
 */
function updateConnectionStatus(online) {
    isOnline = online;
    connectionListeners.forEach(callback => callback(online));
    console.log(`[Connection] Network: ${online ? 'ONLINE' : 'OFFLINE'}`);

    // Si recuperamos red, verificar cogitator
    if (online) {
        checkCogitatorStatus();
    } else {
        // Sin red = sin cogitator también
        isCogitatorOnline = false;
        cogitatorListeners.forEach(cb => cb(false));
    }
}

/**
 * Actualiza estado del cogitator manualmente
 */
function updateCogitatorStatus(online) {
    const changed = isCogitatorOnline !== online;
    isCogitatorOnline = online;

    if (changed) {
        console.log(`[Cogitator] Status: ${online ? 'ONLINE' : 'OFFLINE'}`);
        cogitatorListeners.forEach(cb => cb(online));
    }
}

window.addEventListener('online', () => updateConnectionStatus(true));
window.addEventListener('offline', () => updateConnectionStatus(false));

function onConnectionChange(callback) {
    connectionListeners.push(callback);
    // Call immediately with current status
    callback(isOnline);
}

function onCogitatorChange(callback) {
    cogitatorListeners.push(callback);
    // Call immediately with current status
    callback(isCogitatorOnline);
}

function getConnectionStatus() {
    return isOnline;
}

function getCogitatorStatus() {
    return isCogitatorOnline;
}

/**
 * Estado combinado: true solo si hay red Y cogitator disponible
 */
function isFullyOnline() {
    return isOnline && isCogitatorOnline;
}

// Export for use in other scripts
window.WhVaultDB = {
    STORES,
    initDB,
    saveToStore,
    getFromStore,
    getByKey,
    saveSyncMeta,
    getSyncMeta,
    hasCachedData,
    clearAllData,
    clearStore,
    // Connection status (network)
    onConnectionChange,
    getConnectionStatus,
    // Cogitator status (server availability)
    onCogitatorChange,
    getCogitatorStatus,
    checkCogitatorStatus,
    updateCogitatorStatus,
    isFullyOnline,
    fetchWithTimeout,
    // Cache-first functions
    cacheApiData,
    getCachedData,
    cacheIncursionData,
    getCachedIncursion,
    getLastUpdateTime,
    formatLastUpdate,
    hasAnyCachedData,
    // Sync Queue functions
    generateUUID,
    addToSyncQueue,
    getPendingSyncOperations,
    getPendingSyncCount,
    removeFromSyncQueue,
    markSyncOperationFailed,
    incrementSyncRetry,
    isDuplicateOperation,
    getSyncOperationById,
    onPendingChanges,
    // Cargo functions
    addCargoItem,
    getAllCargoItems,
    getPendingCargoItems,
    getPendingCargoCount,
    updateCargoStatus,
    removeCargoItem,
    clearOffloadedCargo,
    clearAllCargo,
    // Notas Sagradas functions
    addNota,
    getAllNotas,
    getNotaById,
    updateNota,
    removeNota,
    getNotasCount,
    // Avisos (Recordadora) functions
    addAviso,
    getAllAvisos,
    removeAviso,
    clearAvisos
};

// ==========================================
//  PWA INSTALL PROMPT
// ==========================================

let deferredInstallPrompt = null;
let installButtonCallbacks = [];
let installPromptPending = false; // Flag para mostrar banner cuando DOM esté listo

console.log('[PWA] ====== PWA INSTALL DEBUG ======');
console.log('[PWA] Display mode:', window.matchMedia('(display-mode: standalone)').matches ? 'standalone (INSTALLED)' : 'browser');
console.log('[PWA] Navigator standalone:', window.navigator.standalone);
console.log('[PWA] Is secure context:', window.isSecureContext);
console.log('[PWA] Protocol:', window.location.protocol);

// Detectar modo incógnito (aproximado)
const isLikelyIncognito = !window.indexedDB ||
    (navigator.storage && navigator.storage.estimate &&
     navigator.storage.estimate().then(e => e.quota < 120000000));
console.log('[PWA] Likely incognito mode:', isLikelyIncognito ? 'YES (install not available)' : 'No');

// Check if already installed
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    console.log('[PWA] App is already installed as PWA - banner will not show');
}

// Función para mostrar el banner de instalación
function showInstallBanner() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        console.log('[PWA] Showing install banner');
        installBtn.classList.remove('hidden');
        installPromptPending = false;
    } else {
        console.log('[PWA] Install button not in DOM yet, will show when ready');
        installPromptPending = true;
    }
}

// Listen for the install prompt event
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA] beforeinstallprompt event fired!');
    e.preventDefault();
    deferredInstallPrompt = e;

    // Don't show if already installed
    if (isPWAInstalled()) {
        console.log('[PWA] Already installed, not showing banner');
        return;
    }

    // Check if user dismissed it (con try-catch para incognito)
    try {
        if (localStorage.getItem('pwa-install-dismissed') === 'true') {
            console.log('[PWA] User dismissed banner previously');
            return;
        }
    } catch (e) {
        // localStorage no disponible en incognito en algunos browsers
        console.log('[PWA] localStorage not available');
    }

    // Notify all listeners that install is available
    installButtonCallbacks.forEach(cb => cb(true));

    // Intentar mostrar el banner
    showInstallBanner();
});

// Cuando el DOM esté listo, mostrar banner si estaba pendiente
document.addEventListener('DOMContentLoaded', () => {
    console.log('[PWA] DOM ready, checking install state...');
    console.log('[PWA] - installPromptPending:', installPromptPending);
    console.log('[PWA] - deferredInstallPrompt:', deferredInstallPrompt ? 'SET' : 'NULL');

    if (installPromptPending && deferredInstallPrompt) {
        console.log('[PWA] DOM ready, showing pending install banner');
        showInstallBanner();
    }

    // Debug: Check after 3 seconds if beforeinstallprompt never fired
    setTimeout(() => {
        if (!deferredInstallPrompt) {
            console.log('[PWA] ⚠️ beforeinstallprompt never fired after 3s');
            console.log('[PWA] Possible reasons:');
            console.log('[PWA] - App already installed');
            console.log('[PWA] - Incognito/private mode (install not available)');
            console.log('[PWA] - Not served over HTTPS');
            console.log('[PWA] - manifest.json issues');
            console.log('[PWA] - Browser doesn\'t support PWA install');
        }
    }, 3000);
});

// Listen for successful install
window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully');
    deferredInstallPrompt = null;

    // Hide install button
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.classList.add('hidden');
    }

    installButtonCallbacks.forEach(cb => cb(false));
});

// Function to trigger install
async function triggerPWAInstall() {
    if (!deferredInstallPrompt) {
        console.log('[PWA] No install prompt available');
        return false;
    }

    // Show the install prompt
    deferredInstallPrompt.prompt();

    // Wait for user response
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);

    // Clear the prompt
    deferredInstallPrompt = null;

    return outcome === 'accepted';
}

// Check if app is already installed
function isPWAInstalled() {
    // Check if running as standalone PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
    }
    // iOS Safari check
    if (window.navigator.standalone === true) {
        return true;
    }
    return false;
}

// Register callback for install button visibility
function onInstallAvailable(callback) {
    installButtonCallbacks.push(callback);
    // Immediately call if prompt is already available
    if (deferredInstallPrompt) {
        callback(true);
    }
}

// Debug function to check PWA status
function debugPWAStatus() {
    console.log('=== PWA Debug Info ===');
    console.log('Display mode standalone:', window.matchMedia('(display-mode: standalone)').matches);
    console.log('navigator.standalone (iOS):', window.navigator.standalone);
    console.log('Install prompt available:', deferredInstallPrompt !== null);
    console.log('Service Worker supported:', 'serviceWorker' in navigator);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            console.log('Service Worker registered:', !!reg);
            if (reg) {
                console.log('SW scope:', reg.scope);
                console.log('SW state:', reg.active ? 'active' : reg.waiting ? 'waiting' : reg.installing ? 'installing' : 'none');
            }
        });
    }

    // Check manifest
    const manifestLink = document.querySelector('link[rel="manifest"]');
    console.log('Manifest link found:', !!manifestLink);
    if (manifestLink) {
        console.log('Manifest href:', manifestLink.href);
    }

    return {
        isInstalled: isPWAInstalled(),
        canInstall: deferredInstallPrompt !== null,
        displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
    };
}

// Export PWA functions
window.WhVaultPWA = {
    triggerInstall: triggerPWAInstall,
    isInstalled: isPWAInstalled,
    onInstallAvailable: onInstallAvailable,
    debug: debugPWAStatus,
    get canInstall() { return deferredInstallPrompt !== null; }
};
