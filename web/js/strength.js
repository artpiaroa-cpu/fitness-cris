/* ══════════════════════════════════════════════════════════════════════════
   strength.js · Modo fuerza por porcentajes (5/3/1 en 4 días torso/pierna)
   ──────────────────────────────────────────────────────────────────────────
   Aquí vive TODO el cálculo de la ola de fuerza. No toca el DOM ni la base de
   datos: entra un Training Max y una semana, y salen las series con su
   porcentaje, sus repeticiones y su peso ya redondeado a algo cargable.

   Tres decisiones que conviene tener claras:

   1. LOS PORCENTAJES VAN SOBRE EL TRAINING MAX, no sobre el 1RM. El TM es
      ~90 % del e1RM: deja margen para fallar un día malo sin que se caiga el
      programa. Si el TM está inflado, la serie AMRAP lo delata (regla de
      reajuste de la semana 3, ver `needsReset`).

   2. EL PESO SE CALCULA EN UNIDADES DE PRESENTACIÓN y se redondea al
      incremento cargable de verdad (5 lb con barra de 45 lb · 2,5 kg con
      barra de 20 kg). Primero se redondea el propio TM, porque un TM de
      244,99 lb (que es lo que sale de convertir 111,13 kg) daría porcentajes
      distintos al de 245 lb por puro ruido decimal. Después se guarda el
      resultado en kg canónicos, que es lo único que viaja a la base.

   3. LA OLA NO SE GUARDA EN LA RUTINA. La rutina (routine_exercises) solo
      dice qué levantamiento toca cada día; el peso de cada serie se recalcula
      al abrir la sesión con el TM y la semana actuales. Así cambiar de semana
      no obliga a reescribir la rutina entera.

   Determinista a propósito: cero Math.random.
   ══════════════════════════════════════════════════════════════════════════ */

import * as U from './units.js';
import { POOL } from './catalog.js';
import { excludedNames } from './generator.js';

/* ══ LOS CUATRO LEVANTAMIENTOS ═══════════════════════════════════════════ */

export const LIFTS = ['banca', 'sentadilla', 'peso_muerto', 'militar'];

export const LIFT_LABEL = {
  banca: 'Press de banca',
  sentadilla: 'Sentadilla',
  peso_muerto: 'Peso muerto',
  militar: 'Press militar',
};

/** Ejercicio del POOL que encarna cada levantamiento. */
export const LIFT_EXERCISE = {
  banca: 'Press de banca con barra',
  sentadilla: 'Sentadilla con barra',
  peso_muerto: 'Peso muerto con barra',
  militar: 'Press militar con barra',
};

const EX_TO_LIFT = {};
LIFTS.forEach((l) => { EX_TO_LIFT[LIFT_EXERCISE[l]] = l; });

/** Nombre de ejercicio → levantamiento de la ola, o null si no es uno. */
export function liftForExercise(name) {
  return EX_TO_LIFT[name] || null;
}

/* ══ LA OLA ══════════════════════════════════════════════════════════════
   Cuatro semanas. Las tres primeras terminan en una serie AMRAP (el "+"),
   que es la que mide de verdad cómo va el programa. La cuarta es descarga:
   sin AMRAP, ni una repetición de más.                                     */

export const WEEKS = {
  1: {
    name: '5s',
    sets: [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: 5, amrap: true }],
  },
  2: {
    name: '3s',
    sets: [{ pct: 0.70, reps: 3 }, { pct: 0.80, reps: 3 }, { pct: 0.90, reps: 3, amrap: true }],
  },
  3: {
    name: '5/3/1',
    sets: [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: 1, amrap: true }],
  },
  4: {
    name: 'descarga',
    sets: [{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 5 }],
  },
};

/** Calentamiento antes de las series de trabajo. */
export const WARMUP = [{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 3 }];

/** Series de respaldo tras la AMRAP, al porcentaje más bajo de la semana. */
export const BACKOFFS = 2;

/** Subida del TM al cerrar una ola, por levantamiento y sistema de unidades. */
export const TM_INC = {
  banca: { kg: 2.5, lb: 5 },
  militar: { kg: 2.5, lb: 5 },
  sentadilla: { kg: 5, lb: 10 },
  peso_muerto: { kg: 5, lb: 10 },
};

/** Repeticiones mínimas en la AMRAP de la semana 3 antes de sospechar del TM. */
export const RESET_REPS = 3;

export function weekName(week) {
  return (WEEKS[week] || WEEKS[1]).name;
}

