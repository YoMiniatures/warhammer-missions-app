// ==========================================
//  AUSPEX - EVENT LOG (Slot Machine Style)
// ==========================================

const API_URL = '/api';

// Estado global
let eventos = [];
let eventosSemana = [];
let isOfflineMode = false;

// Estado del picker
let pickerItems = [];
let currentOffset = 0;
let targetOffset = 0;
let isDragging = false;
let startY = 0;
let startOffset = 0;
let velocity = 0;
let lastY = 0;
let lastTime = 0;
let animationId = null;
let itemHeight = 85; // Altura estimada de cada item
let todayIndex = 0; // Índice del evento actual/próximo para "volver al hoy"
let centerOffset = 0; // Offset del centro del viewport

// Nombres de meses
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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

function parseFechaLocal(fechaStr) {
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatFechaCorta(fechaStr) {
    const [, m, d] = fechaStr.split('-').map(Number);
    const mes = MESES[m - 1].substring(0, 3).toUpperCase();
    return `${d} ${mes}`;
}

function getHoyStr() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

function isToday(fechaStr) {
    return fechaStr === getHoyStr();
}

function isPast(fechaStr) {
    return fechaStr < getHoyStr();
}

function getDiasHasta(fechaStr) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = parseFechaLocal(fechaStr);
    const diff = fecha - hoy;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getMesFromFecha(fechaStr) {
    const [, m] = fechaStr.split('-').map(Number);
    return m - 1;
}

function updateHeader() {
    document.getElementById('fecha-imperial').textContent = getFechaImperial();
    const añoActual = new Date().getFullYear();
    const subtitulo = document.getElementById('year-subtitle');
    if (subtitulo) {
        subtitulo.textContent = `/// Annual Timeline ${añoActual} ///`;
    }
}

function setLoading(loading) {
    const loadingState = document.getElementById('loading-state');
    const mainContent = document.getElementById('main-content');
    const errorState = document.getElementById('error-state');

    console.log('[Auspex] setLoading:', loading);

    if (loading) {
        loadingState.classList.remove('hidden');
        mainContent.classList.add('hidden');
    } else {
        loadingState.classList.add('hidden');
        mainContent.classList.remove('hidden');
        // Height is managed by flex-1 class
        console.log('[Auspex] Main content height:', mainContent.offsetHeight);
    }
    errorState.classList.add('hidden');
    errorState.classList.remove('flex');
}

function showError() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    document.getElementById('error-state').classList.add('flex');
}

function updateConnectionUI(online) {
    isOfflineMode = !online;
    if (window.WhVaultSync && window.WhVaultSync.updateConnectionStatusUI) {
        window.WhVaultSync.updateConnectionStatusUI(online);
    }
}

// ==========================================
//  API CALLS
// ==========================================

async function loadCheckupsParaAuspex() {
    try {
        const res = await fetch('/api/bahia/checkups');
        const data = await res.json();
        return (data.checkups || [])
            .filter(c => !c.completed)
            .map(c => ({
                tipo: 'checkup-medico',
                id: c.id,
                titulo: c.motivo || c.name || 'Cita médica',
                fecha: c.date,
                hora: c.time,
                medico: c.medico || c.doctor || '',
                especialidad: c.especialidad || '',
                condicionId: c.condicionId || null,
            }));
    } catch {
        return [];
    }
}

