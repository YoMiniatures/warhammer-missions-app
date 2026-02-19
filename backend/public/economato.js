// Economato Imperial - Frontend Logic
// Portfolio | Budget | Patrimonio

let economatoInitialized = false;
let portfolioData = null;
let resumenData = null;
let currentEcoView = 'portfolio';
let assetMap = {};          // id → asset data from portfolio
let selectedAssetId = null;
let verticalesList = [];    // cached vertical names

// ==========================================
//  INIT
// ==========================================

function initEconomato() {
    if (economatoInitialized) return;
    economatoInitialized = true;

    // Restore last view from localStorage
    const saved = localStorage.getItem('ecoView');
    if (saved && ['portfolio', 'budget', 'patrimonio'].includes(saved)) {
        currentEcoView = saved;
    }
    setEcoView(currentEcoView);
}

// ==========================================
//  VIEW TOGGLE
// ==========================================

function setEcoView(view) {
    currentEcoView = view;
    localStorage.setItem('ecoView', view);

    const views = ['portfolio', 'budget', 'patrimonio'];
    const activeClass = 'flex items-center gap-1.5 px-4 py-1.5 rounded text-[10px] font-bold font-mono uppercase tracking-widest transition-all border border-secondary bg-secondary/10 text-secondary';
    const inactiveClass = 'flex items-center gap-1.5 px-4 py-1.5 rounded text-[10px] font-bold font-mono uppercase tracking-widest transition-all border border-[#2d2d2d] text-gray-500 hover:border-gray-500 hover:text-gray-300';

    views.forEach(v => {
        const viewEl = document.getElementById(`${v}-view`);
        const pillEl = document.getElementById(`pill-${v}`);
        if (viewEl) viewEl.style.display = v === view ? '' : 'none';
        if (pillEl) pillEl.className = v === view ? activeClass : inactiveClass;
    });

    // Toggle FAB visibility (only in portfolio)
    const fab = document.getElementById('fab-portfolio');
    if (fab) fab.style.display = view === 'portfolio' ? '' : 'none';

    // Load data for current view
    if (view === 'portfolio') loadPortfolio();
    else if (view === 'budget') loadBudget();
    else if (view === 'patrimonio') loadPatrimonio();
}

// ==========================================
//  DATA LOADING
// ==========================================

async function loadPortfolio() {
    const container = document.getElementById('portfolio-content');
    if (!container) return;

    const DB = window.WhVaultDB;
    const STORE = DB?.STORES?.ECONOMATO_PORTFOLIO;

    // Try cache first
    if (DB && STORE) {
        try {
            const cached = await DB.getCachedData(STORE);
            if (cached.data && cached.data.length > 0) {
                portfolioData = cached.data[0];
                renderPortfolio(portfolioData, container);
                if (cached.isFresh) return; // Fresh cache, skip fetch
            }
        } catch (e) { /* no cache */ }
    }

    if (!portfolioData) container.innerHTML = renderLoading('Cargando portfolio...');

    try {
        const resp = await fetch('/api/economato/portfolio');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        portfolioData = await resp.json();

        if (!portfolioData.success) throw new Error(portfolioData.error || 'Error');

        renderPortfolio(portfolioData, container);
        if (DB && STORE) DB.cacheApiData(STORE, [portfolioData]).catch(() => {});
    } catch (err) {
        console.error('[Economato] Portfolio error:', err);
        if (!portfolioData) container.innerHTML = renderError('Error cargando portfolio', err.message);
    }
}

async function loadBudget() {
    const container = document.getElementById('budget-content');
    if (!container) return;

    const DB = window.WhVaultDB;
    const STORE = DB?.STORES?.ECONOMATO_BUDGET;

    // Try cache first
    if (DB && STORE) {
        try {
            const cached = await DB.getCachedData(STORE);
            if (cached.data && cached.data.length > 0) {
                resumenData = cached.data[0];
                renderBudget(resumenData, container);
                if (cached.isFresh) return;
            }
        } catch (e) { /* no cache */ }
    }

    if (!resumenData) container.innerHTML = renderLoading('Cargando presupuesto...');

    try {
        const resp = await fetch('/api/economato/resumen');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        resumenData = await resp.json();

        if (!resumenData.success) throw new Error(resumenData.error || 'Error');

        renderBudget(resumenData, container);
        if (DB && STORE) DB.cacheApiData(STORE, [resumenData]).catch(() => {});
    } catch (err) {
        console.error('[Economato] Budget error:', err);
        if (!resumenData) container.innerHTML = renderError('Error cargando presupuesto', err.message);
    }
}

