/* ══════════════════════════════════════════════════════════════════════════
   generator.js · Generador de rutina en cliente, alimentado por el perfil
   ──────────────────────────────────────────────────────────────────────────
   Entra un perfil (days_per_week, minutes, equipment, priorities, goal, level,
   limitations, structure, overlap_pref, volume_pref, variety_pref) y sale una
   rutina lista para escribir en routines / routine_days / routine_exercises.

   Los números (series, repeticiones, RIR, volumen semanal y qué estructura
   encaja con cuántos días) salen de docs/entrenamiento.md. Si cambias uno,
   cámbialo también allí: ese documento es la fuente de verdad.

   Cuatro decisiones vertebran el fichero:

   1. ESTRUCTURAS COMO DATOS (STRUCTURES + TPL). Cada estructura es una lista
      de plantillas de día, y cada plantilla declara qué grupos cubre y con qué
      peso. Añadir una estructura nueva es añadir datos, no código.
   2. SOLAPAMIENTO. `overlap_pref` filtra qué estructuras se recomiendan y el
      reparto de los días de la semana busca que dos días seguidos no compartan
      grupo muscular.
   3. PATRONES DE MOVIMIENTO. Un ejercicio por patrón y sesión (dos si el
      músculo es prioridad y el usuario pidió variedad), compuestos antes que
      aislamientos. Evita el clásico "dos empujes horizontales seguidos".
   4. SERIES POR PAPEL. principal / secundario / aislamiento, con esquema
      top set + back-offs para fuerza, y un control de volumen semanal que
      recorta aislamientos si se pasa del techo del nivel.

   Es determinista a propósito: cero Math.random. El mismo perfil produce
   exactamente la misma rutina, que es lo que permite auditarla.
   ══════════════════════════════════════════════════════════════════════════ */

import { POOL } from './catalog.js';

/* ══ MAPA DE LIMITACIONES ═════════════════════════════════════════════════
   Cada limitación articular veta los ejercicios cuyo PATRÓN carga justo esa
   articulación en su posición más comprometida. Se listan por nombre exacto
   del POOL (en vez de por expresión regular) para que quede a la vista qué
   se está quitando y por qué, y para que añadir un ejercicio nuevo al POOL no
   cambie silenciosamente las exclusiones.

   · rodilla  → flexión profunda de rodilla con carga y extensión aislada:
                sentadillas, zancadas, búlgara y extensión de cuádriceps.
                La prensa se mantiene porque el rango se puede limitar.
   · hombro   → todo lo que va por encima de la cabeza y los fondos, que
                llevan el hombro a extensión + rotación interna cargada.
   · lumbar   → cadena posterior con torso libre y momento largo sobre la
                columna: pesos muertos, buenos días, remo con barra inclinado
                y rueda abdominal.
   · muñeca   → agarre fijo en supinación o muñeca en extensión cargada:
                curl con barra, press cerrado, flexiones, rueda y sentadilla
                frontal (posición de rack).
   · cadera   → abducción y flexión profunda de cadera con carga: sumo,
                abducción en máquina y búlgara.
   · cuello   → carga axial con barra apoyada sobre el trapecio y press
                por encima de la cabeza.
   · ninguna  → no excluye nada.
   ══════════════════════════════════════════════════════════════════════════ */
export const LIMITATION_MAP = {
  rodilla: {
    label: 'Rodilla',
    avoid: ['Sentadilla con barra', 'Sentadilla frontal', 'Zancadas con mancuernas',
      'Sentadilla búlgara', 'Extensión de cuádriceps'],
  },
  hombro: {
    label: 'Hombro',
    avoid: ['Press militar con barra', 'Press de hombro con mancuernas',
      'Fondos en paralelas', 'Fondos en banco'],
  },
  lumbar: {
    label: 'Lumbar',
    avoid: ['Peso muerto con barra', 'Peso muerto rumano', 'Peso muerto sumo',
      'Buenos días con barra', 'Remo con barra', 'Rueda abdominal'],
  },
  muñeca: {
    label: 'Muñeca',
    avoid: ['Curl con barra', 'Press cerrado con barra', 'Flexiones',
      'Rueda abdominal', 'Sentadilla frontal'],
  },
  cadera: {
    label: 'Cadera',
    avoid: ['Peso muerto sumo', 'Abducción en máquina', 'Sentadilla búlgara'],
  },
  cuello: {
    label: 'Cuello',
    avoid: ['Press militar con barra', 'Sentadilla con barra',
      'Elevación de talones de pie'],
  },
  ninguna: { label: 'Ninguna', avoid: [] },
};

/** Conjunto de nombres vetados por las limitaciones del perfil. */
export function excludedNames(limitations = []) {
  const out = new Set();
  (limitations || []).forEach((l) => {
    const entry = LIMITATION_MAP[l];
    if (entry) entry.avoid.forEach((n) => out.add(n));
  });
  return out;
}

/* ══ PATRONES DE MOVIMIENTO ═══════════════════════════════════════════════ */

export const PAT_LABEL = {
  empuje_h: 'Empuje horizontal', empuje_v: 'Empuje vertical',
  traccion_h: 'Tracción horizontal', traccion_v: 'Tracción vertical',
  rodilla: 'Dominante de rodilla', cadera: 'Dominante de cadera',
  aduccion: 'Aducción / abducción', gemelo: 'Gemelo', core: 'Core',
  iso_pecho: 'Aislamiento de pecho', iso_espalda: 'Deltoides posterior',
  iso_deltoide: 'Deltoides lateral', iso_biceps: 'Aislamiento de bíceps',
  iso_triceps: 'Aislamiento de tríceps', iso_isquios: 'Aislamiento de isquios',
};

