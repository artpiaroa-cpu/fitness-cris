/* ══════════════════════════════════════════════════════════════════════════
   db.js · Cliente Supabase y todas las consultas
   ──────────────────────────────────────────────────────────────────────────
   Toda la persistencia de datos de entreno vive aquí. localStorage solo se usa
   para dos cosas: preferencias volátiles de interfaz (vista activa, ejercicio
   seleccionado) y la COLA DE ESCRITURAS pendientes cuando no hay red.

   La clave `sb_publishable_…` es publicable por diseño: identifica el proyecto
   y no da más permisos que los que concede RLS, que filtra por auth.uid().
   ══════════════════════════════════════════════════════════════════════════ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://owhxwqktbkpiqrnqnkhn.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_iCrXXInKmbVYpd1TXs1Xfw_og_gqzQ5';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,        // la sesión sobrevive al cierre de la pestaña
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/* ══ Perfiles disponibles en el selector ═════════════════════════════════ */
export const PERFILES = [
  { email: 'cris@entreno.app', name: 'Cris' },
  { email: 'ella@entreno.app', name: 'Ella' },
  { email: 'tres@entreno.app', name: 'Perfil 3' },
];

/* ══ Errores en español ══════════════════════════════════════════════════ */

/** Traduce cualquier error de Supabase a una frase clara. Nunca un stack. */
export function msgError(err) {
  if (!err) return 'Algo no ha ido bien. Inténtalo otra vez.';
  const raw = String(err.message || err.error_description || err || '');
  const m = raw.toLowerCase();
  if (m.includes('failed to fetch') || m.includes('networkerror')
    || m.includes('load failed') || m.includes('network request failed')) {
    return 'Sin conexión. Comprueba la red e inténtalo otra vez.';
  }
  if (m.includes('invalid login credentials')) return 'Contraseña incorrecta.';
  if (m.includes('email not confirmed')) return 'Esta cuenta todavía no está confirmada.';
  if (m.includes('should be at least') || m.includes('password should be')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (m.includes('same as the old') || m.includes('should be different')) {
    return 'La contraseña nueva tiene que ser distinta de la actual.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Demasiados intentos. Espera unos segundos.';
  }
  if (m.includes('jwt') || m.includes('session')) {
    return 'La sesión ha caducado. Vuelve a entrar.';
  }
  return 'No se ha podido completar. Inténtalo otra vez.';
}

function isNetworkError(err) {
  const m = String((err && err.message) || err || '').toLowerCase();
  return m.includes('failed to fetch') || m.includes('networkerror')
    || m.includes('load failed') || m.includes('network request failed');
}

/* ══ Autenticación ══════════════════════════════════════════════════════ */

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return (data && data.session && data.session.user) || null;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((event, session) => cb(event, session));
}

/* ══ Perfil ═════════════════════════════════════════════════════════════ */

