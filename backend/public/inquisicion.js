// ==========================================
//  INQUISICIÓN - INQUISICION.JS
// ==========================================

const API_URL = '/api';

// Estado global
let reviews = [];
let resumen = {};
let currentAno = 2026;
let isOfflineMode = false;

// Element config - matching Duty's PSI system colors
const ELEMENT_CONFIG = {
    // Poderes Ruinosos (Caos)
    khorne:     { icon: 'swords',        color: 'text-red-500',    bg: 'bg-red-500',    hex: '#ef4444', label: 'Khorne',     tipo: 'caos' },
    nurgle:     { icon: 'pest_control',  color: 'text-green-500',  bg: 'bg-green-500',  hex: '#22c55e', label: 'Nurgle',     tipo: 'caos' },
    tzeentch:   { icon: 'auto_fix_high', color: 'text-blue-400',   bg: 'bg-blue-400',   hex: '#60a5fa', label: 'Tzeentch',   tipo: 'caos' },
    slaanesh:   { icon: 'diamond',       color: 'text-pink-400',   bg: 'bg-pink-400',   hex: '#f472b6', label: 'Slaanesh',   tipo: 'caos' },
    // Virtudes Imperiales
    disciplina: { icon: 'military_tech', color: 'text-secondary',  bg: 'bg-secondary',  hex: '#c5a065', label: 'Disciplina', tipo: 'imperio' },
    fe:         { icon: 'church',        color: 'text-gray-200',   bg: 'bg-gray-200',   hex: '#e5e7eb', label: 'Fe',         tipo: 'imperio' },
    deber:      { icon: 'shield',        color: 'text-amber-600',  bg: 'bg-amber-600',  hex: '#d97706', label: 'Deber',      tipo: 'imperio' },
    humildad:   { icon: 'self_improvement', color: 'text-gray-400', bg: 'bg-gray-400',  hex: '#9ca3af', label: 'Humildad',   tipo: 'imperio' },
};

// ==========================================
//  UTILIDADES
// ==========================================

function getFechaImperial() {
    const now = new Date();
    const dias = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

    const diaSemana = dias[now.getDay()];
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = meses[now.getMonth()];

    return `+++ ${diaSemana} ${dia} ${mes} +++`;
}

function setLoading(loading) {
    const loadingEl = document.getElementById('loading-state');
    const mainEl = document.getElementById('main-content');
    const errorEl = document.getElementById('error-state');

    if (loadingEl) loadingEl.classList.toggle('hidden', !loading);
    if (mainEl) mainEl.classList.toggle('hidden', loading);
    if (errorEl) errorEl.classList.add('hidden');

    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');

    if (loading && statusText && statusDot) {
        statusText.textContent = 'SYNC...';
        statusDot.classList.remove('bg-green-500', 'bg-red-500');
        statusDot.classList.add('bg-yellow-500');
    }
}

function showError() {
    const loadingEl = document.getElementById('loading-state');
    const mainEl = document.getElementById('main-content');
    const errorEl = document.getElementById('error-state');

    if (loadingEl) loadingEl.classList.add('hidden');
    if (mainEl) mainEl.classList.add('hidden');
    if (errorEl) {
        errorEl.classList.remove('hidden');
        errorEl.classList.add('flex');
    }

    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    if (statusText) statusText.textContent = 'ERROR';
    if (statusDot) {
        statusDot.classList.remove('bg-green-500', 'bg-yellow-500');
        statusDot.classList.add('bg-red-500');
    }
}

