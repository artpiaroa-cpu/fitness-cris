/* ══════════════════════════════════════════════════════════════════════════
   suggest.js · Peso propuesto para CUALQUIER ejercicio, no solo los básicos
   ──────────────────────────────────────────────────────────────────────────
   Hasta ahora solo los cuatro levantamientos del 5/3/1 llegaban a la sesión
   con un peso calculado; el resto salía con "Elige el peso". Aquí vive la
   cuenta que lo arregla, y es una sola línea de aritmética:

       peso = 1RM del ejercicio × porcentaje que toca a esas repeticiones

   El porcentaje lo pone `units.pctForReps()` (la inversa de las mismas
   fórmulas con las que la app estima el 1RM). Lo que aporta este módulo es
   todo lo demás: de qué fila de `lift_maxes` sale ese 1RM, cuándo NO hay que
   proponer nada, y a qué peso cargable se redondea.

   No toca el DOM ni la base de datos. Determinista: cero Math.random.

   ── LA DUPLICIDAD DE `lift_maxes` ────────────────────────────────────────
   La columna `lift` es texto libre y hoy conviven dos familias de claves:

     · claves de básico del 5/3/1 · 'banca' | 'sentadilla' | 'peso_muerto' | 'militar'
     · NOMBRES de ejercicio del POOL · 'Press de banca con barra', 'Prensa de
       piernas', 'Jalón al pecho en polea'…

   'banca' y 'Press de banca con barra' son EL MISMO levantamiento. La regla,
   aquí y en toda la app:

     1. se busca primero por NOMBRE de ejercicio, porque es la clave que sirve
        para los 52 ejercicios del POOL y no solo para cuatro;
     2. si no hay fila con ese nombre, se cae a la CLAVE DE BÁSICO (strength.js
        ya sabe qué nombre encarna cada clave con LIFT_EXERCISE);
     3. cuando se ESCRIBE el máximo de un básico se escriben LAS DOS CLAVES
        (ver `liftKeys`), para que no vuelvan a desincronizarse.

   El Training Max queda FUERA de esta resolución: lo lee el 5/3/1 por su clave
   de básico y solo se mueve al cerrar una ola. Aquí solo se resuelve el 1RM.
   ══════════════════════════════════════════════════════════════════════════ */

import * as U from './units.js';
import { LIFT_EXERCISE, liftForExercise, loadable } from './strength.js';

/**
 * Claves de `lift_maxes` que representan a un ejercicio.
 * Para los cuatro básicos son DOS (nombre y clave de la ola) y hay que
 * escribirlas juntas; para el resto, una sola.
 * @returns {string[]} nombre primero, que es el que manda al leer
 */
export function liftKeys(name) {
  const lift = liftForExercise(name);
  return lift ? [name, lift] : [name];
}

/** ¿Este nombre de ejercicio es uno de los cuatro básicos de la ola? */
export function isBasicName(name) {
  return !!liftForExercise(name);
}

/** Nombre de ejercicio de una clave de `lift_maxes` (básico → su ejercicio). */
export function exerciseNameForKey(key) {
  return LIFT_EXERCISE[key] || key;
}

/**
 * 1RM guardado de un ejercicio, con la fila de la que sale.
 * Primero por nombre, después por clave de básico (ver cabecera).
 * @param {object} maxes  mapa clave → fila de lift_maxes (kg canónicos)
 * @param {string} name   nombre de ejercicio del POOL
 * @returns {{kg:number, key:string, source:string, row:object}|null}
 */
export function resolveE1rm(maxes, name) {
  const m = maxes || {};
  for (const k of liftKeys(name)) {
    const row = m[k];
    const kg = row ? Number(row.e1rm_kg) || 0 : 0;
    if (kg > 0) return { kg, key: k, source: row.source || '', row };
  }
  return null;
}

/** Training Max guardado de un básico, o 0. Se lee por su clave de ola. */
export function resolveTm(maxes, name) {
  const m = maxes || {};
  const lift = liftForExercise(name);
  const row = (lift && m[lift]) || m[name];
  return row ? Number(row.training_max_kg) || 0 : 0;
}

/**
 * Peso propuesto para una serie de trabajo.
 *
 * @param {object}  o
 * @param {object}  o.maxes      mapa de lift_maxes indexado por clave
 * @param {string}  o.name       nombre del ejercicio
 * @param {string}  o.equipment  'libre' | 'maquina' | 'corporal'
 * @param {boolean} o.isTime     true si se mide en segundos (planchas)
 * @param {number}  o.reps       repeticiones objetivo (la parte ALTA del rango)
 * @param {number}  o.rir        repeticiones en reserva prescritas
 * @param {'kg'|'lb'} o.units    unidades de presentación del perfil
 * @returns {{kind:'peso', pct:number, e1rmKg:number, kg:number, display:number}
 *          |{kind:'corporal'}|null}
 */