/* Aportación INDIRECTA de cada patrón: músculos que reciben trabajo real sin
   ser el grupo principal del ejercicio. Cuentan media serie cada uno, que es
   la convención habitual de "volumen fraccionado". Sirve para que el control
   de volumen no diga que los tríceps hacen 6 series cuando además han
   empujado en todos los press de la semana. El grupo principal del ejercicio
   nunca se cuenta dos veces. */
const PAT_INDIRECT = {
  empuje_h: ['Tríceps', 'Hombros'],
  empuje_v: ['Tríceps'],
  traccion_h: ['Bíceps', 'Hombros'],
  traccion_v: ['Bíceps'],
  rodilla: ['Glúteos'],
  cadera: ['Isquios', 'Glúteos', 'Espalda'],
  aduccion: [],
  gemelo: [], core: [],
  iso_pecho: [], iso_espalda: [], iso_deltoide: [],
  iso_biceps: [], iso_triceps: [], iso_isquios: [],
};
const INDIRECT_WEIGHT = 0.5;

/* ══ ESTRUCTURAS ══════════════════════════════════════════════════════════
   TPL = plantillas de día. Cada plantilla declara los grupos que cubre con un
   peso: 3 = núcleo del día (entra primero y siempre), 2 = apoyo, 1 = remate.
   Ese peso ordena el llenado de la sesión; las prioridades del usuario suman
   por encima.

   Los grupos de las estructuras SIN SOLAPE están repartidos de forma que dos
   plantillas distintas no comparten grupo (salvo el brazo del split por grupos,
   donde tríceps y bíceps aparecen como remate del día de pecho y de espalda:
   ahí el reparto de la semana se encarga de que no caigan en días seguidos).
   ══════════════════════════════════════════════════════════════════════════ */

/** Atajo para declarar un grupo con su peso. */
const G = (g, w) => ({ g, w });

const FULL_GROUPS = [
  G('Cuádriceps', 3), G('Espalda', 3), G('Pecho', 3),
  G('Isquios', 2), G('Glúteos', 2), G('Hombros', 2),
  G('Tríceps', 1), G('Bíceps', 1), G('Abdomen', 1), G('Gemelos', 1),
];

const TPL = {
  /* Las tres variantes de cuerpo completo cubren los mismos grupos: lo que
     cambia es el ejercicio concreto, porque el generador prefiere los que aún
     no ha usado esa semana. El sufijo A/B/C lo pone planTemplates(). */
  full_a: { name: 'Cuerpo completo', groups: FULL_GROUPS },
  full_b: { name: 'Cuerpo completo', groups: FULL_GROUPS },
  full_c: { name: 'Cuerpo completo', groups: FULL_GROUPS },

  upper: {
    name: 'Torso',
    groups: [G('Espalda', 3), G('Pecho', 3), G('Hombros', 2), G('Bíceps', 2), G('Tríceps', 2)],
    /* El peso muerto está clasificado en Espalda, pero es una bisagra de cadera
       y no tiene sitio en un día de torso: dejaría la pierna trabajada el día
       antes de la sesión de pierna. */
    skip: ['cadera'],
  },
  lower: {
    name: 'Pierna',
    groups: [G('Cuádriceps', 3), G('Isquios', 3), G('Glúteos', 3), G('Gemelos', 1), G('Abdomen', 1)],
  },

  push: {
    name: 'Empuje',
    groups: [G('Pecho', 3), G('Hombros', 3), G('Tríceps', 2)],
  },
  pull: {
    name: 'Tirón',
    groups: [G('Espalda', 3), G('Bíceps', 2)],
  },
  legs: {
    name: 'Pierna',
    groups: [G('Cuádriceps', 3), G('Isquios', 3), G('Glúteos', 3), G('Gemelos', 1), G('Abdomen', 1)],
  },

  /* Empuje / Tirón de 4 días: la sentadilla es un empuje y el peso muerto un
     tirón, así que la pierna se reparte entre los dos días y la semana queda
     completa sin días de pierna sueltos. */
  push_full: {
    name: 'Empuje',
    groups: [G('Pecho', 3), G('Hombros', 3), G('Cuádriceps', 3), G('Tríceps', 2), G('Gemelos', 1)],
  },
  pull_full: {
    name: 'Tirón',
    groups: [G('Espalda', 3), G('Isquios', 3), G('Glúteos', 3), G('Bíceps', 2), G('Abdomen', 1)],
  },

  bro_pecho: { name: 'Pecho', groups: [G('Pecho', 3), G('Tríceps', 1)] },
  bro_espalda: { name: 'Espalda', groups: [G('Espalda', 3), G('Bíceps', 1)] },
  bro_pierna: {
    name: 'Pierna',
    groups: [G('Cuádriceps', 3), G('Isquios', 3), G('Glúteos', 2), G('Gemelos', 1)],
  },
  bro_hombro: { name: 'Hombro', groups: [G('Hombros', 3), G('Abdomen', 1)] },
  bro_brazo: { name: 'Brazo', groups: [G('Bíceps', 3), G('Tríceps', 3)] },
};

/**
 * Catálogo de estructuras. Cada una es DATOS:
 *   cycle    · plantillas en orden; una vuelta completa toca todo el cuerpo
 *   overlap  · true si por diseño repite músculos en días seguidos
 *   fit      · días para los que encaja según la tabla de docs/entrenamiento.md
 *   freq     · veces que se toca cada músculo con esos días
 */
