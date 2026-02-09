/**
 * Recordadora - Orbe de Reminiscencia
 * Simple quotes/phrases stored in IndexedDB
 * Tap to edit, delete. That's it.
 */

let memos = [];
let editingId = null; // null = creating, string = editing

document.addEventListener('DOMContentLoaded', () => {
    setFechaImperial();
    cargarMemos();
});

function setFechaImperial() {
    const el = document.getElementById('fecha-imperial');
    if (!el) return;
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const fraction = Math.floor((dayOfYear / 365) * 1000);
    el.textContent = `0.${String(fraction).padStart(3, '0')}.${now.getFullYear()}.M3`;
}

// ==========================================
//  LOAD & RENDER
// ==========================================

async function cargarMemos() {
    try {
        memos = await window.WhVaultDB.getAllAvisos();
    } catch (e) {
        console.error('[Recordadora] Error loading:', e);
        memos = [];
    }
    renderMemos();
}

function renderMemos() {
    const container = document.getElementById('shards-container');
    const emptyState = document.getElementById('empty-state');
    const countIndicator = document.getElementById('count-indicator');
    const countEl = document.getElementById('memo-count');

    container.innerHTML = '';

    if (memos.length === 0) {
        emptyState.classList.remove('hidden');
        countIndicator.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    countIndicator.classList.remove('hidden');
    countEl.textContent = memos.length;

    const maxShards = Math.min(memos.length, 6);
    for (let i = 0; i < maxShards; i++) {
        container.appendChild(crearShard(memos[i], i));
    }

    if (memos.length > 6) {
        const overflow = document.createElement('div');
        overflow.className = 'absolute bottom-4 right-4 pointer-events-auto z-20';
        overflow.innerHTML = `
            <div class="bg-[#1a1718] border border-secondary/30 px-3 py-1.5 rounded text-[10px] font-mono text-secondary/70 uppercase tracking-wider">
                +${memos.length - 6} more
            </div>
        `;
        container.appendChild(overflow);
    }
}

function crearShard(memo, index) {
    const shard = document.createElement('div');
    shard.className = `parchment-shard absolute w-28 p-2.5 pointer-events-auto shard-pos-${index}`;
    shard.onclick = () => abrirEditar(memo);

    // Truncate text for shard display
    const texto = memo.titulo || memo.descripcion || '';
    const truncated = texto.length > 50 ? texto.substring(0, 50) + '...' : texto;

    shard.innerHTML = `<p class="text-[9px] font-gothic text-[#2D2D30] leading-tight">${truncated}</p>`;
    return shard;
}

// ==========================================
//  CREATE
// ==========================================

function abrirCrear() {
    editingId = null;
    document.getElementById('editor-title').innerHTML = '<span class="text-primary">+</span> Nuevo Memorandum';
    document.getElementById('input-texto').value = '';
    document.getElementById('btn-eliminar').classList.add('hidden');
    document.getElementById('modal-editor').classList.remove('hidden');
    document.getElementById('input-texto').focus();
}

// ==========================================
//  EDIT
// ==========================================

function abrirEditar(memo) {
    editingId = memo.id;
    document.getElementById('editor-title').innerHTML = '<span class="text-secondary">~</span> Editar Memorandum';
    document.getElementById('input-texto').value = memo.titulo || memo.descripcion || '';
    document.getElementById('btn-eliminar').classList.remove('hidden');
    document.getElementById('modal-editor').classList.remove('hidden');
    document.getElementById('input-texto').focus();
}

function cerrarEditor() {
    document.getElementById('modal-editor').classList.add('hidden');
    editingId = null;
}

// ==========================================
//  SAVE
// ==========================================

async function guardarMemo() {
    const texto = document.getElementById('input-texto').value.trim();
    if (!texto) {
        showToast('Escribe algo, Lord Capitan', 'warning');
        return;
    }

    try {
        if (editingId) {
            // Update existing
            await window.WhVaultDB.addAviso({
                id: editingId,
                titulo: texto,
                descripcion: texto,
                timestamp: Date.now()
            });
            showToast('Memorandum actualizado', 'verified');
        } else {
            // Create new
            await window.WhVaultDB.addAviso({
                titulo: texto,
                descripcion: texto,
                timestamp: Date.now()
            });
            showToast('Memorandum sellado', 'verified');
        }

        cerrarEditor();
        await cargarMemos();
    } catch (error) {
        console.error('[Recordadora] Save error:', error);
        showToast('Error al guardar', 'error');
    }
}

// ==========================================
//  DELETE
// ==========================================

async function eliminarMemo() {
    if (!editingId) return;

    try {
        await window.WhVaultDB.removeAviso(editingId);
        showToast('Memorandum purgado', 'delete_forever');
        cerrarEditor();
        await cargarMemos();
    } catch (error) {
        console.error('[Recordadora] Delete error:', error);
        showToast('Error al purgar', 'error');
    }
}

// ==========================================
//  TOAST
// ==========================================

function showToast(message, icon) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastText = document.getElementById('toast-text');

    toastIcon.textContent = icon;
    toastIcon.className = `material-symbols-outlined text-lg ${icon === 'verified' ? 'text-data-green' : icon === 'warning' ? 'text-yellow-500' : 'text-primary'}`;
    toastText.textContent = message;

    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}