export async function getProfile(id) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Guarda cambios del perfil. `patch` va siempre en unidades canónicas. */
export async function saveProfile(id, patch) {
  const { data, error } = await supabase.from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/* ══ Rutinas ════════════════════════════════════════════════════════════ */

/**
 * Escribe una rutina generada. Desactiva las anteriores para que solo haya
 * una activa, y crea días y ejercicios en dos inserciones en bloque.
 */
export async function saveRoutine(profileId, routine) {
  await supabase.from('routines').update({ active: false })
    .eq('profile_id', profileId).eq('active', true);

  const { data: rt, error: e1 } = await supabase.from('routines').insert({
    profile_id: profileId,
    name: routine.name,
    focus: routine.focus,
    weeks: routine.weeks || 8,
    active: true,
  }).select().single();
  if (e1) throw e1;

  const dayRows = routine.days.map((d) => ({
    routine_id: rt.id, day_index: d.day_index, name: d.name, is_rest: !!d.is_rest,
  }));
  const { data: days, error: e2 } = await supabase.from('routine_days')
    .insert(dayRows).select();
  if (e2) throw e2;

  const byIndex = new Map(days.map((d) => [d.day_index, d]));
  const exRows = [];
  routine.days.forEach((d) => {
    const row = byIndex.get(d.day_index);
    if (!row) return;
    (d.exercises || []).forEach((x) => exRows.push({ ...x, day_id: row.id }));
  });
  if (exRows.length) {
    const { error: e3 } = await supabase.from('routine_exercises').insert(exRows);
    if (e3) throw e3;
  }
  return rt.id;
}

/** Rutina activa con sus días y ejercicios, ya ordenados. */
export async function getActiveRoutine(profileId) {
  const { data, error } = await supabase.from('routines')
    .select(`id, name, focus, weeks, active, created_at,
             routine_days ( id, day_index, name, is_rest,
               routine_exercises ( id, position, name, slug, muscle, equipment,
                                   sets, rep_low, rep_high, rir, rest_s, is_time ) )`)
    .eq('profile_id', profileId).eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.routine_days.sort((a, b) => a.day_index - b.day_index);
  data.routine_days.forEach((d) => {
    d.routine_exercises.sort((a, b) => a.position - b.position);
  });
  return data;
}

/** Cambia un ejercicio de la rutina por otro (cambio inteligente). */
export async function swapRoutineExercise(exerciseId, patch) {
  const { error } = await supabase.from('routine_exercises').update(patch).eq('id', exerciseId);
  if (error) throw error;
}

/* ══ Sesiones de entreno ════════════════════════════════════════════════ */

/** Sesión sin cerrar de este día (para reanudar tras recargar). */
export async function getOpenSession(profileId, dayId) {
  const { data, error } = await supabase.from('sessions')
    .select('*').eq('profile_id', profileId).eq('day_id', dayId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Alta de sesión con `id` generado en el cliente.
 *
 * Es un upsert, no un insert, por un motivo importante: si el gimnasio no
 * tiene cobertura, la fila de la sesión se encola igual que las series. Como
 * el id ya lo conoce el cliente, las series pueden referenciarlo desde el
 * primer momento y la cola (que es FIFO) inserta la sesión antes que sus
 * series, así que la clave ajena siempre se cumple. Sin esto, entrenar sin
 * cobertura perdería todas las series de la sesión.
 */
export async function upsertSession(row) {
  const { error } = await supabase.from('sessions').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

/** Series ya registradas de una sesión, para reconstruir la pantalla. */
export async function getSessionSets(sessionId) {
  const { data, error } = await supabase.from('session_sets')
    .select('*').eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Alta o actualización de una serie. El `id` lo genera el cliente, así que la
 * operación es idempotente: reintentarla desde la cola offline no duplica
 * filas, solo reescribe la misma.
 * `weight_kg` llega SIEMPRE en kg canónicos.
 */
export async function upsertSet(row) {
  const { error } = await supabase.from('session_sets').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export async function finishSession(sessionId, patch) {
  const { error } = await supabase.from('sessions').update(patch).eq('id', sessionId);
  if (error) throw error;
}

/* ══ Notas por ejercicio ════════════════════════════════════════════════ */

export async function getNotes(profileId) {
  const { data, error } = await supabase.from('exercise_notes')
    .select('exercise, note').eq('profile_id', profileId);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[r.exercise] = r.note; });
  return map;
}

export async function saveNote(profileId, exercise, note) {
  const { error } = await supabase.from('exercise_notes').upsert({
    profile_id: profileId, exercise, note, updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,exercise' });
  if (error) throw error;
}

/* ══ Historial real por ejercicio ═══════════════════════════════════════ */

/**
 * Mejor serie de cada una de las últimas `limit` sesiones en las que se
 * registró este ejercicio. Datos reales de session_sets: si no hay nada,
 * devuelve [] y la interfaz muestra un estado vacío honesto.
 */
export async function getExerciseHistory(profileId, exercise, limit = 10) {
  const { data, error } = await supabase.from('session_sets')
    .select('weight_kg, reps, seconds, rir, done, sessions!inner(id, started_at, profile_id)')
    .eq('exercise', exercise).eq('done', true)
    .eq('sessions.profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw error;

  /* Agrupa por sesión y se queda con la mejor serie de cada una. "Mejor" es
     el e1RM más alto en peso, o los segundos más altos si es isométrico. */
  const bySession = new Map();
  (data || []).forEach((r) => {
    const s = r.sessions;
    if (!s) return;
    const score = r.seconds != null && !r.weight_kg
      ? Number(r.seconds) || 0
      : (Number(r.weight_kg) || 0) * (1 + (Number(r.reps) || 0) / 30);
    const cur = bySession.get(s.id);
    if (!cur || score > cur.score) {
      bySession.set(s.id, { score, started_at: s.started_at, ...r });
    }
  });
  return Array.from(bySession.values())
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at))
    .slice(-limit);
}

/**
 * Mejor serie de la ÚLTIMA sesión en que se hizo cada uno de `exercises`.
 * Es lo que alimenta la columna Auto y el aviso de "la última vez": si un
 * ejercicio no tiene historial no aparece en el mapa, y la interfaz lo dice
 * en vez de inventarse una carga.
 */
export async function getLastBestFor(profileId, exercises) {
  if (!exercises || !exercises.length) return {};
  const { data, error } = await supabase.from('session_sets')
    .select('exercise, weight_kg, reps, seconds, rir, sessions!inner(id, started_at, profile_id)')
    .in('exercise', exercises).eq('done', true)
    .eq('sessions.profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(600);
  if (error) throw error;

  const out = {};
  (data || []).forEach((r) => {
    const s = r.sessions;
    if (!s) return;
    const cur = out[r.exercise];
    /* Solo la sesión más reciente de ese ejercicio; dentro de ella, la serie
       con más carga (o más segundos si es isométrico). */
    if (cur && new Date(s.started_at) < new Date(cur.started_at)) return;
    const score = (Number(r.weight_kg) || 0) || (Number(r.seconds) || 0);
    const curScore = cur ? ((Number(cur.weight_kg) || 0) || (Number(cur.seconds) || 0)) : -1;
    if (!cur || new Date(s.started_at) > new Date(cur.started_at) || score > curScore) {
      out[r.exercise] = {
        weight_kg: r.weight_kg, reps: r.reps, seconds: r.seconds,
        rir: r.rir, started_at: s.started_at,
      };
    }
  });
  return out;
}

/* ══ Volumen semanal por grupo (vista Cuerpo) ═══════════════════════════ */

/**
 * Series marcadas en los últimos `days` días. Devuelve los nombres de
 * ejercicio con su recuento; el mapeo a grupo muscular lo hace catalog.js.
 */
export async function getRecentSets(profileId, days = 7) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await supabase.from('session_sets')
    .select('exercise, done, sessions!inner(started_at, profile_id)')
    .eq('done', true)
    .eq('sessions.profile_id', profileId)
    .gte('sessions.started_at', since)
    .limit(2000);
  if (error) throw error;
  return data || [];
}

/** Sesiones de los últimos `days` días, para el mapa de constancia y tendencias. */
export async function getRecentSessions(profileId, days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await supabase.from('sessions')
    .select('id, title, started_at, ended_at, elapsed_s, rpe')
    .eq('profile_id', profileId)
    .gte('started_at', since)
    .order('started_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Todas las series marcadas de las sesiones dadas (para el CSV y el volumen). */
export async function getSetsForSessions(sessionIds) {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase.from('session_sets')
    .select('session_id, exercise, set_index, is_warmup, weight_kg, reps, seconds, rir, done')
    .in('session_id', sessionIds);
  if (error) throw error;
  return data || [];
}

/* ══ Peso corporal ══════════════════════════════════════════════════════ */

export async function getWeights(profileId, limit = 30) {
  const { data, error } = await supabase.from('weight_log')
    .select('logged_on, weight_kg').eq('profile_id', profileId)
    .order('logged_on', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

/** Registra el peso de un día. `kg` en unidades canónicas. */
export async function logWeight(profileId, kg, loggedOn) {
  const day = loggedOn || new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('weight_log').upsert({
    profile_id: profileId, logged_on: day, weight_kg: kg,
  }, { onConflict: 'profile_id,logged_on' });
  if (error) throw error;
}

/* ══════════════════════════════════════════════════════════════════════════
   COLA OFFLINE
   ──────────────────────────────────────────────────────────────────────────
   Nadie pierde series por mala cobertura en el gimnasio. Si una escritura
   falla por red, se guarda en localStorage y se reintenta al volver la
   conexión. Todas las operaciones encoladas son idempotentes.
   ══════════════════════════════════════════════════════════════════════════ */

const QUEUE_KEY = 'nexus-cola-v1';

const HANDLERS = {
  /* El orden de este objeto no importa, pero el de la cola sí: session_start
     se encola siempre antes que las series de esa sesión. */
  session_start: (p) => upsertSession(p.row),
  set: (p) => upsertSet(p.row),
  session_end: (p) => finishSession(p.sessionId, p.patch),
  note: (p) => saveNote(p.profileId, p.exercise, p.note),
  weight: (p) => logWeight(p.profileId, p.kg, p.loggedOn),
  profile: (p) => saveProfile(p.id, p.patch),
};

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* cuota llena */ }
}

export function queueLength() { return readQueue().length; }

/** Encola una operación fallida. Si ya había una del mismo `key`, la sustituye. */
function enqueue(kind, payload, key) {
  const q = readQueue();
  const at = key ? q.findIndex((x) => x.key === key) : -1;
  const item = { kind, payload, key: key || null, ts: Date.now() };
  if (at >= 0) q[at] = item; else q.push(item);
  writeQueue(q);
  notify();
}

/**
 * Ejecuta una escritura; si falla por red la encola y devuelve false.
 * Cualquier otro error (RLS, validación) se propaga: eso hay que verlo.
 */
export async function write(kind, payload, key) {
  const handler = HANDLERS[kind];
  if (!handler) throw new Error(`Operación desconocida: ${kind}`);
  try {
    await handler(payload);
    return true;
  } catch (err) {
    if (isNetworkError(err)) { enqueue(kind, payload, key); return false; }
    throw err;
  }
}

let flushing = false;

/** Reintenta la cola en orden. Se detiene en el primer fallo de red. */
export async function flushQueue() {
  if (flushing) return { done: 0, left: queueLength() };
  flushing = true;
  let done = 0;
  try {
    let q = readQueue();
    while (q.length) {
      const item = q[0];
      const handler = HANDLERS[item.kind];
      try {
        if (handler) await handler(item.payload);
      } catch (err) {
        if (isNetworkError(err)) break;      // sigue sin red: se queda para luego
        /* Un error no de red en una operación encolada no se puede resolver
           reintentando; se descarta para no bloquear el resto de la cola. */
      }
      q = readQueue().slice(1);
      writeQueue(q);
      done++;
    }
  } finally {
    flushing = false;
    notify();
  }
  return { done, left: queueLength() };
}

/* ── Aviso de estado a la interfaz ─────────────────────────────────────── */
const listeners = new Set();
export function onQueueChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() {
  const state = { pending: queueLength(), online: navigator.onLine };
  listeners.forEach((cb) => { try { cb(state); } catch { /* nada */ } });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { notify(); flushQueue(); });
  window.addEventListener('offline', notify);
  /* Reintento periódico: `online` no siempre se dispara con redes malas. */
  setInterval(() => { if (navigator.onLine && queueLength()) flushQueue(); }, 20000);
}