export const STRUCTURES = {
  fullbody: {
    id: 'fullbody',
    label: 'Cuerpo completo',
    cycle: ['full_a', 'full_b', 'full_c'],
    overlap: true,
    fit: [2, 3],
    freq: '2-3×',
    line: 'Encaja con 2-3 días. Cada músculo se toca 2 o 3 veces por semana.',
    why: 'Todo el cuerpo en cada sesión. La frecuencia más alta con pocos días.',
  },
  upper_lower: {
    id: 'upper_lower',
    label: 'Torso / Pierna',
    cycle: ['upper', 'lower'],
    overlap: false,
    fit: [4, 2],
    freq: '2×',
    line: 'Encaja con 4 días (también con 2). Cada músculo, 2 veces por semana.',
    why: 'Alterna mitades del cuerpo, así ningún día seguido repite músculo.',
  },
  ppl: {
    id: 'ppl',
    label: 'Empuje / Tirón / Pierna',
    cycle: ['push', 'pull', 'legs'],
    overlap: false,
    fit: [3, 6],
    freq: '1× con 3 días · 2× con 6',
    line: 'Encaja con 3 días (1 vez por músculo) o 6 días (2 veces).',
    why: 'Cada día toca músculos distintos: la opción más limpia si acumulas fatiga.',
  },
  push_pull: {
    id: 'push_pull',
    label: 'Empuje / Tirón',
    cycle: ['push_full', 'pull_full'],
    overlap: false,
    fit: [4],
    freq: '2×',
    line: 'Encaja con 4 días. Cada músculo, 2 veces por semana.',
    why: 'Dos sesiones de empujar y dos de tirar, con la pierna repartida.',
  },
  bro: {
    id: 'bro',
    label: 'Por grupos musculares',
    cycle: ['bro_pecho', 'bro_espalda', 'bro_pierna', 'bro_hombro', 'bro_brazo'],
    overlap: false,
    fit: [5],
    freq: '1×',
    line: 'Encaja con 5 días. Cada músculo, 1 vez por semana.',
    why: 'Un grupo por día. Sesiones cortas y muy centradas.',
  },
};

export const STRUCTURE_IDS = ['fullbody', 'upper_lower', 'ppl', 'push_pull', 'bro'];

export const OVERLAP_LABEL = {
  evitar: 'Que cada día toque músculos distintos',
  indiferente: 'Me da igual',
  frecuencia: 'Tocar cada músculo varias veces por semana',
};

export const VOLUME_LABEL = { bajo: 'Suave', medio: 'Normal', alto: 'Fuerte' };
export const VARIETY_LABEL = { pocos: 'Pocos ejercicios, más series', variada: 'Más variedad' };

/** Estructuras que no repiten músculo en días seguidos. */
export const NO_OVERLAP_IDS = STRUCTURE_IDS.filter((id) => !STRUCTURES[id].overlap);

/* ══ RECOMENDACIÓN DE ESTRUCTURA ══════════════════════════════════════════ */

/**
 * Mejor estructura para unos días y una preferencia de solapamiento.
 * Sigue la tabla de docs/entrenamiento.md y luego aplica la preferencia:
 *   evitar     → nunca cuerpo completo
 *   frecuencia → cuerpo completo mientras los días lo permitan
 */
export function recommendStructure(days, overlapPref) {
  const d = Math.max(1, Math.min(7, Number(days) || 3));
  const pref = OVERLAP_LABEL[overlapPref] ? overlapPref : 'indiferente';

  if (pref === 'evitar') {
    if (d <= 2) return 'upper_lower';
    if (d === 3) return 'ppl';
    if (d === 4) return 'upper_lower';
    if (d === 5) return 'bro';
    return 'ppl';
  }
  if (pref === 'frecuencia') {
    if (d <= 4) return 'fullbody';
    if (d === 5) return 'upper_lower';
    return 'ppl';
  }
  if (d <= 3) return 'fullbody';
  if (d === 4) return 'upper_lower';
  if (d === 5) return 'bro';
  return 'ppl';
}

/* ══ PLANTILLAS PARA UNOS DÍAS ════════════════════════════════════════════ */

/**
 * Adapta el ciclo de una estructura al número de días del usuario.
 *
 *  · Más días que plantillas → se dan más VUELTAS (day i usa cycle[i % n]) y
 *    los nombres repetidos se marcan A, B…
 *  · Menos días que plantillas → se JUNTAN plantillas por reparto circular
 *    (con 3 días, un split de 5 queda pecho+hombro / espalda+brazo / pierna),
 *    de forma que no se queda ningún músculo sin entrenar.
 *
 * Devuelve { plan:[{name,groups}], rounds, merged, note }.
 */
export function planTemplates(structureId, days) {
  const st = STRUCTURES[structureId] || STRUCTURES.fullbody;
  const d = Math.max(1, Math.min(7, Number(days) || 3));
  const cyc = st.cycle.map((k) => TPL[k]);

  if (d >= cyc.length) {
    const plan = [];
    for (let i = 0; i < d; i++) {
      const t = cyc[i % cyc.length];
      plan.push({ name: t.name, groups: t.groups, skip: t.skip || [] });
    }
    return { plan: numberNames(plan), rounds: d / cyc.length, merged: false };
  }

  /* Menos días que plantillas: se juntan por reparto circular. */
  const buckets = Array.from({ length: d }, () => []);
  cyc.forEach((t, i) => buckets[i % d].push(t));
  const plan = buckets.map((list) => ({
    name: [...new Set(list.map((t) => t.name))].join(' + '),
    groups: mergeGroups(list),
    /* Un patrón solo se veta si lo vetan TODAS las plantillas que se juntan. */
    skip: list.reduce((acc, t) => acc.filter((s) => (t.skip || []).includes(s)), list[0].skip || []),
  }));
  return { plan: numberNames(plan), rounds: 1, merged: true };
}

