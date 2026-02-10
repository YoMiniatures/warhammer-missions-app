/**
 * Notas Sagradas - Cuaderno de Bitácora
 * Sincronización con Obsidian + Fallback local
 */

let notasItems = [];
let editingNotaId = null;
let currentTipo = 'parchment'; // parchment | metallic
// Use isOnline from db.js (already declared globally)
let pendingSync = []; // Notas pendientes de sincronizar

// DOM refs
const vistaLista = document.getElementById('vista-lista');
const vistaEditor = document.getElementById('vista-editor');
const notasList = document.getElementById('notas-list');
const emptyState = document.getElementById('empty-state');
const countBar = document.getElementById('count-bar');
const notasCount = document.getElementById('notas-count');
const editorTitle = document.getElementById('editor-title');
const editorContent = document.getElementById('editor-content');
const tipoLabel = document.getElementById('tipo-label');
const btnTipo = document.getElementById('btn-tipo');

// ── INIT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setFechaImperial();
    setupOnlineListeners();
    await cargarNotas();
});

function setFechaImperial() {
    const el = document.getElementById('fecha-imperial');
    if (!el) return;
    const now = new Date();
    const dias = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const diaSemana = dias[now.getDay()];
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = meses[now.getMonth()];
    el.textContent = `+++ ${diaSemana} ${dia} ${mes} +++`;
}

function setupOnlineListeners() {
    // Use db.js online state change callback
    if (window.WhVaultDB && window.WhVaultDB.onOnlineStateChange) {
        window.WhVaultDB.onOnlineStateChange(async (online) => {
            if (online) {
                console.log('[Notas] Online - syncing...');
                showToast('Vox-link restored', 'success');
                await syncPendingNotas();
                await cargarNotas();
            } else {
                console.log('[Notas] Offline mode');
                showToast('Offline mode - local storage active', 'error');
            }
        });
    }
}

// ── LOAD & RENDER ─────────────────────────────────────
async function cargarNotas() {
    try {
        if (isOnline) {
            // Try to load from API (Obsidian)
            const response = await fetch('/api/notas');
            const data = await response.json();

            if (data.success) {
                notasItems = data.notas;
                console.log(`[Notas] Loaded ${notasItems.length} from Obsidian`);

                // Cache in IndexedDB for offline use
                await cacheNotasLocally(notasItems);
            } else {
                throw new Error(data.error);
            }
        } else {
            // Offline: Load from IndexedDB cache
            notasItems = await window.WhVaultDB.getAllNotas();
            console.log(`[Notas] Loaded ${notasItems.length} from local cache (offline)`);
        }
    } catch (e) {
        console.error('[Notas] Error loading from API, falling back to local:', e);
        try {
            notasItems = await window.WhVaultDB.getAllNotas();
            console.log(`[Notas] Fallback: Loaded ${notasItems.length} from local cache`);
        } catch (e2) {
            console.error('[Notas] Local load also failed:', e2);
            notasItems = [];
        }
    }
    renderNotas();
}

// Cache notas from API to IndexedDB for offline access
async function cacheNotasLocally(notas) {
    try {
        // Clear old cache
        const existingNotas = await window.WhVaultDB.getAllNotas();
        for (const nota of existingNotas) {
            if (!nota.pendingSync) {
                await window.WhVaultDB.removeNota(nota.id);
            }
        }

        // Add fresh data from API
        for (const nota of notas) {
            // Check if already exists locally with pending sync
            const existing = existingNotas.find(n => n.id === nota.id && n.pendingSync);
            if (!existing) {
                await window.WhVaultDB.addNota({
                    id: nota.id,
                    title: nota.title,
                    content: nota.content,
                    tipo: nota.tipo,
                    timestamp: nota.timestamp,
                    pendingSync: false,
                    cachedFromApi: true
                });
            }
        }
        console.log(`[Notas] Cached ${notas.length} notas locally`);
    } catch (e) {
        console.error('[Notas] Error caching locally:', e);
    }
}