export function suggestWeight({ maxes, name, equipment, isTime, reps, rir, units }) {
  /* Una plancha no se propone en kilos: lo que se prescribe son segundos. */
  if (isTime) return null;

  /* Peso corporal: el 1RM que se guarda de unas dominadas o unos fondos suele
     ser peso AÑADIDO (el cinturón), no la carga total que mueve el cuerpo.
     Tratarlo como carga absoluta propondría "haz dominadas con 12 kg" cuando
     lo guardado eran justamente esos 12 kg de más. Sin manera de distinguirlo,
     no se propone nada y se dice lo que hay que cargar: el propio cuerpo. */
  if (equipment === 'corporal') return { kind: 'corporal' };

  const found = resolveE1rm(maxes, name);
  if (!found) return null;

  const u = units === 'lb' ? 'lb' : 'kg';
  const pct = U.pctForReps(reps, rir);
  const raw = U.toDisplay(found.kg, u) * pct;

  /* Redondeo al incremento cargable del sistema (5 lb / 2,5 kg). Los cuatro
     básicos van con barra, así que ahí se usa `loadable`, que además nunca
     baja de la barra vacía; en una polea o unas mancuernas ese suelo no existe
     y aplicarlo convertiría un curl de 15 lb en uno de 45. */
  const display = isBasicName(name)
    ? loadable(raw, u)
    : Math.max(U.step(u), U.roundToStep(raw, u));

  return {
    kind: 'peso',
    pct,
    e1rmKg: found.kg,
    source: found.source,
    key: found.key,
    display,
    kg: U.fromInput(display, u),
  };
}

/**
 * De dónde sale el peso propuesto, en una línea.
 * "~75 % de tu 1RM (240 lb)". El 1RM se pinta con su unidad porque es un
 * número distinto del peso de la serie y confundirlos es el error típico.
 */
export function suggestLabel(s, units) {
  if (!s || s.kind !== 'peso') return '';
  const u = units === 'lb' ? 'lb' : 'kg';
  return `~${U.fmtNum(s.pct * 100, 0)} % de tu 1RM `
    + `(${U.fmtNum(U.toDisplay(s.e1rmKg, u), 0)} ${U.wLabel(u)})`;
}

/**
 * Entradas de `lift_maxes` listas para pintar en Ajustes › Fuerza.
 * Fusiona las dos claves de un básico en UNA sola entrada (que es lo que ve el
 * usuario: un levantamiento, no dos filas que dicen lo mismo) y ordena por
 * peso, dejando al final lo que aún no tiene dato.
 *
 * @param {object} maxes mapa de lift_maxes
 * @param {string[]} lifts claves de básico del 5/3/1, en orden
 * @param {object} liftLabel clave de básico → etiqueta corta
 * @returns {[{id,keys,name,label,e1rmKg,tmKg,source,basic}]}
 */
export function strengthEntries(maxes, lifts, liftLabel) {
  const m = maxes || {};
  const out = [];
  const seen = new Set();

  (lifts || []).forEach((l) => {
    const name = LIFT_EXERCISE[l] || l;
    const found = resolveE1rm(m, name);
    const row = m[name] || m[l] || {};
    out.push({
      id: l,
      keys: liftKeys(name),
      name,
      label: (liftLabel && liftLabel[l]) || name,
      e1rmKg: found ? found.kg : 0,
      tmKg: resolveTm(m, name),
      source: found ? found.source : (row.source || ''),
      basic: true,
    });
    seen.add(l);
    seen.add(name);
  });

  Object.keys(m).forEach((k) => {
    if (seen.has(k)) return;
    seen.add(k);
    const row = m[k] || {};
    out.push({
      id: k,
      keys: liftKeys(k),
      name: k,
      label: k,
      e1rmKg: Number(row.e1rm_kg) || 0,
      tmKg: Number(row.training_max_kg) || 0,
      source: row.source || '',
      basic: false,
    });
  });

  /* De más a menos peso; lo que no tiene 1RM, al final y por orden alfabético
     (los cuatro básicos vacíos tienen que seguir viéndose para poder rellenarlos). */
  return out.sort((a, b) => (b.e1rmKg - a.e1rmKg)
    || a.label.localeCompare(b.label, 'es'));
}