/** Numera A/B/C los días que se llaman igual. */
function numberNames(plan) {
  const counts = {};
  plan.forEach((p) => { counts[p.name] = (counts[p.name] || 0) + 1; });
  const seen = {};
  plan.forEach((p) => {
    if (counts[p.name] > 1) {
      seen[p.name] = (seen[p.name] || 0) + 1;
      p.name = `${p.name} ${String.fromCharCode(64 + seen[p.name])}`;
    }
  });
  return plan;
}

/** Une los grupos de varias plantillas quedándose con el peso más alto. */
function mergeGroups(list) {
  const map = new Map();
  list.forEach((t) => t.groups.forEach((g) => {
    const cur = map.get(g.g);
    if (!cur || g.w > cur.w) map.set(g.g, { g: g.g, w: g.w });
  }));
  return Array.from(map.values()).sort((a, b) => b.w - a.w);
}

/* ══ REPARTO EN LA SEMANA ═════════════════════════════════════════════════ */

/**
 * Coloca las sesiones en la semana (0 = lunes … 6 = domingo).
 *
 * Enumera TODOS los subconjuntos de tamaño n de los 7 días y se queda con el
 * mejor según, en este orden:
 *   1. días seguidos que comparten grupo muscular (si `avoid`, es lo primero)
 *   2. bloques largos de días seguidos (mejor intercalar descansos)
 *   3. empezar lo antes posible en la semana
 * Como son 7 días, son 127 combinaciones como máximo: barato y determinista.
 * @returns {{idx:number[], clashes:number}} días elegidos y choques que no se
 *   han podido evitar (con 6-7 días de entreno puede no haber hueco libre).
 */
export function layoutWeek(plan, avoid) {
  const n = plan.length;
  if (n >= 7) return { idx: [0, 1, 2, 3, 4, 5, 6], clashes: countClashes(plan, [0, 1, 2, 3, 4, 5, 6]) };
  const sets = plan.map((p) => new Set(p.groups.map((g) => g.g)));
  let best = null;

  for (let mask = 0; mask < 128; mask++) {
    const idx = [];
    for (let b = 0; b < 7; b++) if (mask & (1 << b)) idx.push(b);
    if (idx.length !== n) continue;

    let clashes = 0;
    let runs = 0;
    for (let i = 1; i < idx.length; i++) {
      if (idx[i] === idx[i - 1] + 1) {
        runs++;
        for (const g of sets[i]) if (sets[i - 1].has(g)) { clashes++; break; }
      }
    }
    const score = (avoid ? clashes * 1000 : 0) + runs * 10 + idx[0] + idx[idx.length - 1] * 0.1;
    if (!best || score < best.score) best = { score, idx, clashes };
  }
  return best ? { idx: best.idx, clashes: best.clashes } : { idx: [0, 2, 4], clashes: 0 };
}

/** Días seguidos que comparten al menos un grupo muscular. */
function countClashes(plan, idx) {
  const sets = plan.map((p) => new Set(p.groups.map((g) => g.g)));
  let clashes = 0;
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] !== idx[i - 1] + 1) continue;
    for (const g of sets[i]) if (sets[i - 1].has(g)) { clashes++; break; }
  }
  return clashes;
}

/**
 * Nº de ejercicios por sesión a partir de los minutos disponibles.
 * El minutaje por ejercicio depende del objetivo, porque lo que se come el
 * tiempo son los descansos: en fuerza son de 3 minutos y en definición de uno.
 */
export function exercisesPerSession(minutes, goal) {
  const perEx = goal === 'fuerza' ? 11 : goal === 'grasa' ? 7 : 8;
  return Math.max(3, Math.min(10, Math.round((Number(minutes) || 45) / perEx)));
}

/* ══ PRESCRIPCIÓN POR PAPEL Y OBJETIVO ════════════════════════════════════
   Tabla de docs/entrenamiento.md §4. `principal` es el primer compuesto del
   día para el grupo prioritario; `secundario`, el resto de compuestos;
   `aislamiento`, los monoarticulares.

   En fuerza el principal NO es "N series iguales": es un top set pesado más
   dos back-offs. Por eso cada ejercicio lleva `scheme`, una lista de series
   heterogénea, y `sets` es solo el total.
   ══════════════════════════════════════════════════════════════════════════ */
const PRESCRIPTION = {
  fuerza: {
    principal: {
      top: { low: 3, high: 5, rir: 1, rest: 210 },
      back: { low: 5, high: 6, rir: 2, rest: 180 },
      backs: 2,
    },
    secundario: { sets: 3, low: 5, high: 8, rir: 2, rest: 150 },
    aislamiento: { sets: 2, low: 8, high: 12, rir: 2, rest: 90 },
  },
  musculo: {
    principal: { sets: 3, low: 6, high: 10, rir: 2, rest: 150 },
    secundario: { sets: 3, low: 8, high: 12, rir: 2, rest: 120 },
    aislamiento: { sets: 3, low: 10, high: 15, rir: 1, rest: 75 },
  },
  grasa: {
    principal: { sets: 3, low: 10, high: 15, rir: 2, rest: 90 },
    secundario: { sets: 3, low: 12, high: 15, rir: 2, rest: 75 },
    aislamiento: { sets: 2, low: 12, high: 20, rir: 2, rest: 60 },
  },
  salud: {
    principal: { sets: 3, low: 10, high: 15, rir: 2, rest: 90 },
    secundario: { sets: 3, low: 12, high: 15, rir: 2, rest: 75 },
    aislamiento: { sets: 2, low: 12, high: 20, rir: 2, rest: 60 },
  },
};

