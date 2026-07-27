/* ══════════════════════════════════════════════════════════════════════════
   catalog.js · Catálogo de gimnasio propio + emparejado con el dataset
   ──────────────────────────────────────────────────────────────────────────
   Dos catálogos que cumplen papeles distintos:

   1. POOL — 52 ejercicios curados en español, con grupo muscular, clase de
      equipo, marca de básico (`comp`), señal técnica (`c`) y error típico
      (`e`). Es la fuente de verdad para PROGRAMAR: el generador y el cambio
      inteligente de ejercicio solo eligen de aquí.

   2. data/exercises.min.json — los 1324 ejercicios del dataset
      hasaneyldrm/exercises-dataset. Solo se usa para ENRIQUECER: GIF, imagen
      y pasos de ejecución en español. Sus nombres están en inglés, así que
      cada entrada del POOL lleva un campo `en` con el nombre de consulta y el
      emparejado se resuelve con el mismo algoritmo de tokens que
      coach/exercise_catalog.py (reimplementado aquí en JS).
   ══════════════════════════════════════════════════════════════════════════ */

export const RAW_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';

/** Etiquetas de la clase de equipo. */
export const EQL = { libre: 'Peso libre', maquina: 'Máquina', corporal: 'En casa' };

/* ── POOL ─────────────────────────────────────────────────────────────────
   g  = grupo muscular en español (el que se guarda en routine_exercises)
   eq = clase de equipo: libre | maquina | corporal
   comp = 1 si es un básico multiarticular (recibe más series y más descanso)
   uni  = 1 si es monoarticular / accesorio (el principiante hace menos)
   pat  = PATRÓN DE MOVIMIENTO. Es lo que usa el generador para no repetir
          estímulo dentro de una misma sesión (máximo un ejercicio por patrón,
          dos solo si ese músculo es prioridad del usuario). Valores:
            empuje_h · empuje_v · traccion_h · traccion_v
            rodilla · cadera · aduccion · gemelo · core
            iso_pecho · iso_espalda · iso_deltoide · iso_biceps · iso_triceps
            iso_isquios (curl femoral y nórdico: flexión de rodilla aislada,
                         que no encaja en `rodilla` ni en `cadera`)
   en   = nombre de consulta contra el dataset inglés (para el GIF)
   time = 1 si se mide en segundos en vez de repeticiones                   */
