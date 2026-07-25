/* ══════════════════════════════════════════════════════════════════════════
   generator.js · Generador de rutina en cliente, alimentado por el perfil
   ──────────────────────────────────────────────────────────────────────────
   Entra un perfil (days_per_week, minutes, equipment, priorities, goal,
   level, limitations) y sale una rutina lista para escribir en
   routines / routine_days / routine_exercises.
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

/* ══ PRESCRIPCIÓN POR OBJETIVO ════════════════════════════════════════════
   fuerza  → 3-5 repeticiones con RIR 1-2 en los básicos, accesorios más altos
   musculo → 8-12 con RIR 2
   grasa   → 10-15 con RIR 2 (densidad alta, descansos cortos)
   salud   → 10-15 con RIR 3, siempre lejos del fallo
   ══════════════════════════════════════════════════════════════════════════ */
const PRESCRIPTION = {
  fuerza: {
    comp: { sets: 4, low: 3, high: 5, rir: 1, rest: 180 },
    acc: { sets: 3, low: 6, high: 10, rir: 2, rest: 120 },
  },
  musculo: {
    comp: { sets: 4, low: 8, high: 12, rir: 2, rest: 150 },
    acc: { sets: 3, low: 8, high: 12, rir: 2, rest: 90 },
  },
  grasa: {
    comp: { sets: 3, low: 10, high: 15, rir: 2, rest: 75 },
    acc: { sets: 3, low: 10, high: 15, rir: 2, rest: 60 },
  },
  salud: {
    comp: { sets: 3, low: 10, high: 15, rir: 3, rest: 90 },
    acc: { sets: 2, low: 10, high: 15, rir: 3, rest: 60 },
  },
};

/* Repartos por número de días. Cada día es la secuencia de grupos a cubrir;
   el generador va tomando el mejor ejercicio disponible de cada grupo. */
const FULL = ['Cuádriceps', 'Pecho', 'Espalda', 'Hombros', 'Isquios', 'Glúteos', 'Bíceps', 'Tríceps', 'Abdomen', 'Gemelos'];
const UPPER = ['Pecho', 'Espalda', 'Hombros', 'Espalda', 'Tríceps', 'Bíceps', 'Pecho', 'Abdomen'];
const LOWER = ['Cuádriceps', 'Isquios', 'Glúteos', 'Cuádriceps', 'Isquios', 'Gemelos', 'Abdomen'];
const PUSH = ['Pecho', 'Hombros', 'Pecho', 'Tríceps', 'Hombros', 'Tríceps', 'Abdomen'];
const PULL = ['Espalda', 'Espalda', 'Bíceps', 'Espalda', 'Bíceps', 'Hombros', 'Abdomen'];

const SPLITS = {
  1: [{ name: 'Cuerpo completo', plan: FULL }],
  2: [{ name: 'Cuerpo completo A', plan: FULL }, { name: 'Cuerpo completo B', plan: FULL }],
  3: [{ name: 'Completo A', plan: FULL }, { name: 'Completo B', plan: FULL }, { name: 'Completo C', plan: FULL }],
  4: [{ name: 'Tren superior A', plan: UPPER }, { name: 'Tren inferior A', plan: LOWER },
    { name: 'Tren superior B', plan: UPPER }, { name: 'Tren inferior B', plan: LOWER }],
  5: [{ name: 'Empuje', plan: PUSH }, { name: 'Tirón', plan: PULL }, { name: 'Piernas', plan: LOWER },
    { name: 'Tren superior', plan: UPPER }, { name: 'Tren inferior', plan: LOWER }],
  6: [{ name: 'Empuje A', plan: PUSH }, { name: 'Tirón A', plan: PULL }, { name: 'Piernas A', plan: LOWER },
    { name: 'Empuje B', plan: PUSH }, { name: 'Tirón B', plan: PULL }, { name: 'Piernas B', plan: LOWER }],
  7: [{ name: 'Empuje A', plan: PUSH }, { name: 'Tirón A', plan: PULL }, { name: 'Piernas A', plan: LOWER },
    { name: 'Empuje B', plan: PUSH }, { name: 'Tirón B', plan: PULL }, { name: 'Piernas B', plan: LOWER },
    { name: 'Completo', plan: FULL }],
};

/** Reparte N días de entreno entre los 7 de la semana lo más espaciados posible. */
function spreadDays(n) {
  const layout = {
    1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4],
    5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  return layout[Math.max(1, Math.min(7, n))] || [0, 2, 4];
}

/** Nº de ejercicios por sesión a partir de los minutos disponibles (~8 min/ejercicio). */
export function exercisesPerSession(minutes) {
  return Math.max(3, Math.min(10, Math.round((Number(minutes) || 45) / 8)));
}

/**
 * Ordena el plan del día poniendo delante los grupos que el perfil prioriza,
 * y añade una repetición extra del grupo prioritario si pertenece al día.
 */
function applyPriorities(plan, priorities) {
  if (!priorities || !priorities.length) return plan.slice();
  const pset = new Set(priorities);
  const first = plan.filter((g) => pset.has(g));
  const rest = plan.filter((g) => !pset.has(g));
  const extra = first.length ? [first[0]] : [];
  return first.concat(extra, rest);
}