/** Series semanales objetivo por músculo (nivel × preferencia de volumen). */
export function volumeTarget(level, volumePref) {
  const base = { principiante: [8, 12], intermedio: [12, 18], avanzado: [16, 22] };
  const [lo, hi] = base[level] || base.intermedio;
  const k = volumePref === 'bajo' ? 0.75 : volumePref === 'alto' ? 1.25 : 1;
  return { low: Math.round(lo * k), high: Math.round(hi * k) };
}

export const ROLE_LABEL = {
  principal: 'Básico principal', secundario: 'Compuesto secundario', aislamiento: 'Aislamiento',
};

/* ══ SELECCIÓN DE EJERCICIOS ══════════════════════════════════════════════ */

/** ¿Cuenta como compuesto? Todo lo que no sea monoarticular ni isométrico. */
const isCompound = (x) => !x.uni && !x.time;

/** Orden de preferencia dentro de un grupo: básico > multiarticular > accesorio. */
const rank = (x) => (x.comp ? 2 : (isCompound(x) ? 1 : 0));

/* El POOL está ordenado a mano de más a menos recomendable dentro de cada
   grupo. Ese orden es el que rompe los empates: así el press de banca gana a
   las flexiones y el curl con barra al curl con banda, en vez de decidirlo el
   alfabeto. */
const POOL_IDX = new Map(POOL.map((x, i) => [x.n, i]));
const idx = (x) => (POOL_IDX.has(x.n) ? POOL_IDX.get(x.n) : 999);

/**
 * Elige los ejercicios de una sesión respetando la regla de patrones.
 *
 * Es una selección VORAZ y determinista: en cada hueco se puntúan todos los
 * candidatos posibles del día y entra el mejor.
 *
 *   · +1000 si es compuesto → los básicos entran siempre antes que los
 *     aislamientos, porque cubren más masa muscular por serie
 *   · +60 si el músculo es prioridad del usuario
 *   · +peso del grupo en la plantilla (3 núcleo · 2 apoyo · 1 remate)
 *   · −30 si ese grupo ya tiene un ejercicio en la sesión → primero se reparte
 *     y luego se insiste, así brazos y gemelos no se quedan siempre fuera
 *   · +2 si el ejercicio aún no ha salido esta semana (salvo en fuerza)
 *
 * El patrón de movimiento es un filtro DURO: un solo ejercicio por patrón y
 * sesión. El segundo del mismo patrón se permite únicamente si ese músculo es
 * prioridad Y el usuario pidió variedad, y siempre después de haber agotado
 * los patrones nuevos: por eso va en una segunda fase.
 */
function pickExercises(tplGroups, ctx) {
  const { pool, perSession, priorities, uniCap, allowDouble, used, preferFresh } = ctx;
  const prio = new Set(priorities);
  const chosen = [];
  const pats = new Set();
  const covered = new Map();       // grupo → cuántos ejercicios lleva ya
  let uniCount = 0;

  const take = (x, g) => {
    chosen.push(x);
    pats.add(x.pat);
    covered.set(g.g, (covered.get(g.g) || 0) + 1);
    if (!isCompound(x)) uniCount++;
  };

  const score = (x, g) => (isCompound(x) ? 1000 : 0)
    + (prio.has(g.g) ? 60 : 0) + g.w
    - (covered.get(g.g) ? 30 : 0)
    + rank(x) * 3
    + (preferFresh && !used.has(x.n) ? 2 : 0);

  /**
   * Mejor candidato disponible.
   * @param {boolean} freshPattern true → solo patrones sin usar (fase 1);
   *   false → solo patrones ya usados y solo en músculos prioritarios (fase 2)
   */
  const best = (freshPattern) => {
    let out = null;
    for (const g of tplGroups) {
      if (!freshPattern && !prio.has(g.g)) continue;
      for (const x of pool) {
        if (x.g !== g.g) continue;
        if (pats.has(x.pat) === freshPattern) continue;
        if (chosen.some((c) => c.n === x.n)) continue;
        if (!isCompound(x) && uniCount >= uniCap) continue;
        const s = score(x, g);
        if (!out || s > out.s || (s === out.s && idx(x) < idx(out.x))) {
          out = { x, g, s };
        }
      }
    }
    return out;
  };

  /* Fase 1 · un ejercicio por patrón nuevo, compuestos primero. */
  while (chosen.length < perSession) {
    const pick = best(true);
    if (!pick) break;
    take(pick.x, pick.g);
  }
  /* Fase 2 · segundo ejercicio del mismo patrón para músculos prioritarios. */
  if (allowDouble) {
    while (chosen.length < perSession) {
      const pick = best(false);
      if (!pick) break;
      take(pick.x, pick.g);
    }
  }
  return chosen;
}

/* ══ GENERACIÓN ═══════════════════════════════════════════════════════════ */