export const POOL = [
  { n: 'Press de banca con barra', g: 'Pecho', eq: 'libre', comp: 1, pat: 'empuje_h', en: 'barbell bench press', c: 'Baja hasta rozar el pecho, codos a 45°, pies firmes en el suelo.', e: 'No rebotes la barra en el pecho ni despegues los glúteos del banco.' },
  { n: 'Press inclinado con mancuernas', g: 'Pecho', eq: 'libre', pat: 'empuje_h', en: 'dumbbell incline bench press', c: 'Banco a 30°. Baja hasta notar estiramiento en el pecho.', e: 'Un banco muy inclinado convierte el ejercicio en press de hombro.' },
  { n: 'Aperturas con mancuernas', g: 'Pecho', eq: 'libre', uni: 1, pat: 'iso_pecho', en: 'dumbbell fly', c: 'Codos algo flexionados y fijos: el movimiento sale del hombro.', e: 'Cargar demasiado y acabar haciendo un press.' },
  { n: 'Press de pecho en máquina', g: 'Pecho', eq: 'maquina', pat: 'empuje_h', en: 'lever chest press', c: 'Asiento a la altura del pecho medio.', e: 'Sacar los hombros hacia delante al empujar.' },
  { n: 'Cruce en polea', g: 'Pecho', eq: 'maquina', uni: 1, pat: 'iso_pecho', en: 'cable cross-over', c: 'Junta las manos delante del pecho y aguanta un instante.', e: 'Usar tanto peso que tengas que empujar con el cuerpo.' },
  { n: 'Fondos en paralelas', g: 'Pecho', eq: 'corporal', comp: 1, pat: 'empuje_h', en: 'chest dip', c: 'Inclina el torso hacia delante para cargar el pecho.', e: 'Bajar más allá de donde el hombro está cómodo.' },
  { n: 'Flexiones', g: 'Pecho', eq: 'corporal', comp: 1, pat: 'empuje_h', en: 'push-up', c: 'Cuerpo en línea recta, core apretado.', e: 'Dejar caer la cadera o no bajar el pecho.' },
  { n: 'Remo con barra', g: 'Espalda', eq: 'libre', comp: 1, pat: 'traccion_h', en: 'barbell bent over row', c: 'Torso a 45°, espalda neutra, barra al ombligo.', e: 'Balancear el cuerpo para subir el peso.' },
  { n: 'Peso muerto con barra', g: 'Espalda', eq: 'libre', comp: 1, pat: 'cadera', en: 'barbell deadlift', c: 'Barra pegada a las piernas, espalda neutra. Empuja el suelo.', e: 'Redondear la lumbar o subir primero la cadera.' },
  { n: 'Remo con mancuerna', g: 'Espalda', eq: 'libre', pat: 'traccion_h', en: 'dumbbell bent over row', c: 'Apoya la mano libre. Tira con el codo pegado al cuerpo.', e: 'Rotar el torso para ganar recorrido.' },
  { n: 'Jalón al pecho en polea', g: 'Espalda', eq: 'maquina', pat: 'traccion_v', en: 'cable lat pulldown full range of motion', c: 'Jala al pecho apretando los omóplatos.', e: 'Llevar la barra detrás de la nuca.' },
  { n: 'Remo sentado en polea', g: 'Espalda', eq: 'maquina', pat: 'traccion_h', en: 'cable seated row', c: 'Pecho alto, sin balancear el torso.', e: 'Encoger los hombros en vez de juntar los omóplatos.' },
  { n: 'Dominadas', g: 'Espalda', eq: 'corporal', comp: 1, pat: 'traccion_v', en: 'pull-up', c: 'Con banda o máquina asistida si aún no llegas.', e: 'Balancearse; mejor asistidas y limpias.' },
  { n: 'Press militar con barra', g: 'Hombros', eq: 'libre', comp: 1, pat: 'empuje_v', en: 'barbell standing overhead press', c: 'Glúteos y core apretados para no arquear la espalda.', e: 'Arquear mucho la lumbar convirtiéndolo en press inclinado.' },
  { n: 'Press de hombro con mancuernas', g: 'Hombros', eq: 'libre', pat: 'empuje_v', en: 'dumbbell seated shoulder press', c: 'Sentada con respaldo. Codos algo por debajo del hombro.', e: 'Bajar demasiado y forzar el hombro.' },
  { n: 'Elevaciones laterales', g: 'Hombros', eq: 'libre', uni: 1, pat: 'iso_deltoide', en: 'dumbbell lateral raise', c: 'Sube a la altura del hombro sin encoger el cuello.', e: 'Usar impulso; con 4-6 kg bien hechas sobra.' },
  { n: 'Elevaciones laterales en polea', g: 'Hombros', eq: 'maquina', uni: 1, pat: 'iso_deltoide', en: 'cable lateral raise', c: 'Tensión constante en todo el recorrido.', e: 'Dejar que el brazo caiga sin control.' },
  { n: 'Pájaros en polea', g: 'Hombros', eq: 'maquina', uni: 1, pat: 'iso_espalda', en: 'cable rear delt row', c: 'Deltoides posterior. Abre sin encoger hombros.', e: 'Convertirlo en un remo.' },
  { n: 'Face pull con banda', g: 'Hombros', eq: 'corporal', uni: 1, pat: 'iso_espalda', en: 'band standing rear delt row', c: 'Lleva la banda a la frente separando las manos.', e: 'Tirar solo con los brazos sin abrir el pecho.' },
  { n: 'Curl con barra', g: 'Bíceps', eq: 'libre', uni: 1, pat: 'iso_biceps', en: 'barbell curl', c: 'Codos pegados, sin balanceo. Controla la bajada.', e: 'Mover los codos hacia delante al subir.' },
  { n: 'Curl con mancuernas', g: 'Bíceps', eq: 'libre', uni: 1, pat: 'iso_biceps', en: 'dumbbell biceps curl', c: 'Gira la muñeca al subir.', e: 'Subir los hombros.' },
  { n: 'Curl martillo', g: 'Bíceps', eq: 'libre', uni: 1, pat: 'iso_biceps', en: 'dumbbell hammer curl', c: 'Palmas enfrentadas. Trabaja braquial y antebrazo.', e: 'Balancear las mancuernas.' },
  { n: 'Curl en polea', g: 'Bíceps', eq: 'maquina', uni: 1, pat: 'iso_biceps', en: 'cable curl', c: 'Tensión constante, ideal para terminar.', e: 'Separar los codos del cuerpo.' },
  { n: 'Curl con banda', g: 'Bíceps', eq: 'corporal', uni: 1, pat: 'iso_biceps', en: 'band concentration curl', c: 'Pisa la banda y sube controlando.', e: 'Soltar la banda de golpe al bajar.' },
  { n: 'Press cerrado con barra', g: 'Tríceps', eq: 'libre', comp: 1, pat: 'empuje_h', en: 'barbell close-grip bench press', c: 'Manos a la anchura de hombros, codos cerca del torso.', e: 'Agarre demasiado estrecho: molesta las muñecas.' },
  { n: 'Extensión de tríceps con mancuerna', g: 'Tríceps', eq: 'libre', uni: 1, pat: 'iso_triceps', en: 'dumbbell triceps extension', c: 'Codos apuntando al frente y quietos.', e: 'Abrir los codos hacia los lados.' },
  { n: 'Extensión en polea alta', g: 'Tríceps', eq: 'maquina', uni: 1, pat: 'iso_triceps', en: 'cable pushdown', c: 'Codos fijos a los lados, extiende hasta bloquear.', e: 'Inclinarte para empujar con el peso corporal.' },
  { n: 'Extensión con cuerda', g: 'Tríceps', eq: 'maquina', uni: 1, pat: 'iso_triceps', en: 'cable pushdown (with rope attachment)', c: 'Separa la cuerda al final del recorrido.', e: 'Mover el hombro en vez del codo.' },
  { n: 'Fondos en banco', g: 'Tríceps', eq: 'corporal', pat: 'empuje_h', en: 'bench dip (knees bent)', c: 'Manos en el borde, codos atrás, baja hasta 90°.', e: 'Bajar demasiado y cargar el hombro.' },
  { n: 'Sentadilla con barra', g: 'Cuádriceps', eq: 'libre', comp: 1, pat: 'rodilla', en: 'barbell full squat', c: 'Pies a la anchura de hombros, baja hasta paralelo o algo más.', e: 'Que las rodillas se metan hacia dentro al subir.' },
  { n: 'Sentadilla frontal', g: 'Cuádriceps', eq: 'libre', comp: 1, pat: 'rodilla', en: 'barbell front squat', c: 'Barra en deltoides frontales, codos altos.', e: 'Dejar caer los codos y perder la barra.' },
  { n: 'Zancadas con mancuernas', g: 'Cuádriceps', eq: 'libre', pat: 'rodilla', en: 'dumbbell lunge', c: 'Paso largo, rodilla trasera casi al suelo, torso erguido.', e: 'Paso corto: carga toda la rodilla delantera.' },
  { n: 'Prensa de piernas', g: 'Cuádriceps', eq: 'maquina', comp: 1, pat: 'rodilla', en: 'sled leg press', c: 'No bloquees rodillas arriba ni despegues la lumbar abajo.', e: 'Bajar tanto que la cadera se despegue del respaldo.' },
  { n: 'Extensión de cuádriceps', g: 'Cuádriceps', eq: 'maquina', uni: 1, pat: 'rodilla', en: 'lever leg extension', c: 'Aprieta un segundo arriba.', e: 'Lanzar el peso con impulso.' },
  { n: 'Sentadilla búlgara', g: 'Cuádriceps', eq: 'corporal', pat: 'rodilla', en: 'dumbbell single leg split squat', c: 'Pie trasero en un banco. Brutal solo con peso corporal.', e: 'Poner el pie de delante demasiado cerca del banco.' },
  { n: 'Peso muerto rumano', g: 'Isquios', eq: 'libre', comp: 1, pat: 'cadera', en: 'barbell romanian deadlift', c: 'Rodillas casi fijas, cadera atrás, baja hasta notar estiramiento.', e: 'Doblar las rodillas y convertirlo en peso muerto normal.' },
  { n: 'Buenos días con barra', g: 'Isquios', eq: 'libre', pat: 'cadera', en: 'barbell good morning', c: 'Carga ligera, espalda neutra siempre.', e: 'Cargar como en sentadilla: no es lo mismo.' },
  { n: 'Curl femoral tumbada', g: 'Isquios', eq: 'maquina', uni: 1, pat: 'iso_isquios', en: 'lever lying leg curl', c: 'Cadera pegada al banco, controla la bajada.', e: 'Despegar la cadera para ganar recorrido.' },
  { n: 'Curl femoral sentada', g: 'Isquios', eq: 'maquina', uni: 1, pat: 'iso_isquios', en: 'lever seated leg curl', c: 'Con la cadera flexionada el isquio trabaja más estirado.', e: 'No ajustar el respaldo a tu altura.' },
  { n: 'Curl nórdico', g: 'Isquios', eq: 'corporal', uni: 1, pat: 'iso_isquios', en: 'self assisted inverse leg curl', c: 'Baja lo más lento que puedas y ayúdate con las manos.', e: 'Dejarte caer de golpe.' },
  { n: 'Hip thrust con barra', g: 'Glúteos', eq: 'libre', comp: 1, pat: 'cadera', en: 'barbell glute bridge', c: 'Espalda alta en el banco, barbilla metida, bloquea arriba.', e: 'Hiperextender la lumbar en vez de apretar el glúteo.' },
  { n: 'Peso muerto sumo', g: 'Glúteos', eq: 'libre', comp: 1, pat: 'cadera', en: 'barbell sumo deadlift', c: 'Pies anchos, puntas hacia fuera.', e: 'Separar demasiado y perder fuerza en el arranque.' },
  { n: 'Patada de glúteo en polea', g: 'Glúteos', eq: 'maquina', uni: 1, pat: 'cadera', en: 'cable standing hip extension', c: 'Sin arquear la lumbar; el rango útil es corto.', e: 'Usar la espalda para subir la pierna.' },
  { n: 'Abducción en máquina', g: 'Glúteos', eq: 'maquina', uni: 1, pat: 'aduccion', en: 'side hip abduction', c: 'Inclina el torso adelante para cargar el glúteo medio.', e: 'Rebotar el peso.' },
  { n: 'Puente de glúteo', g: 'Glúteos', eq: 'corporal', pat: 'cadera', en: 'low glute bridge on floor', c: 'Aguanta 2 segundos arriba apretando.', e: 'Empujar con la lumbar en vez del glúteo.' },
  { n: 'Elevación de talones de pie', g: 'Gemelos', eq: 'libre', uni: 1, pat: 'gemelo', en: 'barbell standing calf raise', c: 'Estira abajo, aprieta arriba, sin rebotes.', e: 'Rango corto y rápido.' },
  { n: 'Elevación de talones en máquina', g: 'Gemelos', eq: 'maquina', uni: 1, pat: 'gemelo', en: 'lever seated calf raise', c: 'Pausa de un segundo en el estiramiento.', e: 'Ir solo con la punta del pie.' },
  { n: 'Elevación de talones a una pierna', g: 'Gemelos', eq: 'corporal', uni: 1, pat: 'gemelo', en: 'band single leg calf raise', c: 'Apóyate en la pared, corrige descompensaciones.', e: 'Apoyarte tanto que quites carga.' },
  { n: 'Plancha frontal', g: 'Abdomen', eq: 'corporal', time: 1, pat: 'core', en: 'weighted front plank', c: 'Codos bajo hombros, glúteos apretados.', e: 'Subir la cadera para descansar.' },
  { n: 'Elevación de piernas colgado', g: 'Abdomen', eq: 'corporal', pat: 'core', en: 'hanging leg raise', c: 'Sube con el abdomen, no con impulso.', e: 'Balancearte como un péndulo.' },
  { n: 'Crunch en polea', g: 'Abdomen', eq: 'maquina', uni: 1, pat: 'core', en: 'cable kneeling crunch', c: 'De rodillas, redondea la columna.', e: 'Tirar con los brazos.' },
  { n: 'Rueda abdominal', g: 'Abdomen', eq: 'libre', pat: 'core', en: 'wheel rollerout', c: 'Avanza solo hasta donde no arquees la lumbar.', e: 'Ir demasiado lejos el primer día.' },
];

