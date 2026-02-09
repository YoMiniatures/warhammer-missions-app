/**
 * Warhammer Vault - Cargo (Local Notepad)
 * Data blocks stored locally, offloaded to Obsidian when online
 */

// DOM Elements
const cargoList = document.getElementById('cargo-list');
const emptyState = document.getElementById('empty-state');
const cargoCountBar = document.getElementById('cargo-count-bar');
const cargoCount = document.getElementById('cargo-count');
const offloadContainer = document.getElementById('offload-container');
const btnOffload = document.getElementById('btn-offload');
const offloadStatus = document.getElementById('offload-status');
const modalAdd = document.getElementById('modal-add');
const inputTitle = document.getElementById('input-title');
const inputContent = document.getElementById('input-content');
const fabAdd = document.getElementById('fab-add');

// State
let cargoItems = [];

/**
 * Initialize
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Cargo] Initializing...');

    // Set imperial date
    setFechaImperial();

    // Init sync listeners
    if (window.WhVaultSync) {
        window.WhVaultSync.initSyncListeners();
    }

    // Registrar para cambios de cogitator
    if (window.WhVaultDB?.onCogitatorChange) {
        window.WhVaultDB.onCogitatorChange((online) => {
            updateConnectionUI(online);
        });
    }

    // Load cargo (datos locales)
    await cargarCargo();

    // Verificar estado cogitator DESPUÉS de cargar contenido (sin bloquear)
    if (window.WhVaultDB?.checkCogitatorStatus) {
        window.WhVaultDB.checkCogitatorStatus().then(online => {
            updateConnectionUI(online);
        });
    }

    // Setup event listeners
    setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // FAB button
    fabAdd.addEventListener('click', abrirModal);

    // Offload button
    btnOffload.addEventListener('click', offloadCargo);

    // Connection change
    window.addEventListener('online', () => updateConnectionUI(true));
    window.addEventListener('offline', () => updateConnectionUI(false));
}

/**
 * Load cargo from IndexedDB
 */
async function cargarCargo() {
    try {
        cargoItems = await window.WhVaultDB.getPendingCargoItems();
        console.log(`[Cargo] Loaded ${cargoItems.length} items`);
        renderCargo();
    } catch (error) {
        console.error('[Cargo] Error loading:', error);
        cargoItems = [];
        renderCargo();
    }
}

/**
 * Render cargo items
 */
function renderCargo() {
    if (cargoItems.length === 0) {
        emptyState.classList.remove('hidden');
        cargoList.classList.add('hidden');
        cargoCountBar.classList.add('hidden');
        offloadContainer.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    cargoList.classList.remove('hidden');
    cargoCountBar.classList.remove('hidden');
    offloadContainer.classList.remove('hidden');

    // Update count
    cargoCount.textContent = cargoItems.length;

    // Render items
    cargoList.innerHTML = cargoItems.map(item => renderCargoItem(item)).join('');

    // Update offload button state
    updateOffloadState();
}

/**
 * Render single cargo item
 */
function renderCargoItem(item) {
    const icon = getItemIcon(item);
    const statusBadge = getStatusBadge(item.status);
    const timeAgo = formatTimeAgo(item.timestamp);
    const preview = item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '');
    const itemId = `cargo-${item.id}`;

    return `
        <div id="${itemId}" class="group relative bg-[#1e1617] border border-[#332224] rounded-sm p-3 flex gap-4 hover:border-primary/40 transition-colors shadow-inner">
            <!-- Corner decoration -->
            <div class="absolute top-0 right-0 w-8 h-8 pointer-events-none">
                <div class="absolute top-0 right-0 border-t-2 border-r-2 border-secondary/30 w-full h-full"></div>
            </div>

            <!-- Icon -->
            <div class="flex-shrink-0 flex items-start pt-1">
                <div class="size-10 bg-[#261b1d] border border-primary/30 rounded flex items-center justify-center">
                    <span class="material-symbols-outlined text-secondary text-2xl">${icon}</span>
                </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start gap-2">
                    <h4 class="text-white text-sm font-bold font-display uppercase tracking-tight truncate pr-2">${escapeHtml(item.title)}</h4>
                    ${statusBadge}
                </div>
                <p class="text-gray-400 text-xs mt-1 line-clamp-2 italic font-body">"${escapeHtml(preview)}"</p>
                <div class="mt-2 flex items-center justify-between">
                    <span class="text-[9px] text-gray-500 font-mono">ID: ${item.id.substring(0, 8).toUpperCase()}</span>
                    <button onclick="eliminarCargo('${item.id}')" class="text-gray-600 hover:text-primary text-[9px] font-mono uppercase flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span class="material-symbols-outlined text-xs">delete</span>
                        Purge
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Get icon based on content
 */
function getItemIcon(item) {
    const content = (item.title + ' ' + item.content).toLowerCase();

    if (content.includes('http') || content.includes('www') || content.includes('link')) {
        return 'language';
    }
    if (content.includes('code') || content.includes('function') || content.includes('const ') || content.includes('```')) {
        return 'terminal';
    }
    if (content.includes('idea') || content.includes('note') || content.includes('thought')) {
        return 'lightbulb';
    }
    if (content.includes('list') || content.includes('todo') || content.includes('-')) {
        return 'checklist';
    }
    return 'auto_stories';
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    switch (status) {
        case 'pending':
            return '<span class="shrink-0 text-[8px] font-mono text-data-green border border-data-green/40 px-1 rounded bg-data-green/10 py-0.5">AWAITING UPLINK</span>';
        case 'offloading':
            return '<span class="shrink-0 text-[8px] font-mono text-yellow-400 border border-yellow-400/40 px-1 rounded bg-yellow-400/10 py-0.5 animate-pulse">TRANSMITTING</span>';
        case 'failed':
            return '<span class="shrink-0 text-[8px] font-mono text-primary border border-primary/40 px-1 rounded bg-primary/10 py-0.5 uppercase">Sync Failed</span>';
        default:
            return '<span class="shrink-0 text-[8px] font-mono text-gray-500 border border-gray-600 px-1 rounded bg-gray-900 py-0.5 uppercase">Unknown</span>';
    }
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Open add modal
 */