/** Normaliza el perfil a los valores que entiende el generador. */
function readProfile(profile) {
  const p = profile || {};
  const goal = PRESCRIPTION[p.goal] ? p.goal : 'musculo';
  const level = ['principiante', 'intermedio', 'avanzado'].includes(p.level) ? p.level : 'principiante';
  return {
    goal,
    level,
    days: Math.max(1, Math.min(7, Number(p.days_per_week) || 3)),
    minutes: Number(p.minutes) || 45,
    equipment: (p.equipment && p.equipment.length) ? p.equipment : ['libre', 'maquina', 'corporal'],
    limitations: p.limitations || [],
    priorities: p.priorities || [],
    structure: STRUCTURES[p.structure] ? p.structure : 'auto',
    overlap: OVERLAP_LABEL[p.overlap_pref] ? p.overlap_pref : 'indiferente',
    volume: VOLUME_LABEL[p.volume_pref] ? p.volume_pref : 'medio',
    variety: VARIETY_LABEL[p.variety_pref] ? p.variety_pref : 'variada',
  };
}

/**
 * Decide la estructura y devuelve los avisos, SIN generar ejercicios.
 * La interfaz la usa para explicar la semana antes (y después) de generar.
 */
export function explainPlan(profile) {
  const p = readProfile(profile);
  const auto = p.structure === 'auto';
  let id = auto ? recommendStructure(p.days, p.overlap) : p.structure;
  const notes = [];

  /* Si pidió no repetir músculos, cuerpo completo queda descartado. */
  if (p.overlap === 'evitar' && STRUCTURES[id].overlap) {
    const before = STRUCTURES[id].label;
    id = recommendStructure(p.days, 'evitar');
    notes.push(`${before} repite todos los músculos cada sesión, así que se ha cambiado a `
      + `${STRUCTURES[id].label}: así ningún día seguido toca lo mismo.`);
  }

  const st = STRUCTURES[id];
  const { plan, rounds, merged } = planTemplates(id, p.days);

  if (!auto && !st.fit.includes(p.days)) {
    const fit = st.fit.slice().sort((a, b) => a - b).join(' o ');
    if (merged) {
      notes.push(`${st.label} encaja mejor con ${fit} días. Con ${p.days} se han juntado `
        + 'grupos en cada sesión para que no se quede ningún músculo sin entrenar.');
    } else {
      notes.push(`${st.label} encaja mejor con ${fit} días. Con ${p.days} se hacen `
        + `${rounds % 1 === 0 ? rounds : rounds.toFixed(1)} vueltas, así que algún día se repite `
        + 'y su frecuencia no queda igualada. Se puede usar igual.');
    }
  }

  /* Frecuencia real por músculo según las plantillas asignadas. */
  const freq = {};
  plan.forEach((t) => t.groups.forEach((g) => { freq[g.g] = (freq[g.g] || 0) + 1; }));
  const minFreq = Math.min(...Object.values(freq));

  if (p.overlap === 'evitar' && minFreq < 2) {
    notes.push(`Con ${p.days} días y sin repetir músculos, cada grupo se entrena 1 vez por `
      + 'semana. Es menos de lo ideal (2×), pero evita la fatiga acumulada.');
  }
  return { structure: id, label: st.label, auto, plan, rounds, merged, freq, notes };
}

/**
 * Genera la rutina completa.
 * @returns {{name, focus, weeks, structure, days:[…], volume:[…], notes:[…]}}
 */