function updateConnectionUI(online) {
    isOfflineMode = !online;
    if (window.WhVaultSync && window.WhVaultSync.updateConnectionStatusUI) {
        window.WhVaultSync.updateConnectionStatusUI(online);
    }
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
    toast.style.cssText = `
        position: fixed; top: 1rem; left: 50%; transform: translateX(-50%);
        background: ${type === 'error' ? '#d41132' : '#16a34a'}; color: white;
        padding: 0.5rem 1rem; border-radius: 2px; font-size: 0.875rem;
        font-weight: bold; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// ==========================================
//  API CALLS - CACHE-FIRST PATTERN
// ==========================================

async function cargarReviews() {
    try {
        const DB = window.WhVaultDB;
        const cogitatorOnline = DB?.getCogitatorStatus?.() ?? false;

        // 1. CACHE-FIRST: Intentar cargar desde IndexedDB primero
        if (DB) {
            const cached = await DB.getCachedData(DB.STORES.REVIEWS);

            if (cached.data && cached.data.length > 0) {
                console.log('[Cache] Displaying cached reviews immediately');

                // Filtrar por año actual
                const cachedForYear = cached.data.filter(r => r.ano === currentAno);

                if (cachedForYear.length > 0) {
                    // Reconstruir resumen desde datos cacheados
                    const reviewsData = cachedForYear[0];
                    reviews = reviewsData.reviews || [];
                    resumen = reviewsData.resumen || {};

                    renderAll();
                    setLoading(false);

                    updateDataFreshnessUI(!cached.isFresh, cached.lastUpdate);

                    if (!cached.isFresh) {
                        console.log('[Cache] Fetching fresh reviews in background...');
                        fetchAndCacheReviews(true);
                    } else {
                        DB?.checkCogitatorStatus?.().then(online => {
                            updateConnectionUI(online);
                        });
                    }

                    return;
                }
            }
        }

        // 2. NO HAY CACHE - Intentar fetch siempre (cogitator puede estar disponible
        //    aunque getCogitatorStatus devuelva false en el primer load)
        setLoading(true);
        await fetchAndCacheReviews(false);

    } catch (err) {
        console.error('Error cargando reviews:', err);
        updateConnectionUI(false);
        showError();
    }
}

/**
 * Fetch reviews from API and cache to IndexedDB
 * @param {boolean} silent - If true, don't show loading UI (background update)
 */
async function fetchAndCacheReviews(silent = false) {
    try {
        const DB = window.WhVaultDB;
        const fetchFn = DB?.fetchWithTimeout || fetch;

        const res = await fetchFn(`${API_URL}/reviews?ano=${currentAno}`);
        const data = await res.json();

        if (data.offline) {
            if (!silent) {
                updateConnectionUI(false);
                showToast('Cogitator no disponible', 'error');
            }
            return;
        }

        if (data.success) {
            reviews = data.reviews || [];
            resumen = data.resumen || {};

            // Cache con ID por año para poder filtrar después
            if (DB) {
                const cachePayload = [{
                    id: `reviews-${currentAno}`,
                    ano: currentAno,
                    reviews: reviews,
                    resumen: resumen
                }];
                await DB.cacheApiData(DB.STORES.REVIEWS, cachePayload);
            }

            if (DB?.updateCogitatorStatus) {
                DB.updateCogitatorStatus(true);
            }

            if (!silent) {
                renderAll();
                setLoading(false);
            } else {
                // Silent update - re-render with fresh data
                renderAll();
            }

            updateConnectionUI(true);
            updateDataFreshnessUI(false, Date.now());

            console.log(`[Cache] Reviews ${currentAno} fetched and cached (${reviews.length} reviews)`);
        } else if (!silent) {
            showError();
        }

    } catch (err) {
        console.error('Error fetching reviews:', err);

        if (window.WhVaultDB?.updateCogitatorStatus) {
            window.WhVaultDB.updateCogitatorStatus(false);
        }

        if (!silent) {
            updateConnectionUI(false);
            const hasCache = await window.WhVaultDB?.hasCachedData(window.WhVaultDB.STORES.REVIEWS);
            if (!hasCache) {
                showError();
            }
        }
    }
}

/**
 * Show/hide stale data indicator
 */
function updateDataFreshnessUI(isStale, lastUpdate) {
    let indicator = document.getElementById('data-freshness');

    if (!isStale) {
        if (indicator) indicator.remove();
        return;
    }

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'data-freshness';
        indicator.className = 'fixed bottom-16 left-0 right-0 bg-amber-900/90 border-t border-amber-700/50 px-3 py-1 flex items-center justify-center gap-2 text-amber-200 text-[10px] font-mono z-40';
        document.body.appendChild(indicator);
    }

    const timeAgo = window.WhVaultDB?.formatLastUpdate(lastUpdate) || 'Unknown';
    const cogitatorOnline = window.WhVaultDB?.getCogitatorStatus?.() ?? false;
    const statusText = cogitatorOnline ? 'Updating...' : 'Offline';
    const statusColor = cogitatorOnline ? 'text-amber-400' : 'text-amber-500';

    indicator.innerHTML = `
        <span class="material-symbols-outlined text-amber-400 text-sm">schedule</span>
        <span>Cached data from ${timeAgo}</span>
        <span class="${statusColor}">(${statusText})</span>
    `;
}

// ==========================================
//  YEAR SELECTOR
// ==========================================

function cambiarAno(year) {
    if (year === currentAno) return;
    currentAno = year;
    updateYearButtons();
    setLoading(true);
    cargarReviews();
}

function updateYearButtons() {
    const btn2025 = document.getElementById('btn-2025');
    const btn2026 = document.getElementById('btn-2026');
    if (!btn2025 || !btn2026) return;

    if (currentAno === 2025) {
        btn2025.className = 'px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-widest border transition-all bg-primary-dark/30 border-primary/50 text-primary';
        btn2026.className = 'px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-widest border transition-all bg-surface-dark border-[#332224] text-gray-500';
    } else {
        btn2025.className = 'px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-widest border transition-all bg-surface-dark border-[#332224] text-gray-500';
        btn2026.className = 'px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-widest border transition-all bg-primary-dark/30 border-primary/50 text-primary';
    }
}

// ==========================================
//  RENDER FUNCTIONS
// ==========================================

function renderAll() {
    document.getElementById('fecha-imperial').textContent = getFechaImperial();
    renderStats();
    renderMonthStats();
    renderTrendChart();
    renderHeatmap();
    renderReviewsList();
}

function renderStats() {
    // Pureza
    const purezaEl = document.getElementById('stat-pureza');
    const purezaNivelEl = document.getElementById('stat-pureza-nivel');
    if (purezaEl) {
        const pureza = resumen.purezaPromedio || 0;
        purezaEl.textContent = `${Math.round(pureza)}%`;

        // Color by level
        let colorClass, nivel;
        if (pureza >= 80) {
            colorClass = 'text-green-500';
            nivel = 'PURO';
        } else if (pureza >= 50) {
            colorClass = 'text-amber-500';
            nivel = 'EQUILIBRADO';
        } else if (pureza > 0) {
            colorClass = 'text-red-500';
            nivel = 'CORROMPIDO';
        } else {
            colorClass = 'text-gray-500';
            nivel = '---';
        }

        purezaEl.className = `text-2xl font-bold font-mono ${colorClass}`;
        if (purezaNivelEl) {
            purezaNivelEl.textContent = nivel;
            purezaNivelEl.className = `text-[8px] font-mono uppercase tracking-widest mt-0.5 ${colorClass} opacity-70`;
        }
    }

    // XP
    const xpEl = document.getElementById('stat-xp');
    if (xpEl) xpEl.textContent = (resumen.xpTotal || 0).toLocaleString();

    // Dias perfectos
    const perfectosEl = document.getElementById('stat-perfectos');
    if (perfectosEl) perfectosEl.textContent = resumen.diasPerfectos || 0;

    // Semanas
    const semanasEl = document.getElementById('stat-semanas');
    if (semanasEl) {
        semanasEl.innerHTML = `${resumen.semanasTrackeadas || 0}<span class="text-sm text-gray-600">/52</span>`;
    }
}

function renderMonthStats() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Calcular rango de semanas del mes actual
    const firstDayOfMonth = new Date(currentAno, currentMonth - 1, 1);
    const lastDayOfMonth = new Date(currentAno, currentMonth, 0);

    // Helper para obtener semana del año
    const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };

    const firstWeek = getWeekNumber(firstDayOfMonth);
    const lastWeek = getWeekNumber(lastDayOfMonth);

    // Filtrar reviews del mes actual
    const reviewsDelMes = reviews.filter(r => {
        const sem = r.semana;
        // Manejar caso especial de semana 1 en diciembre/enero
        if (currentMonth === 12 && sem === 1) return true;
        if (currentMonth === 1 && sem >= 52) return true;
        return sem >= firstWeek && sem <= lastWeek;
    });

    // Calcular stats del mes
    let purezaTotal = 0;
    let diasPerfectosTotal = 0;
    let xpTotal = 0;

    reviewsDelMes.forEach(r => {
        purezaTotal += r.purezaPromedio || 0;
        diasPerfectosTotal += r.diasPerfectos || 0;
        xpTotal += r.xpTotal || 0;
    });

    const purezaPromedio = reviewsDelMes.length > 0 ? purezaTotal / reviewsDelMes.length : 0;

    // Calcular racha actual (semanas consecutivas con pureza >= 70%)
    let racha = 0;
    const sortedReviews = [...reviews].sort((a, b) => b.semana - a.semana);
    for (const r of sortedReviews) {
        if ((r.purezaPromedio || 0) >= 70) {
            racha++;
        } else {
            break;
        }
    }

    // Renderizar Pureza Mes
    const purezaMesEl = document.getElementById('month-pureza');
    const purezaMesNivelEl = document.getElementById('month-pureza-nivel');
    if (purezaMesEl) {
        purezaMesEl.textContent = `${Math.round(purezaPromedio)}%`;

        let colorClass, nivel;
        if (purezaPromedio >= 80) {
            colorClass = 'text-green-500';
            nivel = 'PURO';
        } else if (purezaPromedio >= 50) {
            colorClass = 'text-amber-500';
            nivel = 'EQUILIBRADO';
        } else if (purezaPromedio > 0) {
            colorClass = 'text-red-500';
            nivel = 'CORROMPIDO';
        } else {
            colorClass = 'text-gray-500';
            nivel = '---';
        }

        purezaMesEl.className = `text-2xl font-bold font-mono ${colorClass}`;
        if (purezaMesNivelEl) {
            purezaMesNivelEl.textContent = nivel;
            purezaMesNivelEl.className = `text-[8px] font-mono uppercase tracking-widest mt-0.5 ${colorClass} opacity-70`;
        }
    }

    // Renderizar Dias Perfectos Mes
    const perfectosMesEl = document.getElementById('month-perfectos');
    if (perfectosMesEl) perfectosMesEl.textContent = diasPerfectosTotal;

    // Renderizar XP Mes
    const xpMesEl = document.getElementById('month-xp');
    if (xpMesEl) xpMesEl.textContent = xpTotal.toLocaleString();

    // Renderizar Racha
    const streakEl = document.getElementById('month-streak');
    if (streakEl) {
        streakEl.innerHTML = `${racha}<span class="text-sm text-gray-600"> sem</span>`;

        // Color por racha
        let streakColor;
        if (racha >= 4) {
            streakColor = 'text-green-500';
        } else if (racha >= 2) {
            streakColor = 'text-amber-500';
        } else if (racha > 0) {
            streakColor = 'text-amber-500';
        } else {
            streakColor = 'text-gray-500';
        }

        streakEl.className = `text-2xl font-bold font-mono ${streakColor}`;
    }
}

function renderTrendChart() {
    const container = document.getElementById('trend-chart-container');
    if (!container) return;

    // Obtener últimas 12 semanas con datos
    const sortedReviews = [...reviews]
        .filter(r => r.purezaPromedio !== undefined)
        .sort((a, b) => a.semana - b.semana)
        .slice(-12);

    if (sortedReviews.length === 0) {
        container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-600 text-sm font-mono">SIN DATOS SUFICIENTES</div>';
        return;
    }

    // Configuración del gráfico
    const width = container.offsetWidth || 300;
    const height = container.offsetHeight || 192;
    const padding = { top: 20, right: 30, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Escala Y: 0-100%
    const maxY = 100;
    const minY = 0;

    // Crear puntos
    const points = sortedReviews.map((r, i) => {
        const x = padding.left + (i / Math.max(sortedReviews.length - 1, 1)) * chartWidth;
        const y = padding.top + chartHeight - ((r.purezaPromedio / maxY) * chartHeight);
        return { x, y, semana: r.semana, pureza: r.purezaPromedio };
    });

    // Crear path para la línea
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    // Determinar color de línea basado en tendencia
    const firstHalf = sortedReviews.slice(0, Math.floor(sortedReviews.length / 2));
    const secondHalf = sortedReviews.slice(Math.floor(sortedReviews.length / 2));
    const avgFirst = firstHalf.reduce((acc, r) => acc + r.purezaPromedio, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((acc, r) => acc + r.purezaPromedio, 0) / secondHalf.length;
    const trending = avgSecond > avgFirst ? 'up' : avgSecond < avgFirst ? 'down' : 'stable';
    const lineColor = trending === 'up' ? '#22c55e' : trending === 'down' ? '#ef4444' : '#f59e0b';

    // Crear SVG
    let svg = `<svg width="${width}" height="${height}" class="overflow-visible">`;

    // Líneas de referencia
    const ref80Y = padding.top + chartHeight - (80 / maxY) * chartHeight;
    const ref50Y = padding.top + chartHeight - (50 / maxY) * chartHeight;

    svg += `<line x1="${padding.left}" y1="${ref80Y}" x2="${width - padding.right}" y2="${ref80Y}" stroke="#22c55e" stroke-width="1" stroke-dasharray="4 2" opacity="0.3"/>`;
    svg += `<line x1="${padding.left}" y1="${ref50Y}" x2="${width - padding.right}" y2="${ref50Y}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 2" opacity="0.3"/>`;

    // Eje Y labels
    svg += `<text x="${padding.left - 10}" y="${padding.top}" text-anchor="end" fill="#9ca3af" font-size="10" font-family="monospace">100%</text>`;
    svg += `<text x="${padding.left - 10}" y="${ref80Y + 3}" text-anchor="end" fill="#22c55e" font-size="9" font-family="monospace">80%</text>`;
    svg += `<text x="${padding.left - 10}" y="${ref50Y + 3}" text-anchor="end" fill="#ef4444" font-size="9" font-family="monospace">50%</text>`;
    svg += `<text x="${padding.left - 10}" y="${height - padding.bottom}" text-anchor="end" fill="#9ca3af" font-size="10" font-family="monospace">0%</text>`;

    // Área bajo la curva (gradiente)
    const areaPath = `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;
    svg += `<path d="${areaPath}" fill="${lineColor}" opacity="0.1"/>`;

    // Línea principal
    svg += `<path d="${pathD}" stroke="${lineColor}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

    // Puntos
    points.forEach(p => {
        svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${lineColor}" stroke="#0f0f10" stroke-width="2">`;
        svg += `<title>Semana ${p.semana}: ${Math.round(p.pureza)}%</title>`;
        svg += `</circle>`;
    });

    // Eje X labels (cada 2 semanas para no saturar)
    points.forEach((p, i) => {
        if (i % 2 === 0 || i === points.length - 1) {
            svg += `<text x="${p.x}" y="${height - padding.bottom + 15}" text-anchor="middle" fill="#6b7280" font-size="9" font-family="monospace">S${p.semana}</text>`;
        }
    });

    svg += '</svg>';

    container.innerHTML = svg;
}

