// ==========================================
//  MORAL TAB — Mood Evolution & PSI Analysis
//  Imperio vs Caos balance + element breakdown
// ==========================================

let moralInitialized = false;
let moralCurrentYear = new Date().getFullYear();
let moralCurrentMonth = new Date().getMonth() + 1;

// Mood key → ELEMENT_CONFIG key mapping
const MOOD_MAP = {
    'imperio-disciplina': 'disciplina',
    'imperio-fe': 'fe',
    'imperio-deber': 'deber',
    'imperio-humildad': 'humildad',
    'caos-khorne': 'khorne',
    'caos-nurgle': 'nurgle',
    'caos-tzeentch': 'tzeentch',
    'caos-slaanesh': 'slaanesh'
};

window.initMoral = function() {
    if (moralInitialized) return;
    moralInitialized = true;
    loadMoral();
};

window.loadMoral = async function() {
    setMoralLoading(true);
    try {
        const data = await fetchMonthlyIncursionData(moralCurrentYear, moralCurrentMonth);
        if (!data) {
            showMoralError();
            return;
        }
        renderMoral(data);
        setMoralLoading(false);
    } catch (e) {
        console.error('[Moral] Load error:', e);
        showMoralError();
    }
};

function setMoralLoading(loading) {
    const loadingEl = document.getElementById('moral-loading-state');
    const mainEl = document.getElementById('moral-main-content');
    const errorEl = document.getElementById('moral-error-state');
    if (loadingEl) loadingEl.classList.toggle('hidden', !loading);
    if (mainEl) mainEl.classList.toggle('hidden', loading);
    if (errorEl) errorEl.classList.add('hidden');
}

function showMoralError() {
    const loadingEl = document.getElementById('moral-loading-state');
    const mainEl = document.getElementById('moral-main-content');
    const errorEl = document.getElementById('moral-error-state');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (mainEl) mainEl.classList.add('hidden');
    if (errorEl) errorEl.classList.remove('hidden');
}

function navigateMoralMonth(delta) {
    moralCurrentMonth += delta;
    if (moralCurrentMonth > 12) { moralCurrentMonth = 1; moralCurrentYear++; }
    if (moralCurrentMonth < 1) { moralCurrentMonth = 12; moralCurrentYear--; }
    _monthlyDataCache = {};
    moralInitialized = false;
    window.initMoral();
}

function renderMoral(data) {
    renderMoralMonthNav(data);
    renderMoralBalance(data);
    renderMoralEvolution(data);
    renderMoralDistribution(data);
    renderMoralCards(data);
}

// ==========================================
//  MONTH NAVIGATOR
// ==========================================

function renderMoralMonthNav(data) {
    const container = document.getElementById('moral-month-nav');
    if (!container) return;

    const diasConMoods = data.dias.filter(d => d.imperioTotal > 0 || d.caosTotal > 0);

    container.innerHTML = `
        <button onclick="navigateMoralMonth(-1)" class="flex items-center justify-center size-8 text-gray-500 hover:text-primary transition-colors active:scale-95">
            <span class="material-symbols-outlined text-xl">chevron_left</span>
        </button>
        <div class="text-center">
            <span class="text-white text-sm font-bold font-display uppercase tracking-wide">${data.mesNombre} ${data.año}</span>
            <span class="text-gray-500 text-[9px] font-mono block">${diasConMoods.length} días con asignación PSI</span>
        </div>
        <button onclick="navigateMoralMonth(1)" class="flex items-center justify-center size-8 text-gray-500 hover:text-primary transition-colors active:scale-95">
            <span class="material-symbols-outlined text-xl">chevron_right</span>
        </button>
    `;
}

// ==========================================
//  BALANCE BAR
// ==========================================

