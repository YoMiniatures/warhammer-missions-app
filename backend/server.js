import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import https from 'https';
import os from 'os';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443');
const CERTS_DIR = path.join(__dirname, 'certs');

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde /public
app.use(express.static(path.join(__dirname, 'public')));

// Paths al Vault de Obsidian
const VAULT_PATH = path.join(__dirname, '../../warhammer-vault');
const BASE_PATH = path.join(VAULT_PATH, '-⭐ HOME', 'Proyecto Warhammer');
const CARTA_ASTRAL_PATH = path.join(BASE_PATH, '02 - CARTA ASTRAL (PLANNING & ESTRATEGIA)');
const SISTEMAS_PATH = path.join(CARTA_ASTRAL_PATH, '00 - SISTEMAS');
const CUMPLEAÑOS_PATH = path.join(CARTA_ASTRAL_PATH, 'INCOMMING TRANSMISSION ( EVENTOS)', 'CUMPLEAÑOS');
const AVISOS_PATH = path.join(CARTA_ASTRAL_PATH, 'AUSPEX MONITORING');

// Paths Economato / Green Bits
const TESORO_PATH = path.join(BASE_PATH, '04 - CÁMARA DEL TESORO (FINANZAS)');
const GREEN_BITS_PATH = path.join(TESORO_PATH, 'GREEN BITS');
const GREEN_BITS_ACTIVOS_PATH = path.join(GREEN_BITS_PATH, 'Activos');
const GREEN_BITS_VERTICALES_PATH = path.join(GREEN_BITS_PATH, 'Verticales');

// Estado del Tesoro (manual - update these values periodically)
const ESTADO_TESORO = {
  fuel: 3500,           // Dinero líquido
  suministros: 15000,   // Invertido
  deuda: 0,
  variacionMes: 5.2,    // % cambio mensual
  generadores: [
    { nombre: 'Sueldo Principal', icono: 'work', monto: 2500, estado: 'activo' },
    { nombre: 'Staking Crypto', icono: 'currency_bitcoin', monto: 0, estado: 'inactivo' },
    { nombre: 'Otros Pasivos', icono: 'savings', monto: 150, estado: 'activo' }
  ]
};

// ==========================================
//  PRICE CACHE (server-side, 5 min TTL)
// ==========================================
let priceCache = { prices: {}, usdEurRate: null, timestamp: 0 };
const PRICE_CACHE_MS = 5 * 60 * 1000;

async function fetchAllPrices(activos) {
  // Return cache if fresh
  if (Date.now() - priceCache.timestamp < PRICE_CACHE_MS && priceCache.prices && Object.keys(priceCache.prices).length > 0) {
    return priceCache;
  }

  const prices = {};
  let usdEurRate = priceCache.usdEurRate || 0.92;

  try {
    // 1. Fetch USD→EUR rate from Frankfurter
    const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      usdEurRate = fxData.rates?.EUR || 0.92;
    }
  } catch (e) {
    console.log('[Economato] Frankfurter fetch failed, using cached rate');
  }

  // 2. Batch CoinGecko IDs
  const cgIds = activos
    .filter(a => a.api === 'coingecko' && a.identificador)
    .map(a => a.identificador);

  if (cgIds.length > 0) {
    try {
      const uniqueIds = [...new Set(cgIds)].join(',');
      const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds}&vs_currencies=eur,usd&include_24hr_change=true`);
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        for (const [id, data] of Object.entries(cgData)) {
          prices[`coingecko:${id}`] = {
            eur: data.eur || 0,
            usd: data.usd || 0,
            cambio24h: data.eur_24h_change || 0
          };
        }
      }
    } catch (e) {
      console.log('[Economato] CoinGecko fetch failed:', e.message);
    }
  }

  // 3. Gold/Silver prices via gold-api.com (free, no key required)
  const metalActivos = activos.filter(a => a.api === 'goldapi' || a.api === 'metalprice');
  if (metalActivos.length > 0) {
    const metalSymbols = [...new Set(metalActivos.map(a => a.identificador || 'XAU'))];
    for (const metal of metalSymbols) {
      try {
        const metalRes = await fetch(`https://api.gold-api.com/price/${metal}`);
        if (metalRes.ok) {
          const metalData = await metalRes.json();
          // gold-api.com returns price in USD per troy ounce
          const priceUsdPerOz = metalData.price || 0;
          const priceEurPerOz = priceUsdPerOz * usdEurRate;
          const priceEurPerGram = priceEurPerOz / 31.1035;
          prices[`metal:${metal}`] = {
            eurPerOz: priceEurPerOz,
            eurPerGram: priceEurPerGram,
            usdPerOz: priceUsdPerOz
          };
          console.log(`[Economato] ${metal}: $${priceUsdPerOz.toFixed(2)}/oz → €${priceEurPerGram.toFixed(2)}/g, €${priceEurPerOz.toFixed(2)}/oz`);
        }
      } catch (e) {
        console.log(`[Economato] Metal price fetch failed for ${metal}:`, e.message);
      }
    }
  }

  // 4. Manual prices don't need fetching (read from frontmatter)

  priceCache = { prices, usdEurRate, timestamp: Date.now() };
  return priceCache;
}

/**
 * Get current price for an asset based on its api type
 */
function getAssetPrice(activo, priceData) {
  const { api, identificador, moneda, unidad_cantidad, precio_actual_manual } = activo;

  if (api === 'coingecko') {
    const p = priceData.prices[`coingecko:${identificador}`];
    return p ? p.eur : 0;
  }

  if (api === 'goldapi' || api === 'metalprice') {
    const metalId = identificador || 'XAU';
    const p = priceData.prices[`metal:${metalId}`];
    if (!p) return 0;
    return unidad_cantidad === 'onzas' ? p.eurPerOz : p.eurPerGram;
  }

  if (api === 'manual') {
    return precio_actual_manual || 0;
  }

  return 0;
}

/**
 * Calculate PnL for a single asset
 */
function calculateAssetPnl(activo, precioActual) {
  const compras = activo.compras || [];
  const ventas = activo.ventas || [];

  const cantComprada = compras.reduce((sum, c) => sum + (c.cantidad || 0), 0);
  const cantVendida = ventas.reduce((sum, v) => sum + (v.cantidad || 0), 0);
  const cantActual = cantComprada - cantVendida;

  const capitalInvertido = compras.reduce((sum, c) => sum + (c.cantidad || 0) * (c.precio_unitario || 0), 0);
  const capitalRecuperado = ventas.reduce((sum, v) => sum + (v.cantidad || 0) * (v.precio_unitario || 0), 0);

  const precioMedio = cantComprada > 0 ? capitalInvertido / cantComprada : 0;
  const valorActual = cantActual * precioActual;
  const pnl = valorActual + capitalRecuperado - capitalInvertido;
  const roi = capitalInvertido > 0 ? (pnl / capitalInvertido) * 100 : 0;

  return { cantActual, cantComprada, cantVendida, capitalInvertido, capitalRecuperado, precioMedio, valorActual, pnl, roi };
}

// Helper: Obtener rutas de misiones por año (similar a wh-config.js)
function getRutaMisionesActivas(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '03 - MISIONES', 'MISIONES ACTIVAS');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '03 - MISIONES', 'MISIONES ACTIVAS');
  return null;
}

function getRutaMisionesOpcionales(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '03 - MISIONES', 'MISIONES OPCIONALES');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '03 - MISIONES', 'MISIONES OPCIONALES');
  return null;
}

function getRutaMisionesCompletadas(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '03 - MISIONES', 'MISIONES COMPLETADAS');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '03 - MISIONES', 'MISIONES COMPLETADAS');
  return null;
}

function getRutaEventos(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '05 - INCOMMING TRANSMISSION');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '05 - INCOMMING TRANSMISSION');
  return null;
}

function getRutaDirectivas(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '04 - DIRECTIVAS');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '04 - DIRECTIVAS');
  return null;
}

function getRutaCruzadas(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '04 - DIRECTIVAS', 'CRUZADAS');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '04 - DIRECTIVAS', 'CRUZADAS');
  return null;
}

function getRutaIncursiones(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '07 - INCURSIONES');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '07 - INCURSIONES');
  return null;
}

function getRutaReviews(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '00 - REVIEWS');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '00 - REVIEWS');
  return null;
}

function getRutaPlanetas(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '02 - PLANETAS');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '02 - PLANETAS');
  return null;
}

// ============================================================================
// CONFIGURACIÓN CENTRALIZADA DE RUTINAS
// (Debe coincidir con ROUTINES en wh-config.js)
// ============================================================================
const RUTINAS_CONFIG = {
  prioritaria: "libro-morbidor",
  grupos: {
    prioritaria: { titulo: "PRIORITARIA", icon: "priority_high", color: "#d41132", rutinas: ["libro-morbidor"] },
    matutina: { titulo: "MATUTINA", icon: "wb_twilight", color: "#C5A059", rutinas: ["despertar-6am", "agua", "estiramientos", "pasear-tori-m", "revisar-task", "ducharse", "coger-tupper", "llegar-pronto", "mantra"] },
    tarde: { titulo: "TARDE", icon: "light_mode", color: "#f59e0b", rutinas: ["pasear-tori-a", "comer-preparado", "caos-recoger"] },
    noche: { titulo: "NOCHE", icon: "nights_stay", color: "#6366f1", rutinas: ["cenar-preparado", "task-mañana", "journal", "pasear-tori-n", "preparar-ropa", "dormir-11pm"] }
  },
  items: {
    "despertar-6am": { titulo: "6AM", icon: "alarm" },
    "agua": { titulo: "Agua", icon: "water_drop" },
    "estiramientos": { titulo: "Stretch", icon: "self_improvement" },
    "pasear-tori-m": { titulo: "Tori", icon: "pets" },
    "revisar-task": { titulo: "Tasks", icon: "checklist" },
    "ducharse": { titulo: "Ducha", icon: "shower" },
    "coger-tupper": { titulo: "Tupper", icon: "lunch_dining" },
    "llegar-pronto": { titulo: "Puntual", icon: "schedule" },
    "mantra": { titulo: "Mantra", icon: "spa" },
    "pasear-tori-a": { titulo: "Tori", icon: "pets" },
    "comer-preparado": { titulo: "Comida", icon: "restaurant" },
    "caos-recoger": { titulo: "Orden", icon: "cleaning_services" },
    "libro-morbidor": { titulo: "Escribir", icon: "edit_note" },
    "cenar-preparado": { titulo: "Cena", icon: "dinner_dining" },
    "task-mañana": { titulo: "Planear", icon: "event_note" },
    "journal": { titulo: "Journal", icon: "auto_stories" },
    "pasear-tori-n": { titulo: "Tori", icon: "pets" },
    "preparar-ropa": { titulo: "Ropa", icon: "checkroom" },
    "dormir-11pm": { titulo: "11PM", icon: "bedtime" }
  }
};

// Derivados pre-calculados
const ALL_RITUAL_KEYS = Object.values(RUTINAS_CONFIG.grupos).flatMap(g => g.rutinas);
const TOTAL_RUTINAS = ALL_RITUAL_KEYS.length; // 19

// Helper: Convertir mes texto a número (enero=1, febrero=2, etc.)
function mesTextoANumero(mesTexto) {
  const meses = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
  };
  return meses[mesTexto?.toLowerCase()] || null;
}

// Helper: Detectar años a cargar según la semana actual
function detectarAñosACargar() {
  const ahora = new Date();
  const añoActual = ahora.getFullYear();
  const diaSemana = ahora.getDay(); // 0 = domingo

  // Calcular inicio de semana (lunes)
  const inicioSemana = new Date(ahora);
  const diff = (diaSemana === 0 ? -6 : 1 - diaSemana); // Si es domingo, retroceder 6 días
  inicioSemana.setDate(ahora.getDate() + diff);
  inicioSemana.setHours(0, 0, 0, 0);

  // Calcular fin de semana (domingo)
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6);
  finSemana.setHours(23, 59, 59, 999);

  const años = new Set([añoActual]);
  if (inicioSemana.getFullYear() !== añoActual) años.add(inicioSemana.getFullYear());
  if (finSemana.getFullYear() !== añoActual) años.add(finSemana.getFullYear());

  return Array.from(años).sort();
}

// Helper: Normalizar fecha a string YYYY-MM-DD
// gray-matter parsea fechas YAML como Date UTC, por eso usamos getUTC* para no perder un día en UTC+1
function normalizarFecha(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) {
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof fecha === 'string') {
    return fecha.split('T')[0]; // Por si viene con hora
  }
  return null;
}

// Helper: Leer archivo de misión o evento
async function leerMision(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    return {
      id: path.basename(filePath, '.md'),
      path: filePath,
      titulo: data.titulo || path.basename(filePath, '.md'),
      prioridad: data.prioridad || 'media',
      categoria: data.categoria || 'sin-categoria',
      'puntos-xp': data['puntos-xp'] || 0,
      dificultad: data.dificultad || 'media',
      'tiempo-estimado': data['tiempo-estimado'] || 'N/A',
      deadline: normalizarFecha(data.deadline || data.fecha), // Eventos usan 'fecha'
      completada: data.completada || false,
      frontmatter: data,
      contenido: content.trim()
    };
  } catch (error) {
    console.error(`Error leyendo ${filePath}:`, error.message);
    return null;
  }
}

// Helper: Escribir archivo de misión
async function escribirMision(filePath, frontmatter, contenido) {
  const fileContent = matter.stringify(contenido, frontmatter);
  await fs.writeFile(filePath, fileContent, 'utf-8');
}

// Helper: Buscar y actualizar cruzada cuando se completa una misión
async function actualizarCruzadaSiExiste(misionFrontmatter, año) {
  try {
    // Extraer nombre de cruzada del frontmatter de la misión
    const cruzadaRef = misionFrontmatter.cruzada;
    if (!cruzadaRef) {
      console.log('[actualizarCruzada] Misión sin cruzada vinculada');
      return null;
    }

    // Extraer nombre del wikilink: "[[Nombre]]" o [[Nombre]]
    const nombreCruzada = extraerNombreWikilink(cruzadaRef);
    if (!nombreCruzada) {
      console.log('[actualizarCruzada] No se pudo extraer nombre de cruzada');
      return null;
    }

    console.log(`[actualizarCruzada] Buscando cruzada: ${nombreCruzada}`);

    // Buscar en todos los años si no se especifica
    const añosABuscar = año ? [año] : detectarAñosACargar();

    for (const añoBuscar of añosABuscar) {
      const rutaCruzadas = getRutaCruzadas(añoBuscar);
      if (!rutaCruzadas) continue;

      try {
        const archivos = await fs.readdir(rutaCruzadas);

        for (const archivo of archivos) {
          if (!archivo.endsWith('.md')) continue;

          // Comparar nombre (sin extensión y sin "Cruzada - " prefix)
          const nombreArchivo = archivo.replace('.md', '');
          const nombreLimpio = nombreArchivo.replace(/^Cruzada - /i, '');

          if (nombreArchivo === nombreCruzada ||
              nombreLimpio === nombreCruzada ||
              nombreArchivo.includes(nombreCruzada) ||
              nombreCruzada.includes(nombreLimpio)) {

            const cruzadaPath = path.join(rutaCruzadas, archivo);
            console.log(`[actualizarCruzada] Encontrada: ${cruzadaPath}`);

            // Leer cruzada
            const fileContent = await fs.readFile(cruzadaPath, 'utf-8');
            const { data, content } = matter(fileContent);

            // Incrementar pasos-completados
            const pasosActuales = data['pasos-completados'] || 0;
            const pasosTotales = data['pasos-totales'] || 1;
            const nuevosPasos = Math.min(pasosActuales + 1, pasosTotales);

            data['pasos-completados'] = nuevosPasos;

            // Si se completaron todos los pasos, marcar cruzada como completada
            if (nuevosPasos >= pasosTotales) {
              data.completada = true;
              data.estado = 'completada';
              data['fecha-completada'] = new Date().toISOString().split('T')[0];
            }

            // Escribir archivo actualizado
            const nuevoContenido = matter.stringify(content, data);
            await fs.writeFile(cruzadaPath, nuevoContenido, 'utf-8');

            console.log(`[actualizarCruzada] Cruzada actualizada: ${pasosActuales} → ${nuevosPasos}/${pasosTotales}`);

            return {
              nombre: nombreCruzada,
              pasosAnteriores: pasosActuales,
              pasosNuevos: nuevosPasos,
              pasosTotales: pasosTotales,
              completada: nuevosPasos >= pasosTotales
            };
          }
        }
      } catch (err) {
        console.log(`[actualizarCruzada] Error buscando en año ${añoBuscar}:`, err.message);
      }
    }

    console.log(`[actualizarCruzada] Cruzada no encontrada: ${nombreCruzada}`);
    return null;
  } catch (error) {
    console.error('[actualizarCruzada] Error:', error.message);
    return null;
  }
}

// Helper: Cargar todas las misiones de una carpeta
async function cargarMisiones(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let misiones = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursivamente buscar en subdirectorios
        const subMisiones = await cargarMisiones(fullPath);
        misiones = [...misiones, ...subMisiones];
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const mision = await leerMision(fullPath);
        if (mision && mision.frontmatter.tipo) {
          const tipoTrimmed = mision.frontmatter.tipo.trim();
          if (tipoTrimmed === 'mision') {
            misiones.push(mision);
          } else {
            console.log(`[DEBUG] Rechazado (tipo='${mision.frontmatter.tipo}', trimmed='${tipoTrimmed}'): ${entry.name}`);
          }
        } else {
          console.log(`[DEBUG] Rechazado (sin tipo): ${entry.name}`);
        }
      }
    }

    console.log(`[cargarMisiones] ${dirPath} - Cargadas: ${misiones.length} misiones`);
    return misiones;
  } catch (error) {
    console.error(`Error cargando misiones de ${dirPath}:`, error.message);
    return [];
  }
}

// Helper: Cargar archivos recursivamente de una carpeta
async function cargarArchivosRecursivos(dirPath, tipos = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let archivos = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursivo: buscar en subdirectorios
        const subArchivos = await cargarArchivosRecursivos(fullPath, tipos);
        archivos = [...archivos, ...subArchivos];
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const archivo = await leerMision(fullPath);
        if (archivo && archivo.frontmatter.tipo && tipos.includes(archivo.frontmatter.tipo.trim())) {
          archivos.push(archivo);
        }
      }
    }

    return archivos;
  } catch (error) {
    console.error(`Error cargando archivos recursivos de ${dirPath}:`, error.message);
    return [];
  }
}

