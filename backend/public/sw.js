// Warhammer Vault - Service Worker v19.0
// Duty+Reviews fusion (Inquisición merged into Duty)

const CACHE_VERSION = 'v169';
const STATIC_CACHE = `wh-vault-static-${CACHE_VERSION}`;
const API_CACHE = `wh-vault-api-${CACHE_VERSION}`;

// Background Sync config
const SYNC_TAG = 'wh-vault-sync';
const MAX_RETRIES = 3;

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/install.html',
    '/duty.html',
    '/directivas.html',
    '/directiva-detalle.html',
    '/auspex.html',
    '/cargo.html',
    '/economato.html',
    '/debug.html',
    '/app.js',
    '/duty.js',
    '/directivas.js',
    '/directiva-detalle.js',
    '/auspex.js',
    '/cargo.js',
    '/notas.js',
    '/recordadora.html',
    '/recordadora.js',
    '/voidmap.html',
    '/voidmap.js',
    '/planeta-detalle.html',
    '/planeta-detalle.js',
    '/inquisicion.js',
    '/bahia-medica.html',
    '/bahia-medica.js',
    '/economato.js',
    '/trackers.js',
    '/moral.js',
    '/db.js',
    '/sync-utils.js',
    '/manifest.json',
    '/assets/icons/icon.svg',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png',
    '/assets/ship.glb',
    '/assets/skybox.jpg',
    '/assets/medbay-scan.jpg',
    '/nipplejs.min.js'
];

// HTML pages for navigation fallback
const HTML_PAGES = ['/', '/index.html', '/install.html', '/duty.html', '/directivas.html', '/directiva-detalle.html', '/auspex.html', '/cargo.html', '/economato.html', '/recordadora.html', '/voidmap.html', '/planeta-detalle.html', '/bahia-medica.html'];

// Install - pre-cache all static assets
self.addEventListener('install', (event) => {
    console.log('[SW v9] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW v9] Pre-caching assets...');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => {
                console.log('[SW v9] Pre-cache complete');
                // Force immediate activation
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW v9] Pre-cache failed:', error);
            })
    );
});

// Activate - clean old caches and take control immediately
self.addEventListener('activate', (event) => {
    console.log('[SW v9] Activating...');
    event.waitUntil(
        Promise.all([
            // Clean old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('wh-vault-') &&
                                         name !== STATIC_CACHE &&
                                         name !== API_CACHE)
                        .map((name) => {
                            console.log('[SW v9] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            }),
            // Take control immediately
            self.clients.claim()
        ]).then(() => {
            console.log('[SW v9] Now controlling all clients');
        })
    );
});

// Fetch - handle all requests with offline-first for static
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle same-origin GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other protocols
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Handle navigation requests (opening the app)
    if (event.request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(event.request));
        return;
    }

    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(event.request));
        return;
    }

    // Handle static assets
    event.respondWith(handleStaticRequest(event.request));
});

/**
 * Handle navigation requests - CACHE FIRST, critical for offline PWA
 */
async function handleNavigationRequest(request) {
    const url = new URL(request.url);
    console.log('[SW v9] Navigation request:', url.pathname);

    try {
        const cache = await caches.open(STATIC_CACHE);

        // Try to find the exact page in cache
        let cachedResponse = await cache.match(url.pathname);

        // If not found, try matching with /index.html for root
        if (!cachedResponse && (url.pathname === '/' || url.pathname === '')) {
            cachedResponse = await cache.match('/index.html');
        }

        // If we have cached content, serve it
        if (cachedResponse) {
            console.log('[SW v9] Serving navigation from cache:', url.pathname);
            // Try to update in background (don't await)
            fetch(request).then(response => {
                if (response.ok) {
                    cache.put(request, response);
                }
            }).catch(() => {});
            return cachedResponse;
        }

        // No cache, try network
        console.log('[SW v9] No cache for navigation, trying network');
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;

    } catch (error) {
        console.log('[SW v9] Navigation failed, serving fallback:', error.message);

        // Network failed, try to serve any cached HTML
        const cache = await caches.open(STATIC_CACHE);
        const fallback = await cache.match('/index.html');

        if (fallback) {
            return fallback;
        }

        // Absolute last resort
        return new Response('Offline - App not cached. Please connect to install.', {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
        });
    }
}

/**
 * Handle API requests - Network first, cache fallback
 */
async function handleApiRequest(request) {
    const cache = await caches.open(API_CACHE);

    try {
        // Try network first
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Clone and cache the response
            cache.put(request, networkResponse.clone());
            console.log('[SW v9] API cached:', request.url);
        }

        return networkResponse;

    } catch (error) {
        console.log('[SW v9] Network failed, checking cache:', request.url);

        // Network failed, try cache
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            console.log('[SW v9] Serving API from cache:', request.url);

            // Clone response and add header to indicate it's from cache
            const headers = new Headers(cachedResponse.headers);
            headers.set('X-From-Cache', 'true');

            return new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers: headers
            });
        }

        // No cache available - return offline response
        console.log('[SW v9] No cache for API:', request.url);
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Offline - No cached data',
                offline: true,
                misiones: [],
                directivas: [],
                eventos: []
            }),
            {
                status: 200, // Return 200 so the app can handle it
                headers: {
                    'Content-Type': 'application/json',
                    'X-Offline': 'true'
                }
            }
        );
    }
}

/**
 * Handle static requests - Cache first, network fallback
 */
