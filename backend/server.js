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

// GET /api/eventos/semana - Obtener eventos de esta semana (con recurrencia)
app.get('/api/eventos/semana', async (req, res) => {
  try {
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

    // 3. Calcular inicio y fin de semana (lunes a domingo)
    const ahora = new Date();
    const diaSemana = ahora.getDay(); // 0 = domingo, 1 = lunes, etc.
    const diff = (diaSemana === 0 ? -6 : 1 - diaSemana); // Lunes = inicio
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() + diff);
    inicioSemana.setHours(0, 0, 0, 0);

    let eventosSemana = [];

    // 4. Iterar por cada día de la semana (lunes a domingo = 7 días)
    for (let i = 0; i <= 6; i++) {
      const diaActual = new Date(inicioSemana);
      diaActual.setDate(inicioSemana.getDate() + i);
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
              objetivoPrincipal: archivo.frontmatter['objetivo-principal']
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

      // Calcular estadísticas
      const totalPasos = cruzada.pasos.length;
      const pasosCompletados = cruzada.pasos.filter(p => p.completada).length;
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

    if (misionesCruzada.length === 0) {
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

    // Calcular estadísticas
    const totalPasos = pasos.length;
    const pasosCompletados = pasos.filter(p => p.completada).length;
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
        pasos
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
imperio-total: 100
caos-khorne: 0
caos-nurgle: 0
caos-tzeentch: 0
caos-slaanesh: 0
imperio-disciplina: 25
imperio-fe: 25
imperio-deber: 25
imperio-humildad: 25
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

// HTTPS - si hay certificados en ./certs/
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