/** "Ola 2 · Semana 3 · 5/3/1" */
export function waveLabel(cycleNum, week) {
  return `Ola ${cycleNum || 1} · Semana ${week || 1} · ${weekName(week)}`;
}

/* ══ REDONDEO A PESO CARGABLE ════════════════════════════════════════════ */

/**
 * Redondea un peso de presentación a algo que se pueda montar de verdad:
 * el incremento natural del sistema (5 lb / 2,5 kg, que son dos discos de
 * 2,5 lb o de 1,25 kg) y nunca por debajo de la barra vacía.
 */
export function loadable(displayValue, units) {
  const u = units === 'lb' ? 'lb' : 'kg';
  return Math.max(U.barDisplay(u), U.roundToStep(displayValue, u));
}

/** Training Max en unidades de presentación, ya redondeado al incremento. */
export function tmDisplay(tmKg, units) {
  return U.roundToStep(U.toDisplay(tmKg, units), units);
}

/**
 * Series de un levantamiento para una semana concreta.
 * @param {number} tmKg  Training Max en kg canónicos
 * @param {number} week  1-4
 * @param {'kg'|'lb'} units
 * @returns {{tm:number, week:number, name:string,
 *            warm:[{pct,reps,display,kg}],
 *            work:[{pct,reps,amrap,kind,display,kg}]}}
 */
export function wavePlan(tmKg, week, units) {
  const u = units === 'lb' ? 'lb' : 'kg';
  const w = WEEKS[week] || WEEKS[1];
  const tm = tmDisplay(tmKg, u);

  const mk = (s, kind) => {
    const display = loadable(tm * s.pct, u);
    return {
      pct: s.pct,
      reps: s.reps,
      amrap: !!s.amrap,
      kind,
      display,
      kg: U.fromInput(display, u),
    };
  };

  /* En descarga las propias series de trabajo son el 40/50/60 %: repetir el
     calentamiento sería hacer la sesión dos veces. */
  const warm = w.sets.some((s) => s.amrap) ? WARMUP.map((s) => mk(s, 'calentamiento')) : [];

  const work = w.sets.map((s) => mk(s, 'trabajo'));
  if (w.sets.some((s) => s.amrap)) {
    const base = w.sets[0];
    for (let i = 0; i < BACKOFFS; i++) work.push(mk({ pct: base.pct, reps: base.reps }, 'respaldo'));
  }
  return { tm, week: WEEKS[week] ? week : 1, name: w.name, warm, work };
}

/** Índice de la serie AMRAP dentro de `work`, o -1 si la semana no lleva. */
export function amrapIndex(plan) {
  return plan.work.findIndex((s) => s.amrap);
}

/* ══ PROGRESIÓN ══════════════════════════════════════════════════════════ */

/** TM tras cerrar una ola: +5 lb (2,5 kg) en press, +10 lb (5 kg) en pierna. */
export function nextTm(tmKg, lift, units) {
  const u = units === 'lb' ? 'lb' : 'kg';
  const inc = (TM_INC[lift] || TM_INC.banca)[u];
  return U.fromInput(tmDisplay(tmKg, u) + inc, u);
}

/** TM bajado un 10 % (regla de reajuste), redondeado a peso cargable. */
export function dropTm(tmKg, units) {
  const u = units === 'lb' ? 'lb' : 'kg';
  return U.fromInput(U.roundToStep(tmDisplay(tmKg, u) * 0.9, u), u);
}

/** TM recomendado a partir de un e1RM: el 90 %, redondeado al incremento. */
export function tmFromE1rm(e1rmKg, units) {
  const u = units === 'lb' ? 'lb' : 'kg';
  return U.fromInput(U.roundToStep(U.toDisplay(e1rmKg, u) * 0.9, u), u);
}

/**
 * ¿La AMRAP de la semana 3 delata un TM demasiado alto?
 * Menos de 3 repeticiones al 95 % significa que el 95 % ya está muy cerca del
 * máximo real: el TM va por delante de la fuerza de verdad.
 */
export function needsReset(week, reps) {
  return Number(week) === 3 && Number(reps) > 0 && Number(reps) < RESET_REPS;
}

/**
 * e1RM de una serie AMRAP. Las repeticiones que sobran (RIR) cuentan como
 * repeticiones hechas: una serie de 8 dejándose 2 equivale a un 10 al fallo.
 */