export function generateRoutine(profile) {
  const p = readProfile(profile);
  const info = explainPlan(profile);
  const notes = info.notes.slice();

  const perSession = exercisesPerSession(p.minutes, p.goal);
  const banned = excludedNames(p.limitations);
  const pool = POOL.filter((x) => p.equipment.includes(x.eq) && !banned.has(x.n));

  /* El principiante hace menos accesorios monoarticulares por sesión. */
  const uniCap = p.level === 'principiante' ? 2 : p.level === 'intermedio' ? 3 : 4;
  const used = new Set();
  const { idx: order, clashes } = layoutWeek(info.plan, p.overlap === 'evitar');
  if (p.overlap === 'evitar' && clashes) {
    notes.push(`Con ${p.days} días de entreno no queda hueco para intercalar descansos, así que `
      + 'algún par de días seguidos comparte músculo. Es lo máximo que se puede separar.');
  }

  const sessions = info.plan.map((tpl) => {
    /* Cada plantilla puede vetar patrones que no pintan nada en ese día. */
    const dayPool = (tpl.skip || []).length
      ? pool.filter((x) => !tpl.skip.includes(x.pat)) : pool;
    const chosen = pickExercises(tpl.groups, {
      pool: dayPool,
      perSession,
      priorities: p.priorities,
      uniCap,
      allowDouble: p.variety === 'variada',
      used,
      preferFresh: p.goal !== 'fuerza',
    });
    chosen.forEach((x) => used.add(x.n));
    return { tpl, chosen };
  });

  /* ── Papeles y series ──────────────────────────────────────────────────
     El principal es el primer compuesto del día cuyo grupo es prioridad del
     usuario; si no hay ninguno, el primer compuesto de la sesión.            */
  const prio = new Set(p.priorities);
  sessions.forEach((s) => {
    const comps = s.chosen.filter(isCompound);
    const main = comps.find((x) => prio.has(x.g)) || comps[0] || null;
    s.rows = s.chosen.map((x, i) => prescribe(x, i, {
      role: x === main ? 'principal' : (isCompound(x) ? 'secundario' : 'aislamiento'),
      goal: p.goal,
      level: p.level,
      /* Pocos ejercicios y más series: el músculo prioritario gana una serie. */
      bonus: (p.variety === 'pocos' && prio.has(x.g)) ? 1 : 0,
    }));
  });

  /* ── Control de volumen semanal ────────────────────────────────────────── */
  const target = volumeTarget(p.level, p.volume);
  const trimmed = trimVolume(sessions, target, prio);
  if (trimmed) {
    notes.push(`Se han recortado ${trimmed} ${trimmed === 1 ? 'serie' : 'series'} de aislamiento `
      + `para no pasar del techo de ${target.high} series por músculo y semana.`);
  }

  /* ── Días de la semana ─────────────────────────────────────────────────── */
  const routineDays = [];
  for (let d = 0; d < 7; d++) {
    const slot = order.indexOf(d);
    if (slot < 0) {
      routineDays.push({ day_index: d, name: 'Descanso', is_rest: true, exercises: [] });
      continue;
    }
    const s = sessions[slot];
    routineDays.push({
      day_index: d,
      name: s.tpl.name,
      is_rest: false,
      exercises: s.rows.map((r, i) => ({ ...r, position: i })),
    });
  }

  const volume = weeklyVolume(routineDays, target);
  const low = volume.filter((v) => v.state === 'bajo').map((v) => v.muscle);
  const high = volume.filter((v) => v.state === 'alto').map((v) => v.muscle);
  if (low.length) {
    notes.push(`Por debajo del rango de tu nivel (${target.low}-${target.high} series por semana): `
      + `${listar(low)}. Con estos días y minutos no caben más series sin repetir patrón: sube días, `
      + 'sube minutos o marca esos músculos como prioridad.');
  }
  if (high.length) {
    notes.push(`Aun recortando aislamientos, ${listar(high)} ${high.length > 1 ? 'se quedan' : 'se queda'} por encima del techo de `
      + `${target.high} series. Es lo que da esta estructura con ${p.days} días: si te pasa factura, `
      + 'baja el nivel de exigencia o cambia de estructura.');
  }

  /* Frecuencia REAL: días de la semana en que se toca cada músculo. */
  const freq = {};
  routineDays.forEach((d) => {
    new Set(d.exercises.map((x) => x.muscle)).forEach((m) => { freq[m] = (freq[m] || 0) + 1; });
  });

  return {
    name: routineName(p.goal, p.days, STRUCTURES[info.structure].label),
    focus: p.goal,
    weeks: 8,
    structure: info.structure,
    days: routineDays,
    volume,
    target,
    freq,
    notes,
  };
}

/**
 * Convierte un ejercicio del POOL en una fila de routine_exercises.
 * `scheme` describe SERIE A SERIE lo que hay que hacer; `sets`, `rep_low`,
 * `rep_high` y `rir` son el resumen para las vistas que no leen el detalle.
 */
function prescribe(x, position, { role, goal, level, bonus }) {
  const spec = PRESCRIPTION[goal][role];
  const beginner = level === 'principiante';
  let scheme;

  if (role === 'principal' && spec.top) {
    /* Fuerza: top set + back-offs. El principiante hace un back-off menos. */
    const backs = Math.max(1, spec.backs - (beginner ? 1 : 0)) + bonus;
    scheme = [{ kind: 'top', reps_low: spec.top.low, reps_high: spec.top.high, rir: spec.top.rir, rest_s: spec.top.rest }];
    for (let i = 0; i < backs; i++) {
      scheme.push({ kind: 'backoff', reps_low: spec.back.low, reps_high: spec.back.high, rir: spec.back.rir, rest_s: spec.back.rest });
    }
  } else {
    let n = spec.sets + bonus;
    if (beginner) n = Math.max(2, n - 1);
    const low = x.time ? 20 : spec.low;
    const high = x.time ? 45 : spec.high;
    const rest = x.time ? 60 : spec.rest;
    scheme = Array.from({ length: n }, () => ({
      kind: 'recta', reps_low: low, reps_high: high, rir: spec.rir, rest_s: rest,
    }));
  }

  return {
    position,
    name: x.n,
    slug: x.en || null,
    muscle: x.g,
    equipment: x.eq,
    role,
    pat: x.pat || null,
    sets: scheme.length,
    rep_low: Math.min(...scheme.map((s) => s.reps_low)),
    rep_high: Math.max(...scheme.map((s) => s.reps_high)),
    rir: scheme[scheme.length - 1].rir,
    rest_s: scheme[0].rest_s,
    is_time: !!x.time,
    scheme,
  };
}

/* ══ VOLUMEN SEMANAL ══════════════════════════════════════════════════════ */

/**
 * Series semanales por músculo: directas (el grupo del ejercicio) más medias
 * series por trabajo indirecto según el patrón. Es lo que se audita contra el
 * rango del nivel.
 */
function countSets(sessions) {
  const acc = new Map();
  const add = (m, n) => acc.set(m, (acc.get(m) || 0) + n);
  sessions.forEach((s) => (s.rows || s.exercises || []).forEach((r) => {
    add(r.muscle, r.sets);
    (PAT_INDIRECT[r.pat] || []).forEach((m) => {
      if (m !== r.muscle) add(m, r.sets * INDIRECT_WEIGHT);
    });
  }));
  return acc;
}

/**
 * Recorta series si un músculo se pasa del techo semanal. Quita SIEMPRE de los
 * aislamientos primero (mínimo 1 serie), luego de los compuestos secundarios
 * (mínimo 2) y nunca del básico principal ni de un músculo prioritario si
 * queda otro sitio de donde quitar.
 * @returns {number} series recortadas
 */