function renderHeatmap() {
    const container = document.getElementById('heatmap');
    if (!container) return;

    // Build week map from reviews
    const weekMap = {};
    reviews.forEach(r => {
        weekMap[r.semana] = r.purezaPromedio;
    });

    let html = '';
    for (let week = 1; week <= 52; week++) {
        const pureza = weekMap[week];
        let bgColor, borderStyle, textColor;

        if (pureza === undefined || pureza === null) {
            bgColor = 'bg-[#1a1718]';
            borderStyle = 'border border-[#252020]';
            textColor = 'text-gray-700';
        } else if (pureza >= 80) {
            bgColor = 'bg-green-700';
            borderStyle = 'border border-green-600/30';
            textColor = 'text-green-200/60';
        } else if (pureza >= 50) {
            bgColor = 'bg-amber-700';
            borderStyle = 'border border-amber-600/30';
            textColor = 'text-amber-200/60';
        } else {
            bgColor = 'bg-red-900';
            borderStyle = 'border border-red-700/30';
            textColor = 'text-red-200/60';
        }

        html += `<div class="heatmap-cell ${bgColor} ${borderStyle} ${textColor}" title="Semana ${week}${pureza !== undefined ? ': ' + Math.round(pureza) + '%' : ''}">${week}</div>`;
    }

    container.innerHTML = html;
}