function renderNotas() {
    if (notasItems.length === 0) {
        emptyState.classList.remove('hidden');
        notasList.classList.add('hidden');
        countBar.classList.add('hidden');
        updateOffloadState();
        return;
    }

    emptyState.classList.add('hidden');
    notasList.classList.remove('hidden');
    countBar.classList.remove('hidden');
    notasCount.textContent = notasItems.length;

    notasList.innerHTML = notasItems.map(nota => renderNotaCard(nota)).join('');
    updateOffloadState();
}

function renderNotaCard(nota) {
    const timeAgo = formatTimeAgo(nota.timestamp);
    const preview = (nota.content || '').substring(0, 150);
    const dateCode = formatDateCode(nota.timestamp);
    const isPending = nota.pendingSync === true;

    if (nota.tipo === 'parchment') {
        return `
            <div class="parchment-texture p-4 rounded-sm relative overflow-hidden border-b-4 border-black/20 cursor-pointer active:scale-[0.98] transition-transform" onclick="abrirEditor('${nota.id}')">
                <div class="absolute top-0 right-0 p-1 opacity-20">
                    <span class="material-symbols-outlined text-black text-4xl">shield_lock</span>
                </div>
                ${isPending ? '<div class="absolute top-2 left-2"><span class="w-2 h-2 bg-yellow-500 rounded-full inline-block animate-pulse" title="Pending sync"></span></div>' : ''}
                <h4 class="font-handwritten text-lg text-red-950 font-bold leading-tight border-b border-black/10 pb-1 mb-2">${escapeHtml(nota.title)}</h4>
                <p class="font-handwritten text-red-900 text-sm italic leading-relaxed">${escapeHtml(preview)}${nota.content && nota.content.length > 150 ? '...' : ''}</p>
                <div class="mt-3 flex items-center justify-between border-t border-black/5 pt-2">
                    <span class="text-[8px] font-mono text-red-950/60 font-bold uppercase tracking-widest">Recorded: ${dateCode}</span>
                    <span class="text-[8px] font-mono text-red-950/40 uppercase">${timeAgo}</span>
                </div>
                <button onclick="event.stopPropagation(); confirmarEliminar('${nota.id}')" class="absolute top-2 right-2 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity p-1">
                    <span class="material-symbols-outlined text-red-900 text-sm">close</span>
                </button>
            </div>
        `;
    } else {
        return `
            <div class="metallic-slate p-4 rounded-sm relative cursor-pointer active:scale-[0.98] transition-transform" onclick="abrirEditor('${nota.id}')">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-data-green font-display text-sm font-bold uppercase tracking-tight data-glow">${escapeHtml(nota.title)}</h4>
                    <span class="text-primary material-symbols-outlined text-sm">terminal</span>
                </div>
                ${isPending ? '<div class="absolute top-2 left-2"><span class="w-2 h-2 bg-yellow-500 rounded-full inline-block animate-pulse" title="Pending sync"></span></div>' : ''}
                <div class="bg-black/40 p-2 border border-white/5 rounded-sm">
                    <p class="text-gray-400 text-xs font-mono leading-relaxed">${escapeHtml(preview)}${nota.content && nota.content.length > 150 ? '...' : ''}</p>
                </div>
                <div class="mt-3 flex items-center gap-4">
                    <div class="flex items-center gap-1">
                        <span class="w-1.5 h-1.5 bg-data-green rounded-full animate-pulse"></span>
                        <span class="text-[8px] font-mono text-data-green/70 uppercase">Data Intact</span>
                    </div>
                    <span class="text-[8px] font-mono text-gray-500 uppercase italic">${dateCode}</span>
                    <span class="text-[8px] font-mono text-gray-600 uppercase">${timeAgo}</span>
                </div>
                <button onclick="event.stopPropagation(); confirmarEliminar('${nota.id}')" class="absolute top-2 right-2 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity p-1">
                    <span class="material-symbols-outlined text-gray-500 text-sm">close</span>
                </button>
            </div>
        `;
    }
}

// ── EDITOR ─────────────────────────────────────────────
function abrirEditor(id) {
    if (id) {
        // Edit existing
        const nota = notasItems.find(n => n.id === id);
        if (!nota) return;
        editingNotaId = id;
        editorTitle.value = nota.title;
        editorContent.value = nota.content;
        currentTipo = nota.tipo || 'parchment';
    } else {
        // New note
        editingNotaId = null;
        editorTitle.value = '';
        editorContent.value = '';
        currentTipo = 'parchment';
    }

    updateTipoUI();
    vistaLista.classList.add('hidden');
    vistaEditor.classList.remove('hidden');
    editorTitle.focus();
}