async function cargarEventos() {
    try {
        const DB = window.WhVaultDB;

        if (DB) {
            const cached = await DB.getCachedData(DB.STORES.EVENTOS);
            // Validate cache has reasonable amount of events (at least 20 for a full year)
            if (cached.data && cached.data.length >= 20) {
                eventos = cached.data;
                setLoading(false); // MUST be called before renderPicker to ensure height is set
                // Wait for DOM to update before rendering picker
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                renderPicker();
                updateDataFreshnessUI(!cached.isFresh, cached.lastUpdate);
                if (!cached.isFresh) {
                    fetchAndCacheEventos(true);
                } else {
                    // Cache is fresh - still merge checkups (they're not cached in IndexedDB)
                    loadCheckupsParaAuspex().then(checkups => {
                        if (checkups.length > 0) {
                            eventos = [...cached.data, ...checkups];
                            renderPicker();
                        }
                    });
                }
                return;
            } else if (cached.data && cached.data.length > 0) {
                // Cache seems corrupted (too few events), clear it and fetch fresh
                console.warn('[Auspex] Cache corrupted (only ' + cached.data.length + ' events), clearing and fetching fresh...');
                await DB.clearStore(DB.STORES.EVENTOS);
            }
        }

        setLoading(true);
        await fetchAndCacheEventos(false);
    } catch (error) {
        console.error('Error cargando eventos:', error);
        showError();
    }
}

async function fetchAndCacheEventos(silent = false) {
    try {
        const DB = window.WhVaultDB;
        const fetchFn = DB?.fetchWithTimeout || fetch;

        console.log('[Auspex] Fetching eventos from API...');
        const response = await fetchFn(`${API_URL}/eventos/anual`);
        const data = await response.json();
        console.log('[Auspex] API response:', data);

        if (data.success && data.eventos) {
            // Merge checkups médicos en el timeline
            const checkups = await loadCheckupsParaAuspex();
            eventos = [...data.eventos, ...checkups];
            console.log('[Auspex] Loaded', data.eventos.length, 'eventos +', checkups.length, 'citas médicas');

            if (DB) {
                const eventosWithUniqueIds = data.eventos.map((e, idx) => ({
                    ...e,
                    id: `${e.id || 'evt'}-${e.fecha || idx}`
                }));
                await DB.cacheApiData(DB.STORES.EVENTOS, eventosWithUniqueIds);
            }

            if (!silent) {
                setLoading(false);
                // Wait for DOM to update before rendering picker
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                renderPicker();
            }

            updateConnectionUI(true);
            updateDataFreshnessUI(false, Date.now());
        }

        await fetchEventosSemana();
    } catch (error) {
        console.error('Error fetching eventos:', error);
        if (!silent) showError();
    }
}

async function fetchEventosSemana() {
    try {
        const response = await fetch(`${API_URL}/eventos/semana`);
        const data = await response.json();
        if (data.success && data.eventos) {
            eventosSemana = data.eventos;
            renderTicker();
        }
    } catch (error) {
        console.log('Error loading week events:', error);
    }
}

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
    indicator.innerHTML = `<span class="material-symbols-outlined text-amber-400 text-sm">schedule</span><span>Cached ${timeAgo}</span>`;
}

// ==========================================
//  PICKER / SLOT MACHINE
// ==========================================

function getEventoTipo(evento) {
    const tipo = evento.frontmatter?.tipo || evento.tipo || 'evento';
    const prioridad = evento.frontmatter?.prioridad;
    if (tipo === 'checkup-medico') return 'medical';
    if (prioridad === 'alta' || prioridad === 'urgente') return 'urgent';
    if (tipo === 'cumpleaños') return 'birthday';
    if (tipo === 'vacaciones') return 'holiday';
    if (tipo === 'aviso') return 'notice';
    return 'event';
}

