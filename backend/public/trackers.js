// ==========================================
//  TRACKERS TAB — Monthly Routine Heatmaps
//  Bento grid with per-routine completion
// ==========================================

let trackersInitialized = false;
let trackersCurrentYear = new Date().getFullYear();
let trackersCurrentMonth = new Date().getMonth() + 1;

window.initTrackers = function() {
    if (trackersInitialized) return;
    trackersInitialized = true;
    loadTrackers();
};

window.loadTrackers = async function() {
    setTrackersLoading(true);
    try {
        const data = await fetchMonthlyIncursionData(trackersCurrentYear, trackersCurrentMonth);
        if (!data) {
            showTrackersError();
            return;
        }
        renderTrackers(data);
        setTrackersLoading(false);
    } catch (e) {
        console.error('[Trackers] Load error:', e);
        showTrackersError();
    }
};

function setTrackersLoading(loading) {
    const loadingEl = document.getElementById('trackers-loading-state');
    const mainEl = document.getElementById('trackers-main-content');
    const errorEl = document.getElementById('trackers-error-state');
    if (loadingEl) loadingEl.classList.toggle('hidden', !loading);
    if (mainEl) mainEl.classList.toggle('hidden', loading);
    if (errorEl) errorEl.classList.add('hidden');
}

function showTrackersError() {
    const loadingEl = document.getElementById('trackers-loading-state');
    const mainEl = document.getElementById('trackers-main-content');
    const errorEl = document.getElementById('trackers-error-state');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (mainEl) mainEl.classList.add('hidden');
    if (errorEl) errorEl.classList.remove('hidden');
}

function navigateTrackersMonth(delta) {
    trackersCurrentMonth += delta;
    if (trackersCurrentMonth > 12) { trackersCurrentMonth = 1; trackersCurrentYear++; }
    if (trackersCurrentMonth < 1) { trackersCurrentMonth = 12; trackersCurrentYear--; }
    _monthlyDataCache = {}; // Clear in-memory cache to allow refetch
    trackersInitialized = false;
    window.initTrackers();
}

function renderTrackers(data) {
    renderTrackersMonthNav(data);
    renderTrackersSummary(data);
    renderTrackersBento(data);
}

// ==========================================
//  MONTH NAVIGATOR
// ==========================================

function renderTrackersMonthNav(data) {
    const container = document.getElementById('trackers-month-nav');
    if (!container) return;

    container.innerHTML = `
        <button onclick="navigateTrackersMonth(-1)" class="flex items-center justify-center size-8 text-gray-500 hover:text-primary transition-colors active:scale-95">
            <span class="material-symbols-outlined text-xl">chevron_left</span>
        </button>
        <div class="text-center">
            <span class="text-white text-sm font-bold font-display uppercase tracking-wide">${data.mesNombre} ${data.año}</span>
            <span class="text-gray-500 text-[9px] font-mono block">${data.dias.length} / ${data.diasEnMes} días registrados</span>
        </div>
        <button onclick="navigateTrackersMonth(1)" class="flex items-center justify-center size-8 text-gray-500 hover:text-primary transition-colors active:scale-95">
            <span class="material-symbols-outlined text-xl">chevron_right</span>
        </button>
    `;
}

// ==========================================
//  SUMMARY STATS
// ==========================================