function renderReviewsList() {
    const container = document.getElementById('reviews-list');
    const emptyState = document.getElementById('empty-reviews');
    if (!container) return;

    if (reviews.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Sort reviews by semana descending (most recent first)
    const sorted = [...reviews].sort((a, b) => b.semana - a.semana);

    container.innerHTML = sorted.map(r => renderReviewCard(r)).join('');
}

function renderReviewCard(review) {
    const {
        semana, fechaInicio, fechaFin,
        purezaPromedio, nivelPureza,
        rutinasCompletadas, rutinasTotal,
        diasPerfectos, xpTotal,
        elementoDominante
    } = review;

    const pureza = Math.round(purezaPromedio || 0);

    // Purity-based styling (matching directivas.js pattern)
    let borderColor, accentColor, shieldIcon, gradientFrom, glowColor, cornerHex, barColor;
    if (pureza >= 80) {
        borderColor = 'border-green-700/50';
        accentColor = 'text-green-500';
        shieldIcon = 'verified_user';
        gradientFrom = 'from-[#0a1f0d]';
        glowColor = 'rgba(34,197,94,0.4)';
        cornerHex = '#15803d';
        barColor = 'bg-green-600';
    } else if (pureza >= 50) {
        borderColor = 'border-amber-700/50';
        accentColor = 'text-amber-500';
        shieldIcon = 'shield';
        gradientFrom = 'from-[#1f1a0a]';
        glowColor = 'rgba(245,158,11,0.4)';
        cornerHex = '#b45309';
        barColor = 'bg-amber-600';
    } else if (pureza > 0) {
        borderColor = 'border-red-800/50';
        accentColor = 'text-red-500';
        shieldIcon = 'shield_with_heart';
        gradientFrom = 'from-[#1f0a0a]';
        glowColor = 'rgba(239,68,68,0.4)';
        cornerHex = '#991b1b';
        barColor = 'bg-red-700';
    } else {
        borderColor = 'border-[#332224]';
        accentColor = 'text-gray-500';
        shieldIcon = 'shield';
        gradientFrom = 'from-[#151515]';
        glowColor = 'rgba(100,100,100,0.2)';
        cornerHex = '#374151';
        barColor = 'bg-gray-700';
    }

    // Format dates
    const fechaInicioStr = fechaInicio ? formatFechaCorta(fechaInicio) : '???';
    const fechaFinStr = fechaFin ? formatFechaCorta(fechaFin) : '???';

    // Element dominante - use ELEMENT_CONFIG
    const elem = elementoDominante?.nombre ? ELEMENT_CONFIG[elementoDominante.nombre] : null;
    const elemHTML = elem ? `
        <div class="flex items-center gap-1.5 px-2 py-1 rounded-sm ${elem.tipo === 'caos' ? 'bg-red-950/40 border border-red-800/30' : 'bg-amber-950/30 border border-secondary/20'}">
            <span class="material-symbols-outlined ${elem.color} text-xs">${elem.icon}</span>
            <span class="text-[9px] font-mono ${elem.color} uppercase tracking-wider font-bold">${elem.label}</span>
        </div>
    ` : '';

    // Rutinas percentage for mini bar
    const rutPct = rutinasTotal > 0 ? Math.round((rutinasCompletadas / rutinasTotal) * 100) : 0;

    return `
        <div class="bg-gradient-to-b ${gradientFrom} to-surface-dark border ${borderColor} relative overflow-hidden rounded-sm" style="box-shadow: 0 0 12px ${glowColor}">
            <!-- Corner accents -->
            <div class="absolute top-0 left-0 w-1.5 h-1.5" style="background: ${cornerHex};"></div>
            <div class="absolute top-0 right-0 w-1.5 h-1.5" style="background: ${cornerHex};"></div>
            <div class="absolute bottom-0 left-0 w-1.5 h-1.5" style="background: ${cornerHex};"></div>
            <div class="absolute bottom-0 right-0 w-1.5 h-1.5" style="background: ${cornerHex};"></div>

            <!-- Header row -->
            <div class="flex items-center justify-between p-3 pb-2">
                <div class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined ${accentColor} text-xl" style="text-shadow: 0 0 8px ${glowColor};">${shieldIcon}</span>
                    <div>
                        <p class="text-white text-xs font-bold uppercase tracking-wide font-display">Semana ${semana}</p>
                        <p class="text-gray-500 text-[9px] font-mono">${fechaInicioStr} — ${fechaFinStr}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="${accentColor} text-xl font-bold font-mono" style="text-shadow: 0 0 6px ${glowColor};">${pureza}%</p>
                    <p class="${accentColor} text-[8px] font-mono uppercase tracking-widest opacity-70">${nivelPureza || '---'}</p>
                </div>
            </div>

            <!-- Pureza progress bar -->
            <div class="mx-3 h-1 bg-[#120c0d] rounded-full overflow-hidden">
                <div class="${barColor} h-full rounded-full transition-all relative" style="width: ${pureza}%">
                    <div class="absolute right-0 top-0 bottom-0 w-0.5 bg-white/40"></div>
                </div>
            </div>

            <!-- Stats row -->
            <div class="flex items-center justify-between px-3 pt-2 pb-2.5 gap-2">
                <div class="flex items-center gap-3 text-[10px] font-mono text-gray-400">
                    <span class="flex items-center gap-1" title="Rutinas">
                        <span class="material-symbols-outlined text-secondary text-[11px]">checklist</span>
                        <span>${rutinasCompletadas || 0}/${rutinasTotal || 0}</span>
                    </span>
                    <span class="flex items-center gap-1" title="Días perfectos">
                        <span class="material-symbols-outlined text-green-600 text-[11px]">star</span>
                        <span>${diasPerfectos || 0}d</span>
                    </span>
                    <span class="flex items-center gap-1" title="XP">
                        <span class="material-symbols-outlined text-secondary text-[11px]">hexagon</span>
                        <span>${(xpTotal || 0).toLocaleString()}</span>
                    </span>
                </div>
                ${elemHTML}
            </div>
        </div>
    `;
}

function formatFechaCorta(fecha) {
    if (!fecha) return '???';
    // fecha can be "2026-02-02" string or Date
    const str = typeof fecha === 'string' ? fecha : fecha.toISOString().split('T')[0];
    const parts = str.split('-');
    if (parts.length !== 3) return str;
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mes = parseInt(parts[1], 10);
    const dia = parseInt(parts[2], 10);
    return `${dia} ${meses[mes - 1] || '???'}`;
}

// ==========================================
//  INIT
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Registrar para cambios de cogitator
    if (window.WhVaultDB) {
        window.WhVaultDB.onCogitatorChange(async (online) => {
            updateConnectionUI(online);
            if (online && isOfflineMode) {
                showToast('Cogitator restaurado', 'success');
                if (window.WhVaultSync?.processPendingSync) {
                    await window.WhVaultSync.processPendingSync();
                }
                cargarReviews();
            }
        });
    }

    // Set initial year buttons state
    updateYearButtons();

    // Cargar datos iniciales
    cargarReviews();

    // Actualizar fecha cada minuto
    setInterval(() => {
        const el = document.getElementById('fecha-imperial');
        if (el) el.textContent = getFechaImperial();
    }, 60000);
});