function getEventoBadge(evento) {
    const tipo = evento.frontmatter?.tipo || evento.tipo || 'evento';
    const prioridad = evento.frontmatter?.prioridad;

    if (tipo === 'checkup-medico') {
        return `<span class="text-teal-400 text-[9px] font-mono border border-teal-400 px-1.5 py-0.5">MÉDICA</span>`;
    }
    if (prioridad === 'alta' || prioridad === 'urgente') {
        return `<span class="text-primary text-[9px] font-mono border border-primary px-1.5 py-0.5">PRIORITY</span>`;
    }
    if (tipo === 'cumpleaños') {
        return `<span class="text-pink-400 text-[9px] font-mono border border-pink-400 px-1.5 py-0.5">BIRTHDAY</span>`;
    }
    if (tipo === 'vacaciones') {
        return `<span class="text-blue-400 text-[9px] font-mono border border-blue-400 px-1.5 py-0.5">HOLIDAY</span>`;
    }
    if (tipo === 'aviso') {
        return `<span class="text-secondary text-[9px] font-mono border border-secondary px-1.5 py-0.5">NOTICE</span>`;
    }
    return `<span class="text-auspex-green/60 text-[9px] font-mono border border-auspex-green/40 px-1.5 py-0.5">EVENT</span>`;
}