function cerrarEditor() {
    vistaEditor.classList.add('hidden');
    vistaLista.classList.remove('hidden');
    editingNotaId = null;
}

function toggleTipo() {
    currentTipo = currentTipo === 'parchment' ? 'metallic' : 'parchment';
    updateTipoUI();
}

function updateTipoUI() {
    const icon = btnTipo.querySelector('.material-symbols-outlined');
    if (currentTipo === 'parchment') {
        tipoLabel.textContent = 'Parchment';
        icon.textContent = 'description';
        icon.className = 'material-symbols-outlined text-parchment text-lg group-hover:scale-110 transition-transform';
    } else {
        tipoLabel.textContent = 'Data-Slate';
        icon.textContent = 'terminal';
        icon.className = 'material-symbols-outlined text-data-green text-lg group-hover:scale-110 transition-transform';
    }
}

async function guardarNota() {
    const title = editorTitle.value.trim();
    const content = editorContent.value.trim();

    if (!title && !content) {
        showToast('Inscribe title or content, scribe', 'error');
        return;
    }

    try {
        if (isOnline) {
            // Save to Obsidian via API
            if (editingNotaId) {
                const response = await fetch(`/api/notas/${encodeURIComponent(editingNotaId)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title || 'Sin designación',
                        content: content,
                        tipo: currentTipo
                    })
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.error);
                showToast('Scroll updated in Obsidian', 'success');
            } else {
                const response = await fetch('/api/notas/crear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title || 'Sin designación',
                        content: content,
                        tipo: currentTipo
                    })
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.error);
                showToast('New scroll sealed in Obsidian', 'success');
            }
        } else {
            // Offline: Save to IndexedDB with pending flag
            if (editingNotaId) {
                await window.WhVaultDB.updateNota(editingNotaId, {
                    title: title || 'Sin designación',
                    content: content,
                    tipo: currentTipo,
                    pendingSync: true
                });
                showToast('Scroll updated locally (pending sync)', 'success');
            } else {
                await window.WhVaultDB.addNota({
                    title: title || 'Sin designación',
                    content: content,
                    tipo: currentTipo,
                    pendingSync: true
                });
                showToast('New scroll saved locally (pending sync)', 'success');
            }
        }

        cerrarEditor();
        await cargarNotas();
    } catch (e) {
        console.error('[Notas] Error saving:', e);
        // Fallback to local if API fails
        try {
            if (editingNotaId) {
                await window.WhVaultDB.updateNota(editingNotaId, {
                    title: title || 'Sin designación',
                    content: content,
                    tipo: currentTipo,
                    pendingSync: true
                });
            } else {
                await window.WhVaultDB.addNota({
                    title: title || 'Sin designación',
                    content: content,
                    tipo: currentTipo,
                    pendingSync: true
                });
            }
            showToast('Saved locally (will sync when online)', 'success');
            cerrarEditor();
            await cargarNotas();
        } catch (e2) {
            showToast('Cogitator error — data not saved', 'error');
        }
    }
}

// ── SYNC PENDING ────────────────────────────────────────
async function syncPendingNotas() {
    try {
        const localNotas = await window.WhVaultDB.getAllNotas();
        const pendingNotas = localNotas.filter(n => n.pendingSync === true);

        if (pendingNotas.length === 0) return;

        console.log(`[Notas] Syncing ${pendingNotas.length} pending notes...`);

        for (const nota of pendingNotas) {
            try {
                const response = await fetch('/api/notas/offload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: nota.title,
                        content: nota.content,
                        tipo: nota.tipo,
                        timestamp: nota.timestamp
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // Remove from local after successful sync
                    await window.WhVaultDB.removeNota(nota.id);
                    console.log(`[Notas] Synced: ${nota.title}`);
                }
            } catch (e) {
                console.error(`[Notas] Failed to sync: ${nota.title}`, e);
            }
        }

        showToast('Pending scrolls synced to Obsidian', 'success');
    } catch (e) {
        console.error('[Notas] Sync error:', e);
    }
}

// ── DELETE ──────────────────────────────────────────────
function confirmarEliminar(id) {
    const nota = notasItems.find(n => n.id === id);
    if (!nota) return;

    if (confirm(`¿Purgar "${nota.title}" del cogitador?`)) {
        eliminarNota(id);
    }
}

async function eliminarNota(id) {
    try {
        if (isOnline) {
            const response = await fetch(`/api/notas/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error);
            showToast('Scroll purged from Obsidian', 'success');
        } else {
            await window.WhVaultDB.removeNota(id);
            showToast('Scroll purged locally', 'success');
        }
        await cargarNotas();
    } catch (e) {
        console.error('[Notas] Error deleting:', e);
        // Try local delete as fallback
        try {
            await window.WhVaultDB.removeNota(id);
            showToast('Scroll purged locally', 'success');
            await cargarNotas();
        } catch (e2) {
            showToast('Purge failed', 'error');
        }
    }
}

async function eliminarNotaActual() {
    if (!editingNotaId) {
        // New note, just close
        cerrarEditor();
        return;
    }

    if (confirm('¿Purgar esta nota del cogitador?')) {
        await eliminarNota(editingNotaId);
        cerrarEditor();
    }
}

// ── OFFLOAD (Manual sync of local notes) ────────────────
async function offloadNotas() {
    if (!navigator.onLine) {
        showToast('No vox-link connection', 'error');
        return;
    }

    // Get local notes with pending sync
    let localNotas = [];
    try {
        localNotas = await window.WhVaultDB.getAllNotas();
    } catch (e) {
        console.error('[Notas] Error getting local notes:', e);
    }

    if (localNotas.length === 0) {
        showToast('No local scrolls to offload', 'error');
        return;
    }

    const btn = document.getElementById('btn-offload');
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
        <div class="absolute inset-0 scanlines opacity-20"></div>
        <span class="material-symbols-outlined text-white text-2xl animate-spin">sync</span>
        <span class="text-white font-display font-bold tracking-[0.2em] text-sm uppercase">Transmitting...</span>
    `;

    let successCount = 0;
    let failCount = 0;

    for (const nota of localNotas) {
        try {
            const response = await fetch('/api/notas/offload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: nota.title,
                    content: nota.content,
                    tipo: nota.tipo,
                    timestamp: nota.timestamp
                })
            });

            const data = await response.json();

            if (data.success) {
                await window.WhVaultDB.removeNota(nota.id);
                successCount++;
            } else {
                failCount++;
            }
        } catch (e) {
            console.error(`[Notas] Error offloading ${nota.id}:`, e);
            failCount++;
        }
    }

    await cargarNotas();
    btn.disabled = false;
    btn.innerHTML = originalHTML;

    if (failCount === 0) {
        showToast(`${successCount} scrolls sealed in Obsidian`, 'success');
    } else {
        showToast(`${successCount} offloaded, ${failCount} failed`, 'error');
    }
}

function updateOffloadState() {
    const section = document.getElementById('offload-section');
    // Show offload button ONLY if there are notes with pendingSync: true
    window.WhVaultDB.getAllNotas().then(localNotas => {
        const pendingNotas = localNotas.filter(n => n.pendingSync === true);
        if (pendingNotas.length > 0) {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    }).catch(() => {
        section.classList.add('hidden');
    });
}

// ── UTILS ──────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(timestamp).toLocaleDateString('es-ES');
}

function formatDateCode(timestamp) {
    if (!timestamp) return '-.-.M3';
    const d = new Date(timestamp);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${month}.${day.toString().padStart(2, '0')}.M3`;
}

// ── TOAST ──────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const text = document.getElementById('toast-text');

    text.textContent = message;

    if (type === 'success') {
        icon.textContent = 'verified';
        icon.className = 'material-symbols-outlined text-lg text-data-green';
        text.className = 'text-data-green';
    } else {
        icon.textContent = 'error';
        icon.className = 'material-symbols-outlined text-lg text-primary';
        text.className = 'text-primary';
    }

    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}