function abrirModal() {
    modalAdd.classList.remove('hidden');
    inputTitle.value = '';
    inputContent.value = '';
    inputTitle.focus();
}

/**
 * Close add modal
 */
function cerrarModal() {
    modalAdd.classList.add('hidden');
}

/**
 * Save new cargo item
 */
async function guardarCargo() {
    const title = inputTitle.value.trim();
    const content = inputContent.value.trim();

    if (!title && !content) {
        showToast('Enter title or content', 'error');
        return;
    }

    try {
        await window.WhVaultDB.addCargoItem({
            title: title || 'Untitled Data',
            content: content
        });

        cerrarModal();
        await cargarCargo();
        showToast('Data registered', 'success');
    } catch (error) {
        console.error('[Cargo] Error saving:', error);
        showToast('Error saving data', 'error');
    }
}

/**
 * Delete cargo item
 */
async function eliminarCargo(id) {
    try {
        await window.WhVaultDB.removeCargoItem(id);
        await cargarCargo();
        showToast('Data purged', 'success');
    } catch (error) {
        console.error('[Cargo] Error deleting:', error);
        showToast('Error purging data', 'error');
    }
}

/**
 * Offload all cargo to Obsidian
 */
async function offloadCargo() {
    if (!navigator.onLine) {
        showToast('No vox-link connection', 'error');
        return;
    }

    if (cargoItems.length === 0) {
        showToast('Cargo bay empty', 'error');
        return;
    }

    btnOffload.disabled = true;
    const originalText = btnOffload.innerHTML;
    btnOffload.innerHTML = `
        <div class="absolute inset-0 scanlines opacity-20"></div>
        <span class="material-symbols-outlined text-white text-2xl animate-spin">sync</span>
        <span class="text-white font-display font-bold tracking-[0.2em] text-sm uppercase">Transmitting...</span>
    `;

    let successCount = 0;
    let failCount = 0;

    for (const item of cargoItems) {
        try {
            // Update status to offloading
            await window.WhVaultDB.updateCargoStatus(item.id, 'offloading');

            // Send to server
            const response = await fetch('/api/cargo/offload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: item.title,
                    content: item.content,
                    timestamp: item.timestamp
                })
            });

            const data = await response.json();

            if (data.success) {
                // Remove from local storage
                await window.WhVaultDB.removeCargoItem(item.id);
                successCount++;
            } else {
                await window.WhVaultDB.updateCargoStatus(item.id, 'failed');
                failCount++;
            }
        } catch (error) {
            console.error(`[Cargo] Error offloading ${item.id}:`, error);
            await window.WhVaultDB.updateCargoStatus(item.id, 'failed');
            failCount++;
        }
    }

    // Reload and show result
    await cargarCargo();

    btnOffload.disabled = false;
    btnOffload.innerHTML = originalText;

    if (failCount === 0) {
        showToast(`${successCount} data-blocks offloaded`, 'success');
    } else {
        showToast(`${successCount} offloaded, ${failCount} failed`, 'error');
    }
}

/**
 * Update offload button state based on connection
 */
function updateOffloadState() {
    if (!navigator.onLine) {
        btnOffload.disabled = true;
        offloadStatus.textContent = 'REQUIRES VOX-LINK CONNECTION';
        offloadStatus.classList.remove('hidden');
    } else {
        btnOffload.disabled = false;
        offloadStatus.classList.add('hidden');
    }
}

/**
 * Update connection UI
 */
function updateConnectionUI(isOnline) {
    // Delegate to centralized function if available
    if (window.WhVaultSync) {
        window.WhVaultSync.updateConnectionStatusUI(isOnline);
    } else {
        const statusText = document.getElementById('status-text');
        const statusDot = document.getElementById('status-dot');

        if (statusText) {
            statusText.textContent = isOnline ? 'NOMINAL' : 'OFFLINE';
        }
        if (statusDot) {
            statusDot.classList.remove('bg-green-500', 'bg-red-500');
            statusDot.classList.add(isOnline ? 'bg-green-500' : 'bg-red-500');
        }
    }

    updateOffloadState();
}

/**
 * Set imperial date
 */
function setFechaImperial() {
    const fechaEl = document.getElementById('fecha-imperial');
    if (!fechaEl) return;

    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const yearSuffix = now.getFullYear().toString().slice(-3);
    const checkDigit = Math.floor(Math.random() * 10);

    fechaEl.textContent = `${checkDigit}.${dayOfYear.toString().padStart(3, '0')}.${yearSuffix}.M3`;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = type === 'success' ? '#16a34a' : '#dc2626';
    toast.innerHTML = `
        <span class="material-symbols-outlined mr-2">${type === 'success' ? 'check_circle' : 'error'}</span>
        ${message}
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions globally available
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.guardarCargo = guardarCargo;
window.eliminarCargo = eliminarCargo;