export function amrapE1rm(kg, reps, rir) {
  const total = (Number(reps) || 0) + (rir == null ? 0 : Math.max(0, Number(rir) || 0));
  return U.e1rm(kg, total);
}

/* ══ LA PLANTILLA DE 4 DÍAS ══════════════════════════════════════════════
   Torso pesado · Pierna pesado · Torso ligero · Pierna ligero. "Pesado" y
   "ligero" se refieren al carácter del día, no a la ola: los cuatro
   levantamientos llevan los mismos porcentajes. Lo que cambia es el
   accesorio: los días pesados rematan con empuje y cuádriceps, los ligeros
   cargan el volumen de tracción y cadena posterior, que es lo que sostiene
   la banca y la sentadilla sin robarles recuperación.

   Los accesorios se declaran por NOMBRE del POOL, con sus series fijas. No
   pasan por el generador de hipertrofia a propósito: en un programa de
   porcentajes el accesorio es un apoyo estable, no algo que rote cada
   semana.                                                                  */

const A = (name, sets, low, high, rir, rest, role) => ({ name, sets, low, high, rir, rest, role });

export const TEMPLATE = [
  {
    day_index: 0,
    name: 'Torso pesado',
    lift: 'banca',
    accessories: [
      A('Press inclinado con mancuernas', 3, 6, 10, 2, 120, 'secundario'),
      A('Remo con barra', 3, 6, 10, 2, 120, 'secundario'),
      A('Extensión en polea alta', 3, 10, 15, 1, 75, 'aislamiento'),
      A('Elevaciones laterales', 3, 12, 15, 1, 60, 'aislamiento'),
    ],
  },
  {
    day_index: 1,
    name: 'Pierna pesado',
    lift: 'sentadilla',
    accessories: [
      A('Prensa de piernas', 3, 8, 12, 2, 120, 'secundario'),
      A('Curl femoral tumbada', 3, 10, 15, 1, 75, 'aislamiento'),
      A('Elevación de talones de pie', 3, 12, 15, 1, 60, 'aislamiento'),
      A('Plancha frontal', 3, 20, 45, 2, 60, 'aislamiento'),
    ],
  },
  {
    day_index: 3,
    name: 'Torso ligero',
    lift: 'militar',
    accessories: [
      A('Dominadas', 3, 6, 10, 2, 120, 'secundario'),
      A('Remo sentado en polea', 3, 10, 12, 2, 100, 'secundario'),
      A('Curl con barra', 3, 10, 12, 1, 75, 'aislamiento'),
      A('Pájaros en polea', 3, 12, 15, 1, 60, 'aislamiento'),
    ],
  },
  {
    day_index: 4,
    name: 'Pierna ligero',
    lift: 'peso_muerto',
    accessories: [
      A('Hip thrust con barra', 3, 8, 12, 2, 120, 'secundario'),
      A('Curl femoral sentada', 3, 10, 15, 1, 75, 'aislamiento'),
      A('Zancadas con mancuernas', 3, 8, 10, 2, 100, 'secundario'),
      A('Crunch en polea', 3, 12, 15, 1, 60, 'aislamiento'),
    ],
  },
];

const BY_NAME = new Map(POOL.map((x) => [x.n, x]));

/**
 * Sustituto de un accesorio que el equipo o una molestia dejan fuera.
 *
 * Se busca primero por PATRÓN de movimiento (unas dominadas se cambian por un
 * jalón, no por un peso muerto) y solo después por grupo muscular. Los cuatro
 * levantamientos de la ola nunca son candidatos: ya tienen su día y su
 * porcentaje, y meterlos de accesorio duplicaría la carga de la semana.
 * Devuelve null si no hay nada válido, y entonces el accesorio no entra:
 * mejor una sesión de cuatro ejercicios que uno que duele.
 */
function substitute(item, equipment, banned, used, reserved) {
  const ok = (x) => x.n !== item.n && !EX_TO_LIFT[x.n]
    && equipment.includes(x.eq) && !banned.has(x.n)
    && !used.has(x.n) && !reserved.has(x.n);
  return POOL.find((x) => ok(x) && x.pat === item.pat)
    || POOL.find((x) => ok(x) && x.g === item.g)
    || null;
}

/* Repeticiones por defecto cuando el recambio no se mide igual que el
   original: un crunch no se hace "de 20 a 45 segundos" solo porque venga a
   sustituir a una plancha. */
const DEFAULT_REPS = { time: [20, 45], reps: [12, 15] };