// Ordenar misiones por prioridad
function ordenarPorPrioridad(misiones) {
  const orden = { 'alta': 0, 'media': 1, 'baja': 2 };
  return misiones.sort((a, b) => {
    const prioridadA = orden[a.prioridad] ?? 3;
    const prioridadB = orden[b.prioridad] ?? 3;
    return prioridadA - prioridadB;
  });
}

// ============================================
// ENDPOINTS API
// ============================================

// GET /api/misiones/urgentes - Obtener misiones urgentes (deadline <= hoy)
// Incluye ACTIVAS + OPCIONALES de múltiples años si la semana cruza años
app.get('/api/misiones/urgentes', async (req, res) => {
  try {
    const añosACargar = detectarAñosACargar();
    let misionesActivas = [];
    let misionesOpcionales = [];

    // Cargar misiones de todos los años necesarios
    for (const año of añosACargar) {
      const rutaActivas = getRutaMisionesActivas(año);
      const rutaOpcionales = getRutaMisionesOpcionales(año);

      if (rutaActivas) {
        const activas = await cargarMisiones(rutaActivas);
        console.log(`[URGENTES] Año ${año} - ACTIVAS: ${activas.length} misiones cargadas`);
        misionesActivas = [...misionesActivas, ...activas];
      }

      if (rutaOpcionales) {
        const opcionales = await cargarMisiones(rutaOpcionales);
        console.log(`[URGENTES] Año ${año} - OPCIONALES: ${opcionales.length} misiones cargadas`);
        misionesOpcionales = [...misionesOpcionales, ...opcionales];
      }
    }

    const todasMisiones = [...misionesActivas, ...misionesOpcionales];
    const hoy = new Date().toISOString().split('T')[0];
    console.log(`[URGENTES] Total cargadas: ${todasMisiones.length}, hoy: ${hoy}`);

    // Filtrar vencidas o de hoy
    const misionesUrgentes = todasMisiones.filter(m => {
      if (m.completada) return false;
      if (!m.deadline) return false;
      return m.deadline <= hoy;
    });

    const misionesOrdenadas = misionesUrgentes.sort((a, b) => {
      return (a.deadline || '').localeCompare(b.deadline || '');
    });

    res.json({
      success: true,
      total: misionesOrdenadas.length,
      misiones: misionesOrdenadas
    });
  } catch (error) {
    console.error('Error en GET /api/misiones/urgentes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/misiones/opcionales - Obtener misiones opcionales de múltiples años
app.get('/api/misiones/opcionales', async (req, res) => {
  try {
    const añosACargar = detectarAñosACargar();
    let misionesOpcionales = [];

    // Cargar opcionales de todos los años necesarios
    for (const año of añosACargar) {
      const rutaOpcionales = getRutaMisionesOpcionales(año);
      if (rutaOpcionales) {
        const opcionales = await cargarMisiones(rutaOpcionales);
        misionesOpcionales = [...misionesOpcionales, ...opcionales];
      }
    }

    // Filtrar solo no completadas y ordenar por deadline
    const misionesActivas = misionesOpcionales.filter(m => !m.completada);
    const misionesOrdenadas = misionesActivas.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });

    res.json({
      success: true,
      total: misionesOrdenadas.length,
      misiones: misionesOrdenadas
    });
  } catch (error) {
    console.error('Error en GET /api/misiones/opcionales:', error);
    res.json({
      success: true,
      total: 0,
      misiones: []
    });
  }
});

// GET /api/misiones/criterios-victoria - Obtener criterios de victoria del mes actual
// Busca en TODO el vault: misiones Y eventos con criterio-victoria: true (igual que DataviewJS)
app.get('/api/misiones/criterios-victoria', async (req, res) => {
  try {
    // Buscar en TODO el vault (recursivo) misiones Y eventos - igual que dv.pages()
    const todosCriterios = await cargarArchivosRecursivos(VAULT_PATH, ['mision', 'evento']);
    console.log(`[CRITERIOS] Archivos cargados antes del filtro: ${todosCriterios.length}`);

    const ahora = new Date();
    const año = ahora.getFullYear();
    const mes = ahora.getMonth();

    // Formato local sin conversión UTC
    const primerDia = new Date(año, mes, 1);
    const ultimoDia = new Date(año, mes + 1, 0);

    const primerDiaMes = `${año}-${String(mes + 1).padStart(2, '0')}-01`;
    const ultimoDiaMes = `${ultimoDia.getFullYear()}-${String(ultimoDia.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia.getDate()).padStart(2, '0')}`;

    console.log(`[CRITERIOS] Mes actual: ${primerDiaMes} a ${ultimoDiaMes}`);

    // Filtrar solo los que tienen criterio-victoria: true y deadline/fecha en mes actual
    const criterios = todosCriterios.filter(item => {
      // Debe tener criterio-victoria: true
      if (!item.frontmatter['criterio-victoria']) return false;

      // Para misiones: verificar deadline
      if (item.frontmatter.tipo === 'mision') {
        if (!item.deadline) {
          console.log(`[CRITERIOS] Rechazado (sin deadline): ${item.titulo}`);
          return false;
        }
        const enRango = item.deadline >= primerDiaMes && item.deadline <= ultimoDiaMes;
        if (!enRango) {
          console.log(`[CRITERIOS] Rechazado (fuera de rango ${item.deadline}): ${item.titulo}`);
        } else {
          console.log(`[CRITERIOS] ✓ Aceptado: ${item.titulo} (${item.deadline})`);
        }
        return enRango;
      }

      // Para eventos: verificar fecha
      if (item.frontmatter.tipo === 'evento') {
        if (!item.deadline) return false; // deadline viene de fecha
        return item.deadline >= primerDiaMes && item.deadline <= ultimoDiaMes;
      }

      return false;
    });

    // Ordenar por fecha
    const criteriosOrdenados = criterios.sort((a, b) => {
      return (a.deadline || '').localeCompare(b.deadline || '');
    });

    // Calcular completados (misiones: completada, eventos: completado)
    const completados = criterios.filter(c =>
      c.frontmatter.tipo === 'mision' ? c.completada === true : c.frontmatter.completado === true
    ).length;

    const total = criterios.length;
    const porcentaje = total > 0 ? Math.round((completados / total) * 100) : 0;

    res.json({
      success: true,
      total,
      completados,
      porcentaje,
      misiones: criteriosOrdenados
    });
  } catch (error) {
    console.error('Error en GET /api/misiones/criterios-victoria:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/eventos/anual - Obtener TODOS los eventos del año actual
// También disponible como /api/eventos/año para compatibilidad
app.get(['/api/eventos/anual', '/api/eventos/año'], async (req, res) => {
  try {
    const añoActual = new Date().getFullYear();
    const añosACargar = [añoActual]; // Solo el año actual para el timeline anual

    // 1. Cargar eventos, avisos y vacaciones del año
    let todosItems = [];
    for (const año of añosACargar) {
      const rutaEventos = getRutaEventos(año);
      if (rutaEventos) {
        const itemsAño = await cargarArchivosRecursivos(rutaEventos, ['evento', 'aviso', 'vacaciones']);
        todosItems = [...todosItems, ...itemsAño];
      }
    }

    // 2. Cargar cumpleaños (carpeta separada global)
    const cumpleaños = await cargarArchivosRecursivos(CUMPLEAÑOS_PATH, ['cumpleaños']);
    todosItems = [...todosItems, ...cumpleaños];

    // 3. Cargar avisos (AUSPEX MONITORING - carpeta global)
    const avisos = await cargarArchivosRecursivos(AVISOS_PATH, ['aviso']);
    todosItems = [...todosItems, ...avisos];

    let eventosAño = [];

    // 4. Calcular inicio y fin del año
    const inicioAño = new Date(añoActual, 0, 1);
    const finAño = new Date(añoActual, 11, 31);

    // 5. Iterar por cada día del año
    for (let diaActual = new Date(inicioAño); diaActual <= finAño; diaActual.setDate(diaActual.getDate() + 1)) {
      const fechaStr = `${diaActual.getFullYear()}-${String(diaActual.getMonth() + 1).padStart(2, '0')}-${String(diaActual.getDate()).padStart(2, '0')}`;
      const dia = diaActual.getDate();
      const mes = diaActual.getMonth() + 1;
      const weekday = diaActual.getDay() === 0 ? 7 : diaActual.getDay();

      // 6. Para cada item, verificar si coincide con este día
      for (let item of todosItems) {
        const tipo = item.frontmatter?.tipo;
        const subtipo = item.frontmatter?.subtipo;
        const recurrencia = item.frontmatter?.recurrencia;
        const activo = item.frontmatter?.activo !== false;

        if (subtipo === 'recurrente' && !activo) continue;

        let coincide = false;

        // === AVISOS ===
        if (tipo === 'aviso') {
          if (subtipo === 'recurrente' && recurrencia === 'semanal') {
            coincide = item.frontmatter['dia-de-la-semana'] === weekday;
          } else if (subtipo === 'recurrente' && recurrencia === 'mensual') {
            coincide = item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'recurrente' && recurrencia === 'anual') {
            coincide = item.frontmatter.mes === mes && item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'puntual') {
            coincide = item.deadline === fechaStr;
          }
        }

        // === EVENTOS ===
        else if (tipo === 'evento') {
          if (subtipo === 'recurrente' && recurrencia === 'semanal') {
            coincide = item.frontmatter['dia-de-la-semana'] === weekday;
          } else if (subtipo === 'recurrente' && recurrencia === 'mensual') {
            coincide = item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'recurrente' && recurrencia === 'anual') {
            coincide = item.frontmatter.mes === mes && item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'puntual') {
            coincide = item.deadline === fechaStr;
          }
        }

        // === VACACIONES ===
        else if (tipo === 'vacaciones') {
          const fechaInicio = normalizarFecha(item.frontmatter['fecha-inicio']);
          const fechaFin = normalizarFecha(item.frontmatter['fecha-fin']);
          if (fechaInicio && fechaFin) {
            coincide = fechaStr >= fechaInicio && fechaStr <= fechaFin;
          }
        }

        // === CUMPLEAÑOS ===
        else if (tipo === 'cumpleaños') {
          const mesEvento = mesTextoANumero(item.frontmatter.mes);
          const diaEvento = item.frontmatter['dia-del-mes'];
          if (mesEvento === mes && diaEvento === dia) {
            coincide = true;
          }
        }

        if (coincide) {
          eventosAño.push({
            ...item,
            fecha: fechaStr,
          });
        }
      }
    }

    // 7. Ordenar por fecha
    eventosAño.sort((a, b) => a.fecha.localeCompare(b.fecha));

    res.json({
      success: true,
      año: añoActual,
      total: eventosAño.length,
      eventos: eventosAño
    });
  } catch (error) {
    console.error('Error en GET /api/eventos/año:', error);
    res.json({
      success: true,
      año: new Date().getFullYear(),
      total: 0,
      eventos: []
    });
  }
});

// GET /api/eventos/semana - Obtener eventos de esta semana o rango extendido (con recurrencia)
// Query params: ?dias=N (default 7, semana actual lunes-domingo)
app.get('/api/eventos/semana', async (req, res) => {
  try {
    const diasParam = parseInt(req.query.dias) || 0;
    const añosACargar = detectarAñosACargar();

    // 1. Cargar eventos, avisos y vacaciones de todos los años
    let todosItems = [];
    for (const año of añosACargar) {
      const rutaEventos = getRutaEventos(año);
      if (rutaEventos) {
        const itemsAño = await cargarArchivosRecursivos(rutaEventos, ['evento', 'aviso', 'vacaciones']);
        todosItems = [...todosItems, ...itemsAño];
      }
    }

    // 2. Cargar cumpleaños (carpeta separada global)
    const cumpleaños = await cargarArchivosRecursivos(CUMPLEAÑOS_PATH, ['cumpleaños']);
    todosItems = [...todosItems, ...cumpleaños];

    // 3. Cargar avisos (AUSPEX MONITORING - carpeta global)
    const avisos = await cargarArchivosRecursivos(AVISOS_PATH, ['aviso']);
    todosItems = [...todosItems, ...avisos];

    // 3. Calcular rango de fechas
    const ahora = new Date();
    let inicioRango;
    let totalDias;

    if (diasParam > 0) {
      // Rango extendido: desde hoy + N días
      inicioRango = new Date(ahora);
      inicioRango.setHours(0, 0, 0, 0);
      totalDias = diasParam;
    } else {
      // Default: semana actual (lunes a domingo)
      const diaSemana = ahora.getDay(); // 0 = domingo, 1 = lunes, etc.
      const diff = (diaSemana === 0 ? -6 : 1 - diaSemana); // Lunes = inicio
      inicioRango = new Date(ahora);
      inicioRango.setDate(ahora.getDate() + diff);
      inicioRango.setHours(0, 0, 0, 0);
      totalDias = 7;
    }

    let eventosSemana = [];

    // 4. Iterar por cada día del rango
    for (let i = 0; i < totalDias; i++) {
      const diaActual = new Date(inicioRango);
      diaActual.setDate(inicioRango.getDate() + i);
      const fechaStr = `${diaActual.getFullYear()}-${String(diaActual.getMonth() + 1).padStart(2, '0')}-${String(diaActual.getDate()).padStart(2, '0')}`;
      const dia = diaActual.getDate();
      const mes = diaActual.getMonth() + 1; // getMonth() devuelve 0-11
      const weekday = diaActual.getDay() === 0 ? 7 : diaActual.getDay(); // Convertir domingo de 0 a 7

      // 5. Para cada item, verificar si coincide con este día
      for (let item of todosItems) {
        const tipo = item.frontmatter?.tipo;
        const subtipo = item.frontmatter?.subtipo;
        const recurrencia = item.frontmatter?.recurrencia;
        const activo = item.frontmatter?.activo !== false;

        // Solo procesar items activos para recurrentes
        if (subtipo === 'recurrente' && !activo) continue;

        let coincide = false;

        // === AVISOS ===
        if (tipo === 'aviso') {
          if (subtipo === 'recurrente' && recurrencia === 'semanal') {
            coincide = item.frontmatter['dia-de-la-semana'] === weekday;
          } else if (subtipo === 'recurrente' && recurrencia === 'mensual') {
            coincide = item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'recurrente' && recurrencia === 'anual') {
            coincide = item.frontmatter.mes === mes && item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'puntual') {
            coincide = item.deadline === fechaStr;
          }
        }

        // === EVENTOS ===
        else if (tipo === 'evento') {
          if (subtipo === 'recurrente' && recurrencia === 'semanal') {
            coincide = item.frontmatter['dia-de-la-semana'] === weekday;
          } else if (subtipo === 'recurrente' && recurrencia === 'mensual') {
            coincide = item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'recurrente' && recurrencia === 'anual') {
            coincide = item.frontmatter.mes === mes && item.frontmatter['dia-del-mes'] === dia;
          } else if (subtipo === 'puntual') {
            coincide = item.deadline === fechaStr;
          }
        }

        // === VACACIONES ===
        else if (tipo === 'vacaciones') {
          const fechaInicio = normalizarFecha(item.frontmatter['fecha-inicio']);
          const fechaFin = normalizarFecha(item.frontmatter['fecha-fin']);
          if (fechaInicio && fechaFin) {
            coincide = fechaStr >= fechaInicio && fechaStr <= fechaFin;
          }
        }

        // === CUMPLEAÑOS ===
        else if (tipo === 'cumpleaños') {
          const mesEvento = mesTextoANumero(item.frontmatter.mes);
          const diaEvento = item.frontmatter['dia-del-mes'];
          if (mesEvento === mes && diaEvento === dia) {
            coincide = true;
          }
        }

        if (coincide) {
          eventosSemana.push({
            ...item,
            fecha: fechaStr, // Fecha específica de este día
          });
        }
      }
    }

    // 6. Ordenar por fecha
    eventosSemana.sort((a, b) => a.fecha.localeCompare(b.fecha));

    res.json({
      success: true,
      total: eventosSemana.length,
      eventos: eventosSemana
    });
  } catch (error) {
    console.error('Error en GET /api/eventos/semana:', error);
    res.json({
      success: true,
      total: 0,
      eventos: []
    });
  }
});

// POST /api/eventos/crear - Crear un nuevo evento
app.post('/api/eventos/crear', async (req, res) => {
  try {
    const {
      titulo,
      fecha,
      'fecha-fin': fechaFin,
      hora,
      'hora-fin': horaFin,
      categoria,
      subtipo,
      icono,
      ubicacion,
      descripcion
    } = req.body;

    if (!titulo || !titulo.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El título es requerido'
      });
    }

    if (!fecha) {
      return res.status(400).json({
        success: false,
        error: 'La fecha es requerida'
      });
    }

    // Sanitize filename
    const sanitizedTitle = titulo
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    const fileName = `${sanitizedTitle}.md`;

    // Determinar año del evento basado en la fecha
    const añoEvento = new Date(fecha).getFullYear();
    const rutaEventos = getRutaEventos(añoEvento);

    if (!rutaEventos) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo determinar la ruta de eventos para el año ' + añoEvento
      });
    }

    const rutaEventosActivos = path.join(rutaEventos, 'EVENTOS ACTIVOS');
    const filePath = path.join(rutaEventosActivos, fileName);

    // Check if file already exists
    try {
      await fs.access(filePath);
      return res.status(400).json({
        success: false,
        error: 'Ya existe un evento con ese nombre'
      });
    } catch {
      // File doesn't exist, good to proceed
    }

    // Build frontmatter
    const frontmatter = {
      tipo: 'evento',
      directiva: null,
      'criterio-victoria': false,
      subtipo: subtipo || 'puntual',
      recurrencia: 'no',
      fecha: fecha,
      'fecha-fin': fechaFin || null,
      hora: hora ? `"${hora}"` : null,
      'hora-fin': horaFin ? `"${horaFin}"` : null,
      categoria: categoria || null,
      prioridad: 'media',
      icono: icono ? `"${icono}"` : '"📅"',
      ubicacion: ubicacion || null
    };

    // Build content
    const contenido = `# ${icono || '📅'} ${titulo}

## 📝 Descripción
${descripcion || 'Sin descripción.'}

## 📅 Detalles del Evento
- **Fecha**: ${fecha}${fechaFin ? ` - ${fechaFin}` : ''}
- **Hora inicio**: ${hora || 'No especificada'}
- **Hora fin**: ${horaFin || 'No especificada'}
- **Ubicación**: ${ubicacion || 'Por confirmar'}
- **Categoría**: ${categoria || 'General'}

## 📎 Notas
[Añadir notas adicionales]
`;

    // Write file
    await escribirMision(filePath, frontmatter, contenido);

    console.log(`[API] Evento creado: ${fileName}`);

    res.json({
      success: true,
      evento: {
        id: sanitizedTitle,
        titulo,
        path: filePath,
        ...frontmatter
      }
    });

  } catch (error) {
    console.error('Error creando evento:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/misiones/stats - Estadísticas de misiones de múltiples años
app.get('/api/misiones/stats', async (req, res) => {
  try {
    const añosACargar = detectarAñosACargar();
    let misionesActivas = [];

    // Cargar activas de todos los años necesarios
    for (const año of añosACargar) {
      const rutaActivas = getRutaMisionesActivas(año);
      if (rutaActivas) {
        const activas = await cargarMisiones(rutaActivas);
        misionesActivas = [...misionesActivas, ...activas];
      }
    }

    // Filtrar solo no completadas
    const misionesNoCompletadas = misionesActivas.filter(m => !m.completada);

    const stats = {
      total: misionesNoCompletadas.length,
      alta: misionesNoCompletadas.filter(m => m.prioridad === 'alta').length,
      media: misionesNoCompletadas.filter(m => m.prioridad === 'media').length,
      baja: misionesNoCompletadas.filter(m => m.prioridad === 'baja').length,
      xpTotal: misionesNoCompletadas.reduce((sum, m) => sum + (m['puntos-xp'] || 0), 0)
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error en GET /api/misiones/stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/misiones/:id/completar - Completar una misión (buscar en múltiples años)
app.post('/api/misiones/:id/completar', async (req, res) => {
  try {
    const { id } = req.params;
    const añosACargar = detectarAñosACargar();
    let misionPath = null;
    let añoEncontrado = null;

    // Buscar en qué año está la misión
    for (const año of añosACargar) {
      const rutaActivas = getRutaMisionesActivas(año);
      if (rutaActivas) {
        const posiblePath = path.join(rutaActivas, `${id}.md`);
        try {
          await fs.access(posiblePath);
          misionPath = posiblePath;
          añoEncontrado = año;
          break;
        } catch {
          // Continuar buscando
        }
      }

      // También buscar en opcionales
      const rutaOpcionales = getRutaMisionesOpcionales(año);
      if (rutaOpcionales) {
        const posiblePath = path.join(rutaOpcionales, `${id}.md`);
        try {
          await fs.access(posiblePath);
          misionPath = posiblePath;
          añoEncontrado = año;
          break;
        } catch {
          // Continuar buscando
        }
      }
    }

    if (!misionPath) {
      return res.status(404).json({
        success: false,
        error: 'Misión no encontrada'
      });
    }

    // Leer misión actual
    const mision = await leerMision(misionPath);
    if (!mision) {
      return res.status(500).json({
        success: false,
        error: 'Error al leer la misión'
      });
    }

    // Actualizar frontmatter
    mision.frontmatter.completada = true;
    mision.frontmatter['fecha-completada'] = new Date().toISOString().split('T')[0];

    // Mover a completadas del mismo año
    const rutaCompletadas = getRutaMisionesCompletadas(añoEncontrado);
    const nuevaPath = path.join(rutaCompletadas, `${id}.md`);

    // Asegurar que la carpeta existe
    await fs.mkdir(rutaCompletadas, { recursive: true });

    // Escribir en nueva ubicación
    await escribirMision(nuevaPath, mision.frontmatter, mision.contenido);

    // Eliminar de activas/opcionales
    await fs.unlink(misionPath);

    // Actualizar cruzada si existe
    let cruzadaActualizada = null;
    if (mision.frontmatter.cruzada) {
      cruzadaActualizada = await actualizarCruzadaSiExiste(mision.frontmatter, añoEncontrado);
    }

    res.json({
      success: true,
      message: 'Misión completada exitosamente',
      mision: {
        id,
        titulo: mision.titulo,
        xp: mision['puntos-xp']
      },
      cruzada: cruzadaActualizada
    });
  } catch (error) {
    console.error(`Error completando misión ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/misiones/:id/deadline - Actualizar deadline de una misión
app.post('/api/misiones/:id/deadline', async (req, res) => {
  try {
    const { id } = req.params;
    const { deadline } = req.body;

    if (!deadline) {
      return res.status(400).json({ success: false, error: 'deadline es requerido' });
    }

    const añosACargar = detectarAñosACargar();
    let misionPath = null;

    for (const año of añosACargar) {
      for (const getRuta of [getRutaMisionesActivas, getRutaMisionesOpcionales]) {
        const ruta = getRuta(año);
        if (ruta) {
          const posiblePath = path.join(ruta, `${id}.md`);
          try {
            await fs.access(posiblePath);
            misionPath = posiblePath;
            break;
          } catch {}
        }
      }
      if (misionPath) break;
    }

    if (!misionPath) {
      return res.status(404).json({ success: false, error: 'Misión no encontrada' });
    }

    const mision = await leerMision(misionPath);
    if (!mision) {
      return res.status(500).json({ success: false, error: 'Error al leer la misión' });
    }

    mision.frontmatter.deadline = deadline;
    await escribirMision(misionPath, mision.frontmatter, mision.contenido);

    res.json({ success: true, message: 'Deadline actualizado', deadline });
  } catch (error) {
    console.error(`Error actualizando deadline ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/misiones/crear - Crear una nueva misión
app.post('/api/misiones/crear', async (req, res) => {
  try {
    const {
      titulo,
      categoria,
      prioridad,
      deadline,
      'puntos-xp': puntosXp,
      dificultad,
      'tiempo-estimado': tiempoEstimado,
      'criterio-victoria': criterioVictoria,
      descripcion
    } = req.body;

    if (!titulo || !titulo.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El título es requerido'
      });
    }

    // Sanitize filename: remove special characters, replace spaces with hyphens
    const sanitizedTitle = titulo
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .substring(0, 50); // Limit length

    const fileName = `${sanitizedTitle}.md`;
    const año = new Date().getFullYear();
    const rutaMisiones = getRutaMisionesActivas(año);

    if (!rutaMisiones) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo determinar la ruta de misiones'
      });
    }

    const filePath = path.join(rutaMisiones, fileName);

    // Check if file already exists
    try {
      await fs.access(filePath);
      return res.status(400).json({
        success: false,
        error: 'Ya existe una misión con ese nombre'
      });
    } catch {
      // File doesn't exist, good to proceed
    }

    // Build frontmatter
    const frontmatter = {
      tipo: 'mision',
      directiva: null,
      cruzada: null,
      'paso-cruzada': null,
      'criterio-victoria': criterioVictoria || false,
      categoria: categoria || null,
      prioridad: prioridad || 'media',
      'fecha-creacion': new Date().toISOString().split('T')[0],
      deadline: deadline || null,
      'puntos-xp': puntosXp || 100,
      dificultad: dificultad || 'media',
      'tiempo-estimado': tiempoEstimado || null,
      'fecha-completada': null,
      completada: false,
      'vigilancia-activa': false
    };

    // Build content
    const contenido = `# ${titulo}

## 📋 INFORMACIÓN

${descripcion || 'Sin descripción.'}
`;

    // Write file
    await escribirMision(filePath, frontmatter, contenido);

    console.log(`[API] Misión creada: ${fileName}`);

    res.json({
      success: true,
      mision: {
        id: sanitizedTitle,
        titulo,
        path: filePath,
        ...frontmatter
      }
    });

  } catch (error) {
    console.error('Error creando misión:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// DIRECTIVAS ENDPOINTS
// ============================================

// Helper: Extraer nombre de wikilink [[Nombre]] o "[[Nombre]]"
function extraerNombreWikilink(valor) {
  if (!valor) return null;
  const str = String(valor);
  const match = str.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  return match ? match[1] : str;
}

// Helper: Cargar directivas de un año
async function cargarDirectivasDeAño(año) {
  const ruta = getRutaDirectivas(año);
  if (!ruta) return [];

  try {
    const entries = await fs.readdir(ruta, { withFileTypes: true });
    const directivas = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = path.join(ruta, entry.name);
        const archivo = await leerMision(filePath);

        if (archivo && archivo.frontmatter.tipo === 'directiva') {
          directivas.push({
            id: archivo.id,
            path: filePath,
            titulo: archivo.titulo || archivo.id,
            categoria: archivo.frontmatter.categoria || 'sin-categoria',
            prioridad: archivo.frontmatter.prioridad || 'media',
            estado: archivo.frontmatter.estado || 'activa',
            año: año,
            mainQuest: archivo.frontmatter['main-quest'] === true,
            secondaryQuest: archivo.frontmatter['secondary-quest'] === true,
            sideQuest: archivo.frontmatter['side-quest'] === true,
            frontmatter: archivo.frontmatter
          });
        }
      }
    }

    return directivas;
  } catch (error) {
    console.error(`Error cargando directivas de ${año}:`, error.message);
    return [];
  }
}

// Helper: Cargar info de una cruzada desde su archivo .md
async function cargarInfoCruzada(nombreCruzada, año) {
  const rutaDirectivas = getRutaDirectivas(año);
  if (!rutaDirectivas) return null;

  const rutaCruzadas = path.join(rutaDirectivas, 'CRUZADAS');

  try {
    const entries = await fs.readdir(rutaCruzadas, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = path.join(rutaCruzadas, entry.name);
        const archivo = await leerMision(filePath);

        if (archivo && archivo.frontmatter.tipo === 'cruzada') {
          const nombreArchivo = archivo.frontmatter['nombre-cruzada'] || archivo.id;
          // Comparar con el nombre de la cruzada (puede venir como "Cruzada - X" o solo "X")
          if (nombreCruzada.includes(nombreArchivo) || nombreArchivo.includes(nombreCruzada) ||
              entry.name.includes(nombreCruzada.replace('Cruzada - ', ''))) {
            return {
              estado: archivo.frontmatter.estado || 'activa',
              fechaInicio: archivo.frontmatter['fecha-inicio'],
              fechaObjetivo: archivo.frontmatter['fecha-objetivo'],
              objetivoPrincipal: archivo.frontmatter['objetivo-principal'],
              pasosTotales: archivo.frontmatter['pasos-totales'],
              pasosCompletados: archivo.frontmatter['pasos-completados'],
              completada: archivo.frontmatter.completada === true
            };
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error cargando info de cruzada ${nombreCruzada}:`, error.message);
  }

  return null;
}

// Helper: Cargar cruzadas vinculadas a una directiva
async function cargarCruzadasDeDirectiva(directiva) {
  const cruzadas = [];
  const misionesDirectiva = []; // Todas las misiones de esta directiva

  // Buscar cruzadas en todo el vault que referencien esta directiva
  const añosACargar = detectarAñosACargar();

  for (const año of añosACargar) {
    const rutaMisiones = getRutaMisionesActivas(año);
    const rutaCompletadas = getRutaMisionesCompletadas(año);

    // Cargar todas las misiones para encontrar las cruzadas
    const misionesActivas = rutaMisiones ? await cargarMisiones(rutaMisiones) : [];
    const misionesCompletadas = rutaCompletadas ? await cargarMisiones(rutaCompletadas) : [];
    const todasMisiones = [...misionesActivas, ...misionesCompletadas];

    // Agrupar por cruzada
    const cruzadasMap = new Map();

    for (const mision of todasMisiones) {
      const directivaRef = extraerNombreWikilink(mision.frontmatter.directiva);
      const cruzadaRef = extraerNombreWikilink(mision.frontmatter.cruzada);

      // Solo si la misión pertenece a esta directiva
      if (directivaRef === directiva.titulo || directivaRef === directiva.id) {
        if (cruzadaRef) {
          if (!cruzadasMap.has(cruzadaRef)) {
            cruzadasMap.set(cruzadaRef, {
              id: cruzadaRef,
              titulo: cruzadaRef,
              pasos: [],
              misiones: []
            });
          }
          cruzadasMap.get(cruzadaRef).misiones.push(mision);
        } else {
          // Misiones sin cruzada (sueltas)
          misionesDirectiva.push({
            id: mision.id,
            titulo: mision.titulo || mision.id,
            completada: mision.completada === true || mision.frontmatter?.completada === true,
            prioridad: mision.frontmatter?.prioridad || 'media',
            categoria: mision.frontmatter?.categoria || '',
            deadline: mision.deadline || mision.frontmatter?.deadline || null,
            criterioVictoria: mision.frontmatter?.['criterio-victoria'] === true,
          });
        }
      }
    }

    // Procesar cada cruzada
    for (const [nombre, cruzada] of cruzadasMap) {
      // Obtener info adicional de la cruzada (estado, fechas)
      const infoCruzada = await cargarInfoCruzada(nombre, año);

      // Ordenar misiones por paso-cruzada
      cruzada.misiones.sort((a, b) => {
        const pasoA = a.frontmatter['paso-cruzada'] || 999;
        const pasoB = b.frontmatter['paso-cruzada'] || 999;
        return pasoA - pasoB;
      });

      // Generar lista de pasos con deadline
      cruzada.pasos = cruzada.misiones.map((m, idx) => ({
        numero: m.frontmatter['paso-cruzada'] || idx + 1,
        titulo: m.titulo,
        completada: m.completada === true,
        referencia: m.id?.substring(0, 4)?.toUpperCase(),
        misionId: m.id,
        deadline: m.deadline || null
      }));

      // Calcular estadísticas - preferir frontmatter de la cruzada sobre conteo de misiones
      const totalPasos = infoCruzada?.pasosTotales || cruzada.pasos.length;
      const pasosCompletados = infoCruzada?.pasosCompletados != null ? infoCruzada.pasosCompletados : cruzada.pasos.filter(p => p.completada).length;
      const porcentaje = totalPasos > 0 ? Math.round((pasosCompletados / totalPasos) * 100) : 0;

      // Marcar paso activo
      const activeIndex = cruzada.pasos.findIndex(p => !p.completada);
      cruzada.pasos.forEach((p, i) => {
        p.esActivo = i === activeIndex;
        p.activeIndex = activeIndex;
      });

      cruzadas.push({
        id: nombre,
        titulo: nombre,
        totalPasos,
        pasosCompletados,
        porcentaje,
        pasos: cruzada.pasos,
        estado: infoCruzada?.estado || 'activa',
        completada: infoCruzada?.completada || false,
        fechaInicio: infoCruzada?.fechaInicio,
        fechaObjetivo: infoCruzada?.fechaObjetivo
      });
    }
  }

  return { cruzadas, misiones: misionesDirectiva };
}

// GET /api/directivas - Obtener todas las directivas con sus cruzadas
app.get('/api/directivas', async (req, res) => {
  try {
    const añosACargar = detectarAñosACargar();
    let todasDirectivas = [];

    // Cargar directivas de todos los años
    for (const año of añosACargar) {
      const directivasAño = await cargarDirectivasDeAño(año);
      todasDirectivas = [...todasDirectivas, ...directivasAño];
    }

    // Para cada directiva, cargar sus cruzadas y calcular progreso
    const directivasConCruzadas = await Promise.all(
      todasDirectivas.map(async (directiva) => {
        const { cruzadas, misiones } = await cargarCruzadasDeDirectiva(directiva);

        // Calcular porcentaje total de la directiva
        let totalPasos = 0;
        let pasosCompletados = 0;

        cruzadas.forEach(c => {
          totalPasos += c.totalPasos;
          pasosCompletados += c.pasosCompletados;
        });

        const porcentaje = totalPasos > 0 ? Math.round((pasosCompletados / totalPasos) * 100) : 0;

        return {
          ...directiva,
          cruzadas,
          misiones,
          totalPasos,
          pasosCompletados,
          porcentaje
        };
      })
    );

    // Filtrar solo directivas activas (no completadas al 100% o estado activa)
    const directivasActivas = directivasConCruzadas.filter(d =>
      d.estado === 'activa' || d.porcentaje < 100
    );

    res.json({
      success: true,
      total: directivasActivas.length,
      directivas: directivasActivas
    });
  } catch (error) {
    console.error('Error en GET /api/directivas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/directivas/:id - Obtener una directiva con sus cruzadas
app.get('/api/directivas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const añosACargar = detectarAñosACargar();
    let directivaEncontrada = null;

    // Buscar la directiva
    for (const año of añosACargar) {
      const directivasAño = await cargarDirectivasDeAño(año);
      directivaEncontrada = directivasAño.find(d => d.id === id || d.titulo === id);
      if (directivaEncontrada) break;
    }

    if (!directivaEncontrada) {
      return res.status(404).json({
        success: false,
        error: 'Directiva no encontrada'
      });
    }

    // Cargar cruzadas y misiones
    const { cruzadas, misiones } = await cargarCruzadasDeDirectiva(directivaEncontrada);

    // Calcular porcentaje total
    let totalPasos = 0;
    let pasosCompletados = 0;
    cruzadas.forEach(c => {
      totalPasos += c.totalPasos;
      pasosCompletados += c.pasosCompletados;
    });
    const porcentaje = totalPasos > 0 ? Math.round((pasosCompletados / totalPasos) * 100) : 0;

    res.json({
      success: true,
      directiva: {
        ...directivaEncontrada,
        cruzadas,
        misiones,
        totalPasos,
        pasosCompletados,
        porcentaje
      }
    });
  } catch (error) {
    console.error('Error en GET /api/directivas/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/cruzadas/:id - Obtener detalle de una cruzada específica
app.get('/api/cruzadas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const decodedId = decodeURIComponent(id);
    const añosACargar = detectarAñosACargar();

    // Buscar todas las misiones que pertenecen a esta cruzada
    let misionesCruzada = [];

    for (const año of añosACargar) {
      const rutaMisiones = getRutaMisionesActivas(año);
      const rutaCompletadas = getRutaMisionesCompletadas(año);

      const misionesActivas = rutaMisiones ? await cargarMisiones(rutaMisiones) : [];
      const misionesCompletadas = rutaCompletadas ? await cargarMisiones(rutaCompletadas) : [];
      const todasMisiones = [...misionesActivas, ...misionesCompletadas];

      for (const mision of todasMisiones) {
        const cruzadaRef = extraerNombreWikilink(mision.frontmatter.cruzada);
        if (cruzadaRef === decodedId) {
          misionesCruzada.push(mision);
        }
      }
    }

    // Cargar info del frontmatter de la cruzada
    const añoCruzada = añosACargar[0] || new Date().getFullYear();
    const infoCruzada = await cargarInfoCruzada(decodedId, añoCruzada);

    if (misionesCruzada.length === 0 && !infoCruzada) {
      return res.status(404).json({
        success: false,
        error: 'Cruzada no encontrada'
      });
    }

    // Ordenar por paso-cruzada
    misionesCruzada.sort((a, b) => {
      const pasoA = a.frontmatter['paso-cruzada'] || 999;
      const pasoB = b.frontmatter['paso-cruzada'] || 999;
      return pasoA - pasoB;
    });

    // Generar pasos
    const pasos = misionesCruzada.map((m, idx) => ({
      numero: m.frontmatter['paso-cruzada'] || idx + 1,
      titulo: m.titulo,
      completada: m.completada === true,
      referencia: m.id?.substring(0, 4)?.toUpperCase(),
      misionId: m.id
    }));

    // Calcular estadísticas - preferir frontmatter sobre conteo de misiones
    const totalPasos = infoCruzada?.pasosTotales || pasos.length;
    const pasosCompletados = infoCruzada?.pasosCompletados != null ? infoCruzada.pasosCompletados : pasos.filter(p => p.completada).length;
    const porcentaje = totalPasos > 0 ? Math.round((pasosCompletados / totalPasos) * 100) : 0;

    // Marcar paso activo
    const activeIndex = pasos.findIndex(p => !p.completada);
    pasos.forEach((p, i) => {
      p.esActivo = i === activeIndex;
      p.activeIndex = activeIndex;
    });

    res.json({
      success: true,
      cruzada: {
        id: decodedId,
        titulo: decodedId,
        totalPasos,
        pasosCompletados,
        porcentaje,
        pasos,
        estado: infoCruzada?.estado || 'activa',
        completada: infoCruzada?.completada || false
      }
    });
  } catch (error) {
    console.error('Error en GET /api/cruzadas/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/cruzadas/:nombre/completar-paso - Completar un paso de la cruzada
app.post('/api/cruzadas/:nombre/completar-paso', async (req, res) => {
  try {
    const { nombre } = req.params;
    const { misionId, paso } = req.body;

    console.log(`[completar-paso] Cruzada: ${nombre}, misionId: ${misionId}, paso: ${paso}`);

    // Si hay misionId, completar la misión (que actualizará la cruzada automáticamente)
    if (misionId) {
      const añosACargar = detectarAñosACargar();
      let misionPath = null;
      let añoEncontrado = null;

      // Buscar la misión en todos los años
      for (const año of añosACargar) {
        const rutaActivas = getRutaMisionesActivas(año);
        if (rutaActivas) {
          const posiblePath = path.join(rutaActivas, `${misionId}.md`);
          try {
            await fs.access(posiblePath);
            misionPath = posiblePath;
            añoEncontrado = año;
            break;
          } catch {
            // Continuar buscando
          }
        }
      }

      if (misionPath) {
        // Leer y actualizar la misión
        const mision = await leerMision(misionPath);
        if (mision) {
          mision.frontmatter.completada = true;
          mision.frontmatter['fecha-completada'] = new Date().toISOString().split('T')[0];

          // Mover a completadas
          const rutaCompletadas = getRutaMisionesCompletadas(añoEncontrado);
          const nuevaPath = path.join(rutaCompletadas, `${misionId}.md`);
          await fs.mkdir(rutaCompletadas, { recursive: true });
          await escribirMision(nuevaPath, mision.frontmatter, mision.contenido);
          await fs.unlink(misionPath);

          // Actualizar cruzada
          const cruzadaActualizada = await actualizarCruzadaSiExiste(mision.frontmatter, añoEncontrado);

          return res.json({
            success: true,
            message: 'Paso completado (misión)',
            mision: {
              id: misionId,
              titulo: mision.titulo,
              xp: mision['puntos-xp'] || 0
            },
            cruzada: cruzadaActualizada
          });
        }
      }
    }

    // Si no hay misión o no se encontró, actualizar directamente la cruzada
    const añosACargar = detectarAñosACargar();
    let cruzadaActualizada = null;

    for (const año of añosACargar) {
      const rutaCruzadas = getRutaCruzadas(año);
      if (!rutaCruzadas) continue;

      try {
        const archivos = await fs.readdir(rutaCruzadas);
        const nombreDecodificado = decodeURIComponent(nombre);

        for (const archivo of archivos) {
          if (!archivo.endsWith('.md')) continue;

          const nombreArchivo = archivo.replace('.md', '');
          const nombreLimpio = nombreArchivo.replace(/^Cruzada - /i, '');

          if (nombreArchivo === nombreDecodificado ||
              nombreLimpio === nombreDecodificado ||
              nombreArchivo.includes(nombreDecodificado) ||
              nombreDecodificado.includes(nombreLimpio)) {

            const cruzadaPath = path.join(rutaCruzadas, archivo);
            const fileContent = await fs.readFile(cruzadaPath, 'utf-8');
            const { data, content } = matter(fileContent);

            // Incrementar pasos-completados
            const pasosActuales = data['pasos-completados'] || 0;
            const pasosTotales = data['pasos-totales'] || 1;
            const nuevosPasos = Math.min(pasosActuales + 1, pasosTotales);

            data['pasos-completados'] = nuevosPasos;

            if (nuevosPasos >= pasosTotales) {
              data.completada = true;
              data.estado = 'completada';
              data['fecha-completada'] = new Date().toISOString().split('T')[0];
            }

            const nuevoContenido = matter.stringify(content, data);
            await fs.writeFile(cruzadaPath, nuevoContenido, 'utf-8');

            cruzadaActualizada = {
              nombre: nombreDecodificado,
              pasosAnteriores: pasosActuales,
              pasosNuevos: nuevosPasos,
              pasosTotales,
              completada: nuevosPasos >= pasosTotales
            };

            console.log(`[completar-paso] Cruzada actualizada: ${pasosActuales} → ${nuevosPasos}/${pasosTotales}`);
            break;
          }
        }
        if (cruzadaActualizada) break;
      } catch (err) {
        console.log(`[completar-paso] Error en año ${año}:`, err.message);
      }
    }

    if (cruzadaActualizada) {
      return res.json({
        success: true,
        message: 'Paso completado (directo)',
        cruzada: cruzadaActualizada
      });
    }

    res.status(404).json({
      success: false,
      error: 'Cruzada no encontrada'
    });
  } catch (error) {
    console.error('Error en POST /api/cruzadas/:nombre/completar-paso:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINTS DE INCURSIONES DIARIAS
// ============================================

// Helper: Obtener nombre del día en español
function getDiaSemana(fecha) {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return dias[fecha.getDay()];
}

// ============================================================================
// API: CONFIGURACIÓN DE RUTINAS
// ============================================================================

// GET /api/config/rutinas - Devuelve configuración de rutinas al frontend
app.get('/api/config/rutinas', (req, res) => {
  res.json({ success: true, config: RUTINAS_CONFIG });
});

// Helper: Crear contenido de incursión desde template (usa RUTINAS_CONFIG)
function crearContenidoIncursion(fecha) {
  const año = fecha.getFullYear();
  const mes = fecha.getMonth();
  const dia = fecha.getDate();
  const diaSemana = getDiaSemana(fecha).toLowerCase();
  const semana = getWeekNumber(fecha);

  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const fechaStr = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const fechaLarga = `${dia} ${meses[mes]} ${año}`;

  // Generar líneas de rutinas desde config
  const rutinasYaml = ALL_RITUAL_KEYS.map(key => `${key}: false`).join('\n');

  // Generar líneas de grupo-completa desde config
  const gruposYaml = Object.keys(RUTINAS_CONFIG.grupos).map(g => `${g}-completa: false`).join('\n');

  return `---
tipo: incursion-diaria
año: ${año}
semana: ${String(semana).padStart(2, '0')}
fecha: ${fechaStr}
dia-semana: ${diaSemana}
${rutinasYaml}
rutinas-completadas: 0
pureza-dia: 0
${gruposYaml}
dia-perfecto: false
caos-total: 0
imperio-total: 0
caos-khorne: 0
caos-nurgle: 0
caos-tzeentch: 0
caos-slaanesh: 0
imperio-disciplina: 0
imperio-fe: 0
imperio-deber: 0
imperio-humildad: 0
xp-rutinas: 0
xp-perfecto: 0
xp-total-dia: 0
---

# ⚔️ INCURSIÓN: ${fechaLarga}

> **Día de la semana**: ${getDiaSemana(fecha)}
> **Semana**: ${semana}

---

## 📝 NOTAS DEL DÍA



---
`;
}

// Helper: Obtener número de semana
function getWeekNumber(fecha) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// GET /api/incursion/hoy - Obtener o crear la incursión de hoy
// GET /api/incursion/:fecha - Obtener o crear la incursión de una fecha específica
app.get('/api/incursion/hoy', async (req, res) => {
  const hoy = new Date();
  // Usar fecha local sin conversión UTC para evitar problemas de timezone
  const año = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  const fechaStr = `${año}-${mes}-${dia}`;
  return cargarIncursionPorFecha(fechaStr, res, true);
});

app.get('/api/incursion/:fecha', async (req, res) => {
  const { fecha } = req.params;
  // Validar formato fecha YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ success: false, error: 'Formato de fecha inválido. Usar YYYY-MM-DD' });
  }
  return cargarIncursionPorFecha(fecha, res, true);
});

// GET /api/incursiones/semana/:fecha - Obtener estado de los 7 días de la semana
// Devuelve { dias: { '2026-01-06': { exists: true, diaPerfecto: true, rutinasCompletadas: 19 }, ... } }
app.get('/api/incursiones/semana/:fecha', async (req, res) => {
  try {
    const { fecha } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ success: false, error: 'Formato de fecha inválido' });
    }

    // Calcular el lunes de la semana
    const fechaBase = new Date(fecha + 'T12:00:00');
    const dayOfWeek = fechaBase.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(fechaBase);
    monday.setDate(fechaBase.getDate() + diffToMonday);

    const dias = {};

    // Obtener estado de cada día de la semana
    for (let i = 0; i < 7; i++) {
      const dia = new Date(monday);
      dia.setDate(monday.getDate() + i);
      const año = dia.getFullYear();
      const mes = String(dia.getMonth() + 1).padStart(2, '0');
      const d = String(dia.getDate()).padStart(2, '0');
      const fechaStr = `${año}-${mes}-${d}`;
      const diaSemana = getDiaSemana(dia);
      const nombreArchivo = `${fechaStr} - ${diaSemana}.md`;

      const rutaIncursiones = getRutaIncursiones(año);
      if (!rutaIncursiones) {
        dias[fechaStr] = { exists: false, diaPerfecto: false, rutinasCompletadas: 0 };
        continue;
      }

      const rutaArchivo = path.join(rutaIncursiones, nombreArchivo);

      try {
        const contenido = await fs.readFile(rutaArchivo, 'utf-8');
        const parsed = matter(contenido);
        dias[fechaStr] = {
          exists: true,
          diaPerfecto: parsed.data['dia-perfecto'] === true,
          rutinasCompletadas: parsed.data['rutinas-completadas'] || 0
        };
      } catch (err) {
        dias[fechaStr] = { exists: false, diaPerfecto: false, rutinasCompletadas: 0 };
      }
    }

    res.json({ success: true, dias });
  } catch (error) {
    console.error('Error en /api/incursiones/semana:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function cargarIncursionPorFecha(fechaStr, res, crearSiNoExiste = true) {
  try {
    const fecha = new Date(fechaStr + 'T12:00:00'); // Evitar problemas de timezone
    const año = fecha.getFullYear();
    const diaSemana = getDiaSemana(fecha);
    const nombreArchivo = `${fechaStr} - ${diaSemana}.md`;

    const rutaIncursiones = getRutaIncursiones(año);
    if (!rutaIncursiones) {
      return res.status(400).json({ success: false, error: 'Año no soportado' });
    }

    const rutaArchivo = path.join(rutaIncursiones, nombreArchivo);

    let data;
    let exists = true;
    try {
      // Intentar leer el archivo existente
      const contenido = await fs.readFile(rutaArchivo, 'utf-8');
      const parsed = matter(contenido);
      data = parsed.data;
    } catch (err) {
      exists = false;
      if (crearSiNoExiste) {
        // Si no existe, crear el archivo
        const contenidoNuevo = crearContenidoIncursion(fecha);
        await fs.mkdir(rutaIncursiones, { recursive: true });
        await fs.writeFile(rutaArchivo, contenidoNuevo, 'utf-8');
        const parsed = matter(contenidoNuevo);
        data = parsed.data;
      } else {
        data = null;
      }
    }

    res.json({
      success: true,
      fecha: fechaStr,
      diaSemana: diaSemana,
      archivo: nombreArchivo,
      exists: exists,
      data: data
    });

  } catch (error) {
    console.error('Error en /api/incursion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/incursion/ritual/:id - Toggle de un ritual
// Body: { completed: true/false, fecha?: 'YYYY-MM-DD' }
app.post('/api/incursion/ritual/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, fecha: fechaParam } = req.body;

    // Si se pasa fecha, usar esa; si no, usar hoy (fecha local)
    let fechaStr = fechaParam;
    if (!fechaStr) {
      const hoy = new Date();
      fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    }
    const fecha = new Date(fechaStr + 'T12:00:00');
    const año = fecha.getFullYear();
    const diaSemana = getDiaSemana(fecha);
    const nombreArchivo = `${fechaStr} - ${diaSemana}.md`;

    const rutaIncursiones = getRutaIncursiones(año);
    const rutaArchivo = path.join(rutaIncursiones, nombreArchivo);

    // Leer archivo
    const contenido = await fs.readFile(rutaArchivo, 'utf-8');
    const parsed = matter(contenido);

    // Actualizar el ritual
    parsed.data[id] = completed;

    // Recalcular estadísticas usando RUTINAS_CONFIG
    const grupoStats = {};
    for (const [nombre, grupo] of Object.entries(RUTINAS_CONFIG.grupos)) {
      grupoStats[nombre] = grupo.rutinas.every(r => parsed.data[r] === true);
    }

    const rutinasCompletadas = ALL_RITUAL_KEYS.filter(r => parsed.data[r] === true).length;
    const purezaDia = Math.round((rutinasCompletadas / TOTAL_RUTINAS) * 100);
    const diaPerfecto = Object.values(grupoStats).every(v => v);

    // XP
    const xpRutinas = rutinasCompletadas * 5;
    const xpPerfecto = diaPerfecto ? 50 : 0;

    // Actualizar estadísticas por grupo
    for (const nombre of Object.keys(RUTINAS_CONFIG.grupos)) {
      parsed.data[`${nombre}-completa`] = grupoStats[nombre];
    }
    parsed.data['rutinas-completadas'] = rutinasCompletadas;
    parsed.data['pureza-dia'] = purezaDia;
    parsed.data['dia-perfecto'] = diaPerfecto;
    parsed.data['xp-rutinas'] = xpRutinas;
    parsed.data['xp-perfecto'] = xpPerfecto;
    parsed.data['xp-total-dia'] = xpRutinas + xpPerfecto;

    // Normalizar fecha antes de guardar (evitar que gray-matter la convierta a ISO timestamp)
    if (parsed.data.fecha instanceof Date) {
      parsed.data.fecha = normalizarFecha(parsed.data.fecha);
    } else if (typeof parsed.data.fecha === 'string' && parsed.data.fecha.includes('T')) {
      parsed.data.fecha = parsed.data.fecha.split('T')[0];
    }

    // Guardar archivo
    const nuevoContenido = matter.stringify(parsed.content, parsed.data);
    await fs.writeFile(rutaArchivo, nuevoContenido, 'utf-8');

    res.json({
      success: true,
      ritual: id,
      completed: completed,
      stats: {
        ...grupoStats,
        rutinasCompletadas,
        purezaDia,
        diaPerfecto,
        xpTotal: xpRutinas + xpPerfecto
      }
    });

  } catch (error) {
    console.error('Error en /api/incursion/ritual:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/incursion/mood - Actualizar valores de mood
// Body: { moods: { 'caos-khorne': 10, ... }, fecha?: 'YYYY-MM-DD' }
app.post('/api/incursion/mood', async (req, res) => {
  try {
    const { moods, fecha: fechaParam } = req.body;

    // Si se pasa fecha, usar esa; si no, usar hoy (fecha local)
    let fechaStr = fechaParam;
    if (!fechaStr) {
      const hoy = new Date();
      fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    }
    const fecha = new Date(fechaStr + 'T12:00:00');
    const año = fecha.getFullYear();
    const diaSemana = getDiaSemana(fecha);
    const nombreArchivo = `${fechaStr} - ${diaSemana}.md`;

    const rutaIncursiones = getRutaIncursiones(año);
    const rutaArchivo = path.join(rutaIncursiones, nombreArchivo);

    // Leer archivo
    const contenido = await fs.readFile(rutaArchivo, 'utf-8');
    const parsed = matter(contenido);

    // Actualizar moods
    for (const [key, value] of Object.entries(moods)) {
      parsed.data[key] = value;
    }

    // Recalcular totales
    const caosTotal = (parsed.data['caos-khorne'] || 0) + (parsed.data['caos-nurgle'] || 0) +
                      (parsed.data['caos-tzeentch'] || 0) + (parsed.data['caos-slaanesh'] || 0);
    const imperioTotal = (parsed.data['imperio-disciplina'] || 0) + (parsed.data['imperio-fe'] || 0) +
                         (parsed.data['imperio-deber'] || 0) + (parsed.data['imperio-humildad'] || 0);

    parsed.data['caos-total'] = caosTotal;
    parsed.data['imperio-total'] = imperioTotal;

    // Normalizar fecha antes de guardar (evitar que gray-matter la convierta a ISO timestamp)
    if (parsed.data.fecha instanceof Date) {
      parsed.data.fecha = normalizarFecha(parsed.data.fecha);
    } else if (typeof parsed.data.fecha === 'string' && parsed.data.fecha.includes('T')) {
      parsed.data.fecha = parsed.data.fecha.split('T')[0];
    }

    // Guardar archivo
    const nuevoContenido = matter.stringify(parsed.content, parsed.data);
    await fs.writeFile(rutaArchivo, nuevoContenido, 'utf-8');

    res.json({
      success: true,
      moods: moods,
      totals: { caosTotal, imperioTotal }
    });

  } catch (error) {
    console.error('Error en /api/incursion/mood:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REVIEWS SEMANALES (INQUISICIÓN) ENDPOINTS
// ============================================

const ELEMENT_COLORS = {
  khorne: '#dc2626', nurgle: '#22c55e', tzeentch: '#3b82f6', slaanesh: '#a855f7',
  disciplina: '#C9A961', fe: '#e5e7eb', deber: '#cd7f32', humildad: '#6b7280'
};
const ELEMENT_TYPES = {
  khorne: 'caos', nurgle: 'caos', tzeentch: 'caos', slaanesh: 'caos',
  disciplina: 'imperio', fe: 'imperio', deber: 'imperio', humildad: 'imperio'
};

// GET /api/reviews?ano=YYYY - Listar reviews semanales con stats calculadas desde incursiones
app.get('/api/reviews', async (req, res) => {
  try {
    const año = parseInt(req.query.ano) || new Date().getFullYear();
    const rutaReviews = getRutaReviews(año);
    const rutaIncursiones = getRutaIncursiones(año);

    if (!rutaReviews || !rutaIncursiones || !existsSync(rutaReviews)) {
      return res.json({ success: true, ano: año, totalSemanas: 0, resumen: { purezaPromedio: 0, xpTotal: 0, diasPerfectos: 0, semanasTrackeadas: 0, rutinasCompletadas: 0, rutinasTotal: 0 }, reviews: [] });
    }

    // 1. Leer todos los archivos de review
    const reviewEntries = readdirSync(rutaReviews).filter(f => f.startsWith('SEMANA-') && f.endsWith('.md'));

    // 2. Leer todas las incursiones del año una sola vez y agrupar por semana
    const incursionsByWeek = {};
    if (existsSync(rutaIncursiones)) {
      const incEntries = readdirSync(rutaIncursiones).filter(f => /^\d{4}-\d{2}-\d{2}/.test(f) && f.endsWith('.md'));
      for (const incFile of incEntries) {
        try {
          const content = readFileSync(path.join(rutaIncursiones, incFile), 'utf-8');
          const { data } = matter(content);
          if (data.tipo === 'incursion-diaria') {
            const semana = parseInt(data.semana) || 0;
            if (!incursionsByWeek[semana]) incursionsByWeek[semana] = [];
            incursionsByWeek[semana].push(data);
          }
        } catch (e) { /* skip malformed files */ }
      }
    }

    // 3. Para cada review, calcular stats desde incursiones
    const reviews = [];
    let totalXp = 0, totalDiasPerfectos = 0, totalRutinas = 0, totalRutinasMax = 0;
    const purezas = [];

    for (const reviewFile of reviewEntries) {
      try {
        const content = readFileSync(path.join(rutaReviews, reviewFile), 'utf-8');
        const { data } = matter(content);

        const semana = parseInt(data.semana) || 0;
        const incursiones = incursionsByWeek[semana] || [];

        let rutinasTotal = 0, diasPerfectos = 0, xpTotal = 0;
        let khorne = 0, nurgle = 0, tzeentch = 0, slaanesh = 0;
        let disciplina = 0, fe = 0, deber = 0, humildad = 0;
        const purezasDia = [];

        incursiones.forEach(inc => {
          rutinasTotal += inc['rutinas-completadas'] || 0;
          purezasDia.push(inc['pureza-dia'] || 0);
          if (inc['dia-perfecto']) diasPerfectos++;
          xpTotal += inc['xp-total-dia'] || 0;
          khorne += inc['caos-khorne'] || 0;
          nurgle += inc['caos-nurgle'] || 0;
          tzeentch += inc['caos-tzeentch'] || 0;
          slaanesh += inc['caos-slaanesh'] || 0;
          disciplina += inc['imperio-disciplina'] || 0;
          fe += inc['imperio-fe'] || 0;
          deber += inc['imperio-deber'] || 0;
          humildad += inc['imperio-humildad'] || 0;
        });

        const numDias = incursiones.length;
        const purezaPromedio = numDias > 0 ? Math.round(purezasDia.reduce((a, b) => a + b, 0) / numDias) : 0;
        const maxRutinas = numDias * TOTAL_RUTINAS;

        const nivelPureza = purezaPromedio >= 80 ? 'Puro' : purezaPromedio >= 50 ? 'Equilibrado' : 'Corrompido';
        const colorPureza = purezaPromedio >= 80 ? '#22c55e' : purezaPromedio >= 50 ? '#f59e0b' : '#ef4444';

        // Elemento dominante
        const elementos = { khorne, nurgle, tzeentch, slaanesh, disciplina, fe, deber, humildad };
        let dominanteName = 'disciplina';
        let dominanteVal = 0;
        for (const [key, val] of Object.entries(elementos)) {
          const avg = numDias > 0 ? Math.round(val / numDias) : 0;
          if (avg > dominanteVal) { dominanteVal = avg; dominanteName = key; }
        }

        // Acumular para resumen global
        totalXp += xpTotal;
        totalDiasPerfectos += diasPerfectos;
        totalRutinas += rutinasTotal;
        totalRutinasMax += maxRutinas;
        if (numDias > 0) purezas.push(purezaPromedio);

        const reflexion = (data['reflexion-semana'] || '').trim();

        reviews.push({
          id: reviewFile.replace('.md', ''),
          semana,
          ano: data['año'] || año,
          fechaInicio: normalizarFecha(data['fecha-inicio']),
          fechaFin: normalizarFecha(data['fecha-fin']),
          reflexion: reflexion === '[Tu reflexión aquí]' ? '' : reflexion,
          diasRegistrados: numDias,
          diasPerfectos,
          purezaPromedio,
          rutinasCompletadas: rutinasTotal,
          rutinasTotal: maxRutinas,
          xpTotal,
          nivelPureza,
          colorPureza,
          elementoDominante: {
            nombre: dominanteName,
            tipo: ELEMENT_TYPES[dominanteName],
            valor: dominanteVal,
            color: ELEMENT_COLORS[dominanteName]
          }
        });
      } catch (e) { /* skip malformed review files */ }
    }

    // Ordenar por semana descendente (más reciente primero)
    reviews.sort((a, b) => b.semana - a.semana);

    const purezaGlobal = purezas.length > 0 ? Math.round(purezas.reduce((a, b) => a + b, 0) / purezas.length) : 0;

    res.json({
      success: true,
      ano: año,
      totalSemanas: reviews.length,
      resumen: {
        purezaPromedio: purezaGlobal,
        xpTotal: totalXp,
        diasPerfectos: totalDiasPerfectos,
        semanasTrackeadas: reviews.length,
        rutinasCompletadas: totalRutinas,
        rutinasTotal: totalRutinasMax
      },
      reviews
    });
  } catch (error) {
    console.error('Error en GET /api/reviews:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/reviews/crear - Crear review semanal
app.post('/api/reviews/crear', async (req, res) => {
  try {
    const { semana, año, fechaInicio, fechaFin, reflexion } = req.body;

    // Validaciones
    if (!semana || !año || !fechaInicio || !fechaFin) {
      return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
    }

    if (semana < 1 || semana > 52) {
      return res.status(400).json({ success: false, error: 'Semana debe estar entre 1 y 52' });
    }

    // Determinar ruta según año
    const rutaReviews = getRutaReviews(año);
    await fs.mkdir(rutaReviews, { recursive: true });

    // Generar nombre de archivo
    const semanaStr = semana.toString().padStart(2, '0');
    const filename = `SEMANA-${semanaStr}-${año}.md`;
    const filepath = path.join(rutaReviews, filename);

    // Verificar si ya existe
    try {
      await fs.access(filepath);
      return res.status(409).json({ success: false, error: 'Ya existe un review para esta semana' });
    } catch {
      // No existe, continuar
    }

    // Crear contenido del archivo
    const frontmatter = {
      'tipo': 'review-semanal',
      'año': año,
      'semana': semana,
      'fecha-inicio': fechaInicio,
      'fecha-fin': fechaFin,
      'reflexion-semana': reflexion || '[Reflexión pendiente]',
      'cssclasses': ['dashboard-view']
    };

    const body = `# 📊 REVIEW SEMANA ${semana} - ${año}

> **Datos leídos directamente de las Incursiones Diarias**

---

## 📈 RESUMEN EJECUTIVO

\`\`\`dataviewjs
const CONFIG = eval(await dv.io.load("wh-config.js"));
const page = dv.current();
const semana = page.semana;
const año = page.año;

// Buscar incursiones - usar ruta dinamica segun año
const sistemaNombre = año === 2025 ? "SISTEMA AQUILA" : "SISTEMA HIPPARION";
const rutaIncursiones = \`"-⭐ HOME/Proyecto Warhammer/02 - CARTA ASTRAL (PLANNING & ESTRATEGIA)/00 - SISTEMAS/\${sistemaNombre} - AÑO \${año}/07 - INCURSIONES"\`;

const incursiones = dv.pages(rutaIncursiones)
    .where(p => p.tipo === "incursion-diaria" && p.semana === semana && p.año === año)
    .sort(p => p.fecha, 'asc');

if (incursiones.length === 0) {
    dv.paragraph("⚠️ No se encontraron incursiones para la semana " + semana + ". Usa la webapp Duty para crear las incursiones diarias.");
} else {
    // Calcular estadísticas agregadas
    let rutinasTotal = 0;
    let diasPerfectos = 0;
    let xpTotal = 0;
    const purezas = [];

    incursiones.forEach(inc => {
        rutinasTotal += inc["rutinas-completadas"] || 0;
        purezas.push(inc["pureza-dia"] || 0);
        if (inc["dia-perfecto"]) diasPerfectos++;
        xpTotal += inc["xp-total-dia"] || 0;
    });

    const numDias = incursiones.length;
    const purezaPromedio = numDias > 0 ? Math.round(purezas.reduce((a,b) => a+b, 0) / numDias) : 0;
    const maxRutinas = numDias * 19;

    const nivelPureza = purezaPromedio >= 80 ? "PURO" : purezaPromedio >= 50 ? "EQUILIBRADO" : "CORRUPTO";
    const colorPureza = purezaPromedio >= 80 ? "#10b981" : purezaPromedio >= 50 ? "#f59e0b" : "#ef4444";

    const container = dv.el("div", "");
    container.innerHTML = \`
    <div class="stats-mini-grid">
        <div class="stat-mini">
            <div class="stat-label">Días Registrados</div>
            <div class="stat-value">\${numDias}/7</div>
        </div>
        <div class="stat-mini">
            <div class="stat-label">Días Perfectos</div>
            <div class="stat-value">\${diasPerfectos}/\${numDias}</div>
        </div>
        <div class="stat-mini">
            <div class="stat-label">Pureza Promedio</div>
            <div class="stat-value" style="color: \${colorPureza}">\${purezaPromedio}%</div>
            <div class="stat-sublabel">\${nivelPureza}</div>
        </div>
        <div class="stat-mini">
            <div class="stat-label">Rutinas</div>
            <div class="stat-value">\${rutinasTotal}/\${maxRutinas}</div>
        </div>
        <div class="stat-mini">
            <div class="stat-label">XP Total</div>
            <div class="stat-value" style="color: #C9A961">\${xpTotal}</div>
        </div>
    </div>
    \`;
}
\`\`\`

---

## 📝 REFLEXIÓN SEMANAL

\`\`\`dataviewjs
const page = dv.current();
const reflexion = page["reflexion-semana"] || "[Escribe tu reflexión aquí editando el frontmatter]";
dv.el("blockquote", reflexion);
\`\`\`

---

## 🔗 INCURSIONES DE ESTA SEMANA

\`\`\`dataviewjs
const page = dv.current();
const semana = page.semana;
const año = page.año;

const sistemaNombre = año === 2025 ? "SISTEMA AQUILA" : "SISTEMA HIPPARION";
const rutaIncursiones = \`"-⭐ HOME/Proyecto Warhammer/02 - CARTA ASTRAL (PLANNING & ESTRATEGIA)/00 - SISTEMAS/\${sistemaNombre} - AÑO \${año}/07 - INCURSIONES"\`;

const incursiones = dv.pages(rutaIncursiones)
    .where(p => p.tipo === "incursion-diaria" && p.semana === semana && p.año === año)
    .sort(p => p.fecha, 'asc');

if (incursiones.length === 0) {
    dv.paragraph("No hay incursiones para esta semana.");
} else {
    dv.table(
        ["Fecha", "Día", "Rutinas", "Pureza", "XP", "Perfecto"],
        incursiones.map(inc => [
            inc.file.link,
            inc["dia-semana"] || "?",
            \`\${inc["rutinas-completadas"] || 0}/19\`,
            \`\${inc["pureza-dia"] || 0}%\`,
            inc["xp-total-dia"] || 0,
            inc["dia-perfecto"] ? "⭐" : ""
        ])
    );
}
\`\`\`

---

## 🧭 NAVEGACIÓN

[[SEMANA-${(semana - 1).toString().padStart(2, '0')}-${año}|← Semana Anterior]] | [[09 - INQUISICIÓN (REVIEWS & CONTROL)|🏠 Dashboard]] | [[SEMANA-${(semana + 1).toString().padStart(2, '0')}-${año}|Semana Siguiente →]]
`;

    const fileContent = matter.stringify(body, frontmatter);
    await fs.writeFile(filepath, fileContent, 'utf-8');

    console.log(`✅ Review creado: ${filename}`);
    res.json({
      success: true,
      message: 'Review creado correctamente',
      filename,
      semana,
      año
    });
  } catch (error) {
    console.error('Error en POST /api/reviews/crear:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// NOTAS SAGRADAS ENDPOINTS
// ============================================

const NOTAS_PATH = path.join(BASE_PATH, '15- NOTAS');

// GET /api/notas - Listar todas las notas del vault
app.get('/api/notas', async (req, res) => {
  try {
    await fs.mkdir(NOTAS_PATH, { recursive: true });
    const entries = await fs.readdir(NOTAS_PATH, { withFileTypes: true });
    const notas = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = path.join(NOTAS_PATH, entry.name);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data, content } = matter(fileContent);

        if (data.tipo === 'nota-sagrada') {
          notas.push({
            id: entry.name.replace('.md', ''),
            filename: entry.name,
            title: data.titulo || entry.name.replace('.md', ''),
            content: content.trim(),
            tipo: data.estilo || 'parchment',
            timestamp: data['fecha-creacion'] ? new Date(data['fecha-creacion']).getTime() : Date.now(),
            fechaCreacion: data['fecha-creacion'],
            fechaModificacion: data['fecha-modificacion'],
            frontmatter: data
          });
        }
      }
    }

    // Ordenar por fecha de modificación (más reciente primero)
    notas.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      success: true,
      total: notas.length,
      notas
    });
  } catch (error) {
    console.error('Error en GET /api/notas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/notas/:id - Obtener una nota específica
app.get('/api/notas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(NOTAS_PATH, `${id}.md`);

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    res.json({
      success: true,
      nota: {
        id,
        filename: `${id}.md`,
        title: data.titulo || id,
        content: content.trim(),
        tipo: data.estilo || 'parchment',
        timestamp: data['fecha-creacion'] ? new Date(data['fecha-creacion']).getTime() : Date.now(),
        frontmatter: data
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }
    console.error('Error en GET /api/notas/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/notas/crear - Crear nueva nota
app.post('/api/notas/crear', async (req, res) => {
  try {
    const { title, content, tipo } = req.body;

    if (!title && !content) {
      return res.status(400).json({
        success: false,
        error: 'Title or content required'
      });
    }

    const fecha = new Date();
    const fechaStr = fecha.toISOString().split('T')[0];
    const timestamp = Date.now();

    // Sanitize filename
    const tituloSanitizado = (title || 'Sin-designacion')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .trim()
      .substring(0, 50);

    const nombreArchivo = `${fechaStr}-${tituloSanitizado}.md`;
    await fs.mkdir(NOTAS_PATH, { recursive: true });
    const rutaArchivo = path.join(NOTAS_PATH, nombreArchivo);

    // Check if exists
    try {
      await fs.access(rutaArchivo);
      // Add timestamp to make unique
      const nombreUnico = `${fechaStr}-${tituloSanitizado}-${timestamp}.md`;
      const rutaUnica = path.join(NOTAS_PATH, nombreUnico);
      await crearArchivoNota(rutaUnica, title, content, tipo, fechaStr);
      return res.json({
        success: true,
        nota: {
          id: nombreUnico.replace('.md', ''),
          filename: nombreUnico,
          title: title || 'Sin designación',
          content,
          tipo: tipo || 'parchment',
          timestamp
        }
      });
    } catch {
      // File doesn't exist, create it
      await crearArchivoNota(rutaArchivo, title, content, tipo, fechaStr);
      res.json({
        success: true,
        nota: {
          id: nombreArchivo.replace('.md', ''),
          filename: nombreArchivo,
          title: title || 'Sin designación',
          content,
          tipo: tipo || 'parchment',
          timestamp
        }
      });
    }
  } catch (error) {
    console.error('Error en POST /api/notas/crear:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper: Crear archivo de nota
async function crearArchivoNota(rutaArchivo, title, content, tipo, fechaStr) {
  const contenidoArchivo = `---
tipo: nota-sagrada
titulo: "${title || 'Sin designación'}"
estilo: ${tipo || 'parchment'}
fecha-creacion: ${fechaStr}
fecha-modificacion: ${fechaStr}
source: warhammer-vault-app
---

${content || ''}
`;
  await fs.writeFile(rutaArchivo, contenidoArchivo, 'utf-8');
  console.log(`[Notas] Creada: ${path.basename(rutaArchivo)}`);
}

// PUT /api/notas/:id - Actualizar nota existente
app.put('/api/notas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tipo } = req.body;
    const filePath = path.join(NOTAS_PATH, `${id}.md`);

    // Read existing file
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data } = matter(fileContent);

    // Update frontmatter
    data.titulo = title || data.titulo;
    data.estilo = tipo || data.estilo || 'parchment';
    data['fecha-modificacion'] = new Date().toISOString().split('T')[0];

    // Write updated file
    const nuevoContenido = matter.stringify(content || '', data);
    await fs.writeFile(filePath, nuevoContenido, 'utf-8');

    console.log(`[Notas] Actualizada: ${id}`);

    res.json({
      success: true,
      nota: {
        id,
        title: data.titulo,
        content,
        tipo: data.estilo,
        fechaModificacion: data['fecha-modificacion']
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }
    console.error('Error en PUT /api/notas/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/notas/:id - Eliminar nota
app.delete('/api/notas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(NOTAS_PATH, `${id}.md`);

    await fs.unlink(filePath);
    console.log(`[Notas] Eliminada: ${id}`);

    res.json({
      success: true,
      message: 'Nota eliminada'
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }
    console.error('Error en DELETE /api/notas/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/notas/offload - Offload nota desde local a Obsidian
app.post('/api/notas/offload', async (req, res) => {
  try {
    const { title, content, tipo, timestamp } = req.body;

    if (!title && !content) {
      return res.status(400).json({
        success: false,
        error: 'Title or content required'
      });
    }

    const fecha = timestamp ? new Date(timestamp) : new Date();
    const fechaStr = fecha.toISOString().split('T')[0];

    // Sanitize filename
    const tituloSanitizado = (title || 'Sin-designacion')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .trim()
      .substring(0, 50);

    const nombreArchivo = `${fechaStr}-${tituloSanitizado}.md`;
    await fs.mkdir(NOTAS_PATH, { recursive: true });

    let rutaFinal = path.join(NOTAS_PATH, nombreArchivo);

    // Check if exists, make unique if needed
    try {
      await fs.access(rutaFinal);
      const nombreUnico = `${fechaStr}-${tituloSanitizado}-${Date.now()}.md`;
      rutaFinal = path.join(NOTAS_PATH, nombreUnico);
    } catch {
      // File doesn't exist, use original name
    }

    await crearArchivoNota(rutaFinal, title, content, tipo, fechaStr);

    res.json({
      success: true,
      message: 'Nota offloaded to Obsidian',
      archivo: path.basename(rutaFinal),
      path: rutaFinal
    });
  } catch (error) {
    console.error('Error en POST /api/notas/offload:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// CARGO ENDPOINTS (Local Notepad → Obsidian)
// ============================================

const CARGO_PATH = path.join(BASE_PATH, '14 - CARGO');

// POST /api/cargo/offload - Crear nota en Obsidian desde cargo local
app.post('/api/cargo/offload', async (req, res) => {
  try {
    const { title, content, timestamp } = req.body;

    if (!title && !content) {
      return res.status(400).json({
        success: false,
        error: 'Title or content required'
      });
    }

    // Generar nombre de archivo basado en fecha y título
    const fecha = timestamp ? new Date(timestamp) : new Date();
    const fechaStr = fecha.toISOString().split('T')[0];
    const tituloSanitizado = (title || 'Untitled')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);

    const nombreArchivo = `${fechaStr} - ${tituloSanitizado}.md`;

    // Asegurar que la carpeta existe
    await fs.mkdir(CARGO_PATH, { recursive: true });

    const rutaArchivo = path.join(CARGO_PATH, nombreArchivo);

    // Crear contenido del archivo markdown
    const fechaLarga = fecha.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const contenidoArchivo = `---
tipo: cargo-note
titulo: "${title || 'Untitled'}"
fecha-creacion: ${fechaStr}
fecha-offload: ${new Date().toISOString().split('T')[0]}
source: warhammer-vault-app
---

# ${title || 'Untitled'}

> **Fecha original**: ${fechaLarga}
> **Offloaded**: ${new Date().toLocaleDateString('es-ES')}

---

${content || ''}
`;

    await fs.writeFile(rutaArchivo, contenidoArchivo, 'utf-8');

    console.log(`[Cargo] Offloaded: ${nombreArchivo}`);

    res.json({
      success: true,
      message: 'Data offloaded to cogitator',
      archivo: nombreArchivo,
      path: rutaArchivo
    });

  } catch (error) {
    console.error('Error en POST /api/cargo/offload:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// AVISOS (RECORDADORA)
// ============================================

// GET /api/avisos - Listar todos los avisos del vault
app.get('/api/avisos', async (req, res) => {
  try {
    await fs.mkdir(AVISOS_PATH, { recursive: true });
    const avisos = await cargarArchivosRecursivos(AVISOS_PATH, ['aviso']);

    const resultado = avisos.map(a => ({
      id: a.id,
      titulo: a.frontmatter.titulo || a.titulo,
      subtipo: a.frontmatter.subtipo || 'puntual',
      recurrencia: a.frontmatter.recurrencia || 'no',
      fecha: normalizarFecha(a.frontmatter.fecha),
      'dia-del-mes': a.frontmatter['dia-del-mes'] || null,
      'dia-de-la-semana': a.frontmatter['dia-de-la-semana'] || null,
      hora: a.frontmatter.hora || '09:00',
      categoria: a.frontmatter.categoria || 'general',
      prioridad: a.frontmatter.prioridad || 'media',
      icono: a.frontmatter.icono || '📌',
      activo: a.frontmatter.activo !== false,
      descripcion: a.contenido,
      frontmatter: a.frontmatter
    }));

    // Ordenar: activos primero, luego por prioridad
    const ordenPrioridad = { 'alta': 0, 'media': 1, 'baja': 2 };
    resultado.sort((a, b) => {
      if (a.activo !== b.activo) return a.activo ? -1 : 1;
      return (ordenPrioridad[a.prioridad] ?? 1) - (ordenPrioridad[b.prioridad] ?? 1);
    });

    res.json({
      success: true,
      total: resultado.length,
      avisos: resultado
    });
  } catch (error) {
    console.error('Error en GET /api/avisos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/avisos/crear - Crear nuevo aviso en Obsidian
app.post('/api/avisos/crear', async (req, res) => {
  try {
    const {
      titulo,
      subtipo,
      recurrencia,
      fecha,
      diaDeLaSemana,
      diaDelMes,
      hora,
      categoria,
      prioridad,
      icono,
      descripcion
    } = req.body;

    if (!titulo || !titulo.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El título es requerido'
      });
    }

    // Sanitize filename
    const tituloSanitizado = titulo
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    const nombreArchivo = `${tituloSanitizado}.md`;
    await fs.mkdir(AVISOS_PATH, { recursive: true });
    let rutaArchivo = path.join(AVISOS_PATH, nombreArchivo);

    // Check if file exists, add timestamp if needed
    try {
      await fs.access(rutaArchivo);
      const nombreUnico = `${tituloSanitizado}-${Date.now()}.md`;
      rutaArchivo = path.join(AVISOS_PATH, nombreUnico);
    } catch {
      // File doesn't exist, use original name
    }

    // Build frontmatter
    const subtipoFinal = subtipo || 'puntual';
    const recurrenciaFinal = subtipoFinal === 'puntual' ? 'no' : (recurrencia || 'semanal');

    const frontmatterData = {
      tipo: 'aviso',
      titulo: titulo.trim(),
      directiva: null,
      'criterio-victoria': false,
      subtipo: subtipoFinal,
      recurrencia: recurrenciaFinal,
      categoria: categoria || 'general',
      prioridad: prioridad || 'media',
      icono: icono || '📌',
      hora: hora || '09:00'
    };

    // Add conditional fields
    if (subtipoFinal === 'puntual') {
      frontmatterData.fecha = fecha || new Date().toISOString().split('T')[0];
    } else if (recurrenciaFinal === 'semanal') {
      frontmatterData['dia-de-la-semana'] = parseInt(diaDeLaSemana) || 1;
      frontmatterData.activo = true;
    } else if (recurrenciaFinal === 'mensual') {
      frontmatterData['dia-del-mes'] = parseInt(diaDelMes) || 1;
      frontmatterData.activo = true;
    }

    // Build markdown content
    const contenido = `# ${icono || '📌'} ${titulo.trim()}

## Descripción
${descripcion || 'Sin descripción.'}

## Acciones
- [ ] Acción pendiente
`;

    await escribirMision(rutaArchivo, frontmatterData, contenido);

    console.log(`[Avisos] Creado: ${path.basename(rutaArchivo)}`);

    res.json({
      success: true,
      aviso: {
        id: path.basename(rutaArchivo, '.md'),
        titulo: titulo.trim(),
        subtipo: subtipoFinal,
        recurrencia: recurrenciaFinal,
        fecha: frontmatterData.fecha || null,
        'dia-del-mes': frontmatterData['dia-del-mes'] || null,
        'dia-de-la-semana': frontmatterData['dia-de-la-semana'] || null,
        hora: frontmatterData.hora,
        categoria: frontmatterData.categoria,
        prioridad: frontmatterData.prioridad,
        icono: frontmatterData.icono,
        activo: frontmatterData.activo !== false,
        descripcion: descripcion || ''
      }
    });
  } catch (error) {
    console.error('Error en POST /api/avisos/crear:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// PLANETAS (VoidMap)
// ============================================================================

// GET /api/planetas?año=YYYY - Listar los 12 planetas del año
app.get('/api/planetas', async (req, res) => {
  try {
    const año = parseInt(req.query.año) || new Date().getFullYear();
    const ruta = getRutaPlanetas(año);
    if (!ruta) {
      return res.json({ success: true, total: 0, año, planetas: [] });
    }

    const entries = await fs.readdir(ruta, { withFileTypes: true });
    const planetas = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = path.join(ruta, entry.name);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const { data } = matter(fileContent);

      if (data.tipo !== 'planeta') continue;

      planetas.push({
        id: path.basename(filePath, '.md'),
        nombre: data['nombre-planeta'] || 'Unknown',
        mes: data.mes,
        numeroMes: data['numero-mes'],
        fechaInicio: normalizarFecha(data['fecha-inicio']),
        fechaFin: normalizarFecha(data['fecha-fin']),
        estado: data.estado || 'pendiente',
        progreso: data.progreso || 0,
        totalMisiones: data['total-misiones'] || 0,
        misionesCompletadas: data['misiones-completadas'] || 0,
        sector: data.sector || '',
        objetivoMes: data['objetivo-mes'] || '',
        image: data.image || null,
        año: año
      });
    }

    planetas.sort((a, b) => a.numeroMes - b.numeroMes);
    console.log(`[PLANETAS] Año ${año}: ${planetas.length} planetas cargados`);

    res.json({ success: true, total: planetas.length, año, planetas });
  } catch (error) {
    console.error('Error en GET /api/planetas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/planetas/imagen/:filename - Serve planet images from vault Attachments
app.get('/api/planetas/imagen/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    // Security: only allow image filenames, no path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    const ATTACHMENTS_PATH = path.join(__dirname, '..', '..', 'warhammer-vault', '00 - Assets', 'Attachments');
    const filePath = path.join(ATTACHMENTS_PATH, filename);

    // Try exact filename first, then case-insensitive
    let finalPath = filePath;
    if (!existsSync(finalPath)) {
      // Try uppercase
      finalPath = path.join(ATTACHMENTS_PATH, filename.toUpperCase());
    }
    if (!existsSync(finalPath)) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const data = await fs.readFile(finalPath);
    res.send(data);
  } catch (error) {
    console.error('Error serving planet image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/planetas/:id?año=YYYY - Detalle de un planeta con sus misiones
app.get('/api/planetas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const año = parseInt(req.query.año) || new Date().getFullYear();
    const ruta = getRutaPlanetas(año);
    if (!ruta) {
      return res.status(404).json({ success: false, error: 'Año no encontrado' });
    }

    // Buscar el archivo del planeta
    const entries = await fs.readdir(ruta, { withFileTypes: true });
    let planetaData = null;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const baseName = path.basename(entry.name, '.md');
      if (baseName === id) {
        const filePath = path.join(ruta, entry.name);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(fileContent);
        planetaData = {
          id: baseName,
          nombre: data['nombre-planeta'] || 'Unknown',
          mes: data.mes,
          numeroMes: data['numero-mes'],
          fechaInicio: normalizarFecha(data['fecha-inicio']),
          fechaFin: normalizarFecha(data['fecha-fin']),
          estado: data.estado || 'pendiente',
          progreso: data.progreso || 0,
          totalMisiones: data['total-misiones'] || 0,
          misionesCompletadas: data['misiones-completadas'] || 0,
          sector: data.sector || '',
          objetivoMes: data['objetivo-mes'] || '',
          image: data.image || null,
          año: año
        };
        break;
      }
    }

    if (!planetaData) {
      return res.status(404).json({ success: false, error: 'Planeta no encontrado' });
    }

    // Cargar misiones del planeta (filtrar por deadline dentro del rango de fechas)
    const fechaInicio = planetaData.fechaInicio;
    const fechaFin = planetaData.fechaFin;
    let todasMisiones = [];

    const rutaActivas = getRutaMisionesActivas(año);
    const rutaCompletadas = getRutaMisionesCompletadas(año);
    const rutaOpcionales = getRutaMisionesOpcionales(año);

    if (rutaActivas) todasMisiones = [...todasMisiones, ...(await cargarMisiones(rutaActivas))];
    if (rutaCompletadas) todasMisiones = [...todasMisiones, ...(await cargarMisiones(rutaCompletadas))];
    if (rutaOpcionales) todasMisiones = [...todasMisiones, ...(await cargarMisiones(rutaOpcionales))];

    // Filtrar misiones cuyo deadline está dentro del rango del planeta
    const misionesPlaneta = todasMisiones.filter(m => {
      if (!m.deadline) return false;
      return m.deadline >= fechaInicio && m.deadline <= fechaFin;
    });

    // Calcular XP
    let xpEarned = 0;
    let xpPending = 0;
    misionesPlaneta.forEach(m => {
      const xp = m['puntos-xp'] || 0;
      if (m.completada) {
        xpEarned += xp;
      } else {
        xpPending += xp;
      }
    });

    // Ordenar misiones por deadline
    misionesPlaneta.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));

    console.log(`[PLANETAS] Detalle ${planetaData.nombre}: ${misionesPlaneta.length} misiones, XP=${xpEarned}/${xpEarned + xpPending}`);

    res.json({
      success: true,
      planeta: {
        ...planetaData,
        misiones: misionesPlaneta,
        stats: {
          xpEarned,
          xpPending,
          xpTotal: xpEarned + xpPending,
          totalActive: misionesPlaneta.filter(m => !m.completada).length,
          totalCompleted: misionesPlaneta.filter(m => m.completada).length
        }
      }
    });
  } catch (error) {
    console.error('Error en GET /api/planetas/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/planetas/:id/estado - Cambiar el estado de un planeta
app.post('/api/planetas/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const año = parseInt(req.query.año) || parseInt(req.body.año) || new Date().getFullYear();
    const { estado } = req.body;

    const estadosValidos = ['conquistado', 'en-conquista', 'bloqueado', 'pendiente'];
    if (!estado || !estadosValidos.includes(estado)) {
      return res.status(400).json({ success: false, error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
    }

    const ruta = getRutaPlanetas(año);
    if (!ruta) {
      return res.status(404).json({ success: false, error: 'Año no encontrado' });
    }

    // Buscar el archivo del planeta
    const entries = await fs.readdir(ruta, { withFileTypes: true });
    let filePath = null;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      if (path.basename(entry.name, '.md') === id) {
        filePath = path.join(ruta, entry.name);
        break;
      }
    }

    if (!filePath) {
      return res.status(404).json({ success: false, error: 'Planeta no encontrado' });
    }

    // Leer, modificar frontmatter, escribir
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    const estadoAnterior = data.estado;
    data.estado = estado;
    const newContent = matter.stringify(content, data);
    await fs.writeFile(filePath, newContent, 'utf-8');

    console.log(`[PLANETAS] Estado cambiado: ${data['nombre-planeta'] || id} ${estadoAnterior} → ${estado}`);

    res.json({ success: true, estadoAnterior, estadoNuevo: estado });
  } catch (error) {
    console.error('Error en POST /api/planetas/:id/estado:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Warhammer Missions API is running',
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// INICIAR SERVIDOR(ES)
// ============================================================

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const isTailscale = name.toLowerCase().includes('tailscale') || addr.address.startsWith('100.');
        addresses.push({ name, address: addr.address, tailscale: isTailscale });
      }
    }
  }
  return addresses;
}

function printStartupInfo(httpsActive) {
  console.log('========================================');
  console.log('  WARHAMMER MISSIONS API');
  console.log('========================================');
  console.log('');
  console.log('  Acceso local:');
  console.log(`    http://localhost:${PORT}`);
  if (httpsActive) console.log(`    https://localhost:${HTTPS_PORT}`);

  const addresses = getNetworkAddresses();
  const lanAddrs = addresses.filter(a => !a.tailscale);
  const tsAddrs = addresses.filter(a => a.tailscale);

  if (lanAddrs.length > 0) {
    console.log('');
    console.log('  Red local (LAN):');
    for (const a of lanAddrs) {
      console.log(`    http://${a.address}:${PORT}  (${a.name})`);
      if (httpsActive) console.log(`    https://${a.address}:${HTTPS_PORT}  (${a.name})`);
    }
  }

  if (tsAddrs.length > 0) {
    console.log('');
    console.log('  Tailscale (VPN):');
    for (const a of tsAddrs) {
      console.log(`    http://${a.address}:${PORT}  (${a.name})`);
      if (httpsActive) console.log(`    https://${a.address}:${HTTPS_PORT}  (${a.name})`);
    }
    if (!httpsActive) {
      console.log('');
      console.log('  [!] Sin HTTPS - PWA requiere HTTPS fuera de localhost.');
      console.log('      Coloca certificados en ./certs/ o usa chrome://flags');
      console.log('      (#unsafely-treat-insecure-origin-as-secure)');
    }
  } else {
    console.log('');
    console.log('  [i] Tailscale no detectado. Instala/activa para acceso remoto.');
  }

  console.log('');
  console.log(`  Health check: /api/health`);
  console.log('========================================');
}

// ============================================
// BAHÍA MÉDICA ENDPOINTS
// ============================================

function getRutaBahiaMedica(año) {
  if (año === 2025) return path.join(SISTEMAS_PATH, 'SISTEMA AQUILA - AÑO 2025', '08 - BAHIA MEDICA');
  if (año === 2026) return path.join(SISTEMAS_PATH, 'SISTEMA HIPPARION - AÑO 2026', '08 - BAHIA MEDICA');
  return null;
}

// GET /api/bahia/checkups - Obtener todas las citas médicas
app.get('/api/bahia/checkups', async (req, res) => {
  try {
    const año = parseInt(req.query.ano) || new Date().getFullYear();
    const rutaBahia = getRutaBahiaMedica(año);

    if (!rutaBahia) {
      return res.json({ success: true, checkups: [] });
    }

    // Asegurar que existe la carpeta
    await fs.mkdir(rutaBahia, { recursive: true });

    const checkups = [];

    if (existsSync(rutaBahia)) {
      const files = readdirSync(rutaBahia).filter(f => f.startsWith('CHECKUP-') && f.endsWith('.md'));

      for (const file of files) {
        try {
          const content = readFileSync(path.join(rutaBahia, file), 'utf-8');
          const { data } = matter(content);

          if (data.tipo === 'checkup-medico') {
            checkups.push({
              id: data.id || file.replace('.md', ''),
              zone: data.zona || 'general',
              name: data.nombre || data.motivo || '',
              date: normalizarFecha(data.fecha),
              time: data.hora || '',
              doctor: data.doctor || '',
              notes: data.notas || '',
              frequency: data.frecuencia || 'none',
              completed: data.completado || false,
              created: normalizarFecha(data['fecha-creacion']),
              medico: data.medico || data.doctor || '',
              especialidad: data.especialidad || '',
              motivo: data.motivo || data.nombre || '',
              condicionId: data['condicion-id'] || null,
              condicionZona: data['condicion-zona'] || null,
            });
          }
        } catch (e) {
          console.error('Error leyendo checkup:', file, e);
        }
      }
    }

    // Ordenar por fecha
    checkups.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ success: true, checkups });
  } catch (error) {
    console.error('Error en GET /api/bahia/checkups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bahia/checkups/crear - Crear nueva cita médica
app.post('/api/bahia/checkups/crear', async (req, res) => {
  try {
    const { id, zone, name, date, time, doctor, notes, frequency, completed,
            medico, especialidad, motivo, condicionId, condicionZona } = req.body;

    if (!id || !zone || !name || !date) {
      return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
    }

    const año = new Date(date).getFullYear();
    const rutaBahia = getRutaBahiaMedica(año);

    if (!rutaBahia) {
      return res.status(400).json({ success: false, error: 'Año no válido' });
    }

    await fs.mkdir(rutaBahia, { recursive: true });

    const filename = `CHECKUP-${id}.md`;
    const filepath = path.join(rutaBahia, filename);

    // Verificar si ya existe
    try {
      await fs.access(filepath);
      return res.status(409).json({ success: false, error: 'Ya existe un checkup con ese ID' });
    } catch {
      // No existe, continuar
    }

    // Crear contenido
    const frontmatter = {
      tipo: 'checkup-medico',
      id: id,
      zona: zone,
      nombre: motivo || name,
      motivo: motivo || name,
      fecha: new Date(date),
      hora: time || '09:00',
      doctor: doctor || medico || '',
      medico: medico || doctor || '',
      especialidad: especialidad || '',
      notas: notes || '',
      frecuencia: frequency || 'none',
      completado: completed || false,
      'condicion-id': condicionId || null,
      'condicion-zona': condicionZona || null,
      'fecha-creacion': new Date()
    };

    const zoneNames = {
      cabeza: 'CABEZA / CRÁNEO',
      torso: 'TORSO / PECHO',
      abdomen: 'ABDOMEN / BELLY',
      pelvis: 'PELVIS / GENITALES',
      brazos: 'BRAZOS',
      manos: 'MANOS',
      piernas: 'PIERNAS',
      pies: 'PIES'
    };

    const body = `# ${name}

## 📋 Detalles

**Zona Corporal**: ${zoneNames[zone] || zone}
**Fecha**: ${date}
**Hora**: ${time || '09:00'}
${doctor ? `**Doctor/Centro**: ${doctor}` : ''}

## 📝 Notas

${notes || 'Sin notas adicionales'}

## 🔄 Frecuencia

${frequency === 'none' ? 'No se repite' : frequency === 'yearly' ? 'Anual' : frequency === 'biannual' ? 'Semestral' : frequency === 'quarterly' ? 'Trimestral' : frequency === 'monthly' ? 'Mensual' : frequency}

---

*Creado desde Bahía Médica - Medicae Pod*
`;

    const content = matter.stringify(body, frontmatter);
    await fs.writeFile(filepath, content, 'utf-8');

    res.json({ success: true, id: id });
  } catch (error) {
    console.error('Error en POST /api/bahia/checkups/crear:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/bahia/checkups/:id - Eliminar cita médica
app.delete('/api/bahia/checkups/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar el archivo en todos los años
    for (const año of [2025, 2026]) {
      const rutaBahia = getRutaBahiaMedica(año);
      if (!rutaBahia) continue;

      const filename = `CHECKUP-${id}.md`;
      const filepath = path.join(rutaBahia, filename);

      if (existsSync(filepath)) {
        await fs.unlink(filepath);
        return res.json({ success: true });
      }
    }

    res.status(404).json({ success: false, error: 'Checkup no encontrado' });
  } catch (error) {
    console.error('Error en DELETE /api/bahia/checkups/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bahia/checkups/:id - Actualizar cita médica
app.patch('/api/bahia/checkups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    for (const año of [2025, 2026]) {
      const rutaBahia = getRutaBahiaMedica(año);
      if (!rutaBahia) continue;

      const filename = `CHECKUP-${id}.md`;
      const filepath = path.join(rutaBahia, filename);

      if (existsSync(filepath)) {
        const content = readFileSync(filepath, 'utf-8');
        const { data, content: body } = matter(content);

        // Aplicar updates permitidos
        if (updates.completado !== undefined) data.completado = updates.completado;
        if (updates.fecha !== undefined) data.fecha = new Date(updates.fecha);
        if (updates.hora !== undefined) data.hora = updates.hora;
        if (updates.medico !== undefined) { data.medico = updates.medico; data.doctor = updates.medico; }
        if (updates.especialidad !== undefined) data.especialidad = updates.especialidad;
        if (updates.motivo !== undefined) { data.motivo = updates.motivo; data.nombre = updates.motivo; }
        if (updates.notas !== undefined) data.notas = updates.notas;
        if (updates.condicionId !== undefined) data['condicion-id'] = updates.condicionId;

        await fs.writeFile(filepath, matter.stringify(body, data), 'utf-8');
        return res.json({ success: true, id });
      }
    }

    res.status(404).json({ success: false, error: 'Checkup no encontrado' });
  } catch (error) {
    console.error('Error en PATCH /api/bahia/checkups/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BAHÍA MÉDICA - CONDICIONES (LESIONES / AFECCIONES)
// ============================================

function getRutaLesiones(año) {
  return path.join(getRutaBahiaMedica(año), 'LESIONES');
}

function getRutaAfecciones(año) {
  return path.join(getRutaBahiaMedica(año), 'AFECCIONES');
}

// GET /api/bahia/condiciones - Obtener lesiones y afecciones
app.get('/api/bahia/condiciones', async (req, res) => {
  try {
    const año = parseInt(req.query.ano) || new Date().getFullYear();
    const zonaFiltro = req.query.zona || null;

    const rutaLesiones = getRutaLesiones(año);
    const rutaAfecciones = getRutaAfecciones(año);
    const condiciones = [];

    // Leer lesiones
    for (const ruta of [rutaLesiones, rutaAfecciones]) {
      if (!existsSync(ruta)) continue;
      const archivos = readdirSync(ruta).filter(f => f.endsWith('.md'));
      for (const archivo of archivos) {
        try {
          const contenido = readFileSync(path.join(ruta, archivo), 'utf8');
          const { data } = matter(contenido);
          if (data.tipo !== 'lesion' && data.tipo !== 'afeccion') continue;
          if (zonaFiltro && data.zona !== zonaFiltro) continue;
          condiciones.push({
            id: data.id || archivo.replace('.md', ''),
            tipo: data.tipo,
            zona: data.zona || '',
            nombre: data.nombre || '',
            permanente: data.permanente !== undefined ? data.permanente : (data.tipo === 'lesion'),
            fechaInicio: normalizarFecha(data['fecha-inicio']),
            severidad: data.severidad || 'leve',
            notas: data.notas || '',
            fechaResolucionEstimada: normalizarFecha(data['fecha-resolucion-estimada']),
            completada: data.completada || false,
            fechaCreacion: normalizarFecha(data['fecha-creacion']),
          });
        } catch (e) { /* skip malformed */ }
      }
    }

    // Ordenar: permanentes primero, luego por fecha-inicio desc
    condiciones.sort((a, b) => {
      if (a.permanente !== b.permanente) return a.permanente ? -1 : 1;
      return (b.fechaInicio || '').localeCompare(a.fechaInicio || '');
    });

    res.json({ success: true, condiciones });
  } catch (error) {
    console.error('Error en GET /api/bahia/condiciones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bahia/condiciones/crear - Crear nueva lesión o afección
app.post('/api/bahia/condiciones/crear', async (req, res) => {
  try {
    const { id, tipo, zona, nombre, permanente, fechaInicio, severidad, notas, fechaResolucionEstimada } = req.body;

    if (!id || !tipo || !zona || !nombre) {
      return res.status(400).json({ success: false, error: 'Campos obligatorios: id, tipo, zona, nombre' });
    }
    if (tipo !== 'lesion' && tipo !== 'afeccion') {
      return res.status(400).json({ success: false, error: 'tipo debe ser "lesion" o "afeccion"' });
    }

    // Determinar año desde fechaInicio o fecha actual
    const fechaRef = fechaInicio ? new Date(fechaInicio) : new Date();
    const año = fechaRef.getFullYear();
    const ruta = tipo === 'lesion' ? getRutaLesiones(año) : getRutaAfecciones(año);

    await fs.mkdir(ruta, { recursive: true });

    const nombreArchivo = tipo === 'lesion' ? `LESION-${id}.md` : `AFECCION-${id}.md`;
    const rutaArchivo = path.join(ruta, nombreArchivo);

    if (existsSync(rutaArchivo)) {
      return res.status(409).json({ success: false, error: 'Ya existe una condición con ese ID' });
    }

    const hoy = new Date();
    const fechaCreacion = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;

    const frontmatter = {
      tipo,
      id,
      zona,
      nombre,
      permanente: permanente !== undefined ? permanente : (tipo === 'lesion'),
      'fecha-inicio': fechaInicio || fechaCreacion,
      severidad: severidad || 'leve',
      notas: notas || '',
      ...(tipo === 'afeccion' && { 'fecha-resolucion-estimada': fechaResolucionEstimada || '' }),
      completada: false,
      'fecha-creacion': fechaCreacion,
    };

    const tipoLabel = tipo === 'lesion' ? '🔴 Lesión Permanente' : '🟡 Afección Pasajera';
    const cuerpo = `\n# ${tipoLabel}: ${nombre}\n\n> **Zona**: ${zona} | **Severidad**: ${severidad || 'leve'}\n\n## Descripción\n\n${notas || '*(Sin descripción adicional)*'}\n${tipo === 'afeccion' && fechaResolucionEstimada ? `\n## Resolución estimada\n\n${fechaResolucionEstimada}\n` : ''}\n`;

    const contenido = matter.stringify(cuerpo, frontmatter);
    await fs.writeFile(rutaArchivo, contenido, 'utf8');

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error en POST /api/bahia/condiciones/crear:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bahia/condiciones/:id - Actualizar condición (notas, severidad, completada, fecha-resolucion)
app.patch('/api/bahia/condiciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body; // { completada?, notas?, severidad?, fechaResolucionEstimada? }

    let rutaArchivo = null;
    for (const año of [2025, 2026]) {
      for (const getRuta of [getRutaLesiones, getRutaAfecciones]) {
        const ruta = getRuta(año);
        if (!existsSync(ruta)) continue;
        const archivos = readdirSync(ruta).filter(f => f.endsWith('.md'));
        for (const archivo of archivos) {
          try {
            const contenido = readFileSync(path.join(ruta, archivo), 'utf8');
            const { data } = matter(contenido);
            if (data.id === id) {
              rutaArchivo = path.join(ruta, archivo);
              break;
            }
          } catch (e) { /* skip */ }
        }
        if (rutaArchivo) break;
      }
      if (rutaArchivo) break;
    }

    if (!rutaArchivo) {
      return res.status(404).json({ success: false, error: 'Condición no encontrada' });
    }

    const contenidoActual = readFileSync(rutaArchivo, 'utf8');
    const { data, content } = matter(contenidoActual);

    if (updates.completada !== undefined) data.completada = updates.completada;
    if (updates.notas !== undefined) data.notas = updates.notas;
    if (updates.severidad !== undefined) data.severidad = updates.severidad;
    if (updates.fechaResolucionEstimada !== undefined) data['fecha-resolucion-estimada'] = updates.fechaResolucionEstimada;

    const nuevoContenido = matter.stringify(content, data);
    await fs.writeFile(rutaArchivo, nuevoContenido, 'utf8');

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error en PATCH /api/bahia/condiciones/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/bahia/condiciones/:id - Eliminar condición
app.delete('/api/bahia/condiciones/:id', async (req, res) => {
  try {
    const { id } = req.params;

    for (const año of [2025, 2026]) {
      for (const getRuta of [getRutaLesiones, getRutaAfecciones]) {
        const ruta = getRuta(año);
        if (!existsSync(ruta)) continue;
        const archivos = readdirSync(ruta).filter(f => f.endsWith('.md'));
        for (const archivo of archivos) {
          try {
            const contenido = readFileSync(path.join(ruta, archivo), 'utf8');
            const { data } = matter(contenido);
            if (data.id === id) {
              await fs.unlink(path.join(ruta, archivo));
              return res.json({ success: true });
            }
          } catch (e) { /* skip */ }
        }
      }
    }

    res.status(404).json({ success: false, error: 'Condición no encontrada' });
  } catch (error) {
    console.error('Error en DELETE /api/bahia/condiciones/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BAHÍA MÉDICA - HISTORIAL CLÍNICO
// ============================================

function getRutaHistorial(año) {
  return path.join(getRutaBahiaMedica(año), 'HISTORIAL');
}

// GET /api/bahia/historial - Lista entradas del historial clínico
app.get('/api/bahia/historial', async (req, res) => {
  try {
    const año = parseInt(req.query.ano) || new Date().getFullYear();
    const zona = req.query.zona || null;
    const subtipo = req.query.subtipo || null;

    const rutaHistorial = getRutaHistorial(año);

    // Si no existe la carpeta, devolver vacío
    if (!existsSync(rutaHistorial)) {
      return res.json({ success: true, historial: [] });
    }

    const archivos = readdirSync(rutaHistorial).filter(f => f.startsWith('HISTORIAL-') && f.endsWith('.md'));

    const historial = [];
    for (const archivo of archivos) {
      try {
        const contenido = readFileSync(path.join(rutaHistorial, archivo), 'utf-8');
        const { data } = matter(contenido);

        if (data.tipo !== 'historial-medico') continue;
        if (zona && data['condicion-zona'] !== zona) continue;
        if (subtipo && data.subtipo !== subtipo) continue;

        historial.push({
          id: data.id || archivo.replace('.md', ''),
          subtipo: data.subtipo || 'visita',
          fecha: normalizarFecha(data.fecha),
          titulo: data.titulo || '',
          notas: data.notas || '',
          condicionId: data['condicion-id'] || null,
          condicionZona: data['condicion-zona'] || null,
          // Visita
          medico: data.medico || null,
          especialidad: data.especialidad || null,
          diagnostico: data.diagnostico || null,
          tratamiento: data.tratamiento || null,
          // Medicamento
          nombreMedicamento: data['nombre-medicamento'] || null,
          dosis: data.dosis || null,
          pauta: data.pauta || null,
          fechaFin: normalizarFecha(data['fecha-fin']),
          // Análisis
          tipoAnalisis: data['tipo-analisis'] || null,
          resultado: data.resultado || null,
          // Vacuna
          nombreVacuna: data['nombre-vacuna'] || null,
          siguienteDosis: normalizarFecha(data['siguiente-dosis']),
          completada: data.completada || false,
          fechaCreacion: normalizarFecha(data['fecha-creacion']),
        });
      } catch (e) {
        console.error(`Error parseando ${archivo}:`, e.message);
      }
    }

    // Ordenar por fecha desc
    historial.sort((a, b) => {
      const fa = a.fecha || '';
      const fb = b.fecha || '';
      return fb.localeCompare(fa);
    });

    res.json({ success: true, historial });
  } catch (error) {
    console.error('Error en GET /api/bahia/historial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bahia/historial/crear - Crear nueva entrada del historial
app.post('/api/bahia/historial/crear', async (req, res) => {
  try {
    const {
      id, subtipo, fecha, titulo, notas,
      condicionId, condicionZona,
      // Visita
      medico, especialidad, diagnostico, tratamiento,
      // Medicamento
      nombreMedicamento, dosis, pauta, fechaFin,
      // Análisis
      tipoAnalisis, resultado,
      // Vacuna
      nombreVacuna, siguienteDosis,
    } = req.body;

    if (!id || !subtipo || !fecha || !titulo) {
      return res.status(400).json({ success: false, error: 'Faltan campos requeridos: id, subtipo, fecha, titulo' });
    }

    const subtiposValidos = ['visita', 'medicamento', 'analisis', 'vacuna'];
    if (!subtiposValidos.includes(subtipo)) {
      return res.status(400).json({ success: false, error: 'subtipo debe ser: visita, medicamento, analisis o vacuna' });
    }

    const año = parseInt(fecha.split('-')[0]) || new Date().getFullYear();
    const rutaHistorial = getRutaHistorial(año);
    await fs.mkdir(rutaHistorial, { recursive: true });

    const filename = `HISTORIAL-${id}.md`;
    const filepath = path.join(rutaHistorial, filename);

    const hoy = new Date();
    const fechaCreacion = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const frontmatter = {
      tipo: 'historial-medico',
      id,
      subtipo,
      fecha,
      titulo,
      notas: notas || '',
      'condicion-id': condicionId || null,
      'condicion-zona': condicionZona || null,
      medico: medico || null,
      especialidad: especialidad || null,
      diagnostico: diagnostico || null,
      tratamiento: tratamiento || null,
      'nombre-medicamento': nombreMedicamento || null,
      dosis: dosis || null,
      pauta: pauta || null,
      'fecha-fin': fechaFin || null,
      'tipo-analisis': tipoAnalisis || null,
      resultado: resultado || null,
      'nombre-vacuna': nombreVacuna || null,
      'siguiente-dosis': siguienteDosis || null,
      completada: false,
      'fecha-creacion': fechaCreacion,
    };

    const subtipoLabel = { visita: 'Visita Médica', medicamento: 'Medicamento', analisis: 'Análisis / Prueba', vacuna: 'Vacuna' };
    const body = `# 📋 ${subtipoLabel[subtipo] || subtipo}: ${titulo}\n\n> **Fecha**: ${fecha}${condicionZona ? ` | **Zona**: ${condicionZona}` : ''}\n\n## Notas\n\n${notas || '*(sin notas adicionales)*'}\n`;

    const fileContent = matter.stringify(body, frontmatter);
    await fs.writeFile(filepath, fileContent, 'utf-8');

    console.log(`✅ Historial creado: ${filename}`);
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error en POST /api/bahia/historial/crear:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bahia/historial/:id - Actualizar entrada del historial
app.patch('/api/bahia/historial/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    let filepath = null;
    for (const año of [2025, 2026]) {
      const ruta = getRutaHistorial(año);
      const candidato = path.join(ruta, `HISTORIAL-${id}.md`);
      if (existsSync(candidato)) {
        filepath = candidato;
        break;
      }
    }

    if (!filepath) {
      return res.status(404).json({ success: false, error: 'Entrada de historial no encontrada' });
    }

    const contenido = readFileSync(filepath, 'utf-8');
    const { data, content } = matter(contenido);

    // Actualizar campos permitidos
    const campoMap = {
      completada: 'completada',
      notas: 'notas',
      diagnostico: 'diagnostico',
      tratamiento: 'tratamiento',
      resultado: 'resultado',
      fechaFin: 'fecha-fin',
      siguienteDosis: 'siguiente-dosis',
    };
    for (const [jsKey, yamlKey] of Object.entries(campoMap)) {
      if (updates[jsKey] !== undefined) data[yamlKey] = updates[jsKey];
    }

    const newContent = matter.stringify(content, data);
    await fs.writeFile(filepath, newContent, 'utf-8');

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error en PATCH /api/bahia/historial/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/bahia/historial/:id - Eliminar entrada del historial
app.delete('/api/bahia/historial/:id', async (req, res) => {
  try {
    const { id } = req.params;

    for (const año of [2025, 2026]) {
      const ruta = getRutaHistorial(año);
      const candidato = path.join(ruta, `HISTORIAL-${id}.md`);
      if (existsSync(candidato)) {
        await fs.unlink(candidato);
        return res.json({ success: true });
      }
    }

    res.status(404).json({ success: false, error: 'Entrada de historial no encontrada' });
  } catch (error) {
    console.error('Error en DELETE /api/bahia/historial/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SERVER START
// ============================================

// HTTPS - si hay certificados en ./certs/
// ==========================================
//  ECONOMATO ENDPOINTS
// ==========================================

/**
 * GET /api/economato/resumen - Estado del tesoro + generadores
 */
app.get('/api/economato/resumen', async (req, res) => {
  try {
    const ingresosMensuales = ESTADO_TESORO.generadores
      .filter(g => g.estado === 'activo')
      .reduce((sum, g) => sum + g.monto, 0);

    res.json({
      success: true,
      ...ESTADO_TESORO,
      tesoroTotal: ESTADO_TESORO.fuel + ESTADO_TESORO.suministros - ESTADO_TESORO.deuda,
      ingresosMensuales
    });
  } catch (error) {
    console.error('[Economato] Error en resumen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/economato/portfolio - GREEN BITS con precios live + PnL
 */
app.get('/api/economato/portfolio', async (req, res) => {
  try {
    // 1. Read all activos
    const files = await fs.readdir(GREEN_BITS_ACTIVOS_PATH);
    const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'Activos.md');

    const activos = [];
    for (const file of mdFiles) {
      try {
        const content = await fs.readFile(path.join(GREEN_BITS_ACTIVOS_PATH, file), 'utf-8');
        const { data } = matter(content);
        if (data.estado === 'activo' || data.estado === 'pausado') {
          activos.push({ ...data, _file: file, _id: file.replace('.md', '') });
        }
      } catch (e) { /* skip unreadable */ }
    }

    // 2. Fetch prices (cached)
    const priceData = await fetchAllPrices(activos);

    // 3. Calculate PnL per asset
    const activosConPnl = activos.map(a => {
      const precioActual = getAssetPrice(a, priceData);
      const calc = calculateAssetPnl(a, precioActual);

      // Get 24h change for coingecko assets
      let cambio24h = 0;
      if (a.api === 'coingecko') {
        const p = priceData.prices[`coingecko:${a.identificador}`];
        cambio24h = p?.cambio24h || 0;
      }

      // Check alerts
      const alertasTriggered = [];
      if (a.alertas && Array.isArray(a.alertas)) {
        for (const alerta of a.alertas) {
          if (!alerta || !alerta.tipo) continue;
          if (alerta.tipo === 'precio_supera' && precioActual >= alerta.valor) {
            alertasTriggered.push({ ...alerta, activo: a.nombre });
          }
          if (alerta.tipo === 'precio_baja' && precioActual <= alerta.valor) {
            alertasTriggered.push({ ...alerta, activo: a.nombre });
          }
        }
      }

      return {
        id: a._id,
        nombre: a.nombre,
        vertical: a.vertical,
        estado: a.estado,
        api: a.api,
        moneda: a.moneda || 'EUR',
        precioActual: Math.round(precioActual * 100) / 100,
        cambio24h: Math.round(cambio24h * 100) / 100,
        ...calc,
        capitalInvertido: Math.round(calc.capitalInvertido * 100) / 100,
        valorActual: Math.round(calc.valorActual * 100) / 100,
        pnl: Math.round(calc.pnl * 100) / 100,
        roi: Math.round(calc.roi * 100) / 100,
        precioMedio: Math.round(calc.precioMedio * 100) / 100,
        alertas: alertasTriggered
      };
    });

    // 4. Read verticals
    let verticalesFiles = [];
    try {
      verticalesFiles = (await fs.readdir(GREEN_BITS_VERTICALES_PATH))
        .filter(f => f.endsWith('.md') && f !== 'Verticales.md');
    } catch (e) { /* no verticales dir */ }

    const verticalesMap = {};
    for (const vf of verticalesFiles) {
      try {
        const vc = await fs.readFile(path.join(GREEN_BITS_VERTICALES_PATH, vf), 'utf-8');
        const { data } = matter(vc);
        if (data.nombre) {
          verticalesMap[data.nombre] = {
            nombre: data.nombre,
            descripcion: data.descripcion || '',
            estado: data.estado || 'activo',
            capitalInvertido: 0,
            valorActual: 0,
            pnl: 0,
            numActivos: 0
          };
        }
      } catch (e) { /* skip */ }
    }

    // 5. Aggregate by vertical
    for (const a of activosConPnl) {
      const vName = a.vertical || 'Otros';
      if (!verticalesMap[vName]) {
        verticalesMap[vName] = { nombre: vName, descripcion: '', estado: 'activo', capitalInvertido: 0, valorActual: 0, pnl: 0, numActivos: 0 };
      }
      verticalesMap[vName].capitalInvertido += a.capitalInvertido;
      verticalesMap[vName].valorActual += a.valorActual;
      verticalesMap[vName].pnl += a.pnl;
      verticalesMap[vName].numActivos++;
    }

    const verticales = Object.values(verticalesMap)
      .filter(v => v.numActivos > 0)
      .map(v => ({
        ...v,
        capitalInvertido: Math.round(v.capitalInvertido * 100) / 100,
        valorActual: Math.round(v.valorActual * 100) / 100,
        pnl: Math.round(v.pnl * 100) / 100,
        roi: v.capitalInvertido > 0 ? Math.round((v.pnl / v.capitalInvertido) * 10000) / 100 : 0
      }))
      .sort((a, b) => b.valorActual - a.valorActual);

    // 6. Totals
    const totalInvertido = verticales.reduce((s, v) => s + v.capitalInvertido, 0);
    const totalValorActual = verticales.reduce((s, v) => s + v.valorActual, 0);
    const totalPnl = totalValorActual - totalInvertido;
    const totalRoi = totalInvertido > 0 ? Math.round((totalPnl / totalInvertido) * 10000) / 100 : 0;

    // All triggered alerts
    const alertas = activosConPnl.flatMap(a => a.alertas);

    res.json({
      success: true,
      activos: activosConPnl.sort((a, b) => b.valorActual - a.valorActual),
      verticales,
      totalInvertido: Math.round(totalInvertido * 100) / 100,
      totalValorActual: Math.round(totalValorActual * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalRoi,
      alertas,
      ultimaActualizacion: new Date(priceCache.timestamp).toISOString()
    });
  } catch (error) {
    console.error('[Economato] Error en portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ==========================================
// ECONOMATO: CRUD Activos (Inversiones)
// ==========================================

function resolveAssetPath(assetId) {
  const filePath = path.join(GREEN_BITS_ACTIVOS_PATH, `${assetId}.md`);
  return existsSync(filePath) ? filePath : null;
}

function sanitizeFilename(vertical, nombre) {
  const clean = (str) => str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-')
    .trim();
  return `${clean(vertical)}-${clean(nombre)}`;
}

// Fix gray-matter Date objects → string in compras/ventas arrays
function fixDatesInArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(entry => {
    const fixed = { ...entry };
    if (fixed.fecha instanceof Date) {
      fixed.fecha = fixed.fecha.toISOString().split('T')[0];
    }
    return fixed;
  });
}

/**
 * GET /api/economato/verticales - Lista de verticales activas
 */
app.get('/api/economato/verticales', async (req, res) => {
  try {
    const files = await fs.readdir(GREEN_BITS_VERTICALES_PATH);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    const verticales = [];
    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(GREEN_BITS_VERTICALES_PATH, file), 'utf-8');
      const { data } = matter(content);
      if (data.nombre && data.estado !== 'abandonado') {
        verticales.push({ nombre: data.nombre, estado: data.estado || 'activo' });
      }
    }
    res.json({ success: true, verticales });
  } catch (error) {
    console.error('[Economato] Error verticales:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/economato/activos/crear - Crear nuevo activo
 */
app.post('/api/economato/activos/crear', async (req, res) => {
  try {
    const { nombre, vertical, api, identificador, moneda, unidad_cantidad, precio_actual_manual, compraInicial } = req.body;
    if (!nombre || !vertical) {
      return res.status(400).json({ success: false, error: 'nombre y vertical son requeridos' });
    }

    const filename = sanitizeFilename(vertical, nombre);
    const filepath = path.join(GREEN_BITS_ACTIVOS_PATH, `${filename}.md`);

    if (existsSync(filepath)) {
      return res.status(409).json({ success: false, error: 'Ya existe un activo con ese nombre' });
    }

    const compras = [];
    if (compraInicial && compraInicial.fecha && compraInicial.cantidad > 0) {
      compras.push({
        fecha: compraInicial.fecha,
        cantidad: Number(compraInicial.cantidad),
        precio_unitario: Number(compraInicial.precio_unitario) || 0
      });
    }

    const frontmatter = {
      nombre,
      vertical,
      estado: 'activo',
      tags: ['green-bits', 'activo'],
      api: api || 'manual',
      identificador: identificador || '',
      moneda: moneda || 'EUR',
      ...(unidad_cantidad && unidad_cantidad !== 'unidades' ? { unidad_cantidad } : {}),
      ...(api === 'manual' ? { precio_actual_manual: Number(precio_actual_manual) || 0, fecha_precio_manual: new Date().toISOString().split('T')[0] } : {}),
      compras,
      ventas: [],
      alertas: [],
      punto_retorno: '',
      lecciones: '',
      watchlist: ''
    };

    const body = `## Notas\n\n`;
    const fileContent = matter.stringify(body, frontmatter);
    await fs.writeFile(filepath, fileContent, 'utf-8');
    priceCache.timestamp = 0; // invalidate

    console.log(`[Economato] Nuevo activo creado: ${filename}`);
    res.json({ success: true, id: filename });
  } catch (error) {
    console.error('[Economato] Error crear activo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/economato/activos/:id - Actualizar metadata del activo
 */
app.patch('/api/economato/activos/:id', async (req, res) => {
  try {
    const filepath = resolveAssetPath(req.params.id);
    if (!filepath) {
      return res.status(404).json({ success: false, error: 'Activo no encontrado' });
    }

    const content = await fs.readFile(filepath, 'utf-8');
    const { data, content: body } = matter(content);
    const updates = req.body;

    if (updates.estado !== undefined) data.estado = updates.estado;
    if (updates.precio_actual_manual !== undefined) {
      data.precio_actual_manual = Number(updates.precio_actual_manual);
      data.fecha_precio_manual = new Date().toISOString().split('T')[0];
    }
    if (updates.nombre !== undefined) data.nombre = updates.nombre;

    // Fix dates in arrays before writing
    data.compras = fixDatesInArray(data.compras);
    data.ventas = fixDatesInArray(data.ventas);

    await fs.writeFile(filepath, matter.stringify(body, data), 'utf-8');
    priceCache.timestamp = 0;

    console.log(`[Economato] Activo actualizado: ${req.params.id}`);
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('[Economato] Error actualizar activo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/economato/activos/:id/compra - Añadir compra a un activo
 */
app.post('/api/economato/activos/:id/compra', async (req, res) => {
  try {
    const filepath = resolveAssetPath(req.params.id);
    if (!filepath) {
      return res.status(404).json({ success: false, error: 'Activo no encontrado' });
    }

    const { fecha, cantidad, precio_unitario } = req.body;
    if (!fecha || !cantidad || cantidad <= 0) {
      return res.status(400).json({ success: false, error: 'fecha y cantidad (>0) son requeridos' });
    }

    const content = await fs.readFile(filepath, 'utf-8');
    const { data, content: body } = matter(content);

    data.compras = fixDatesInArray(data.compras || []);
    data.ventas = fixDatesInArray(data.ventas || []);
    data.compras.push({
      fecha: String(fecha),
      cantidad: Number(cantidad),
      precio_unitario: Number(precio_unitario) || 0
    });

    await fs.writeFile(filepath, matter.stringify(body, data), 'utf-8');
    priceCache.timestamp = 0;

    console.log(`[Economato] Compra añadida a ${req.params.id}: ${cantidad} @ ${precio_unitario}`);
    res.json({ success: true, id: req.params.id, comprasCount: data.compras.length });
  } catch (error) {
    console.error('[Economato] Error añadir compra:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/economato/activos/:id/venta - Añadir venta a un activo
 */
app.post('/api/economato/activos/:id/venta', async (req, res) => {
  try {
    const filepath = resolveAssetPath(req.params.id);
    if (!filepath) {
      return res.status(404).json({ success: false, error: 'Activo no encontrado' });
    }

    const { fecha, cantidad, precio_unitario } = req.body;
    if (!fecha || !cantidad || cantidad <= 0 || precio_unitario === undefined) {
      return res.status(400).json({ success: false, error: 'fecha, cantidad (>0) y precio_unitario son requeridos' });
    }

    const content = await fs.readFile(filepath, 'utf-8');
    const { data, content: body } = matter(content);

    data.compras = fixDatesInArray(data.compras || []);
    data.ventas = fixDatesInArray(data.ventas || []);

    const totalComprado = data.compras.reduce((sum, c) => sum + (Number(c.cantidad) || 0), 0);
    const totalVendido = data.ventas.reduce((sum, v) => sum + (Number(v.cantidad) || 0), 0);
    const cantActual = totalComprado - totalVendido;

    if (Number(cantidad) > cantActual + 0.0001) {
      return res.status(400).json({ success: false, error: `No puedes vender más de lo que posees (${cantActual.toFixed(4)})` });
    }

    data.ventas.push({
      fecha: String(fecha),
      cantidad: Number(cantidad),
      precio_unitario: Number(precio_unitario)
    });

    await fs.writeFile(filepath, matter.stringify(body, data), 'utf-8');
    priceCache.timestamp = 0;

    console.log(`[Economato] Venta añadida a ${req.params.id}: ${cantidad} @ ${precio_unitario}`);
    res.json({ success: true, id: req.params.id, ventasCount: data.ventas.length });
  } catch (error) {
    console.error('[Economato] Error añadir venta:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


let httpsActive = false;
if (existsSync(CERTS_DIR)) {
  try {
    const certFiles = readdirSync(CERTS_DIR);
    const certFile = certFiles.find(f => f.endsWith('.crt') || f.endsWith('.pem'));
    const keyFile = certFiles.find(f => f.endsWith('.key'));

    if (certFile && keyFile) {
      const httpsOptions = {
        cert: readFileSync(path.join(CERTS_DIR, certFile)),
        key: readFileSync(path.join(CERTS_DIR, keyFile))
      };
      https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`[HTTPS] Puerto ${HTTPS_PORT} activo`);
      });
      httpsActive = true;
    }
  } catch (err) {
    console.error('[HTTPS] Error al cargar certificados:', err.message);
  }
}

// HTTP - siempre activo
app.listen(PORT, '0.0.0.0', () => {
  printStartupInfo(httpsActive);
});