async function loadPatrimonio() {
    const container = document.getElementById('patrimonio-content');
    if (!container) return;

    container.innerHTML = renderLoading('Calculando patrimonio...');

    try {
        // Need both resumen and portfolio data
        const [resResp, portResp] = await Promise.all([
            fetch('/api/economato/resumen'),
            fetch('/api/economato/portfolio')
        ]);

        if (!resResp.ok) throw new Error(`Resumen: HTTP ${resResp.status}`);
        if (!portResp.ok) throw new Error(`Portfolio: HTTP ${portResp.status}`);

        resumenData = await resResp.json();
        portfolioData = await portResp.json();

        renderPatrimonio(resumenData, portfolioData, container);
    } catch (err) {
        console.error('[Economato] Patrimonio error:', err);
        // Try using already-loaded data from other tabs
        if (resumenData && portfolioData) {
            renderPatrimonio(resumenData, portfolioData, container);
        } else {
            container.innerHTML = renderError('Error cargando patrimonio', err.message);
        }
    }
}

// ==========================================
//  PORTFOLIO RENDERING
// ==========================================

function renderPortfolio(data, container) {
    const { activos, verticales, totalInvertido, totalValorActual, totalPnl, totalRoi, alertas, ultimaActualizacion } = data;

    let html = '';

    // Total portfolio summary card
    html += `
    <div class="bg-[#1a1718] border border-secondary/20 rounded-lg p-4 mb-4">
        <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Valor Total Portfolio</span>
            <span class="text-[10px] font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}">${formatRoi(totalRoi)}</span>
        </div>
        <div class="text-3xl font-bold text-white font-display">${formatCurrency(totalValorActual)}</div>
        <div class="flex items-center gap-3 mt-2">
            <span class="text-xs text-gray-500">Invertido: ${formatCurrency(totalInvertido)}</span>
            <span class="text-xs ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}">${formatPnl(totalPnl)}</span>
        </div>
        ${ultimaActualizacion ? `<div class="text-[9px] font-mono text-gray-600 mt-2">UPD: ${new Date(ultimaActualizacion).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
    </div>`;

    // Alerts
    if (alertas && alertas.length > 0) {
        html += `<div class="mb-4 space-y-2">`;
        for (const a of alertas) {
            html += `
            <div class="bg-yellow-900/20 border border-yellow-600/30 rounded p-3 flex items-center gap-2">
                <span class="material-symbols-outlined text-yellow-500 text-lg">warning</span>
                <div>
                    <span class="text-yellow-400 text-xs font-bold">${a.activo}</span>
                    <span class="text-yellow-300/70 text-xs ml-1">${a.mensaje || a.tipo}</span>
                </div>
            </div>`;
        }
        html += `</div>`;
    }

    // Verticals summary (horizontal scroll)
    if (verticales.length > 0) {
        html += `
        <div class="mb-4">
            <div class="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2 px-1">Verticales</div>
            <div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style="scrollbar-width:none;">`;

        for (const v of verticales) {
            const isProfit = v.pnl >= 0;
            html += `
            <div class="min-w-[140px] bg-[#1a1718] border border-[#332224] rounded-lg p-3 flex-shrink-0">
                <div class="text-xs font-bold text-white mb-1 truncate">${v.nombre}</div>
                <div class="text-sm font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}">${formatCurrency(v.valorActual)}</div>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[9px] ${isProfit ? 'text-green-400/70' : 'text-red-400/70'}">${formatPnl(v.pnl)}</span>
                    <span class="text-[9px] text-gray-600">${v.numActivos} activos</span>
                </div>
            </div>`;
        }

        html += `</div></div>`;
    }

    // Asset list
    html += `
    <div>
        <div class="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2 px-1">Activos (${activos.length})</div>
        <div class="space-y-1.5">`;

    assetMap = {};
    for (const a of activos) {
        assetMap[a.id] = a;
        const isProfit = a.pnl >= 0;
        const apiIcon = getApiIcon(a.api);

        html += `
        <div class="bg-[#1a1718] border border-[#2d2d2d] rounded p-3 cursor-pointer active:bg-[#261e1f] transition-colors" onclick="openAssetActions('${a.id}')">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <span class="material-symbols-outlined text-sm ${a.estado === 'pausado' ? 'text-gray-600' : 'text-secondary'}">${apiIcon}</span>
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">${a.nombre}</div>
                        <div class="text-[9px] text-gray-500 font-mono">${a.vertical}${a.cambio24h ? ` · 24h: ${a.cambio24h > 0 ? '+' : ''}${a.cambio24h}%` : ''}</div>
                    </div>
                </div>
                <div class="text-right flex-shrink-0 ml-2">
                    <div class="text-xs font-bold text-white">${formatCurrency(a.valorActual)}</div>
                    <div class="text-[9px] ${isProfit ? 'text-green-400' : 'text-red-400'}">${formatPnl(a.pnl)}</div>
                </div>
            </div>
            ${a.capitalInvertido > 0 ? `
            <div class="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-[#2d2d2d]/50">
                <span class="text-[9px] text-gray-500">Qty: ${formatQty(a.cantActual)}</span>
                <span class="text-[9px] text-gray-500">Avg: ${formatCurrency(a.precioMedio)}</span>
                <span class="text-[9px] text-gray-500">Now: ${formatCurrency(a.precioActual)}</span>
                <span class="text-[9px] ${isProfit ? 'text-green-400' : 'text-red-400'} ml-auto">${formatRoi(a.roi)}</span>
            </div>` : ''}
        </div>`;
    }

    html += `</div></div>`;

    container.innerHTML = html;
}

// ==========================================
//  BUDGET RENDERING
// ==========================================

function renderBudget(data, container) {
    const { generadores, ingresosMensuales } = data;

    let html = '';

    // Monthly income summary
    html += `
    <div class="bg-[#1a1718] border border-secondary/20 rounded-lg p-4 mb-4">
        <div class="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1">Ingresos Mensuales</div>
        <div class="text-3xl font-bold text-green-400 font-display">${formatCurrency(ingresosMensuales)}</div>
        <div class="text-xs text-gray-500 mt-1">Generadores activos: ${generadores.filter(g => g.estado === 'activo').length}/${generadores.length}</div>
    </div>`;

    // Generators
    html += `
    <div class="mb-4">
        <div class="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2 px-1">Generadores de Ingreso</div>
        <div class="space-y-2">`;

    for (const g of generadores) {
        const isActive = g.estado === 'activo';
        const pct = ingresosMensuales > 0 ? Math.round((g.monto / ingresosMensuales) * 100) : 0;

        html += `
        <div class="bg-[#1a1718] border border-[#2d2d2d] rounded p-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-lg ${isActive ? 'text-green-400' : 'text-gray-600'}">${g.icono}</span>
                    <div>
                        <div class="text-xs font-bold ${isActive ? 'text-white' : 'text-gray-500'}">${g.nombre}</div>
                        <div class="text-[9px] font-mono ${isActive ? 'text-green-400/70' : 'text-gray-600'}">${isActive ? 'ACTIVO' : 'INACTIVO'}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm font-bold ${isActive ? 'text-green-400' : 'text-gray-600'}">${formatCurrency(g.monto)}</div>
                    ${isActive && pct > 0 ? `<div class="text-[9px] text-gray-500">${pct}%</div>` : ''}
                </div>
            </div>
            ${isActive && pct > 0 ? `
            <div class="mt-2 w-full bg-[#0f0f10] h-1 rounded-full overflow-hidden">
                <div class="bg-green-500/40 h-full rounded-full transition-all" style="width: ${pct}%"></div>
            </div>` : ''}
        </div>`;
    }

    html += `</div></div>`;

    // Yearly projection
    html += `
    <div class="bg-[#1a1718] border border-[#332224] rounded-lg p-4">
        <div class="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-3">Proyección Anual</div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <div class="text-[9px] text-gray-500 uppercase">Ingresos / Año</div>
                <div class="text-lg font-bold text-green-400">${formatCurrency(ingresosMensuales * 12)}</div>
            </div>
            <div>
                <div class="text-[9px] text-gray-500 uppercase">Ingresos / Día</div>
                <div class="text-lg font-bold text-green-400/70">${formatCurrency(Math.round(ingresosMensuales / 30 * 100) / 100)}</div>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;
}

// ==========================================
//  PATRIMONIO RENDERING
// ==========================================

function renderPatrimonio(resumen, portfolio, container) {
    const fuel = resumen.fuel || 0;
    const suministros = resumen.suministros || 0;
    const deuda = resumen.deuda || 0;
    const portfolioVal = portfolio?.totalValorActual || 0;
    const portfolioPnl = portfolio?.totalPnl || 0;
    const ingresos = resumen.ingresosMensuales || 0;
    const variacion = resumen.variacionMes || 0;

    const tesoroTotal = fuel + suministros - deuda;
    const patrimonioNeto = tesoroTotal + portfolioVal;
    const fuelPct = patrimonioNeto > 0 ? Math.round((fuel / patrimonioNeto) * 100) : 0;
    const suministrosPct = patrimonioNeto > 0 ? Math.round((suministros / patrimonioNeto) * 100) : 0;
    const portfolioPct = patrimonioNeto > 0 ? Math.round((portfolioVal / patrimonioNeto) * 100) : 0;

    let html = '';

    // Net worth card
    html += `
    <div class="bg-gradient-to-br from-[#1a1718] to-[#261e1f] border border-secondary/30 rounded-lg p-5 mb-4">
        <div class="text-[10px] font-mono text-secondary uppercase tracking-widest mb-1">Patrimonio Neto</div>
        <div class="text-4xl font-bold text-white font-display">${formatCurrency(patrimonioNeto)}</div>
        <div class="flex items-center gap-2 mt-2">
            <span class="material-symbols-outlined text-sm ${variacion >= 0 ? 'text-green-400' : 'text-red-400'}">${variacion >= 0 ? 'trending_up' : 'trending_down'}</span>
            <span class="text-xs ${variacion >= 0 ? 'text-green-400' : 'text-red-400'}">${variacion >= 0 ? '+' : ''}${variacion}% este mes</span>
        </div>
    </div>`;

    // Breakdown bars
    html += `
    <div class="space-y-3 mb-4">
        <div class="text-[10px] font-mono text-gray-500 uppercase tracking-widest px-1">Desglose</div>

        <!-- Fuel (líquido) -->
        <div class="bg-[#1a1718] border border-[#2d2d2d] rounded p-3">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-blue-400 text-sm">water_drop</span>
                    <span class="text-xs font-bold text-white">Fuel (Líquido)</span>
                </div>
                <div class="text-right">
                    <span class="text-sm font-bold text-blue-400">${formatCurrency(fuel)}</span>
                    <span class="text-[9px] text-gray-500 ml-1">${fuelPct}%</span>
                </div>
            </div>
            <div class="w-full bg-[#0f0f10] h-2 rounded-full overflow-hidden">
                <div class="bg-blue-500/60 h-full rounded-full transition-all" style="width: ${fuelPct}%"></div>
            </div>
        </div>

        <!-- Suministros (invertido) -->
        <div class="bg-[#1a1718] border border-[#2d2d2d] rounded p-3">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-purple-400 text-sm">deployed_code</span>
                    <span class="text-xs font-bold text-white">Suministros (Invertido)</span>
                </div>
                <div class="text-right">
                    <span class="text-sm font-bold text-purple-400">${formatCurrency(suministros)}</span>
                    <span class="text-[9px] text-gray-500 ml-1">${suministrosPct}%</span>
                </div>
            </div>
            <div class="w-full bg-[#0f0f10] h-2 rounded-full overflow-hidden">
                <div class="bg-purple-500/60 h-full rounded-full transition-all" style="width: ${suministrosPct}%"></div>
            </div>
        </div>

        <!-- Portfolio -->
        <div class="bg-[#1a1718] border border-[#2d2d2d] rounded p-3">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-secondary text-sm">monitoring</span>
                    <span class="text-xs font-bold text-white">Portfolio (GREEN BITS)</span>
                </div>
                <div class="text-right">
                    <span class="text-sm font-bold text-secondary">${formatCurrency(portfolioVal)}</span>
                    <span class="text-[9px] text-gray-500 ml-1">${portfolioPct}%</span>
                </div>
            </div>
            <div class="w-full bg-[#0f0f10] h-2 rounded-full overflow-hidden">
                <div class="bg-secondary/60 h-full rounded-full transition-all" style="width: ${portfolioPct}%"></div>
            </div>
            <div class="text-[9px] ${portfolioPnl >= 0 ? 'text-green-400' : 'text-red-400'} mt-1">PnL: ${formatPnl(portfolioPnl)}</div>
        </div>

        ${deuda > 0 ? `
        <!-- Deuda -->
        <div class="bg-[#1a1718] border border-red-900/30 rounded p-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-red-400 text-sm">credit_card_off</span>
                    <span class="text-xs font-bold text-white">Deuda</span>
                </div>
                <span class="text-sm font-bold text-red-400">-${formatCurrency(deuda)}</span>
            </div>
        </div>` : ''}
    </div>`;

    // Quick stats grid
    html += `
    <div class="bg-[#1a1718] border border-[#332224] rounded-lg p-4">
        <div class="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-3">Estadísticas</div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <div class="text-[9px] text-gray-500 uppercase">Tesoro (sin portfolio)</div>
                <div class="text-lg font-bold text-white">${formatCurrency(tesoroTotal)}</div>
            </div>
            <div>
                <div class="text-[9px] text-gray-500 uppercase">Ingresos / Mes</div>
                <div class="text-lg font-bold text-green-400">${formatCurrency(ingresos)}</div>
            </div>
            <div>
                <div class="text-[9px] text-gray-500 uppercase">Meses de Fuel</div>
                <div class="text-lg font-bold text-blue-400">${ingresos > 0 ? Math.round(fuel / ingresos * 10) / 10 : '∞'}</div>
            </div>
            <div>
                <div class="text-[9px] text-gray-500 uppercase">Verticales Activos</div>
                <div class="text-lg font-bold text-secondary">${portfolio?.verticales?.length || 0}</div>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;
}

// ==========================================
//  UTILITIES
// ==========================================

function formatCurrency(n) {
    if (n == null || isNaN(n)) return '€0';
    const abs = Math.abs(n);
    if (abs >= 1000) {
        return (n < 0 ? '-' : '') + '€' + abs.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return (n < 0 ? '-' : '') + '€' + abs.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPnl(n) {
    if (n == null || isNaN(n)) return '€0';
    const sign = n >= 0 ? '+' : '';
    return sign + formatCurrency(n);
}

function formatRoi(n) {
    if (n == null || isNaN(n) || n === 0) return '0%';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function formatQty(n) {
    if (n == null || isNaN(n)) return '0';
    if (n >= 1000) return n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
    if (n >= 1) return n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
    return n.toLocaleString('es-ES', { maximumFractionDigits: 6 });
}

function getApiIcon(api) {
    switch (api) {
        case 'coingecko': return 'currency_bitcoin';
        case 'goldapi':
        case 'metalprice': return 'diamond';
        case 'optcg': return 'playing_cards';
        case 'manual': return 'edit_note';
        default: return 'account_balance';
    }
}

function renderLoading(msg) {
    return `
    <div class="flex flex-col items-center justify-center py-16">
        <div class="size-8 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin mb-4"></div>
        <span class="text-gray-500 text-xs font-mono uppercase tracking-widest">${msg}</span>
    </div>`;
}

function renderError(title, detail) {
    return `
    <div class="flex flex-col items-center justify-center py-16 px-8">
        <span class="material-symbols-outlined text-red-500/50 text-4xl mb-3">error</span>
        <span class="text-red-400 text-sm font-bold">${title}</span>
        <span class="text-gray-500 text-xs font-mono mt-1">${detail}</span>
    </div>`;
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ==========================================
//  TOAST
// ==========================================

function showToast(msg, type = 'success') {
    const colors = { success: 'bg-green-700 border-green-500', error: 'bg-red-900 border-red-600', warning: 'bg-yellow-900 border-yellow-600' };
    const icons = { success: 'check_circle', error: 'error', warning: 'warning' };
    const toast = document.createElement('div');
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[60] ${colors[type] || colors.success} border rounded-lg px-4 py-3 flex items-center gap-2 shadow-2xl max-w-[90%] animate-fade-in`;
    toast.innerHTML = `<span class="material-symbols-outlined text-white text-lg">${icons[type] || icons.success}</span><span class="text-white text-sm font-bold">${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ==========================================
//  ACTION SHEET
// ==========================================

function openAssetActions(assetId) {
    const asset = assetMap[assetId];
    if (!asset) return;
    selectedAssetId = assetId;

    const header = document.getElementById('action-sheet-header');
    const buttons = document.getElementById('action-sheet-buttons');
    const sheet = document.getElementById('asset-actions');

    const isProfit = asset.pnl >= 0;
    header.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-white truncate">${asset.nombre}</div>
                <div class="text-[10px] text-gray-500 font-mono">${asset.vertical} · ${asset.api}</div>
            </div>
            <div class="text-right ml-3">
                <div class="text-sm font-bold text-white">${formatCurrency(asset.valorActual)}</div>
                <div class="text-[10px] ${isProfit ? 'text-green-400' : 'text-red-400'}">${formatPnl(asset.pnl)} (${formatRoi(asset.roi)})</div>
            </div>
        </div>
        <div class="flex items-center gap-3 mt-2 text-[10px] text-gray-500 font-mono">
            <span>Qty: ${formatQty(asset.cantActual)}</span>
            <span>Avg: ${formatCurrency(asset.precioMedio)}</span>
            <span>Now: ${formatCurrency(asset.precioActual)}</span>
        </div>`;

    let btns = `
        <button class="action-btn" onclick="openCompraModal('${assetId}')">
            <span class="material-symbols-outlined text-green-400">shopping_cart</span>
            <span>Añadir Compra</span>
        </button>
        <button class="action-btn" onclick="openVentaModal('${assetId}')">
            <span class="material-symbols-outlined text-red-400">sell</span>
            <span>Añadir Venta</span>
        </button>`;

    if (asset.api === 'manual') {
        btns += `
        <button class="action-btn" onclick="openPrecioModal('${assetId}')">
            <span class="material-symbols-outlined text-secondary">edit</span>
            <span>Actualizar Precio Manual</span>
        </button>`;
    }

    // Status buttons
    const estados = ['activo', 'pausado', 'abandonado'];
    const estadoIcons = { activo: 'play_circle', pausado: 'pause_circle', abandonado: 'cancel' };
    const estadoColors = { activo: 'text-green-400', pausado: 'text-yellow-400', abandonado: 'text-red-400' };
    const otherEstados = estados.filter(e => e !== asset.estado);

    for (const est of otherEstados) {
        btns += `
        <button class="action-btn" onclick="changeAssetStatus('${assetId}', '${est}')">
            <span class="material-symbols-outlined ${estadoColors[est]}">${estadoIcons[est]}</span>
            <span>Marcar como ${est}</span>
        </button>`;
    }

    buttons.innerHTML = btns;

    sheet.classList.remove('hidden');
}

function closeAssetActions() {
    document.getElementById('asset-actions')?.classList.add('hidden');
    selectedAssetId = null;
}

// ==========================================
//  NEW ASSET MODAL
// ==========================================

async function openNewAssetModal() {
    // Load verticales if not cached
    if (verticalesList.length === 0) {
        try {
            const resp = await fetch('/api/economato/verticales');
            const data = await resp.json();
            if (data.success) verticalesList = data.verticales;
        } catch (e) {
            verticalesList = [
                { nombre: 'Crypto' }, { nombre: 'Inversiones' }, { nombre: 'TCG' },
                { nombre: 'Compra-Venta' }, { nombre: 'Warhammer' }
            ];
        }
    }

    // Populate vertical select
    const select = document.getElementById('new-asset-vertical');
    select.innerHTML = verticalesList.map(v => `<option value="${v.nombre}">${v.nombre}</option>`).join('');

    // Reset fields
    document.getElementById('new-asset-nombre').value = '';
    document.getElementById('new-asset-api').value = 'manual';
    document.getElementById('new-asset-identificador').value = '';
    document.getElementById('new-asset-moneda').value = 'EUR';
    document.getElementById('new-asset-unidad').value = 'unidades';
    document.getElementById('new-asset-precio').value = '';
    document.getElementById('new-asset-compra-toggle').checked = false;
    document.getElementById('new-asset-compra-fields').style.display = 'none';
    document.getElementById('new-asset-compra-fecha').value = todayStr();
    document.getElementById('new-asset-compra-cantidad').value = '';
    document.getElementById('new-asset-compra-precio').value = '';

    onApiTypeChange();

    const modal = document.getElementById('modal-new-asset');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => document.getElementById('new-asset-nombre').focus(), 100);
}