/**
 * Genera la rutina completa.
 * @returns {{name, focus, weeks, days:[{day_index,name,is_rest,exercises:[]}]}}
 */
export function generateRoutine(profile) {
  const goal = PRESCRIPTION[profile.goal] ? profile.goal : 'musculo';
  const level = profile.level || 'principiante';
  const days = Math.max(1, Math.min(7, Number(profile.days_per_week) || 3));
  const perSession = exercisesPerSession(profile.minutes);
  const equipment = (profile.equipment && profile.equipment.length)
    ? profile.equipment : ['libre', 'maquina', 'corporal'];
  const banned = excludedNames(profile.limitations);
  const priorities = profile.priorities || [];

  /* Candidatos: el equipo del perfil menos lo vetado por las limitaciones. */
  const pool = POOL.filter((x) => equipment.includes(x.eq) && !banned.has(x.n));

  /* El principiante hace menos accesorios monoarticulares por sesión. */
  const uniCap = level === 'principiante' ? 1 : level === 'intermedio' ? 3 : 5;

  const split = SPLITS[days] || SPLITS[3];
  const trainingIdx = spreadDays(days);
  const used = new Set();          // evita repetir el mismo ejercicio en la semana
  const routineDays = [];

  for (let d = 0; d < 7; d++) {
    const slot = trainingIdx.indexOf(d);
    if (slot < 0) {
      routineDays.push({ day_index: d, name: 'Descanso', is_rest: true, exercises: [] });
      continue;
    }
    const tpl = split[slot % split.length];
    const plan = applyPriorities(tpl.plan, priorities);
    const chosen = [];
    let uniCount = 0;

    /* Una pasada por grupo; si un grupo no tiene opciones (por equipo o por
       limitaciones) se SALTA en vez de romper el generador. Se dan hasta dos
       vueltas al plan para poder llenar la sesión cuando hay pocos grupos. */
    for (let round = 0; round < 2 && chosen.length < perSession; round++) {
      for (let gi = 0; gi < plan.length && chosen.length < perSession; gi++) {
        const group = plan[gi];
        let opts = pool.filter((x) => x.g === group
          && !used.has(x.n)
          && !chosen.some((c) => c.n === x.n));
        if (uniCount >= uniCap) opts = opts.filter((x) => !x.uni);
        if (!opts.length) continue;               // grupo sin opciones → saltar
        /* Primero los básicos: dan más estímulo por minuto. */
        opts.sort((a, b) => (b.comp || 0) - (a.comp || 0));
        const pick = opts[0];
        chosen.push(pick);
        used.add(pick.n);
        if (pick.uni) uniCount++;
      }
      /* Si tras la primera vuelta la semana ya agotó el pool, se reciclan
         los nombres usados para poder seguir llenando sesiones. */
      if (chosen.length < perSession) used.clear();
    }

    routineDays.push({
      day_index: d,
      name: `${tpl.name}`,
      is_rest: false,
      exercises: chosen.map((x, i) => prescribe(x, i, goal, level)),
    });
  }

  return {
    name: routineName(goal, days),
    focus: goal,
    weeks: 8,
    days: routineDays,
  };
}

/** Convierte un ejercicio del POOL en una fila de routine_exercises. */
function prescribe(x, position, goal, level) {
  const kind = x.comp ? 'comp' : 'acc';
  const base = PRESCRIPTION[goal][kind];
  let sets = base.sets;
  if (level === 'principiante') sets = Math.max(2, sets - 1);
  else if (level === 'avanzado' && x.comp) sets = sets + 1;

  return {
    position,
    name: x.n,
    slug: x.en || null,
    muscle: x.g,
    equipment: x.eq,
    sets,
    rep_low: x.time ? 20 : base.low,
    rep_high: x.time ? 45 : base.high,
    rir: base.rir,
    rest_s: x.time ? 60 : base.rest,
    is_time: !!x.time,
  };
}

const GOAL_LABEL = { musculo: 'Músculo', fuerza: 'Fuerza', grasa: 'Definición', salud: 'Salud' };

function routineName(goal, days) {
  return `${GOAL_LABEL[goal] || 'Músculo'} · ${days} día${days === 1 ? '' : 's'}`;
}

/** Alternativas del mismo grupo, respetando equipo y limitaciones. */
export function alternatives(current, profile) {
  const equipment = (profile.equipment && profile.equipment.length)
    ? profile.equipment : ['libre', 'maquina', 'corporal'];
  const banned = excludedNames(profile.limitations);
  let alts = POOL.filter((x) => x.g === current.muscle && x.n !== current.name
    && equipment.includes(x.eq) && !banned.has(x.n));
  /* Si el equipo deja el grupo sin alternativas, se abre a todo el POOL pero
     se siguen respetando las limitaciones: el equipo es una preferencia, la
     articulación que duele no. */
  if (!alts.length) {
    alts = POOL.filter((x) => x.g === current.muscle && x.n !== current.name && !banned.has(x.n));
  }
  return alts;
}