function renderPicker() {
    console.log('[Auspex] renderPicker called, eventos:', eventos.length);

    const track = document.getElementById('picker-track');
    const viewport = document.getElementById('picker-viewport');

    console.log('[Auspex] track:', track, 'viewport:', viewport);

    if (!track || !viewport) {
        console.error('[Auspex] Missing track or viewport!');
        return;
    }

    // Construir lista de items (meses + eventos)
    pickerItems = [];
    const eventosPorMes = {};
    const añoActual = new Date().getFullYear();
    const mesActual = new Date().getMonth();
    const hoy = new Date().toISOString().split('T')[0];

    // Agrupar eventos por mes
    eventos.forEach(evento => {
        const mes = getMesFromFecha(evento.fecha);
        if (!eventosPorMes[mes]) eventosPorMes[mes] = [];
        eventosPorMes[mes].push(evento);
    });

    let html = '';
    let initialIndex = 0;
    let foundInitialEvent = false;

    // Renderizar cada mes
    for (let mesNum = 0; mesNum < 12; mesNum++) {
        const eventosDelMes = eventosPorMes[mesNum] || [];
        const esMesActual = mesNum === mesActual;

        // Ordenar eventos del mes por fecha
        eventosDelMes.sort((a, b) => a.fecha.localeCompare(b.fecha));

        // Header del mes - set as initial if it's current month and no event found yet
        if (esMesActual && !foundInitialEvent) {
            initialIndex = pickerItems.length;
        }

        html += `
            <div class="picker-item" data-type="month" data-month="${mesNum}">
                <div class="month-header">
                    <span class="month-header-label ${esMesActual ? 'text-auspex-green' : ''}">${MESES[mesNum]} ${añoActual}</span>
                    <div class="month-header-line"></div>
                    <span class="month-header-count">${eventosDelMes.length}</span>
                </div>
            </div>
        `;
        pickerItems.push({ type: 'month', month: mesNum });

        // Eventos del mes o placeholder vacío
        if (eventosDelMes.length === 0) {
            html += `
                <div class="picker-item" data-type="empty" data-month="${mesNum}">
                    <div class="empty-month">/// Sin eventos ///</div>
                </div>
            `;
            pickerItems.push({ type: 'empty', month: mesNum });
        } else {
            eventosDelMes.forEach((evento, idx) => {
                const tipoEvento = getEventoTipo(evento);
                const esHoy = isToday(evento.fecha);
                const esPasado = isPast(evento.fecha);
                const diasHasta = getDiasHasta(evento.fecha);

                // Marcar índice para scroll inicial (FIRST today or future event)
                if (!foundInitialEvent) {
                    if (esHoy) {
                        initialIndex = pickerItems.length;
                        foundInitialEvent = true;
                    } else if (!esPasado && diasHasta >= 0) {
                        initialIndex = pickerItems.length;
                        foundInitialEvent = true;
                    }
                }

                let cardClasses = 'event-card';
                if (esHoy) cardClasses += ' today';
                else if (tipoEvento === 'urgent') cardClasses += ' urgent';
                else if (tipoEvento === 'birthday') cardClasses += ' birthday';
                else if (tipoEvento === 'holiday') cardClasses += ' holiday';
                else if (tipoEvento === 'medical') cardClasses += ' medical';

                const descripcion = evento.content?.trim() || evento.frontmatter?.descripcion || '';

                html += `
                    <div class="picker-item" data-type="event" data-month="${mesNum}" data-fecha="${evento.fecha}">
                        <div class="${cardClasses}">
                            <div class="flex justify-between items-start gap-2 mb-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-auspex-green/60 text-[10px] font-mono">${formatFechaCorta(evento.fecha)}</span>
                                    ${esHoy ? '<span class="text-auspex-green text-[9px] font-bold bg-auspex-green/20 px-1.5 py-0.5">HOY</span>' : ''}
                                </div>
                                ${getEventoBadge(evento)}
                            </div>
                            <h3 class="text-white font-bold text-sm leading-tight ${esPasado ? 'opacity-50' : ''}">${evento.titulo}</h3>
                            ${evento.medico ? `<p class="text-teal-400/60 text-[11px] mt-0.5 line-clamp-1">${evento.medico}${evento.especialidad ? ' · ' + evento.especialidad : ''}</p>` : descripcion ? `<p class="text-gray-500 text-[11px] mt-1 line-clamp-1">${descripcion}</p>` : ''}
                            ${!esPasado && diasHasta > 0 ? `<div class="mt-1 text-[9px] text-auspex-green/40 font-mono">T-${diasHasta}d</div>` : ''}
                        </div>
                    </div>
                `;
                pickerItems.push({ type: 'event', month: mesNum, fecha: evento.fecha, evento });
            });
        }
    }

    track.innerHTML = html;
    console.log('[Auspex] Track HTML set, items:', pickerItems.length);

    // Calcular altura real de items después de render (using rAF to ensure DOM is ready)
    requestAnimationFrame(() => {
        const items = track.querySelectorAll('.picker-item');
        console.log('[Auspex] DOM items found:', items.length);

        if (items.length > 0) {
            itemHeight = items[0].offsetHeight || 85;
        }

        // Get viewport height - CSS calc should have set it already
        let viewportHeight = viewport.offsetHeight;
        console.log('[Auspex] viewportHeight:', viewportHeight, 'itemHeight:', itemHeight, 'initialIndex:', initialIndex);

        // Fallback if still no height (shouldn't happen with CSS calc)
        if (viewportHeight < 100) {
            viewportHeight = window.innerHeight - 262; // 70+48+80+64 = 262
            console.log('[Auspex] Using fallback height:', viewportHeight);
        }

        centerOffset = viewportHeight / 2 - itemHeight / 2;

        // Guardar índice para "volver al hoy"
        todayIndex = initialIndex;

        // Posicionar inicialmente unos items ANTES del día de hoy para el efecto de entrada
        const offsetBack = Math.min(5, initialIndex); // Máximo 5 items atrás
        const startIndex = Math.max(0, initialIndex - offsetBack);
        currentOffset = centerOffset - (startIndex * itemHeight);
        targetOffset = currentOffset;

        console.log('[Auspex] Initial offset:', currentOffset, 'todayIndex:', todayIndex);

        updatePickerPosition();
        updateActiveItems();

        // Setup de eventos de touch/mouse/wheel
        setupPickerInteraction();

        // Efecto de entrada: animar hacia el día de hoy después de un breve delay
        setTimeout(() => {
            scrollToToday();
        }, 300);
    });
}

function updatePickerPosition() {
    const track = document.getElementById('picker-track');
    if (track) {
        track.style.transform = `translateY(${currentOffset}px)`;
    }
}