function closeNewAssetModal() {
    const modal = document.getElementById('modal-new-asset');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function onApiTypeChange() {
    const api = document.getElementById('new-asset-api').value;
    const idField = document.getElementById('field-identificador');
    const unitField = document.getElementById('field-unidad');
    const priceField = document.getElementById('field-precio-manual');
    const hint = document.getElementById('identificador-hint');

    idField.style.display = (api === 'coingecko' || api === 'goldapi') ? '' : 'none';
    unitField.style.display = api === 'goldapi' ? '' : 'none';
    priceField.style.display = api === 'manual' ? '' : 'none';

    if (hint) {
        if (api === 'coingecko') hint.textContent = 'ID de CoinGecko: bitcoin, ethereum, solana...';
        else if (api === 'goldapi') hint.textContent = 'Símbolo metal: XAU (oro), XAG (plata), XPT (platino)';
        else hint.textContent = '';
    }
}

async function saveNewAsset() {
    const nombre = document.getElementById('new-asset-nombre').value.trim();
    const vertical = document.getElementById('new-asset-vertical').value;
    const api = document.getElementById('new-asset-api').value;
    const identificador = document.getElementById('new-asset-identificador').value.trim();
    const moneda = document.getElementById('new-asset-moneda').value;
    const unidad_cantidad = document.getElementById('new-asset-unidad').value;
    const precio_actual_manual = parseFloat(document.getElementById('new-asset-precio').value) || 0;

    if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

    const payload = { nombre, vertical, api, identificador, moneda, unidad_cantidad, precio_actual_manual };

    // Optional first purchase
    if (document.getElementById('new-asset-compra-toggle').checked) {
        const fecha = document.getElementById('new-asset-compra-fecha').value;
        const cantidad = parseFloat(document.getElementById('new-asset-compra-cantidad').value);
        const precio_unitario = parseFloat(document.getElementById('new-asset-compra-precio').value) || 0;
        if (fecha && cantidad > 0) {
            payload.compraInicial = { fecha, cantidad, precio_unitario };
        }
    }

    try {
        const resp = await fetch('/api/economato/activos/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (data.success) {
            showToast(`Activo "${nombre}" creado`, 'success');
            closeNewAssetModal();
            refreshPortfolio();
        } else {
            showToast(data.error || 'Error al crear', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

// ==========================================
//  COMPRA MODAL
// ==========================================

function openCompraModal(assetId) {
    closeAssetActions();
    const asset = assetMap[assetId];
    if (!asset) return;

    document.getElementById('compra-asset-id').value = assetId;
    document.getElementById('compra-asset-name').textContent = asset.nombre;
    document.getElementById('compra-fecha').value = todayStr();
    document.getElementById('compra-cantidad').value = '';
    document.getElementById('compra-precio').value = '';
    document.getElementById('compra-total-preview').textContent = '';

    // Live total preview
    const qtyEl = document.getElementById('compra-cantidad');
    const priceEl = document.getElementById('compra-precio');
    const previewEl = document.getElementById('compra-total-preview');
    const updatePreview = () => {
        const q = parseFloat(qtyEl.value) || 0;
        const p = parseFloat(priceEl.value) || 0;
        previewEl.textContent = q > 0 && p > 0 ? `Total: ${formatCurrency(q * p)}` : '';
    };
    qtyEl.oninput = updatePreview;
    priceEl.oninput = updatePreview;

    const modal = document.getElementById('modal-compra');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeCompraModal() {
    const modal = document.getElementById('modal-compra');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function saveCompra() {
    const assetId = document.getElementById('compra-asset-id').value;
    const fecha = document.getElementById('compra-fecha').value;
    const cantidad = parseFloat(document.getElementById('compra-cantidad').value);
    const precio_unitario = parseFloat(document.getElementById('compra-precio').value) || 0;

    if (!fecha || !cantidad || cantidad <= 0) { showToast('Fecha y cantidad son requeridos', 'error'); return; }

    try {
        const resp = await fetch(`/api/economato/activos/${encodeURIComponent(assetId)}/compra`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, cantidad, precio_unitario })
        });
        const data = await resp.json();
        if (data.success) {
            showToast('Compra registrada', 'success');
            closeCompraModal();
            refreshPortfolio();
        } else {
            showToast(data.error || 'Error', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

// ==========================================
//  VENTA MODAL
// ==========================================

function openVentaModal(assetId) {
    closeAssetActions();
    const asset = assetMap[assetId];
    if (!asset) return;

    document.getElementById('venta-asset-id').value = assetId;
    document.getElementById('venta-asset-name').textContent = asset.nombre;
    document.getElementById('venta-holdings').textContent = `Holdings actuales: ${formatQty(asset.cantActual)} unidades`;
    document.getElementById('venta-fecha').value = todayStr();
    document.getElementById('venta-cantidad').value = '';
    document.getElementById('venta-precio').value = '';
    document.getElementById('venta-total-preview').textContent = '';

    // Live total preview
    const qtyEl = document.getElementById('venta-cantidad');
    const priceEl = document.getElementById('venta-precio');
    const previewEl = document.getElementById('venta-total-preview');
    const updatePreview = () => {
        const q = parseFloat(qtyEl.value) || 0;
        const p = parseFloat(priceEl.value) || 0;
        previewEl.textContent = q > 0 && p > 0 ? `Total venta: ${formatCurrency(q * p)}` : '';
    };
    qtyEl.oninput = updatePreview;
    priceEl.oninput = updatePreview;

    const modal = document.getElementById('modal-venta');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeVentaModal() {
    const modal = document.getElementById('modal-venta');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function saveVenta() {
    const assetId = document.getElementById('venta-asset-id').value;
    const fecha = document.getElementById('venta-fecha').value;
    const cantidad = parseFloat(document.getElementById('venta-cantidad').value);
    const precio_unitario = parseFloat(document.getElementById('venta-precio').value);

    if (!fecha || !cantidad || cantidad <= 0 || isNaN(precio_unitario)) { showToast('Todos los campos son requeridos', 'error'); return; }

    try {
        const resp = await fetch(`/api/economato/activos/${encodeURIComponent(assetId)}/venta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, cantidad, precio_unitario })
        });
        const data = await resp.json();
        if (data.success) {
            showToast('Venta registrada', 'success');
            closeVentaModal();
            refreshPortfolio();
        } else {
            showToast(data.error || 'Error', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

// ==========================================
//  PRECIO MANUAL MODAL
// ==========================================

function openPrecioModal(assetId) {
    closeAssetActions();
    const asset = assetMap[assetId];
    if (!asset) return;

    document.getElementById('precio-asset-id').value = assetId;
    document.getElementById('precio-asset-name').textContent = asset.nombre;
    document.getElementById('precio-valor').value = asset.precioActual || '';

    const modal = document.getElementById('modal-precio');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => document.getElementById('precio-valor').focus(), 100);
}

function closePrecioModal() {
    const modal = document.getElementById('modal-precio');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function saveManualPrice() {
    const assetId = document.getElementById('precio-asset-id').value;
    const precio = parseFloat(document.getElementById('precio-valor').value);

    if (isNaN(precio) || precio < 0) { showToast('Precio no válido', 'error'); return; }

    try {
        const resp = await fetch(`/api/economato/activos/${encodeURIComponent(assetId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ precio_actual_manual: precio })
        });
        const data = await resp.json();
        if (data.success) {
            showToast('Precio actualizado', 'success');
            closePrecioModal();
            refreshPortfolio();
        } else {
            showToast(data.error || 'Error', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

// ==========================================
//  CHANGE STATUS
// ==========================================

async function changeAssetStatus(assetId, newStatus) {
    closeAssetActions();
    try {
        const resp = await fetch(`/api/economato/activos/${encodeURIComponent(assetId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: newStatus })
        });
        const data = await resp.json();
        if (data.success) {
            showToast(`Estado: ${newStatus}`, 'success');
            refreshPortfolio();
        } else {
            showToast(data.error || 'Error', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

// ==========================================
//  REFRESH
// ==========================================

async function refreshPortfolio() {
    // Invalidate cache
    const DB = window.WhVaultDB;
    if (DB?.STORES?.ECONOMATO_PORTFOLIO) {
        try { await DB.cacheApiData(DB.STORES.ECONOMATO_PORTFOLIO, []); } catch (e) {}
    }
    portfolioData = null;
    loadPortfolio();
}
