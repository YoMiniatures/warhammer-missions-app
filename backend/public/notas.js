/**
 * Notas Sagradas - Cuaderno de Bitácora
 * Sincronización con Obsidian + Fallback local
 *
 * NOTE: setFechaImperial, escapeHtml, formatTimeAgo, showToast
 * are defined in cargo.html shared utilities block
 */

let notasItems = [];
let editingNotaId = null;
let currentTipo = 'parchment'; // parchment | metallic
let pendingSync = [];

// DOM refs (prefixed to avoid conflicts with cargo.js)
const notasList = document.getElementById('notas-list');
const notasEmptyState = document.getElementById('notas-empty-state');
const notasCountBar = document.getElementById('notas-count-bar');
const notasCount = document.getElementById('notas-count');
const editorTitle = document.getElementById('editor-title');
const editorContent = document.getElementById('editor-content');
const tipoLabel = document.getElementById('tipo-label');
const btnTipo = document.getElementById('btn-tipo');
const notasEditor = document.getElementById('notas-editor');

// ── INIT ──────────────────────────────────────────────
// Note: DOMContentLoaded listener is shared with cargo.js
// We use a separate init call that cargo.html triggers after both scripts load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Notas] Initializing...');
    setupOnlineListeners();
    await cargarNotas();
});

function setupOnlineListeners() {
    if (window.WhVaultDB && window.WhVaultDB.onOnlineStateChange) {
        window.WhVaultDB.onOnlineStateChange(async (online) => {
            if (online) {
                console.log('[Notas] Online - syncing...');
                await syncPendingNotas();
                await cargarNotas();
            }
        });
    }
}

// ── LOAD & RENDER ─────────────────────────────────────
async function cargarNotas() {
    try {
        if (typeof isOnline !== 'undefined' && isOnline) {
            const response = await fetch('/api/notas');
            const data = await response.json();

            if (data.success) {
                notasItems = data.notas;
                console.log(`[Notas] Loaded ${notasItems.length} from Obsidian`);
                await cacheNotasLocally(notasItems);
            } else {
                throw new Error(data.error);
            }
        } else {
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

async function cacheNotasLocally(notas) {
    try {
        const existingNotas = await window.WhVaultDB.getAllNotas();
        for (const nota of existingNotas) {
            if (!nota.pendingSync) {
                await window.WhVaultDB.removeNota(nota.id);
            }
        }

        for (const nota of notas) {
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
    if (!notasList || !notasEmptyState || !notasCountBar) return;

    if (notasItems.length === 0) {
        notasEmptyState.classList.remove('hidden');
        notasList.classList.add('hidden');
        notasCountBar.classList.add('hidden');
        updateNotasOffloadState();
        return;
    }

    notasEmptyState.classList.add('hidden');
    notasList.classList.remove('hidden');
    notasCountBar.classList.remove('hidden');
    notasCount.textContent = notasItems.length;

    notasList.innerHTML = notasItems.map(nota => renderNotaCard(nota)).join('');
    updateNotasOffloadState();
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
        const nota = notasItems.find(n => n.id === id);
        if (!nota) return;
        editingNotaId = id;
        editorTitle.value = nota.title;
        editorContent.value = nota.content;
        currentTipo = nota.tipo || 'parchment';
    } else {
        editingNotaId = null;
        editorTitle.value = '';
        editorContent.value = '';
        currentTipo = 'parchment';
    }

    updateTipoUI();
    if (notasEditor) notasEditor.classList.remove('hidden');
    editorTitle.focus();
}

function cerrarEditor() {
    if (notasEditor) notasEditor.classList.add('hidden');
    editingNotaId = null;
}

function toggleTipo() {
    currentTipo = currentTipo === 'parchment' ? 'metallic' : 'parchment';
    updateTipoUI();
}

function updateTipoUI() {
    if (!btnTipo) return;
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

    const isOnlineNow = typeof isOnline !== 'undefined' ? isOnline : navigator.onLine;

    try {
        if (isOnlineNow) {
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
    const isOnlineNow = typeof isOnline !== 'undefined' ? isOnline : navigator.onLine;

    try {
        if (isOnlineNow) {
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

    const btn = document.getElementById('notas-btn-offload');
    if (!btn) return;
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

function updateNotasOffloadState() {
    const section = document.getElementById('notas-offload-section');
    if (!section) return;
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

// ── NOTAS-SPECIFIC UTILS ────────────────────────────────
function formatDateCode(timestamp) {
    if (!timestamp) return '-.-.M3';
    const d = new Date(timestamp);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${month}.${day.toString().padStart(2, '0')}.M3`;
}

// Make functions globally available
window.abrirEditor = abrirEditor;
window.cerrarEditor = cerrarEditor;
window.guardarNota = guardarNota;
window.toggleTipo = toggleTipo;
window.eliminarNotaActual = eliminarNotaActual;
window.confirmarEliminar = confirmarEliminar;
window.offloadNotas = offloadNotas;