function updateActiveItems() {
    const viewport = document.getElementById('picker-viewport');
    const items = document.querySelectorAll('.picker-item');
    const indicator = document.getElementById('month-indicator');

    if (!viewport || items.length === 0) return;

    const viewportRect = viewport.getBoundingClientRect();
    const centerY = viewportRect.top + viewportRect.height / 2;

    let activeMonth = 0;

    items.forEach((item) => {
        const itemRect = item.getBoundingClientRect();
        const itemCenterY = itemRect.top + itemRect.height / 2;
        const distanceFromCenter = Math.abs(itemCenterY - centerY);

        // Limpiar clases
        item.classList.remove('active', 'near');

        // Item en el centro (activo) - dentro de 45px del centro
        if (distanceFromCenter < 45) {
            item.classList.add('active');
            const month = parseInt(item.dataset.month);
            if (!isNaN(month)) activeMonth = month;
        }
        // Items cercanos - dentro de 120px del centro
        else if (distanceFromCenter < 120) {
            item.classList.add('near');
        }
    });

    // Actualizar indicador de mes
    if (indicator) {
        indicator.textContent = `${MESES[activeMonth]} ${new Date().getFullYear()}`;
    }
}

/**
 * Scroll animado al evento de hoy/próximo
 */
function scrollToToday() {
    const viewport = document.getElementById('picker-viewport');
    const items = document.querySelectorAll('.picker-item');

    if (!viewport || items.length === 0) return;

    // Buscar el evento de hoy o el próximo evento futuro
    const hoy = new Date().toISOString().split('T')[0];
    let targetItem = null;

    for (const item of items) {
        const fecha = item.dataset.fecha;
        if (!fecha) continue; // Saltar headers de mes

        if (fecha >= hoy) {
            targetItem = item;
            break; // Primer evento de hoy o futuro
        }
    }

    // Si no encontramos evento futuro, ir al último evento
    if (!targetItem && items.length > 0) {
        targetItem = items[items.length - 1];
    }

    if (!targetItem) return;

    // Calcular cuánto mover para centrar el item
    const viewportRect = viewport.getBoundingClientRect();
    const itemRect = targetItem.getBoundingClientRect();
    const viewportCenterY = viewportRect.top + viewportRect.height / 2;
    const itemCenterY = itemRect.top + itemRect.height / 2;
    const offsetNeeded = viewportCenterY - itemCenterY;

    // Si ya está centrado, no hacer nada
    if (Math.abs(offsetNeeded) < 10) {
        return;
    }

    const targetOffsetValue = currentOffset + offsetNeeded;

    // Animación suave hacia el destino
    const startOffsetAnim = currentOffset;
    const duration = 400;
    const startTime = performance.now();

    function animateScroll(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);

        currentOffset = startOffsetAnim + (targetOffsetValue - startOffsetAnim) * eased;
        targetOffset = currentOffset;

        updatePickerPosition();
        updateActiveItems();

        if (progress < 1) {
            requestAnimationFrame(animateScroll);
        }
    }

    requestAnimationFrame(animateScroll);
    console.log('[Auspex] Scrolling to today, target fecha:', targetItem.dataset.fecha);
}

function setupPickerInteraction() {
    const viewport = document.getElementById('picker-viewport');
    if (!viewport) return;

    // Prevenir pull-to-refresh y scroll nativo en toda la página
    document.body.addEventListener('touchmove', preventPullToRefresh, { passive: false });
    document.addEventListener('touchmove', preventPullToRefresh, { passive: false });

    // Touch events (NO passive para poder prevenir default)
    viewport.addEventListener('touchstart', onTouchStart, { passive: false });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd, { passive: true });

    // Mouse events
    viewport.addEventListener('mousedown', onMouseDown);
    viewport.addEventListener('mousemove', onMouseMove);
    viewport.addEventListener('mouseup', onMouseUp);
    viewport.addEventListener('mouseleave', onMouseUp);

    // Wheel events
    viewport.addEventListener('wheel', onWheel, { passive: false });

    console.log('[Auspex] Picker interaction setup complete');
}