function renderMoralBalance(data) {
    const container = document.getElementById('moral-balance');
    if (!container) return;

    const diasConMoods = data.dias.filter(d => d.imperioTotal > 0 || d.caosTotal > 0);
    if (diasConMoods.length === 0) {
        container.innerHTML = `
            <div class="bg-surface-dark border border-[#332224] rounded-sm p-6 text-center">
                <span class="material-symbols-outlined text-3xl text-gray-700 mb-2 block">psychology</span>
                <p class="text-gray-500 text-xs font-mono uppercase">Sin datos de moral este mes</p>
            </div>
        `;
        return;
    }

    const avgImperio = Math.round(diasConMoods.reduce((s, d) => s + d.imperioTotal, 0) / diasConMoods.length);
    const avgCaos = Math.round(diasConMoods.reduce((s, d) => s + d.caosTotal, 0) / diasConMoods.length);
    const total = avgImperio + avgCaos;
    const imperioPct = total > 0 ? Math.round((avgImperio / total) * 100) : 50;
    const caosPct = 100 - imperioPct;

    const imperioWins = imperioPct >= 50;

    container.innerHTML = `
        <div class="bg-surface-dark border border-[#332224] rounded-sm p-3">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-secondary text-sm">shield</span>
                    <span class="text-[10px] font-mono text-gray-500 tracking-widest uppercase">Balance Mensual</span>
                </div>
                <span class="text-[9px] font-mono ${imperioWins ? 'text-secondary' : 'text-purple-400'} font-bold uppercase">${imperioWins ? 'Imperio domina' : 'Caos domina'}</span>
            </div>
            <div class="flex items-center gap-2 mb-1.5">
                <span class="text-secondary text-[10px] font-mono font-bold w-8">${imperioPct}%</span>
                <div class="flex-1 h-3 rounded-sm overflow-hidden flex bg-[#1f2937]">
                    <div class="h-full bg-gradient-to-r from-secondary/80 to-secondary transition-all" style="width: ${imperioPct}%"></div>
                    <div class="h-full bg-gradient-to-r from-purple-600 to-purple-500 transition-all" style="width: ${caosPct}%"></div>
                </div>
                <span class="text-purple-400 text-[10px] font-mono font-bold w-8 text-right">${caosPct}%</span>
            </div>
            <div class="flex justify-between">
                <span class="text-[8px] font-mono text-gray-600">IMPERIALIS (avg ${avgImperio})</span>
                <span class="text-[8px] font-mono text-gray-600">THE WARP (avg ${avgCaos})</span>
            </div>
        </div>
    `;
}

// ==========================================
//  EVOLUTION CHART (SVG)
// ==========================================