/** Fila de routine_exercises a partir de una entrada del POOL. */
function row(x, position, { sets, low, high, rir, rest, role, scheme }) {
  return {
    position,
    name: x.n,
    slug: x.en || null,
    muscle: x.g,
    equipment: x.eq,
    role,
    sets,
    rep_low: low,
    rep_high: high,
    rir,
    rest_s: rest,
    is_time: !!x.time,
    scheme: scheme || null,
  };
}

/** Documentación de la ola que se guarda en `scheme` para poder auditarla. */
function waveScheme(lift) {
  return Object.keys(WEEKS).map((k) => ({
    kind: 'ola',
    lift,
    semana: Number(k),
    nombre: WEEKS[k].name,
    series: WEEKS[k].sets.map((s) => ({ pct: s.pct, reps: s.reps, amrap: !!s.amrap })),
    respaldo: WEEKS[k].sets.some((s) => s.amrap) ? BACKOFFS : 0,
  }));
}

/**
 * Construye la rutina 5/3/1 completa, lista para db.saveRoutine().
 * `focus` es '531': es la marca por la que la sesión sabe que el ejercicio
 * principal se rige por porcentajes y no por el historial.
 */
export function build531Routine(profile) {
  const p = profile || {};
  const units = p.units === 'lb' ? 'lb' : 'kg';
  const equipment = (p.equipment && p.equipment.length) ? p.equipment : ['libre', 'maquina', 'corporal'];
  const banned = excludedNames(p.limitations);
  const notes = [];
  if (!equipment.includes('libre')) {
    notes.push('El 5/3/1 se apoya en cuatro levantamientos con barra. Se mantienen aunque no '
      + 'hayas marcado peso libre: sin barra, este programa no tiene sentido.');
  }

  const used = new Set();
  /* Accesorios que ya tienen su sitio en otro día: un recambio no debe
     robarles el hueco y acabar repitiendo el mismo ejercicio dos veces. */
  const reserved = new Set();
  TEMPLATE.forEach((t) => t.accessories.forEach((a) => reserved.add(a.name)));
  const days = [];

  for (let d = 0; d < 7; d++) {
    const tpl = TEMPLATE.find((t) => t.day_index === d);
    if (!tpl) {
      days.push({ day_index: d, name: 'Descanso', is_rest: true, exercises: [] });
      continue;
    }
    const main = BY_NAME.get(LIFT_EXERCISE[tpl.lift]);
    const exercises = [];
    /* 3 series de trabajo + 2 de respaldo. En descarga son 3, y eso lo
       resuelve la sesión al recalcular la ola: aquí se guarda el máximo. */
    exercises.push(row(main, 0, {
      sets: WEEKS[1].sets.length + BACKOFFS,
      low: 1, high: 5, rir: 1, rest: 210, role: 'principal',
      scheme: waveScheme(tpl.lift),
    }));
    used.add(main.n);

    tpl.accessories.forEach((acc) => {
      const orig = BY_NAME.get(acc.name);
      if (!orig) return;
      let x = orig;
      let low = acc.low;
      let high = acc.high;
      if (!equipment.includes(x.eq) || banned.has(x.n)) {
        const alt = substitute(x, equipment, banned, used, reserved);
        if (!alt) {
          notes.push(`${acc.name} se ha quitado del día ${tpl.name.toLowerCase()}: no encaja con `
            + 'tu equipo o con las zonas que hay que cuidar, y no queda recambio.');
          return;
        }
        notes.push(`${acc.name} se ha cambiado por ${alt.n} en ${tpl.name.toLowerCase()}.`);
        x = alt;
        /* Si uno se mide en segundos y el otro en repeticiones, las cifras del
           original no valen. */
        if (!!x.time !== !!orig.time) {
          [low, high] = DEFAULT_REPS[x.time ? 'time' : 'reps'];
        }
      }
      used.add(x.n);
      exercises.push(row(x, exercises.length, {
        sets: acc.sets, low, high, rir: acc.rir, rest: acc.rest, role: acc.role,
      }));
    });

    days.push({ day_index: d, name: tpl.name, is_rest: false, exercises });
  }

  return {
    name: `Fuerza 5/3/1 · Torso / Pierna · 4 días`,
    focus: '531',
    weeks: 4,
    structure: 'upper_lower',
    units,
    days,
    notes,
  };
}

/** ¿Es una rutina de porcentajes? */
export function is531(routine) {
  return !!routine && routine.focus === '531';
}