// Prevenir pull-to-refresh del navegador
function preventPullToRefresh(e) {
    // Permitir scroll en modales
    if (e.target.closest('.modal-content')) {
        return;
    }
    // Si el scroll está en la parte superior y se intenta hacer scroll hacia arriba
    if (window.scrollY === 0 && e.touches && e.touches[0]) {
        const touch = e.touches[0];
        if (touch.clientY > lastTouchY) {
            e.preventDefault();
        }
    }
}
let lastTouchY = 0;

function onTouchStart(e) {
    e.preventDefault(); // Prevenir comportamientos nativos
    isDragging = true;
    startY = e.touches[0].clientY;
    lastTouchY = startY; // Para detección de pull-to-refresh
    startOffset = currentOffset;
    velocity = 0;
    lastY = startY;
    lastTime = Date.now();
    cancelAnimationFrame(animationId);
}

function onTouchMove(e) {
    e.preventDefault(); // Prevenir scroll nativo y pull-to-refresh
    if (!isDragging) return;

    const currentY = e.touches[0].clientY;
    lastTouchY = currentY; // Actualizar para detección
    const deltaY = currentY - startY;

    // Calcular velocidad (reducido para momentum más suave)
    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) {
        velocity = (currentY - lastY) / dt * 8; // Reducido de 15 a 8
    }
    lastY = currentY;
    lastTime = now;

    currentOffset = startOffset + deltaY;
    clampOffset(); // Limitar el offset
    updatePickerPosition();
    updateActiveItems();
}

function onTouchEnd() {
    isDragging = false;
    applyMomentum();
}

function onMouseDown(e) {
    isDragging = true;
    startY = e.clientY;
    startOffset = currentOffset;
    velocity = 0;
    lastY = startY;
    lastTime = Date.now();
    cancelAnimationFrame(animationId);
    e.preventDefault();
}

function onMouseMove(e) {
    if (!isDragging) return;
    const currentY = e.clientY;
    const deltaY = currentY - startY;

    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) {
        velocity = (currentY - lastY) / dt * 8; // Reducido de 15 a 8
    }
    lastY = currentY;
    lastTime = now;

    currentOffset = startOffset + deltaY;
    clampOffset();
    updatePickerPosition();
    updateActiveItems();
}

function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    applyMomentum();
}

function onWheel(e) {
    e.preventDefault();
    cancelAnimationFrame(animationId);

    const delta = e.deltaY * -0.5;
    currentOffset += delta;

    clampOffset();
    updatePickerPosition();
    updateActiveItems();

    // Snap después de un momento
    clearTimeout(window.wheelTimeout);
    window.wheelTimeout = setTimeout(() => {
        snapToNearestItem();
    }, 150);
}

function applyMomentum() {
    const friction = 0.92; // Un poco más de fricción para que pare antes
    const minVelocity = 0.3; // Velocidad mínima antes de parar

    function animate() {
        if (Math.abs(velocity) > minVelocity) {
            currentOffset += velocity;
            velocity *= friction;
            clampOffset();
            updatePickerPosition();
            updateActiveItems();
            animationId = requestAnimationFrame(animate);
        } else {
            velocity = 0;
            snapToNearestItem();
        }
    }

    animationId = requestAnimationFrame(animate);
}

function clampOffset() {
    const viewport = document.getElementById('picker-viewport');
    const track = document.getElementById('picker-track');
    if (!viewport || !track) return;

    const viewportHeight = viewport.offsetHeight;

    // Calculate real total height from last item position
    const items = track.querySelectorAll('.picker-item');
    let totalHeight = 0;
    if (items.length > 0) {
        const lastItem = items[items.length - 1];
        totalHeight = lastItem.offsetTop + lastItem.offsetHeight;
    }

    // If totalHeight is 0 or too small, don't clamp (items not rendered yet)
    if (totalHeight < 500) return;

    const centerOffset = viewportHeight / 2;

    // maxOffset: first item at center (track at top position)
    const maxOffset = centerOffset - itemHeight / 2;
    // minOffset: last item at center (track moved up by totalHeight - half viewport)
    const minOffset = centerOffset - totalHeight + itemHeight / 2;

    const oldOffset = currentOffset;
    currentOffset = Math.max(minOffset, Math.min(maxOffset, currentOffset));

    // Debug: uncomment to see clamp values
    // if (oldOffset !== currentOffset) {
    //     console.log('[Clamp] totalHeight:', totalHeight, 'viewportHeight:', viewportHeight, 'min:', minOffset, 'max:', maxOffset, 'offset:', oldOffset, '->', currentOffset);
    // }
}