function renderMoralEvolution(data) {
    const container = document.getElementById('moral-evolution');
    if (!container) return;

    const diasConMoods = data.dias.filter(d => d.imperioTotal > 0 || d.caosTotal > 0);
    if (diasConMoods.length < 2) {
        container.innerHTML = `
            <div class="bg-surface-dark border border-[#332224] rounded-sm p-4 text-center">
                <span class="text-gray-600 text-[10px] font-mono uppercase">Se necesitan al menos 2 días con datos para el gráfico</span>
            </div>
        `;
        return;
    }

    const W = 360, H = 140, PAD_X = 30, PAD_Y = 15;
    const chartW = W - PAD_X * 2, chartH = H - PAD_Y * 2;

    // Find max value for scaling
    const allVals = diasConMoods.flatMap(d => [d.imperioTotal, d.caosTotal]);
    const maxVal = Math.max(...allVals, 10);

    // Build day→data map
    const dayDataMap = {};
    data.dias.forEach(d => {
        const dayNum = parseInt(d.fecha.split('-')[2]);
        dayDataMap[dayNum] = d;
    });

    // Generate points only for days with mood data
    function getPoints(key) {
        const pts = [];
        diasConMoods.forEach(d => {
            const dayNum = parseInt(d.fecha.split('-')[2]);
            const x = PAD_X + ((dayNum - 1) / (data.diasEnMes - 1)) * chartW;
            const y = PAD_Y + chartH - (d[key] / maxVal) * chartH;
            pts.push({ x, y, day: dayNum, val: d[key] });
        });
        return pts;
    }

    const imperioPoints = getPoints('imperioTotal');
    const caosPoints = getPoints('caosTotal');

    function pointsToPath(pts) {
        return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    }

    function pointsToArea(pts) {
        if (pts.length === 0) return '';
        const baseline = PAD_Y + chartH;
        return `M${pts[0].x.toFixed(1)},${baseline} ` +
            pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
            ` L${pts[pts.length - 1].x.toFixed(1)},${baseline} Z`;
    }

    // Grid lines
    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
        const y = PAD_Y + (i / 4) * chartH;
        const val = Math.round(maxVal * (1 - i / 4));
        gridLines.push(`<line x1="${PAD_X}" y1="${y}" x2="${W - PAD_X}" y2="${y}" stroke="#2d2d2d" stroke-width="0.5" />`);
        gridLines.push(`<text x="${PAD_X - 4}" y="${y + 3}" fill="#555" font-size="7" text-anchor="end" font-family="monospace">${val}</text>`);
    }

    // Day labels on X axis
    const xLabels = [];
    const labelInterval = data.diasEnMes <= 15 ? 2 : 5;
    for (let day = 1; day <= data.diasEnMes; day += labelInterval) {
        const x = PAD_X + ((day - 1) / (data.diasEnMes - 1)) * chartW;
        xLabels.push(`<text x="${x}" y="${H - 2}" fill="#555" font-size="7" text-anchor="middle" font-family="monospace">${day}</text>`);
    }

    // Reference line at midpoint
    const midY = PAD_Y + chartH - ((maxVal / 2) / maxVal) * chartH;

    const svg = `
        <svg viewBox="0 0 ${W} ${H}" class="w-full" xmlns="http://www.w3.org/2000/svg">
            <!-- Grid -->
            ${gridLines.join('')}
            <!-- Midpoint reference -->
            <line x1="${PAD_X}" y1="${midY}" x2="${W - PAD_X}" y2="${midY}" stroke="#c5a065" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.3" />
            <!-- Imperio area -->
            <path d="${pointsToArea(imperioPoints)}" fill="#c5a065" opacity="0.15" />
            <!-- Caos area -->
            <path d="${pointsToArea(caosPoints)}" fill="#a855f7" opacity="0.15" />
            <!-- Imperio line -->
            <path d="${pointsToPath(imperioPoints)}" fill="none" stroke="#c5a065" stroke-width="1.5" stroke-linejoin="round" />
            <!-- Caos line -->
            <path d="${pointsToPath(caosPoints)}" fill="none" stroke="#a855f7" stroke-width="1.5" stroke-linejoin="round" />
            <!-- Imperio dots -->
            ${imperioPoints.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#c5a065" stroke="#1a1718" stroke-width="1"><title>Día ${p.day}: Imperio ${p.val}</title></circle>`).join('')}
            <!-- Caos dots -->
            ${caosPoints.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#a855f7" stroke="#1a1718" stroke-width="1"><title>Día ${p.day}: Caos ${p.val}</title></circle>`).join('')}
            <!-- X labels -->
            ${xLabels.join('')}
        </svg>
    `;

    container.innerHTML = `
        <div class="bg-surface-dark border border-[#332224] rounded-sm p-3">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-primary text-sm">show_chart</span>
                    <span class="text-[10px] font-mono text-gray-500 tracking-widest uppercase">Evolución Diaria</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-1"><div class="w-2 h-0.5 bg-secondary rounded"></div><span class="text-[8px] font-mono text-gray-500">Imperio</span></div>
                    <div class="flex items-center gap-1"><div class="w-2 h-0.5 bg-purple-500 rounded"></div><span class="text-[8px] font-mono text-gray-500">Caos</span></div>
                </div>
            </div>
            ${svg}
        </div>
    `;
}

// ==========================================
//  ELEMENT DISTRIBUTION (8 horizontal bars)
// ==========================================

function renderMoralDistribution(data) {
    const container = document.getElementById('moral-distribution');
    if (!container) return;

    const diasConMoods = data.dias.filter(d => d.imperioTotal > 0 || d.caosTotal > 0);
    if (diasConMoods.length === 0) { container.innerHTML = ''; return; }

    // Calculate averages per element
    const moodKeys = Object.keys(MOOD_MAP);
    const elementAvgs = moodKeys.map(moodKey => {
        const elemKey = MOOD_MAP[moodKey];
        const elemConfig = (typeof ELEMENT_CONFIG !== 'undefined') ? ELEMENT_CONFIG[elemKey] : null;
        const total = diasConMoods.reduce((s, d) => s + (d.moods[moodKey] || 0), 0);
        const avg = total / diasConMoods.length;
        return {
            moodKey,
            elemKey,
            config: elemConfig,
            avg: Math.round(avg * 10) / 10,
            tipo: elemConfig?.tipo || (moodKey.startsWith('imperio') ? 'imperio' : 'caos')
        };
    });

    const maxAvg = Math.max(...elementAvgs.map(e => e.avg), 1);
    const imperioElems = elementAvgs.filter(e => e.tipo === 'imperio').sort((a, b) => b.avg - a.avg);
    const caosElems = elementAvgs.filter(e => e.tipo === 'caos').sort((a, b) => b.avg - a.avg);

    function renderBar(elem) {
        const pct = maxAvg > 0 ? Math.round((elem.avg / maxAvg) * 100) : 0;
        const icon = elem.config?.icon || 'help';
        const label = elem.config?.label || elem.elemKey;
        const hex = elem.config?.hex || '#888';
        const colorClass = elem.config?.color || 'text-gray-400';

        return `
            <div class="flex items-center gap-2 mb-1.5">
                <div class="flex items-center gap-1 w-20 flex-shrink-0">
                    <span class="material-symbols-outlined ${colorClass} text-xs">${icon}</span>
                    <span class="text-[9px] font-mono text-gray-400">${label}</span>
                </div>
                <div class="flex-1 h-2 bg-[#1f2937] rounded-sm overflow-hidden">
                    <div class="h-full rounded-sm transition-all" style="width: ${pct}%; background: ${hex};"></div>
                </div>
                <span class="text-[9px] font-mono text-gray-400 w-6 text-right">${elem.avg}</span>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="bg-surface-dark border border-[#332224] rounded-sm p-3">
            <div class="flex items-center gap-1.5 mb-3">
                <span class="material-symbols-outlined text-primary text-sm">equalizer</span>
                <span class="text-[10px] font-mono text-gray-500 tracking-widest uppercase">Distribución por Elemento</span>
            </div>
            <!-- Imperialis -->
            <div class="mb-3">
                <div class="flex items-center gap-1 mb-1.5">
                    <div class="w-1 h-3 bg-secondary rounded-full"></div>
                    <span class="text-[8px] font-mono text-secondary uppercase tracking-widest font-bold">Imperialis</span>
                </div>
                ${imperioElems.map(renderBar).join('')}
            </div>
            <!-- The Warp -->
            <div>
                <div class="flex items-center gap-1 mb-1.5">
                    <div class="w-1 h-3 bg-purple-500 rounded-full"></div>
                    <span class="text-[8px] font-mono text-purple-400 uppercase tracking-widest font-bold">The Warp</span>
                </div>
                ${caosElems.map(renderBar).join('')}
            </div>
        </div>
    `;
}

// ==========================================
//  ELEMENT CARDS (8 cards with sparklines)
// ==========================================

function renderMoralCards(data) {
    const container = document.getElementById('moral-cards');
    if (!container) return;

    const diasConMoods = data.dias.filter(d => d.imperioTotal > 0 || d.caosTotal > 0);
    if (diasConMoods.length === 0) { container.innerHTML = ''; return; }

    const moodKeys = Object.keys(MOOD_MAP);

    const cards = moodKeys.map(moodKey => {
        const elemKey = MOOD_MAP[moodKey];
        const elemConfig = (typeof ELEMENT_CONFIG !== 'undefined') ? ELEMENT_CONFIG[elemKey] : null;
        const icon = elemConfig?.icon || 'help';
        const label = elemConfig?.label || elemKey;
        const hex = elemConfig?.hex || '#888';
        const colorClass = elemConfig?.color || 'text-gray-400';
        const tipo = elemConfig?.tipo || (moodKey.startsWith('imperio') ? 'imperio' : 'caos');

        // Values per day with mood data
        const values = diasConMoods.map(d => d.moods[moodKey] || 0);
        const avg = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10 : 0;
        const maxVal = Math.max(...values, 1);

        // Trend: compare first half vs second half
        const mid = Math.floor(values.length / 2);
        const firstHalf = values.slice(0, mid);
        const secondHalf = values.slice(mid);
        const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length : 0;
        const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length : 0;
        const trend = secondAvg > firstAvg + 0.5 ? '↑' : secondAvg < firstAvg - 0.5 ? '↓' : '—';
        const trendColor = tipo === 'imperio'
            ? (trend === '↑' ? 'text-green-400' : trend === '↓' ? 'text-red-400' : 'text-gray-500')
            : (trend === '↑' ? 'text-red-400' : trend === '↓' ? 'text-green-400' : 'text-gray-500');

        // Sparkline bars
        const sparkBars = values.map(v => {
            const h = maxVal > 0 ? Math.max(2, Math.round((v / maxVal) * 24)) : 2;
            return `<div class="sparkline-bar flex-1" style="height:${h}px; background:${hex}; opacity:${v > 0 ? 0.7 : 0.15};"></div>`;
        }).join('');

        const borderColor = tipo === 'imperio' ? 'border-secondary/20' : 'border-purple-800/30';

        return `
            <div class="bg-surface-dark border ${borderColor} rounded-sm p-2.5 flex flex-col">
                <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-1">
                        <span class="material-symbols-outlined ${colorClass} text-sm">${icon}</span>
                        <span class="text-[9px] font-mono text-gray-400 uppercase">${label}</span>
                    </div>
                    <span class="${trendColor} text-sm font-bold">${trend}</span>
                </div>
                <p class="${colorClass} text-xl font-bold font-mono mb-1">${avg}</p>
                <div class="flex items-end gap-px mt-auto" style="height: 24px;">
                    ${sparkBars}
                </div>
            </div>
        `;
    });

    container.innerHTML = cards.join('');
}