function trimVolume(sessions, target, prio) {
  let cut = 0;
  for (let guard = 0; guard < 400; guard++) {
    const counts = countSets(sessions);
    let over = null;
    counts.forEach((v, m) => {
      if (v > target.high && (!over || v - target.high > over.excess)) {
        over = { muscle: m, excess: v - target.high };
      }
    });
    if (!over) break;

    /* Candidatos: ejercicios que aportan a ese músculo, del más prescindible
       al menos prescindible. */
    const cands = [];
    sessions.forEach((s) => s.rows.forEach((r) => {
      const direct = r.muscle === over.muscle;
      const indirect = (PAT_INDIRECT[r.pat] || []).includes(over.muscle);
      if (!direct && !indirect) return;
      /* Suelo por papel: del aislamiento se puede quitar casi todo, del
         compuesto secundario hasta 2, y el básico principal no se toca. */
      const floor = r.role === 'aislamiento' ? 1 : r.role === 'secundario' ? 2 : r.sets;
      if (r.sets <= floor) return;
      const weight = r.role === 'aislamiento' ? 0 : r.role === 'secundario' ? 1 : 2;
      cands.push({ r, key: [weight, prio.has(r.muscle) ? 1 : 0, direct ? 0 : 1, -r.sets] });
    }));
    if (!cands.length) break;
    cands.sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      return a.r.name.localeCompare(b.r.name, 'es');
    });
    const row = cands[0].r;
    row.scheme.pop();
    row.sets = row.scheme.length;
    row.rep_low = Math.min(...row.scheme.map((s) => s.reps_low));
    row.rep_high = Math.max(...row.scheme.map((s) => s.reps_high));
    cut++;
  }
  return cut;
}

/**
 * Resumen auditable de series semanales por músculo.
 * Acepta los días generados aquí o los que vienen de la base de datos
 * (routine_days con routine_exercises).
 * @returns {[{muscle, sets, direct, indirect, days, state, low, high}]}
 */
export function weeklyVolume(days, target) {
  const list = (days || []).map((d) => ({
    rows: (d.exercises || d.routine_exercises || []),
  }));
  const direct = new Map();
  const indirect = new Map();
  const byDay = new Map();
  list.forEach((s, i) => s.rows.forEach((r) => {
    direct.set(r.muscle, (direct.get(r.muscle) || 0) + r.sets);
    if (!byDay.has(r.muscle)) byDay.set(r.muscle, new Set());
    byDay.get(r.muscle).add(i);
    const pat = r.pat || patOf(r.name);
    (PAT_INDIRECT[pat] || []).forEach((m) => {
      if (m === r.muscle) return;
      indirect.set(m, (indirect.get(m) || 0) + r.sets * INDIRECT_WEIGHT);
      if (!byDay.has(m)) byDay.set(m, new Set());
    });
  }));

  const muscles = new Set([...direct.keys(), ...indirect.keys()]);
  const out = [];
  muscles.forEach((m) => {
    const d = direct.get(m) || 0;
    const ind = indirect.get(m) || 0;
    const total = d + ind;
    out.push({
      muscle: m,
      direct: d,
      indirect: ind,
      sets: total,
      days: (byDay.get(m) || new Set()).size,
      low: target.low,
      high: target.high,
      state: total > target.high ? 'alto' : total < target.low ? 'bajo' : 'rango',
    });
  });
  return out.sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle, 'es'));
}

/** Patrón de un ejercicio por nombre (para rutinas guardadas sin `pat`). */
function patOf(name) {
  const x = POOL.find((e) => e.n === name);
  return x ? x.pat : null;
}

/** "a, b y c", cortando en cuatro para que el aviso no sea un párrafo. */
function listar(arr) {
  const list = arr.slice(0, 4);
  const resto = arr.length - list.length;
  if (resto > 0) return `${list.join(', ')} y ${resto} más`;
  return list.length > 1
    ? `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
    : list[0];
}

const GOAL_LABEL = { musculo: 'Músculo', fuerza: 'Fuerza', grasa: 'Definición', salud: 'Salud' };

function routineName(goal, days, structureLabel) {
  return `${GOAL_LABEL[goal] || 'Músculo'} · ${structureLabel} · ${days} día${days === 1 ? '' : 's'}`;
}

/**
 * Alternativas del mismo grupo, respetando equipo y limitaciones.
 * Se ordenan poniendo delante las del MISMO patrón (son el recambio directo)
 * y detrás las de otro patrón, que cambian el estímulo.
 */
export function alternatives(current, profile) {
  const equipment = (profile.equipment && profile.equipment.length)
    ? profile.equipment : ['libre', 'maquina', 'corporal'];
  const banned = excludedNames(profile.limitations);
  const pat = current.pat || patOf(current.name);
  let alts = POOL.filter((x) => x.g === current.muscle && x.n !== current.name
    && equipment.includes(x.eq) && !banned.has(x.n));
  /* Si el equipo deja el grupo sin alternativas, se abre a todo el POOL pero
     se siguen respetando las limitaciones: el equipo es una preferencia, la
     articulación que duele no. */
  if (!alts.length) {
    alts = POOL.filter((x) => x.g === current.muscle && x.n !== current.name && !banned.has(x.n));
  }
  return alts.sort((a, b) => {
    const sa = a.pat === pat ? 0 : 1;
    const sb = b.pat === pat ? 0 : 1;
    return sa - sb || a.n.localeCompare(b.n, 'es');
  });
}
