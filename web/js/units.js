/* ══════════════════════════════════════════════════════════════════════════
   units.js · Conversión kg/lb, cm/pies y formateo es-ES
   ──────────────────────────────────────────────────────────────────────────
   REGLA CANÓNICA: la base de datos guarda SIEMPRE kilogramos y centímetros.
   `profiles.units` es solo una preferencia de PRESENTACIÓN. Todo lo que entra
   por un input pasa por `fromInput()` y todo lo que se pinta pasa por
   `toDisplay()`. Jamás se escriben libras en `weight_kg`.
   ══════════════════════════════════════════════════════════════════════════ */

export const LB_PER_KG = 2.20462;
export const KG_PER_LB = 1 / LB_PER_KG;

/* Incrementos naturales de cada sistema: los discos de un gimnasio métrico
   suben de 2,5 en 2,5 kg (2 discos de 1,25); los imperiales de 5 en 5 lb. */
export const STEP = { kg: 2.5, lb: 5 };

/* Barra olímpica: 20 kg en métrico, 45 lb en imperial. Son barras distintas,
   no la misma cifra convertida, así que 45 lb se guarda como sus kg reales. */
export const BAR_KG = { kg: 20, lb: 45 * KG_PER_LB };

/* Juegos de discos reales de cada sistema, de mayor a menor. */
export const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

/* Colores de disco por tamaño (calibrados IWF en kg; convención de gimnasio en lb). */
export const PLATE_COLOR = {
  kg: { 25: '#E5484D', 20: '#4C8DFF', 15: '#FFB43D', 10: '#4BE08A', 5: '#E6EEF7', 2.5: '#9B7BFF', 1.25: '#8B9CB2' },
  lb: { 45: '#4C8DFF', 35: '#FFB43D', 25: '#4BE08A', 10: '#E6EEF7', 5: '#9B7BFF', 2.5: '#8B9CB2' },
};

/* ── Conversión ─────────────────────────────────────────────────────────── */

/** kg canónicos → número en las unidades del usuario. */
export function toDisplay(kg, units) {
  const v = Number(kg) || 0;
  return units === 'lb' ? v * LB_PER_KG : v;
}

/** Número escrito por el usuario → kg canónicos (3 decimales, sin ruido float). */
export function fromInput(value, units) {
  const v = num(value);
  const kg = units === 'lb' ? v * KG_PER_LB : v;
  return Math.round(kg * 1000) / 1000;
}

/** Etiqueta corta de la unidad de peso. */
export function wLabel(units) { return units === 'lb' ? 'lb' : 'kg'; }

/** Paso de incremento en unidades de presentación. */
export function step(units) { return STEP[units === 'lb' ? 'lb' : 'kg']; }

/** Redondea un valor de presentación al paso del sistema (2,5 kg / 5 lb). */
export function roundToStep(displayValue, units) {
  const s = step(units);
  return Math.round(displayValue / s) * s;
}

/** Peso de la barra en unidades de presentación (20 kg → 20; 45 lb → 45). */
export function barDisplay(units) {
  return units === 'lb' ? 45 : 20;
}

/** Peso de la barra en kg canónicos. */
export function barKg(units) {
  return BAR_KG[units === 'lb' ? 'lb' : 'kg'];
}

/* ── Formateo es-ES ─────────────────────────────────────────────────────── */

/** Parsea coma o punto decimal indistintamente. */
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isNaN(x) ? 0 : x;
}

/** Formatea con coma decimal y sin ceros de relleno. Máx. `dec` decimales. */
export function fmtNum(v, dec = 1) {
  const n = Number(v) || 0;
  return n.toLocaleString('es-ES', { maximumFractionDigits: dec });
}

/** Entero con separador de miles es-ES. */
export function fmtInt(v) {
  return Math.round(Number(v) || 0).toLocaleString('es-ES');
}

/** Segundos → "m:ss". */
export function fmtTime(s) {
  const t = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(t / 60);
  const r = t % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/* ── Altura: cm canónicos ↔ pies/pulgadas ──────────────────────────────── */

/** cm → {ft, in} redondeado a la pulgada. */
export function cmToFtIn(cm) {
  const totalIn = Math.round((Number(cm) || 0) / 2.54);
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
}

/** pies + pulgadas → cm canónicos (1 decimal). */
export function ftInToCm(ft, inch) {
  const totalIn = (Number(ft) || 0) * 12 + (Number(inch) || 0);
  return Math.round(totalIn * 2.54 * 10) / 10;
}

/** Altura canónica → texto en las unidades del usuario. */
export function fmtHeight(cm, units) {
  if (units === 'lb') {
    const { ft, in: i } = cmToFtIn(cm);
    return `${ft}′ ${i}″`;
  }
  return `${fmtNum(cm, 0)} cm`;
}

/* ── Calculadora de discos ─────────────────────────────────────────────────
   Trabaja íntegramente en unidades de presentación: reparte lo que sobra de
   la barra entre los dos lados y devuelve la lista de discos de un lado.
   `rest` es lo que no cuadra con el juego disponible.                      */
export function plateSplit(totalDisplay, units, barOverrideDisplay) {
  const u = units === 'lb' ? 'lb' : 'kg';
  const bar = barOverrideDisplay == null ? barDisplay(u) : barOverrideDisplay;
  const per = Math.round(((totalDisplay - bar) / 2) * 100) / 100;
  const list = [];
  let rest = per;
  if (per >= 0) {
    for (const p of PLATES[u]) {
      while (rest >= p - 0.001) {
        list.push(p);
        rest = Math.round((rest - p) * 100) / 100;
      }
    }
  }
  return { list, rest: per < 0 ? per : rest, per, bar };
}

/* ── e1RM (Epley) ───────────────────────────────────────────────────────── */

/** 1RM estimado en kg canónicos a partir de kg y repeticiones. */
export function e1rm(kg, reps) {
  const w = Number(kg) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return null;
  return Math.round(w * (1 + r / 30) * 100) / 100;
}