function snapToNearestItem() {
    const viewport = document.getElementById('picker-viewport');
    const track = document.getElementById('picker-track');
    if (!viewport || !track) return;

    const viewportHeight = viewport.offsetHeight;
    const centerY = viewportHeight / 2;
    const items = track.querySelectorAll('.picker-item');

    if (items.length === 0) return;

    // Find the item closest to the center using real positions
    let closestItem = null;
    let closestDistance = Infinity;

    items.forEach((item) => {
        // Calculate where this item's center would be with current offset
        const itemTop = item.offsetTop + currentOffset;
        const itemCenter = itemTop + item.offsetHeight / 2;
        const distance = Math.abs(itemCenter - centerY);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestItem = item;
        }
    });

    if (!closestItem) return;

    // Calculate offset to center this item
    const itemCenter = closestItem.offsetTop + closestItem.offsetHeight / 2;
    targetOffset = centerY - itemCenter;

    // Solo hacer snap si la diferencia es significativa (evita micro-saltos)
    const diff = targetOffset - currentOffset;
    if (Math.abs(diff) < 5) {
        currentOffset = targetOffset;
        updatePickerPosition();
        updateActiveItems();
        return;
    }

    // Animar hacia el snap con easing suave
    let progress = 0;
    const startOffset = currentOffset;
    const duration = 200; // ms
    const startTime = performance.now();

    function animateSnap(now) {
        progress = Math.min(1, (now - startTime) / duration);
        // Ease out cubic para suavidad
        const eased = 1 - Math.pow(1 - progress, 3);
        currentOffset = startOffset + (targetOffset - startOffset) * eased;

        updatePickerPosition();
        updateActiveItems();

        if (progress < 1) {
            requestAnimationFrame(animateSnap);
        }
    }

    requestAnimationFrame(animateSnap);
}

// ==========================================
//  TICKER
// ==========================================

function renderTicker() {
    const tickerContent = document.getElementById('ticker-content');
    const eventosParaTicker = eventosSemana.length > 0 ? eventosSemana : eventos.slice(0, 10);

    if (eventosParaTicker.length === 0) {
        tickerContent.innerHTML = `
            <div class="flex items-center">
                <span class="text-auspex-green/60 text-[10px] mx-4">+++ NO EVENTS IN RANGE +++</span>
            </div>
            <div class="flex items-center">
                <span class="text-auspex-green/60 text-[10px] mx-4">+++ SCANNING VOIDSPACE +++</span>
            </div>
        `;
        return;
    }

    const tickerItems = eventosParaTicker.slice(0, 8).map(evento => {
        const tipoEvento = getEventoTipo(evento);
        let colorClass = 'text-auspex-green/60';
        if (tipoEvento === 'urgent') colorClass = 'text-primary';
        else if (tipoEvento === 'birthday') colorClass = 'text-pink-400';
        else if (isToday(evento.fecha)) colorClass = 'text-auspex-green';
        return `<span class="${colorClass} text-[10px] mx-4">+++ ${evento.titulo.toUpperCase()} (${formatFechaCorta(evento.fecha)}) +++</span>`;
    }).join('');

    tickerContent.innerHTML = `
        <div class="flex items-center">${tickerItems}</div>
        <div class="flex items-center">${tickerItems}</div>
    `;
}