async function handleStaticRequest(request) {
    const cache = await caches.open(STATIC_CACHE);

    // For HTML navigation requests, always try cache first
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            console.log('[SW v9] Serving HTML from cache:', request.url);
            // Update cache in background
            fetchAndCache(request, cache);
            return cachedResponse;
        }

        // Try network
        try {
            const networkResponse = await fetch(request);
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch (error) {
            // Offline and no cache - try to serve index.html as fallback
            console.log('[SW v9] Offline, serving index.html fallback');
            const fallback = await cache.match('/index.html');
            if (fallback) {
                return fallback;
            }
            return new Response('Offline - Page not cached', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    }

    // For other assets - cache first
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        // Update in background
        fetchAndCache(request, cache);
        return cachedResponse;
    }

    // Not in cache, try network
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW v9] Asset not available:', request.url);
        return new Response('Offline', { status: 503 });
    }
}

/**
 * Fetch and update cache in background
 */
async function fetchAndCache(request, cache) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response);
        }
    } catch (error) {
        // Silently fail - we already served from cache
    }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
    console.log('[SW v9] Message received:', event.data);

    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }

    if (event.data === 'clearCache') {
        caches.delete(STATIC_CACHE);
        caches.delete(API_CACHE);
        console.log('[SW v9] All caches cleared');
    }
});

// ==========================================
//  BACKGROUND SYNC
// ==========================================

/**
 * Handle sync events (triggered when connection restored)
 */
self.addEventListener('sync', (event) => {
    console.log('[SW v9] Sync event received:', event.tag);

    if (event.tag === SYNC_TAG) {
        event.waitUntil(processSyncQueue());
    }
});

/**
 * Process all pending operations in the sync queue
 */
async function processSyncQueue() {
    console.log('[SW v9] Processing sync queue...');

    try {
        const db = await openSyncDB();
        const operations = await getPendingOperationsFromDB(db);

        console.log(`[SW v9] Found ${operations.length} pending operations`);

        let successCount = 0;
        let failCount = 0;

        for (const operation of operations) {
            try {
                await processOperation(operation, db);
                successCount++;
            } catch (error) {
                console.error(`[SW v9] Failed to process operation ${operation.id}:`, error);
                failCount++;

                // Increment retry count
                const retries = await incrementRetryInDB(db, operation.id);

                if (retries >= MAX_RETRIES) {
                    console.log(`[SW v9] Max retries reached for ${operation.id}, marking as failed`);
                    await markFailedInDB(db, operation.id);
                }
            }
        }

        // Notify all clients about sync completion
        await notifyClients('sync-complete', { successCount, failCount });

        console.log(`[SW v9] Sync complete: ${successCount} succeeded, ${failCount} failed`);

    } catch (error) {
        console.error('[SW v9] Sync queue processing failed:', error);
        throw error; // Re-throw so browser knows to retry
    }
}

/**
 * Process a single operation
 */
async function processOperation(operation, db) {
    console.log(`[SW v9] Processing: ${operation.type} (${operation.id})`);

    const response = await fetch(operation.endpoint, {
        method: operation.method,
        headers: {
            'Content-Type': 'application/json',
            'X-Sync-Operation': operation.id,
            'X-Client-Timestamp': operation.timestamp.toString()
        },
        body: JSON.stringify(operation.body)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success) {
        // Operation successful, remove from queue
        await removeOperationFromDB(db, operation.id);
        console.log(`[SW v9] Operation ${operation.id} completed successfully`);

        // Notify client about successful operation
        await notifyClients('operation-success', {
            operationId: operation.id,
            type: operation.type,
            result: data
        });
    } else {
        throw new Error(data.error || 'Operation failed');
    }
}

// ==========================================
//  INDEXEDDB HELPERS (for Service Worker)
// ==========================================

const DB_NAME = 'wh-vault-db';
const DB_VERSION = 2;
const SYNC_QUEUE_STORE = 'sync-queue';

/**
 * Open IndexedDB from Service Worker
 */
function openSyncDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        // Handle upgrade if needed (shouldn't happen normally, main thread creates it)
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
                const store = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('status', 'status', { unique: false });
            }
        };
    });
}

/**
 * Get all pending operations ordered by timestamp
 */
function getPendingOperationsFromDB(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SYNC_QUEUE_STORE, 'readonly');
        const store = transaction.objectStore(SYNC_QUEUE_STORE);
        const index = store.index('timestamp');
        const request = index.getAll();

        request.onsuccess = () => {
            const ops = request.result.filter(op => op.status === 'pending');
            resolve(ops);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Remove operation from queue
 */
function removeOperationFromDB(db, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
        const store = transaction.objectStore(SYNC_QUEUE_STORE);
        store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Increment retry counter
 */
function incrementRetryInDB(db, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
        const store = transaction.objectStore(SYNC_QUEUE_STORE);
        const request = store.get(id);

        request.onsuccess = () => {
            const op = request.result;
            if (op) {
                op.retries = (op.retries || 0) + 1;
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
 * Mark operation as failed
 */
function markFailedInDB(db, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
        const store = transaction.objectStore(SYNC_QUEUE_STORE);
        const request = store.get(id);

        request.onsuccess = () => {
            const op = request.result;
            if (op) {
                op.status = 'failed';
                store.put(op);
            }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Notify all open tabs/windows about sync events
 */
async function notifyClients(type, data = {}) {
    const clients = await self.clients.matchAll({ type: 'window' });

    clients.forEach(client => {
        client.postMessage({
            type: type,
            ...data
        });
    });

    console.log(`[SW v9] Notified ${clients.length} clients: ${type}`);
}