const BY_NAME = new Map(POOL.map((x) => [x.n, x]));
/** Busca en el POOL por nombre exacto en español. */
export function poolByName(name) { return BY_NAME.get(name) || null; }

/* ── Grupos musculares ────────────────────────────────────────────────────
   Los 19 `target` del dataset colapsados a los grupos con los que se
   programa, en español. Mismo criterio que TARGET_TO_GROUP en
   coach/exercise_catalog.py.                                               */
export const TARGET_TO_ES = {
  pectorals: 'Pecho', 'serratus anterior': 'Pecho',
  lats: 'Espalda', 'upper back': 'Espalda', spine: 'Espalda',
  traps: 'Trapecio', 'levator scapulae': 'Cuello',
  delts: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps', forearms: 'Antebrazo',
  quads: 'Cuádriceps', hamstrings: 'Isquios', glutes: 'Glúteos',
  adductors: 'Aductores', abductors: 'Glúteos', calves: 'Gemelos',
  abs: 'Abdomen', 'cardiovascular system': 'Cardio',
};

/* Grupos → slugs del mapa anatómico + objetivo de series semanales.
   Los objetivos siguen el rango de volumen semanal habitual (MEV-MAV). */
export const MUSCLES = [
  { n: 'Glúteos', k: ['gluteal'], t: 16 },
  { n: 'Cuádriceps', k: ['quadriceps'], t: 12 },
  { n: 'Isquios', k: ['hamstring'], t: 10 },
  { n: 'Espalda', k: ['upper-back'], t: 12 },
  { n: 'Aductores', k: ['adductors'], t: 6 },
  { n: 'Pecho', k: ['chest'], t: 12 },
  { n: 'Hombros', k: ['deltoids'], t: 10 },
  { n: 'Trapecio', k: ['trapezius'], t: 8 },
  { n: 'Lumbar', k: ['lower-back'], t: 6 },
  { n: 'Bíceps', k: ['biceps'], t: 8 },
  { n: 'Tríceps', k: ['triceps'], t: 8 },
  { n: 'Abdomen', k: ['abs', 'obliques'], t: 8 },
  { n: 'Gemelos', k: ['calves', 'tibialis'], t: 8 },
  { n: 'Antebrazo', k: ['forearm'], t: 6 },
];