// ==========================================
//  INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Prevenir scroll global en toda la página (excepto en modales)
    document.addEventListener('wheel', (e) => {
        // Permitir scroll en modales
        if (e.target.closest('.modal-content')) {
            return;
        }
        // Solo permitir wheel en el picker-viewport (lo manejamos nosotros)
        if (!e.target.closest('#picker-viewport')) {
            e.preventDefault();
        }
    }, { passive: false });

    // Prevenir pull-to-refresh globalmente (excepto en modales)
    document.addEventListener('touchmove', (e) => {
        // Permitir scroll en modales
        if (e.target.closest('.modal-content')) {
            return;
        }
        if (!e.target.closest('#picker-viewport')) {
            e.preventDefault();
        }
    }, { passive: false });

    if (window.WhVaultDB) {
        window.WhVaultDB.onCogitatorChange(async (online) => {
            updateConnectionUI(online);
            if (online && isOfflineMode) {
                showToast('Cogitator restaurado', 'success');
                cargarEventos();
            }
        });
    }

    updateHeader();
    cargarEventos();
    setInterval(updateHeader, 60000);
});

// ==========================================
//  TOAST
// ==========================================

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined text-base mr-2">${type === 'error' ? 'error' : 'check_circle'}</span>
        ${message}
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// ==========================================
//  CREAR EVENTO - MODAL FUNCTIONS
// ==========================================

function openCreateEventoModal() {
    const modal = document.getElementById('modal-crear-evento');
    modal.classList.remove('hidden');

    // Set default fecha to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('evento-fecha').value = today;

    // Clear other fields
    document.getElementById('evento-titulo').value = '';
    document.getElementById('evento-fecha-fin').value = '';
    document.getElementById('evento-hora').value = '';
    document.getElementById('evento-hora-fin').value = '';
    document.getElementById('evento-categoria').value = '';
    document.getElementById('evento-subtipo').value = 'puntual';
    document.getElementById('evento-icono').value = '📅';
    document.getElementById('evento-ubicacion').value = '';
    document.getElementById('evento-descripcion').value = '';

    // Focus on title input
    setTimeout(() => {
        document.getElementById('evento-titulo').focus();
    }, 100);
}

function closeCreateEventoModal() {
    const modal = document.getElementById('modal-crear-evento');
    modal.classList.add('hidden');
}

async function crearEvento() {
    const titulo = document.getElementById('evento-titulo').value.trim();
    const fecha = document.getElementById('evento-fecha').value;

    if (!titulo) {
        showToast('El título es requerido', 'error');
        return;
    }
    if (!fecha) {
        showToast('La fecha es requerida', 'error');
        return;
    }

    const eventoData = {
        titulo,
        fecha,
        'fecha-fin': document.getElementById('evento-fecha-fin').value || null,
        hora: document.getElementById('evento-hora').value || null,
        'hora-fin': document.getElementById('evento-hora-fin').value || null,
        categoria: document.getElementById('evento-categoria').value || null,
        subtipo: document.getElementById('evento-subtipo').value || 'puntual',
        icono: document.getElementById('evento-icono').value || '📅',
        ubicacion: document.getElementById('evento-ubicacion').value || null,
        descripcion: document.getElementById('evento-descripcion').value.trim() || ''
    };

    try {
        const response = await fetch(`${API_URL}/eventos/crear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventoData)
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Evento "${titulo}" creado`, 'success');
            closeCreateEventoModal();

            // Invalidar cache y recargar eventos desde el servidor
            const DB = window.WhVaultDB;
            if (DB) {
                await DB.clearStore(DB.STORES.EVENTOS);
            }
            await cargarEventos();
        } else {
            showToast(data.error || 'Error al crear evento', 'error');
        }
    } catch (error) {
        console.error('Error creando evento:', error);
        showToast('Error de conexión', 'error');
    }
}