function renderTrackersSummary(data) {
    const container = document.getElementById('trackers-summary');
    if (!container) return;

    const diasConDatos = data.dias.filter(d => d.existe);
    const totalPosibles = diasConDatos.length * (data.config ? Object.values(data.config.grupos).reduce((s, g) => s + g.rutinas.length, 0) : 19);
    const totalCompletadas = diasConDatos.reduce((s, d) => s + d.rutinasCompletadas, 0);
    const tasaCompletado = totalPosibles > 0 ? Math.round((totalCompletadas / totalPosibles) * 100) : 0;
    const diasPerfectos = diasConDatos.filter(d => d.diaPerfecto).length;

    // Best streak
    let bestStreak = 0, currentStreak = 0;
    const dateMap = {};
    diasConDatos.forEach(d => { dateMap[d.fecha] = true; });
    for (let day = 1; day <= data.diasEnMes; day++) {
        const dateStr = `${data.año}-${String(data.mes).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        if (dateMap[dateStr]) {
            currentStreak++;
            if (currentStreak > bestStreak) bestStreak = currentStreak;
        } else {
            currentStreak = 0;
        }
    }

    const stats = [
        { icon: 'percent', label: 'Completado', value: `${tasaCompletado}%`, color: tasaCompletado >= 80 ? 'text-green-400' : tasaCompletado >= 50 ? 'text-amber-400' : 'text-red-400' },
        { icon: 'calendar_month', label: 'Registrados', value: diasConDatos.length, color: 'text-gray-300' },
        { icon: 'star', label: 'Perfectos', value: diasPerfectos, color: diasPerfectos > 0 ? 'text-secondary' : 'text-gray-500' },
        { icon: 'local_fire_department', label: 'Mejor Racha', value: `${bestStreak}d`, color: bestStreak >= 7 ? 'text-primary' : 'text-gray-300' },
    ];

    container.innerHTML = stats.map(s => `
        <div class="bg-surface-dark border border-[#332224] rounded-sm p-3 text-center">
            <span class="material-symbols-outlined ${s.color} text-lg mb-1 block">${s.icon}</span>
            <p class="${s.color} text-lg font-bold font-mono">${s.value}</p>
            <p class="text-gray-500 text-[8px] font-mono uppercase tracking-widest">${s.label}</p>
        </div>
    `).join('');
}

// ==========================================
//  BENTO GRID — One card per group
// ==========================================

function renderTrackersBento(data) {
    const container = document.getElementById('trackers-bento');
    if (!container) return;

    const config = data.config;
    if (!config || !config.grupos) {
        container.innerHTML = '<p class="text-gray-500 text-sm font-mono text-center py-8">Sin config de rutinas</p>';
        return;
    }

    // Build a day lookup: dateStr → dia data
    const dayMap = {};
    data.dias.forEach(d => { dayMap[d.fecha] = d; });

    const groupOrder = ['prioritaria', 'matutina', 'tarde', 'noche'];
    const cards = [];

    groupOrder.forEach(groupKey => {
        const group = config.grupos[groupKey];
        if (!group) return;

        const rutinas = group.rutinas;
        // Calculate group completion %
        let groupTotal = 0, groupDone = 0;
        data.dias.forEach(d => {
            rutinas.forEach(r => {
                groupTotal++;
                if (d.rutinas[r]) groupDone++;
            });
        });
        const groupPct = groupTotal > 0 ? Math.round((groupDone / groupTotal) * 100) : 0;

        // Build heatmap rows
        const rows = rutinas.map(rutinaKey => {
            const item = config.items[rutinaKey] || { titulo: rutinaKey, icon: 'check' };

            // Per-routine stats
            let rDone = 0, rTotal = 0;
            data.dias.forEach(d => { rTotal++; if (d.rutinas[rutinaKey]) rDone++; });
            const rPct = rTotal > 0 ? Math.round((rDone / rTotal) * 100) : 0;

            // Day cells
            const cells = [];
            for (let day = 1; day <= data.diasEnMes; day++) {
                const dateStr = `${data.año}-${String(data.mes).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const d = dayMap[dateStr];
                let colorClass, title;
                if (!d) {
                    colorClass = 'bg-[#1f2937]';
                    title = `${day}: sin datos`;
                } else if (d.rutinas[rutinaKey]) {
                    colorClass = 'bg-green-500';
                    title = `${day}: completada`;
                } else {
                    colorClass = 'bg-red-900';
                    title = `${day}: no completada`;
                }
                cells.push(`<div class="tracker-cell ${colorClass}" title="${title}"></div>`);
            }

            return `
                <div class="flex items-center gap-1 mb-0.5">
                    <div class="flex items-center gap-1 w-16 flex-shrink-0" title="${item.titulo} — ${rPct}%">
                        <span class="material-symbols-outlined text-[10px] text-gray-500">${item.icon}</span>
                        <span class="text-[8px] font-mono text-gray-400 truncate">${item.titulo}</span>
                    </div>
                    <div class="flex-1 grid gap-px" style="grid-template-columns: repeat(${data.diasEnMes}, 1fr);">
                        ${cells.join('')}
                    </div>
                    <span class="text-[8px] font-mono w-7 text-right flex-shrink-0 ${rPct >= 80 ? 'text-green-400' : rPct >= 50 ? 'text-amber-400' : 'text-red-400'}">${rPct}%</span>
                </div>
            `;
        });

        cards.push(`
            <div class="bg-surface-dark border border-[#332224] rounded-sm overflow-hidden">
                <div class="flex items-center justify-between p-3 pb-2 border-b border-[#332224]">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm" style="color: ${group.color}">${group.icon}</span>
                        <span class="text-white text-[10px] font-bold font-mono uppercase tracking-widest">${group.titulo}</span>
                    </div>
                    <span class="text-[10px] font-bold font-mono ${groupPct >= 80 ? 'text-green-400' : groupPct >= 50 ? 'text-amber-400' : 'text-red-400'}">${groupPct}%</span>
                </div>
                <div class="p-2 pt-1.5">
                    ${rows.join('')}
                </div>
                <!-- Day labels -->
                <div class="flex items-center gap-1 px-2 pb-1.5">
                    <div class="w-16 flex-shrink-0"></div>
                    <div class="flex-1 flex justify-between">
                        <span class="text-[7px] font-mono text-gray-600">1</span>
                        <span class="text-[7px] font-mono text-gray-600">${Math.ceil(data.diasEnMes / 2)}</span>
                        <span class="text-[7px] font-mono text-gray-600">${data.diasEnMes}</span>
                    </div>
                    <div class="w-7 flex-shrink-0"></div>
                </div>
            </div>
        `);
    });

    container.innerHTML = cards.join('');
}