/** slug anatómico → grupo. */
export const SLUG_TO_MUSCLE = {};
MUSCLES.forEach((m) => m.k.forEach((s) => { SLUG_TO_MUSCLE[s] = m; }));

/* ── Emparejado con el dataset (port de coach/exercise_catalog.py) ──────── */

/* Tokens sin valor para emparejar: artículos y los sufijos de cámara/género
   que el dataset añade a algunas variantes y que diluirían la coincidencia.
   Es exactamente el STOPWORDS de coach/exercise_catalog.py. Ojo: allí la
   entrada "front view" es una cadena de dos palabras que nunca llega a casar
   con un token suelto, así que "front" NO se descarta — y no debe descartarse,
   porque distingue "front squat" o "front plank" de sus variantes. */
const STOPWORDS = new Set(['the', 'a', 'with', 'and', 'on', 'to', 'of', 'up',
  'version', 'pov', 'female', 'male', 'side']);

/** Singularización burda para que 'biceps'/'bicep' y 'thrusts'/'thrust' casen. */
function stem(t) {
  return (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) ? t.slice(0, -1) : t;
}

/** Minúsculas, fuera puntuación y paréntesis, y a tokens con raíz. */
function normalize(name) {
  return String(name || '').toLowerCase()
    .replace(/[()[\],./\\-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

let CATALOG = [];   // [{ex, tokens:Set}]
let loaded = false;

/** Carga data/exercises.min.json y pre-tokeniza cada nombre una sola vez. */
export async function loadCatalog(url = 'data/exercises.min.json') {
  if (loaded) return CATALOG;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    CATALOG = (data.exercises || []).map((ex) => ({ ex, tokens: new Set(normalize(ex.name)) }));
    loaded = true;
  } catch (err) {
    // Sin catálogo la app sigue funcionando: simplemente no hay GIF ni pasos.
    CATALOG = [];
    loaded = true;
  }
  return CATALOG;
}

const matchCache = new Map();

/**
 * Mejor coincidencia del dataset para un nombre, o null si es demasiado floja.
 * Puntúa cuánto de la CONSULTA cubre el candidato, con una pequeña penalización
 * a los candidatos rellenos de palabras extra; los empates los gana el que
 * menos palabras sobrantes lleva. Idéntico a find_exercise() en Python.
 */
export function findExercise(name, minScore = 0.5) {
  const key = `${name}|${minScore}`;
  if (matchCache.has(key)) return matchCache.get(key);
  const query = new Set(normalize(name));
  let out = null;
  if (query.size) {
    let bestScore = -1;
    let bestExtra = Infinity;
    for (const { ex, tokens } of CATALOG) {
      if (!tokens.size) continue;
      let overlap = 0;
      for (const t of query) if (tokens.has(t)) overlap++;
      if (!overlap) continue;
      const coverage = overlap / query.size;      // cuánto de la consulta casó
      const precision = overlap / tokens.size;     // lo enfocado del candidato
      const score = coverage * 0.7 + precision * 0.3;
      let extra = 0;
      for (const t of tokens) if (!query.has(t)) extra++;
      if (score > bestScore || (score === bestScore && extra < bestExtra)) {
        bestScore = score; bestExtra = extra; out = ex;
      }
    }
    if (bestScore < minScore) out = null;
  }
  matchCache.set(key, out);
  return out;
}

/** Entrada del dataset para un ejercicio del POOL (usa su nombre `en`). */
export function datasetFor(poolItem) {
  if (!poolItem) return null;
  return findExercise(poolItem.en || poolItem.n);
}

/** URL absoluta del GIF en GitHub raw, o null si no hay coincidencia. */
export function gifUrl(poolItem) {
  const ds = datasetFor(poolItem);
  return ds && ds.gif_url ? RAW_BASE + ds.gif_url : null;
}

/** Pasos de ejecución en español (o inglés si falta la traducción). */
export function stepsFor(poolItem) {
  const ds = datasetFor(poolItem);
  if (!ds || !ds.instruction_steps) return [];
  return ds.instruction_steps.es || ds.instruction_steps.en || [];
}

/**
 * Nombre de ejercicio registrado → grupo muscular en español.
 * Primero por nombre exacto del POOL (lo normal, porque las rutinas se
 * generan desde el POOL); si no, cae al emparejado con el dataset.
 */
export function muscleGroupFor(name) {
  const p = poolByName(name);
  if (p) return p.g;
  const ds = findExercise(name);
  if (!ds) return null;
  const target = String(ds.target || '').toLowerCase();
  return TARGET_TO_ES[target] || null;
}

/* ── Iniciales de respaldo cuando no hay imagen ────────────────────────── */
const STOPW_ES = new Set(['de', 'con', 'en', 'el', 'la', 'los', 'las', 'a', 'al', 'y', 'un', 'una']);

/** "Press de banca con barra" → "PBB". Respaldo visual si el GIF falla. */
export function initials(name) {
  const w = String(name || '').split(/[\s·]+/).filter((x) => x && !STOPW_ES.has(x.toLowerCase()));
  return w.slice(0, 3).map((x) => x.charAt(0).toUpperCase()).join('') || 'EJ';
}
