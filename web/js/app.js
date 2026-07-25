/* ══════════════════════════════════════════════════════════════════════════
   app.js · Interfaz de la app. Portado del prototipo y conectado a Supabase.
   ──────────────────────────────────────────────────────────────────────────
   Reparto de responsabilidades:
     db.js        · toda la persistencia y la cola offline
     units.js     · conversión kg/lb y formateo es-ES
     catalog.js   · POOL propio + emparejado con el dataset para los GIF
     generator.js · generación de la rutina y mapa de limitaciones
     studio.js    · contenido del Estudio

   localStorage guarda SOLO preferencias volátiles de interfaz (vista activa,
   ejercicio seleccionado, barra elegida). Ningún dato de entreno.
   ══════════════════════════════════════════════════════════════════════════ */

import * as db from './db.js';
import * as U from './units.js';
import * as C from './catalog.js';
import { generateRoutine, alternatives, exercisesPerSession, LIMITATION_MAP } from './generator.js';
import { ROUTINES, CARDIO } from './studio.js';

/* ══ Utilidades ══════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = U.fmtTime;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));

/* ══ Preferencias volátiles de interfaz ═════════════════════════════════ */
const UI_KEY = 'nexus-ui-v1';
const UI = {
  view: 'v-dash', exIdx: 0, dayIndex: null, side: 'front', sexo: 'f',
  mode: 'hyper', tab: 'casa', barDisplay: null, warmOpen: {},
  cardio: { mode: 'Caminar', met: 3.5, min: 30, int: 1 },
};
try {
  const raw = localStorage.getItem(UI_KEY);
  if (raw) Object.assign(UI, JSON.parse(raw));
} catch { /* preferencia perdida, no pasa nada */ }
const saveUI = () => {
  try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch { /* cuota */ }
};

/* ══ Estado de la aplicación ════════════════════════════════════════════ */
let user = null;          // usuario autenticado
let profile = null;       // fila de profiles
let routine = null;       // rutina activa con días y ejercicios
let ANATOMY = null;       // data/anatomy.json
let volume = {};          // grupo → series de los últimos 7 días
let volumeTotal = 0;
let weights = [];         // weight_log
let recentSessions = [];  // sessions de los últimos 30 días
let notes = {};           // exercise_notes
let lastBest = {};        // ejercicio → mejor serie de su última sesión

const units = () => (profile && profile.units === 'lb' ? 'lb' : 'kg');

/* ══════════════════════════════════════════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════════════════════════════════════════ */

async function boot() {
  bindStaticEvents();
  paintNet({ pending: db.queueLength(), online: navigator.onLine });
  db.onQueueChange(paintNet);

  /* El catálogo y la anatomía no dependen de la sesión: se piden ya. */
  const assets = Promise.all([
    C.loadCatalog('data/exercises.min.json'),
    fetch('data/anatomy.json').then((r) => r.json()).then((a) => { ANATOMY = a; })
      .catch(() => { ANATOMY = null; }),
  ]);

  db.onAuthChange((event) => {
    if (event === 'SIGNED_OUT') { showGate(); }
  });

  let session = null;
  try { session = await db.currentUser(); } catch { session = null; }
  await assets;

  if (!session) { showGate(); return; }
  user = session;
  await enterApp();
}

/** Oculta la pantalla de arranque. */
function hideBoot() { $('boot').classList.add('hidden'); }

/* ══════════════════════════════════════════════════════════════════════════
   1 · SELECTOR DE PERFIL Y LOGIN
   ══════════════════════════════════════════════════════════════════════════ */

let gateOpen = null;   // email de la tarjeta desplegada

function showGate() {
  hideBoot();
  user = null; profile = null; routine = null;
  $('app').classList.add('hidden');
  $('nav').classList.add('hidden');
  $('wiz').classList.add('hidden');
  $('gate').classList.remove('hidden');
  gateOpen = null;
  renderGate();
}

function renderGate() {
  $('whoGrid').innerHTML = db.PERFILES.map((p) => {
    const open = gateOpen === p.email;
    const ini = p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return `<div>
      <button class="who-card" type="button" data-who="${esc(p.email)}"
        aria-expanded="${open}">
        <span class="avatar" aria-hidden="true">${esc(ini)}</span>
        <span class="grow"><h3>${esc(p.name)}</h3><p>${esc(p.email)}</p></span>
        <span class="caret" aria-hidden="true">${open ? '⌄' : '›'}</span>
      </button>
      ${open ? `<div class="pw-box">
        <label class="f-lbl" for="pwIn">Contraseña</label>
        <input class="in" id="pwIn" type="password" autocomplete="current-password"
          placeholder="Tu contraseña" aria-label="Contraseña de ${esc(p.name)}">
        <button class="btn" id="pwGo" type="button">Entrar</button>
        <p class="err" id="gateErr" role="alert"></p>
      </div>` : ''}
    </div>`;
  }).join('');

  const input = $('pwIn');
  if (input) {
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    $('pwGo').addEventListener('click', doLogin);
  }
}

async function doLogin() {
  const pass = $('pwIn') ? $('pwIn').value : '';
  const err = $('gateErr');
  const btn = $('pwGo');
  if (!pass) { err.textContent = 'Escribe la contraseña.'; return; }
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    user = await db.signIn(gateOpen, pass);
    $('gate').classList.add('hidden');
    await enterApp();
  } catch (e) {
    err.textContent = db.msgError(e);
    btn.disabled = false;
    btn.textContent = 'Entrar';
    const i = $('pwIn');
    if (i) { i.value = ''; i.focus(); }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ENTRADA A LA APP (o al cuestionario)
   ══════════════════════════════════════════════════════════════════════════ */

async function enterApp() {
  hideBoot();
  try {
    profile = await db.getProfile(user.id);
  } catch (e) {
    $('gate').classList.remove('hidden');
    const note = $('gateNote');
    if (note) note.textContent = db.msgError(e);
    return;
  }
  UI.sexo = profile.sex === 'm' ? 'm' : 'f';

  if (!profile.onboarded) { startWizard(); return; }
  await showApp();
}

async function showApp() {
  $('gate').classList.add('hidden');
  $('wiz').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('nav').classList.remove('hidden');

  await Promise.all([loadRoutine(), loadStats(), loadNotes()]);

  paintSound();
  renderSexPick();
  renderBody();
  setSide(UI.side);
  renderStudio();
  renderCreate();
  renderDash();
  renderWork();
  renderSettings();
  go(UI.view === 'v-sess' ? 'v-work' : (UI.view || 'v-dash'));
  db.flushQueue();
}

async function loadRoutine() {
  try { routine = await db.getActiveRoutine(profile.id); } catch { routine = null; }
}

async function loadNotes() {
  try { notes = await db.getNotes(profile.id); } catch { notes = {}; }
}

/** Estadísticas reales: volumen 7 días, sesiones 30 días y peso corporal. */
async function loadStats() {
  const [sets, sess, w] = await Promise.all([
    db.getRecentSets(profile.id, 7).catch(() => []),
    db.getRecentSessions(profile.id, 30).catch(() => []),
    db.getWeights(profile.id, 30).catch(() => []),
  ]);
  volume = {};
  volumeTotal = 0;
  sets.forEach((r) => {
    const g = C.muscleGroupFor(r.exercise);
    if (!g) return;
    volume[g] = (volume[g] || 0) + 1;
    volumeTotal++;
  });
  recentSessions = sess;
  weights = w;
  await refreshSetCounts();
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · CUESTIONARIO INICIAL
   ══════════════════════════════════════════════════════════════════════════ */

let draft = null;
let wzAt = 0;

const MUSCLE_CHOICES = ['Glúteos', 'Cuádriceps', 'Isquios', 'Espalda', 'Pecho',
  'Hombros', 'Bíceps', 'Tríceps', 'Abdomen', 'Gemelos'];
const LIMIT_CHOICES = ['rodilla', 'hombro', 'lumbar', 'muñeca', 'cadera', 'cuello'];
const INTEREST_CHOICES = [
  ['pilates', 'Pilates', 'Control, core y suelo. Nada de impacto.'],
  ['cardio', 'Cardio', 'Caminar, bici, remo… para el corazón.'],
  ['movilidad', 'Movilidad', 'Rutinas cortas para desentumecer.'],
];

function startWizard() {
  draft = {
    units: profile.units || 'kg',
    name: profile.name || '',
    sex: profile.sex || 'f',
    height_cm: profile.height_cm || null,
    ft: null, in: null,
    weight_kg: profile.weight_kg || null,
    weightInput: '',
    goal: null,
    level: null,
    days_per_week: profile.days_per_week || 3,
    minutes: profile.minutes || 45,
    equipment: (profile.equipment || []).slice(),
    limitations: (profile.limitations || []).slice(),
    priorities: (profile.priorities || []).slice(),
    interests: (profile.interests || []).slice(),
  };
  if (draft.height_cm) {
    const f = U.cmToFtIn(draft.height_cm);
    draft.ft = f.ft; draft.in = f.in;
  }
  wzAt = 0;
  $('gate').classList.add('hidden');
  $('app').classList.add('hidden');
  $('nav').classList.add('hidden');
  $('wiz').classList.remove('hidden');
  renderStep();
}

/* Cada paso: bloque, pregunta, por qué se pregunta, cuerpo y validación. */
const STEPS = [
  {
    block: 'Datos', q: '¿En qué unidades trabajas?',
    why: 'Se pregunta primero para pedirte la altura y el peso ya en tus unidades. Podrás cambiarlo cuando quieras en Ajustes.',
    html: () => optCards('units', [
      ['kg', 'Kilos y centímetros', 'Lo habitual en España. Los discos suben de 2,5 en 2,5 kg.'],
      ['lb', 'Libras, pies y pulgadas', 'Sistema imperial. Los discos suben de 5 en 5 lb.'],
    ], draft.units, true),
    valid: () => !!draft.units,
  },
  {
    block: 'Datos', q: '¿Cómo te llamas?',
    why: 'Solo para saludarte y para etiquetar tus datos.',
    html: () => `<div class="wz-fields">
      <div><label class="f-lbl" for="f-name">Tu nombre</label>
      <input class="in" id="f-name" data-field="name" type="text" autocomplete="given-name"
        value="${esc(draft.name)}" placeholder="Tu nombre"></div></div>`,
    valid: () => draft.name.trim().length >= 2,
    err: 'Escribe al menos dos letras.',
  },
  {
    block: 'Datos', q: '¿Qué mapa corporal usamos?',
    why: 'Solo cambia el dibujo del cuerpo en la vista Cuerpo. No afecta a la rutina.',
    html: () => optCards('sex', [
      ['f', 'Ella', 'Figura femenina en el mapa muscular.'],
      ['m', 'Él', 'Figura masculina en el mapa muscular.'],
    ], draft.sex, true),
    valid: () => !!draft.sex,
  },
  {
    block: 'Datos', q: '¿Cuánto mides?',
    why: 'Sirve de contexto para tus datos. Puedes saltarlo si no te apetece.',
    html: () => (draft.units === 'lb'
      ? `<div class="pair">
          <div><label class="f-lbl" for="f-ft">Pies</label>
            <input class="in mono" id="f-ft" data-field="ft" type="text" inputmode="numeric"
              value="${draft.ft == null ? '' : draft.ft}" placeholder="5"></div>
          <div><label class="f-lbl" for="f-in">Pulgadas</label>
            <input class="in mono" id="f-in" data-field="in" type="text" inputmode="numeric"
              value="${draft.in == null ? '' : draft.in}" placeholder="6"></div>
        </div><p class="note">Se guarda en centímetros.</p>`
      : `<div><label class="f-lbl" for="f-cm">Altura en centímetros</label>
          <input class="in mono" id="f-cm" data-field="height_cm" type="text" inputmode="decimal"
            value="${draft.height_cm == null ? '' : U.fmtNum(draft.height_cm, 0)}" placeholder="165"></div>`),
    valid: () => true,
    optional: true,
  },
  {
    block: 'Datos', q: '¿Cuánto pesas ahora?',
    why: 'Se usa para estimar las calorías del cardio y para ver tu evolución.',
    html: () => `<div><label class="f-lbl" for="f-w">Peso en ${U.wLabel(draft.units)}</label>
      <input class="in mono" id="f-w" data-field="weightInput" type="text" inputmode="decimal"
        value="${esc(draft.weightInput)}" placeholder="${draft.units === 'lb' ? '140' : '64'}"></div>
      <p class="note">Se guarda siempre en kilos; se muestra en tus unidades.</p>`,
    valid: () => true,
    optional: true,
  },
  {
    block: 'Objetivo', q: '¿Qué buscas ahora mismo?',
    why: 'Marca las repeticiones, las series y lo cerca del fallo que se entrena.',
    html: () => optCards('goal', [
      ['musculo', 'Ganar músculo', '8-12 repeticiones, dejando 2 en el depósito. El estándar para crecer.'],
      ['fuerza', 'Ganar fuerza', '3-5 repeticiones pesadas en los básicos, con descansos largos.'],
      ['grasa', 'Perder grasa', '10-15 repeticiones y descansos cortos, para mantener músculo.'],
      ['salud', 'Salud y sentirme bien', '10-15 repeticiones lejos del fallo. Sin agujetas de castigo.'],
    ], draft.goal, true),
    valid: () => !!draft.goal,
    err: 'Elige un objetivo para seguir.',
  },
  {
    block: 'Objetivo', q: '¿Cuánta experiencia tienes?',
    why: 'El nivel decide cuántas series y cuántos ejercicios de aislamiento entran.',
    html: () => optCards('level', [
      ['principiante', 'Principiante', 'Llevas menos de 6 meses entrenando, o vuelves después de una pausa larga.'],
      ['intermedio', 'Intermedio', 'Entrenas con constancia desde hace más de un año y conoces la técnica básica.'],
      ['avanzado', 'Avanzado', 'Varios años entrenando y sabes ajustar tu propio programa.'],
    ], draft.level, true),
    valid: () => !!draft.level,
    err: 'Elige el nivel que mejor te describa.',
  },
  {
    block: 'Logística', q: '¿Cuántos días a la semana?',
    why: 'Con menos días se reparte a cuerpo completo; con más, se separa por zonas.',
    html: () => bigNum('days_per_week', draft.days_per_week, 'días', 1),
    valid: () => draft.days_per_week >= 1 && draft.days_per_week <= 7,
  },
  {
    block: 'Logística', q: '¿Cuánto dura una sesión?',
    why: () => `Con ${draft.minutes} minutos entran unos ${exercisesPerSession(draft.minutes)} ejercicios.`,
    html: () => bigNum('minutes', draft.minutes, 'minutos', 5),
    valid: () => draft.minutes >= 10 && draft.minutes <= 180,
  },
  {
    block: 'Logística', q: '¿Con qué puedes contar?',
    why: 'Puedes marcar varias. Solo se te propondrán ejercicios que puedas hacer de verdad.',
    html: () => optCards('equipment', [
      ['libre', 'Peso libre', 'Barras, mancuernas y banco.'],
      ['maquina', 'Máquinas y poleas', 'Gimnasio con máquinas guiadas.'],
      ['corporal', 'En casa', 'Peso corporal, bandas y una silla.'],
    ], draft.equipment, false),
    valid: () => draft.equipment.length > 0,
    err: 'Marca al menos una opción.',
  },
  {
    block: 'Salud', q: '¿Alguna zona que haya que cuidar?',
    why: 'Se excluirán los ejercicios que cargan justo esa articulación. Marca varias o ninguna.',
    html: () => `<div class="opts">
      ${LIMIT_CHOICES.map((k) => card('limitations', k,
      LIMITATION_MAP[k].label,
      `Se evitan: ${LIMITATION_MAP[k].avoid.slice(0, 3).join(', ').toLowerCase()}…`,
      draft.limitations.includes(k), false)).join('')}
      ${card('limitations', 'ninguna', 'Ninguna, todo bien',
      'Sin exclusiones. Siempre puedes cambiarlo después.',
      draft.limitations.includes('ninguna'), false)}
    </div>`,
    valid: () => true,
    optional: true,
  },
  {
    block: 'Preferencias', q: '¿Hay algo que quieras priorizar?',
    why: 'Los grupos que marques aparecerán antes y con un ejercicio extra. Puedes no marcar nada.',
    html: () => `<div class="chip-grid">${MUSCLE_CHOICES.map((m) => `
      <button class="pick" type="button" data-multi="priorities" data-val="${esc(m)}"
        aria-pressed="${draft.priorities.includes(m)}">${esc(m)}</button>`).join('')}</div>`,
    valid: () => true,
    optional: true,
  },
  {
    block: 'Preferencias', q: '¿Te interesa algo más suave?',
    why: 'Aparecerá en la pestaña Estudio, para los días que no toca gimnasio.',
    html: () => `<div class="opts">${INTEREST_CHOICES.map(([k, t, d]) =>
      card('interests', k, t, d, draft.interests.includes(k), false)).join('')}</div>`,
    valid: () => true,
    optional: true,
  },
];

/** Tarjetas de opción; `single` decide si es radio o casilla múltiple. */
function optCards(key, list, current, single) {
  return `<div class="opts">${list.map(([v, t, d]) => card(key, v, t, d,
    single ? current === v : (current || []).includes(v), single)).join('')}</div>`;
}

function card(key, val, title, desc, on, single) {
  return `<button class="opt-card" type="button"
    data-${single ? 'single' : 'multi'}="${esc(key)}" data-val="${esc(val)}"
    aria-pressed="${on}">
    <span class="mark" aria-hidden="true">${single ? '●' : '✓'}</span>
    <span class="grow"><h4>${esc(title)}</h4><p>${esc(desc)}</p></span></button>`;
}

function bigNum(key, val, unit, stepBy) {
  return `<div class="big-num">
    <button type="button" data-step="${esc(key)}" data-d="${-stepBy}" aria-label="Menos">−</button>
    <span class="v" id="bigv">${val}<small>${esc(unit)}</small></span>
    <button type="button" data-step="${esc(key)}" data-d="${stepBy}" aria-label="Más">+</button>
  </div>`;
}

function renderStep() {
  const s = STEPS[wzAt];
  $('wzBar').style.width = `${Math.round((wzAt / STEPS.length) * 100)}%`;
  $('wzStep').textContent = `Paso ${wzAt + 1} de ${STEPS.length}`;
  $('wzBlock').textContent = s.block;
  const why = typeof s.why === 'function' ? s.why() : s.why;
  $('wzBody').innerHTML = `<h2>${esc(s.q)}</h2><p class="why">${esc(why)}</p>
    ${s.html()}<p class="err" id="wzErr" role="alert"></p>`;
  $('wzBack').style.visibility = wzAt === 0 ? 'hidden' : 'visible';
  $('wzNext').textContent = wzAt === STEPS.length - 1 ? 'Crear mi rutina' : 'Seguir';
  const first = $('wzBody').querySelector('input');
  if (first) first.focus();
  window.scrollTo(0, 0);
}

/* Un único gestor para todos los controles del cuestionario. */
$('wzBody').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.single) {
    draft[d.single] = d.val;
    /* Cambiar de unidades reinterpreta lo que ya se escribió. */
    if (d.single === 'units') draft.weightInput = '';
    renderStep();
    return;
  }
  if (d.multi) {
    const arr = draft[d.multi];
    const at = arr.indexOf(d.val);
    if (at >= 0) arr.splice(at, 1); else arr.push(d.val);
    /* "Ninguna" y una limitación concreta se excluyen entre sí. */
    if (d.multi === 'limitations') {
      if (d.val === 'ninguna' && arr.includes('ninguna')) {
        draft.limitations = ['ninguna'];
      } else if (d.val !== 'ninguna') {
        draft.limitations = arr.filter((x) => x !== 'ninguna');
      }
    }
    renderStep();
    return;
  }
  if (d.step) {
    const lim = { days_per_week: [1, 7], minutes: [10, 180] }[d.step];
    const next = Math.max(lim[0], Math.min(lim[1], draft[d.step] + Number(d.d)));
    draft[d.step] = next;
    renderStep();
  }
});

$('wzBody').addEventListener('input', (ev) => {
  const f = ev.target.dataset.field;
  if (!f) return;
  draft[f] = ev.target.value;
  const err = $('wzErr');
  if (err) err.textContent = '';
});

$('wzBack').addEventListener('click', () => {
  if (wzAt > 0) { wzAt--; renderStep(); }
});

$('wzNext').addEventListener('click', async () => {
  const s = STEPS[wzAt];
  /* Normaliza los campos de texto antes de validar. */
  if (typeof draft.name === 'string') draft.name = draft.name;
  if (!s.valid()) {
    $('wzErr').textContent = s.err || 'Falta algo por rellenar.';
    return;
  }
  if (wzAt < STEPS.length - 1) { wzAt++; renderStep(); return; }
  await finishWizard();
});

async function finishWizard() {
  const btn = $('wzNext');
  btn.disabled = true;
  btn.textContent = 'Creando tu rutina…';
  $('wzErr').textContent = '';

  /* Altura y peso a unidades canónicas (cm y kg). */
  let heightCm = null;
  if (draft.units === 'lb') {
    if (draft.ft || draft.in) heightCm = U.ftInToCm(U.num(draft.ft), U.num(draft.in));
  } else if (draft.height_cm) {
    heightCm = Math.round(U.num(draft.height_cm) * 10) / 10;
  }
  let weightKg = null;
  if (String(draft.weightInput).trim()) {
    weightKg = U.fromInput(draft.weightInput, draft.units);
  }

  const limitations = draft.limitations.filter((x) => x !== 'ninguna');
  const patch = {
    name: draft.name.trim(),
    sex: draft.sex,
    height_cm: heightCm,
    weight_kg: weightKg,
    units: draft.units,
    level: draft.level,
    goal: draft.goal,
    days_per_week: draft.days_per_week,
    minutes: draft.minutes,
    equipment: draft.equipment,
    limitations,
    priorities: draft.priorities,
    interests: draft.interests,
    onboarded: true,
  };

  try {
    profile = await db.saveProfile(user.id, patch);
    const r = generateRoutine(profile);
    await db.saveRoutine(profile.id, r);
    if (weightKg) {
      await db.write('weight', { profileId: profile.id, kg: weightKg }).catch(() => {});
    }
    UI.sexo = profile.sex === 'm' ? 'm' : 'f';
    UI.dayIndex = null;
    UI.view = 'v-work';
    saveUI();
    await showApp();
  } catch (e) {
    $('wzErr').textContent = db.msgError(e);
    btn.disabled = false;
    btn.textContent = 'Crear mi rutina';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · NAVEGACIÓN Y TEMA
   ══════════════════════════════════════════════════════════════════════════ */

function go(id) {
  closeKpad();
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === id));
  document.querySelectorAll('.nav [data-go]').forEach((b) => {
    if (b.dataset.go === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  UI.view = id;
  saveUI();
  window.scrollTo(0, 0);
}

function ring(id, pct, r) {
  const c = 2 * Math.PI * r;
  const el = $(id);
  if (el) el.setAttribute('stroke-dasharray', `${Math.max(0, Math.min(1, pct)) * c} ${c}`);
}

function bindStaticEvents() {
  $('whoGrid').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-who]');
    if (!b) return;
    gateOpen = gateOpen === b.dataset.who ? null : b.dataset.who;
    renderGate();
  });

  document.querySelectorAll('.nav [data-go]').forEach((b) => {
    b.addEventListener('click', () => go(b.dataset.go));
  });
  $('back').addEventListener('click', () => go('v-work'));
  $('goSet').addEventListener('click', () => { renderSettings(); go('v-set'); });
  $('setBack').addEventListener('click', () => go('v-dash'));
  $('goToday').addEventListener('click', () => openToday());
  $('goStudio2').addEventListener('click', () => go('v-studio'));
  $('theme').addEventListener('click', () => {
    const c = document.documentElement.getAttribute('data-theme');
    const light = c === 'light' || (!c && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.setAttribute('data-theme', light ? 'dark' : 'light');
  });

  bindWork();
  bindCreate();
  bindStudio();
  bindBody();
  bindSession();
  bindSheet();
  bindPlayer();
  bindSettings();
  bindDash();
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · PANEL
   ══════════════════════════════════════════════════════════════════════════ */

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Índice de día de rutina (0 = lunes) para una fecha. */
function dayIndexOf(d) { return (d.getDay() + 6) % 7; }

function bindDash() {
  $('wSave').addEventListener('click', saveTodayWeight);
  $('wIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveTodayWeight(); });
  $('expCsv').addEventListener('click', exportCsv);
}

function renderDash() {
  const now = new Date();
  $('dashDate').textContent = `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]}`;

  /* Héroe: el día de hoy según la rutina activa. */
  const today = todayDay();
  if (!routine) {
    $('heroName').textContent = 'Aún no tienes rutina';
    $('heroSub').textContent = 'Ve a Crear para generar una en un toque.';
  } else if (!today || today.is_rest) {
    $('heroName').textContent = 'Hoy toca descansar';
    $('heroSub').textContent = 'Movilidad suave o pilates si te apetece moverte.';
  } else {
    const ex = today.routine_exercises || [];
    const mins = ex.length * 8 + 8;
    const groups = [...new Set(ex.map((x) => x.muscle))].slice(0, 3).join(', ');
    $('heroName').textContent = today.name;
    $('heroSub').textContent = `${ex.length} ejercicios · ~${mins} min${groups ? ` · ${groups}` : ''}`;
  }

  /* Anillos con datos reales de los últimos 7 días. */
  const groupsHit = Object.keys(volume).filter((g) => volume[g] > 0).length;
  const targetSets = C.MUSCLES.reduce((n, m) => n + m.t, 0);
  const weekEx = routine
    ? routine.routine_days.reduce((n, d) => n + (d.routine_exercises || []).length, 0) : 0;
  const doneEx = Object.keys(volume).length ? countDistinctExercises() : 0;
  ring('r1', groupsHit / C.MUSCLES.length, 28);
  ring('r2', volumeTotal / Math.max(1, targetSets), 41);
  ring('r3', weekEx ? doneEx / weekEx : 0, 28);
  $('r1v').textContent = groupsHit; $('r1s').textContent = `/${C.MUSCLES.length}`;
  $('r2v').textContent = volumeTotal; $('r2s').textContent = `/${targetSets}`;
  $('r3v').textContent = doneEx; $('r3s').textContent = `/${weekEx}`;

  renderBars();
  renderHeat();
  renderWeight();
}

let distinctEx = 0;
function countDistinctExercises() { return distinctEx; }

/** Series por día de los últimos 7 días. */
function renderBars() {
  const perDay = new Array(7).fill(0);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  recentSessions.forEach((s) => {
    const d = new Date(s.started_at);
    const diff = Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (diff >= 0 && diff < 7) perDay[6 - diff] += sessionSetCount[s.id] || 0;
  });
  const max = Math.max(1, ...perDay);
  $('bars').innerHTML = perDay.map((v) => `<i style="height:${Math.round(v / max * 100)}%"></i>`).join('');
  const total = perDay.reduce((a, b) => a + b, 0);
  $('volTxt').innerHTML = total
    ? `${U.fmtNum(total / 7, 1)}<span style="font-size:var(--fs-xs);color:var(--ink-3)"> series/día</span>`
    : '<span style="font-size:var(--fs-sm);color:var(--ink-3)">Sin datos aún</span>';
}

let sessionSetCount = {};

function renderHeat() {
  const byDay = {};
  recentSessions.forEach((s) => {
    const d = new Date(s.started_at);
    byDay[d.toISOString().slice(0, 10)] = (byDay[d.toISOString().slice(0, 10)] || 0) + 1;
  });
  const cells = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 864e5);
    const n = byDay[d.toISOString().slice(0, 10)] || 0;
    cells.push(n >= 2 ? 'mid' : n === 1 ? 'on' : '');
  }
  $('heat').innerHTML = cells.map((c) => `<i class="${c}"></i>`).join('');
  const week = recentSessions.filter((s) => (Date.now() - new Date(s.started_at)) < 7 * 864e5).length;
  $('heatTxt').innerHTML = `${week}<span style="font-size:var(--fs-xs);color:var(--ink-3)"> esta semana</span>`;
}

function renderWeight() {
  const u = units();
  $('wUnit').textContent = U.wLabel(u);
  if (!weights.length) {
    $('wSpark').innerHTML = '<p class="note" style="margin-top:11px">Sin registros todavía.</p>';
    $('wTxt').innerHTML = '<span style="font-size:var(--fs-sm);color:var(--ink-3)">—</span>';
    $('wIn').value = '';
    return;
  }
  const vals = weights.map((w) => U.toDisplay(w.weight_kg, u));
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const span = (mx - mn) || 1;
  const pts = vals.map((v, i) => {
    const x = 3 + (i / Math.max(1, vals.length - 1)) * 103;
    const y = 34 - ((v - mn) / span) * 26;
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  });
  const last = pts[pts.length - 1].split(',');
  $('wSpark').innerHTML = `<svg viewBox="0 0 110 40" preserveAspectRatio="none"
    style="width:100%;height:40px;margin-top:11px" role="img"
    aria-label="Evolución del peso corporal">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--mg)" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="var(--mg)"/></svg>`;
  const cur = weights[weights.length - 1];
  $('wTxt').innerHTML = `${U.fmtNum(U.toDisplay(cur.weight_kg, u), 1)}<span style="font-size:var(--fs-xs);color:var(--ink-3)"> ${U.wLabel(u)}</span>`;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRow = weights.find((w) => w.logged_on === todayStr);
  $('wIn').value = todayRow ? U.fmtNum(U.toDisplay(todayRow.weight_kg, u), 1) : '';
}

async function saveTodayWeight() {
  const u = units();
  const raw = $('wIn').value.trim();
  const msg = $('wMsg');
  if (!raw) { msg.textContent = 'Escribe tu peso para guardarlo.'; return; }
  const kg = U.fromInput(raw, u);
  if (kg <= 0 || kg > 400) { msg.textContent = 'Ese peso no parece correcto.'; return; }
  msg.textContent = 'Guardando…';
  try {
    const ok = await db.write('weight', { profileId: profile.id, kg },
      `weight:${new Date().toISOString().slice(0, 10)}`);
    msg.textContent = ok ? 'Peso de hoy guardado.' : 'Sin conexión: se guardará al volver la red.';
    if (ok) {
      weights = await db.getWeights(profile.id, 30);
      renderWeight();
      /* El cardio usa el peso corporal: refresca su estimación. */
      if (UI.tab === 'cardio') renderStudio();
    }
  } catch (e) { msg.textContent = db.msgError(e); }
}

/* ══ Exportar CSV con datos reales ══ */
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv() {
  const msg = $('expMsg');
  msg.textContent = 'Preparando…';
  try {
    const sess = await db.getRecentSessions(profile.id, 365);
    if (!sess.length) {
      msg.textContent = 'Todavía no hay sesiones que exportar.';
      return;
    }
    const sets = await db.getSetsForSessions(sess.map((s) => s.id));
    const byId = new Map(sess.map((s) => [s.id, s]));
    const u = units();
    const head = `fecha,sesion,ejercicio,serie,calentamiento,${U.wLabel(u)},reps,segundos,rir,hecha`;
    const rows = [head];
    sets.sort((a, b) => {
      const da = new Date(byId.get(a.session_id).started_at);
      const dbb = new Date(byId.get(b.session_id).started_at);
      return da - dbb || a.set_index - b.set_index;
    }).forEach((r) => {
      const s = byId.get(r.session_id);
      rows.push([
        s.started_at.slice(0, 10), csvCell(s.title || ''), csvCell(r.exercise),
        r.set_index + 1, r.is_warmup ? 'si' : 'no',
        r.weight_kg == null ? '' : U.fmtNum(U.toDisplay(r.weight_kg, u), 2).replace(',', '.'),
        r.reps == null ? '' : r.reps,
        r.seconds == null ? '' : r.seconds,
        r.rir == null ? '' : r.rir,
        r.done ? 'si' : 'no',
      ].join(','));
    });
    const csv = `${rows.join('\n')}\n`;
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'entrenos.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    msg.textContent = `Exportadas ${sets.length} series de ${sess.length} sesiones.`;
  } catch (e) { msg.textContent = db.msgError(e); }
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · ENTRENAR
   ══════════════════════════════════════════════════════════════════════════ */

function todayDay() {
  if (!routine) return null;
  const idx = UI.dayIndex == null ? dayIndexOf(new Date()) : UI.dayIndex;
  return routine.routine_days.find((d) => d.day_index === idx) || null;
}

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function bindWork() {
  $('days').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-day]');
    if (!b) return;
    UI.dayIndex = Number(b.dataset.day);
    saveUI();
    renderWork();
    renderDash();
  });
  $('wlist').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-open]');
    if (!b) return;
    const idx = Number(b.dataset.open);
    const day = routine.routine_days.find((d) => d.day_index === idx);
    if (!day) return;
    if (day.is_rest) { go('v-studio'); return; }
    UI.dayIndex = idx;
    saveUI();
    openSession(day);
  });
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      UI.mode = b.dataset.mode;
      saveUI();
      document.querySelectorAll('[data-mode]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
      $('modeNote').textContent = UI.mode === 'fuerza'
        ? 'Fuerza: una serie pesada (top set) y luego series de respaldo más ligeras. Añade calentamiento y 1RM estimado.'
        : 'Hipertrofia: series rectas con RIR objetivo que baja cada semana.';
      if (SESS.day) buildSession();
    });
  });
}

function renderWork() {
  document.querySelectorAll('[data-mode]').forEach((x) => {
    x.setAttribute('aria-pressed', String(x.dataset.mode === UI.mode));
  });

  if (!routine) {
    $('workLbl').textContent = 'Sin programa';
    $('days').innerHTML = '';
    $('wlist').innerHTML = `<div class="p"><p class="empty"><b>Todavía no hay rutina.</b>
      Ve a Crear y genérala en un toque: usa tus días, tus minutos y tu equipo.</p></div>`;
    return;
  }
  $('workLbl').textContent = `${routine.name} · ${routine.weeks} semanas`;

  const todayIdx = dayIndexOf(new Date());
  const sel = UI.dayIndex == null ? todayIdx : UI.dayIndex;
  const trained = new Set(recentSessions
    .filter((s) => (Date.now() - new Date(s.started_at)) < 7 * 864e5)
    .map((s) => s.day_id));

  const monday = new Date();
  monday.setDate(monday.getDate() - dayIndexOf(monday));

  $('days').innerHTML = routine.routine_days.map((d) => {
    const date = new Date(monday.getTime() + d.day_index * 864e5);
    const cls = d.day_index === todayIdx ? ' today' : (trained.has(d.id) ? ' done' : '');
    return `<button class="day${cls}" type="button" data-day="${d.day_index}"
      aria-pressed="${d.day_index === sel}"
      aria-label="${DIAS[date.getDay()]} ${date.getDate()}, ${esc(d.name)}">
      <span>${DOW[d.day_index]}</span><b>${date.getDate()}</b></button>`;
  }).join('');

  $('wlist').innerHTML = routine.routine_days.map((d) => {
    const ex = d.routine_exercises || [];
    const sum = d.is_rest ? 'Movilidad o pilates suave'
      : ex.slice(0, 3).map((x) => x.name).join(', ');
    const chips = d.is_rest ? []
      : [...new Set(ex.map((x) => x.muscle))].slice(0, 3);
    const done = trained.has(d.id);
    return `<button class="row${done ? ' done' : ''}${d.is_rest ? ' rest' : ''}"
      type="button" data-open="${d.day_index}">
      <div class="grow"><h4>${esc(d.name)}${d.day_index === todayIdx ? ' · hoy' : ''}</h4>
      <p>${esc(sum)}</p>
      ${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
      </div>
      ${d.is_rest ? '' : `<span class="box"><svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg></span>`}
      </button>`;
  }).join('');
}

function openToday() {
  const d = todayDay();
  if (!d) { go(routine ? 'v-work' : 'v-create'); return; }
  if (d.is_rest) { go('v-studio'); return; }
  openSession(d);
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · CREAR RUTINA
   ══════════════════════════════════════════════════════════════════════════ */

const CREATE = { equipment: [], goal: 'musculo', days: 3, minutes: 45, priorities: [] };

function renderCreate() {
  CREATE.equipment = (profile.equipment || ['libre', 'maquina']).slice();
  CREATE.goal = profile.goal || 'musculo';
  CREATE.days = profile.days_per_week || 3;
  CREATE.minutes = profile.minutes || 45;
  CREATE.priorities = (profile.priorities || []).slice();
  document.querySelectorAll('[data-eq]').forEach((b) => {
    b.setAttribute('aria-pressed', String(CREATE.equipment.includes(b.dataset.eq)));
  });
  document.querySelectorAll('[data-f]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.f === CREATE.goal));
  });
  $('n-days').textContent = CREATE.days;
  $('n-minutes').textContent = CREATE.minutes;
}

function bindCreate() {
  document.querySelectorAll('[data-eq]').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.eq;
      const at = CREATE.equipment.indexOf(k);
      if (at >= 0) CREATE.equipment.splice(at, 1); else CREATE.equipment.push(k);
      if (!CREATE.equipment.length) CREATE.equipment.push(k);
      document.querySelectorAll('[data-eq]').forEach((x) => {
        x.setAttribute('aria-pressed', String(CREATE.equipment.includes(x.dataset.eq)));
      });
    });
  });
  document.querySelectorAll('[data-f]').forEach((b) => {
    b.addEventListener('click', () => {
      CREATE.goal = b.dataset.f;
      document.querySelectorAll('[data-f]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-n]');
    if (!b) return;
    const key = b.dataset.n;
    const d = Number(b.dataset.d);
    if (key === 'days') CREATE.days = Math.max(1, Math.min(7, CREATE.days + d));
    else if (key === 'minutes') CREATE.minutes = Math.max(10, Math.min(180, CREATE.minutes + d));
    else if (key === 'cmin') {
      UI.cardio.min = Math.max(5, Math.min(180, UI.cardio.min + d));
      saveUI();
      const c = $('n-cmin');
      if (c) c.textContent = UI.cardio.min;
      calcKcal();
      return;
    }
    const el = $(`n-${key}`);
    if (el) el.textContent = key === 'days' ? CREATE.days : CREATE.minutes;
  });
  $('gen').addEventListener('click', doGenerate);
  $('brief').addEventListener('change', function () {
    if (this.value.trim()) parseBrief(this.value);
  });
  bindMic();
  $('genOut').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sw]');
    if (!b) return;
    const [di, xi] = b.dataset.sw.split('-').map(Number);
    const day = PREVIEW.days[di];
    const cur = day.exercises[xi];
    openSwapSheet({ muscle: cur.muscle, name: cur.name }, (next) => {
      day.exercises[xi] = { ...cur, name: next.n, slug: next.en, muscle: next.g, equipment: next.eq };
      renderPreview();
    });
  });
}

let PREVIEW = null;

async function doGenerate() {
  const btn = $('gen');
  btn.disabled = true;
  btn.textContent = 'Generando…';
  try {
    /* Los ajustes de esta pantalla se guardan en el perfil: son los mismos
       campos que pidió el cuestionario, así que la rutina es reproducible. */
    profile = await db.saveProfile(profile.id, {
      equipment: CREATE.equipment,
      goal: CREATE.goal,
      days_per_week: CREATE.days,
      minutes: CREATE.minutes,
      priorities: CREATE.priorities,
    });
    PREVIEW = generateRoutine(profile);
    await db.saveRoutine(profile.id, PREVIEW);
    await loadRoutine();
    renderPreview();
    renderWork();
    renderDash();
    btn.textContent = 'Generar y guardar rutina';
    btn.disabled = false;
  } catch (e) {
    $('genOut').innerHTML = `<p class="err" style="margin-top:12px">${esc(db.msgError(e))}</p>`;
    btn.textContent = 'Generar y guardar rutina';
    btn.disabled = false;
  }
}

function renderPreview() {
  if (!PREVIEW) { $('genOut').innerHTML = ''; return; }
  const training = PREVIEW.days.filter((d) => !d.is_rest);
  const banned = (profile.limitations || []);
  $('genOut').innerHTML = `<h2 class="sec">Rutina guardada</h2>${training.map((day) => {
    const di = PREVIEW.days.indexOf(day);
    return `<div class="panel" style="margin-bottom:10px">
      <div class="p" style="padding-bottom:5px">
        <p class="lbl">${esc(day.name)} · ${day.exercises.length} ejercicios · ~${day.exercises.length * 8 + 8} min</p>
      </div>
      ${day.exercises.map((x, j) => `<div class="row" style="cursor:default">
        <div class="grow"><h4>${esc(x.name)}</h4>
        <div class="chips" style="margin-top:6px">
          <span class="chip m">${esc(x.muscle)}</span>
          <span class="chip">${esc(C.EQL[x.equipment] || x.equipment)}</span>
          <span class="chip">${x.sets} × ${x.is_time ? `${x.rep_low}-${x.rep_high} s` : `${x.rep_low}-${x.rep_high}`}</span>
          <span class="chip">RIR ${x.rir}</span>
        </div></div>
        <button class="swap" type="button" data-sw="${di}-${j}" aria-label="Cambiar ${esc(x.name)}">⇄</button>
      </div>`).join('')}
    </div>`;
  }).join('')}
  <p class="note">Generada con tu perfil: ${profile.days_per_week} días, ${profile.minutes} min
  (≈${exercisesPerSession(profile.minutes)} ejercicios), objetivo ${esc(profile.goal)}, nivel ${esc(profile.level)}.
  ${banned.length ? `Se han excluido los ejercicios que cargan: ${esc(banned.join(', '))}.` : 'Sin exclusiones por molestias.'}</p>`;
}

/* ── Dictado por voz ── */
function bindMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;
  $('mic').addEventListener('click', () => {
    if (!SR) {
      $('heard').innerHTML = 'Aquí no hay dictado. <b>Escríbelo abajo</b> y funciona igual.';
      $('brief').focus();
      return;
    }
    if (listening) { rec.stop(); return; }
    try {
      rec = new SR();
      rec.lang = 'es-ES';
      rec.interimResults = true;
      rec.onstart = () => {
        listening = true;
        $('mic').classList.add('live');
        $('heard').textContent = 'Escuchando…';
      };
      rec.onresult = (ev) => {
        let t = '';
        for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        $('heard').innerHTML = `<b>${esc(t)}</b>`;
        $('brief').value = t;
      };
      rec.onerror = () => {
        $('heard').innerHTML = 'No se pudo usar el micrófono. <b>Escríbelo abajo</b>.';
      };
      rec.onend = () => {
        listening = false;
        $('mic').classList.remove('live');
        if ($('brief').value.trim()) parseBrief($('brief').value);
      };
      rec.start();
    } catch {
      $('heard').innerHTML = 'No se pudo iniciar el dictado. <b>Escríbelo abajo</b>.';
    }
  });
}

/** Interpreta una frase libre y ajusta los controles de Crear. */
function parseBrief(text) {
  const t = text.toLowerCase();
  const hits = [];
  if (/fuerza|b[áa]sico|powerlifting|fuerte/.test(t)) { CREATE.goal = 'fuerza'; hits.push('fuerza'); }
  else if (/grasa|definir|adelgazar|perder/.test(t)) { CREATE.goal = 'grasa'; hits.push('perder grasa'); }
  else if (/salud|suave|sentirme|movilidad/.test(t)) { CREATE.goal = 'salud'; hits.push('salud'); }
  else if (/m[úu]sculo|hipertrofia|volumen/.test(t)) { CREATE.goal = 'musculo'; hits.push('músculo'); }

  if (/m[áa]quina/.test(t)) { CREATE.equipment = ['maquina']; hits.push('máquinas'); }
  if (/casa|sin material|peso corporal/.test(t)) { CREATE.equipment = ['corporal']; hits.push('en casa'); }
  if (/mancuerna|barra|peso libre/.test(t) && !/m[áa]quina/.test(t)) {
    CREATE.equipment = ['libre']; hits.push('peso libre');
  }
  const d = t.match(/(\d)\s*(d[íi]as?|veces|x)/);
  if (d) { CREATE.days = Math.max(1, Math.min(7, parseInt(d[1], 10))); hits.push(`${CREATE.days} días`); }
  const m = t.match(/(\d{2,3})\s*min/);
  if (m) { CREATE.minutes = Math.max(10, Math.min(180, parseInt(m[1], 10))); hits.push(`${CREATE.minutes} min`); }

  /* Los músculos nombrados pasan a ser prioridades del perfil. */
  const pri = MUSCLE_CHOICES.filter((g) => t.includes(g.toLowerCase().replace('í', 'i').replace('á', 'a').replace('ú', 'u'))
    || t.includes(g.toLowerCase()));
  if (/gl[úu]teo/.test(t) && !pri.includes('Glúteos')) pri.push('Glúteos');
  if (/pierna/.test(t) && !pri.includes('Cuádriceps')) pri.push('Cuádriceps');
  if (pri.length) { CREATE.priorities = pri; hits.push(pri.join(' y ')); }

  document.querySelectorAll('[data-f]').forEach((x) => {
    x.setAttribute('aria-pressed', String(x.dataset.f === CREATE.goal));
  });
  document.querySelectorAll('[data-eq]').forEach((x) => {
    x.setAttribute('aria-pressed', String(CREATE.equipment.includes(x.dataset.eq)));
  });
  $('n-days').textContent = CREATE.days;
  $('n-minutes').textContent = CREATE.minutes;
  if (hits.length) $('heard').innerHTML = `Entendido: <b>${esc(hits.join(' · '))}</b>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · ESTUDIO
   ══════════════════════════════════════════════════════════════════════════ */

function bindStudio() {
  document.querySelectorAll('[data-st]').forEach((b) => {
    b.addEventListener('click', () => {
      UI.tab = b.dataset.st;
      saveUI();
      document.querySelectorAll('[data-st]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderStudio();
    });
  });
}

function renderStudio() {
  document.querySelectorAll('[data-st]').forEach((x) => {
    x.setAttribute('aria-pressed', String(x.dataset.st === UI.tab));
  });
  const t = UI.tab;
  if (t === 'cardio') { renderCardio(); return; }

  const list = ROUTINES[t] || [];
  $('studioBody').innerHTML = `<h2 class="sec">${t === 'casa' ? 'Entrenar en casa' : t === 'pilates' ? 'Pilates' : 'Movilidad'}</h2>
    ${list.map((r, i) => `<div class="panel" style="margin-bottom:10px">
      <button class="row" type="button" data-rt="${t}|${i}">
        <span class="ico" aria-hidden="true">${r.i}</span>
        <div class="grow"><h4>${esc(r.n)}</h4><p>${esc(r.d)}</p>
        <div class="chips" style="margin-top:7px">
          <span class="chip m">${r.min} min</span><span class="chip lv">${esc(r.lv)}</span>
          <span class="chip">${r.items.length} bloques</span></div></div>
        <span style="color:var(--ink-3)" aria-hidden="true">›</span></button></div>`).join('')}
    <p class="note">Cada rutina se reproduce en modo guiado: te dice qué hacer, cuánto falta y qué viene después.</p>`;

  $('studioBody').querySelectorAll('[data-rt]').forEach((b) => {
    b.addEventListener('click', () => {
      const [tab, i] = b.dataset.rt.split('|');
      startPlayer(ROUTINES[tab][Number(i)]);
    });
  });
}

/** Peso corporal canónico para la fórmula MET (necesita kg de verdad). */
function bodyKg() {
  if (weights.length) return Number(weights[weights.length - 1].weight_kg) || 62;
  return Number(profile.weight_kg) || 62;
}

function renderCardio() {
  const u = units();
  const kg = bodyKg();
  $('studioBody').innerHTML = `
    <div class="panel p" style="margin-top:13px"><div class="kcal"><b id="kcal">0</b>
      <span>kcal estimadas</span></div>
      <p class="note" style="text-align:center">Fórmula MET · MET × 3,5 × kg ÷ 200 × minutos</p></div>
    <h2 class="sec">Modalidad</h2><div class="g3" id="cmode">
    ${CARDIO.map((c) => `<button class="pick" type="button" data-c="${esc(c.n)}" data-met="${c.met}"
      aria-pressed="${UI.cardio.mode === c.n}" style="padding:13px 4px">
      <span style="display:block;font-size:1.2rem;margin-bottom:3px" aria-hidden="true">${c.i}</span>${esc(c.n)}</button>`).join('')}
    </div>
    <h2 class="sec">Parámetros</h2><div class="panel p">
      <div class="field"><div class="grow"><h4>Duración</h4><p>minutos</p></div>
        <div class="num-in"><button type="button" data-n="cmin" data-d="-5" aria-label="Menos minutos">−</button>
          <span class="v" id="n-cmin">${UI.cardio.min}</span>
          <button type="button" data-n="cmin" data-d="5" aria-label="Más minutos">+</button></div></div>
      <div class="field"><div class="grow"><h4>Peso corporal</h4>
        <p>${U.fmtNum(U.toDisplay(kg, u), 1)} ${U.wLabel(u)} · desde tu registro</p></div>
        <span class="val">${U.fmtNum(U.toDisplay(kg, u), 1)} ${U.wLabel(u)}</span></div>
      <div class="field"><div class="grow"><h4>Intensidad</h4><p>Ajusta el MET</p></div>
        <div class="g3" style="gap:5px">
        ${[['0.8', 'Suave'], ['1', 'Media'], ['1.25', 'Fuerte']].map(([v, l]) => `
          <button class="pick" type="button" data-int="${v}" aria-pressed="${String(UI.cardio.int) === v}"
            style="padding:8px 4px;font-size:var(--fs-xs)">${l}</button>`).join('')}
        </div></div></div>
    <button class="btn ghost" id="startCardio" type="button" style="margin-top:13px">Empezar cuenta atrás</button>
    <p class="note">Estimación poblacional, no una medición. Sirve para comparar sesiones entre sí.
    El peso corporal sale de tu último registro en el Panel.</p>`;

  calcKcal();
  $('cmode').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-c]');
    if (!b) return;
    UI.cardio.mode = b.dataset.c;
    UI.cardio.met = parseFloat(b.dataset.met);
    saveUI();
    $('cmode').querySelectorAll('button').forEach((x) => {
      x.setAttribute('aria-pressed', String(x === b));
    });
    calcKcal();
  });
  $('studioBody').querySelectorAll('[data-int]').forEach((b) => {
    b.addEventListener('click', () => {
      UI.cardio.int = parseFloat(b.dataset.int);
      saveUI();
      $('studioBody').querySelectorAll('[data-int]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
      calcKcal();
    });
  });
  $('startCardio').addEventListener('click', () => {
    startTimer(UI.cardio.min * 60, `${UI.cardio.mode} · cuenta atrás`);
  });
}

/* La fórmula MET necesita kilos reales, así que se calcula con el canónico y
   solo el peso mostrado se convierte. */
function calcKcal() {
  const el = $('kcal');
  if (!el) return;
  const met = (UI.cardio.met || 3.5) * (UI.cardio.int || 1);
  el.textContent = U.fmtInt(met * 3.5 * bodyKg() / 200 * UI.cardio.min);
}

/* ── Reproductor guiado ── */
const P = { r: null, i: 0, left: 0, t: null, playing: false };

function bindPlayer() {
  $('pNextBtn').addEventListener('click', nextStep);
  $('pPrev').addEventListener('click', () => { if (P.i > 0) { P.i--; loadStep(); } });
  $('pPlay').addEventListener('click', () => {
    P.playing = !P.playing;
    $('pPlay').textContent = P.playing ? '❚❚ Pausa' : '▶ Seguir';
  });
  $('pQuit').addEventListener('click', () => {
    $('player').classList.remove('open');
    P.playing = false;
    if (P.t) { clearInterval(P.t); P.t = null; }
  });
}

function startPlayer(r) {
  P.r = r; P.i = 0; P.playing = true;
  $('pRoutine').textContent = r.n;
  $('pPlay').textContent = '❚❚ Pausa';
  $('player').classList.add('open');
  loadStep();
  if (P.t) clearInterval(P.t);
  P.t = setInterval(tickPlayer, 1000);
}

function loadStep() {
  const it = P.r.items[P.i];
  P.left = it.s;
  $('pName').textContent = it.n;
  $('pCue').textContent = it.c;
  $('pPhase').textContent = it.rest ? 'Respira' : `Ejercicio ${P.i + 1}`;
  $('pCount').textContent = `${P.i + 1}/${P.r.items.length}`;
  $('pClock').textContent = fmt(P.left);
  $('pClock').style.color = it.rest ? 'var(--am)' : 'var(--cy)';
  const nx = P.r.items[P.i + 1];
  $('pNext').innerHTML = nx ? `Después: <b>${esc(nx.n)}</b>` : 'Último bloque. ¡Ya casi!';
  $('pBar').style.width = `${P.i / P.r.items.length * 100}%`;
}

function tickPlayer() {
  if (!P.playing) return;
  P.left--;
  $('pClock').textContent = fmt(Math.max(0, P.left));
  if (P.left <= 0) nextStep();
}

function nextStep() {
  if (P.i < P.r.items.length - 1) { P.i++; loadStep(); return; }
  $('pName').textContent = '¡Terminado!';
  $('pCue').textContent = `Has completado ${P.r.n}. ${P.r.min} minutos bien invertidos.`;
  $('pClock').textContent = '✓';
  $('pPhase').textContent = 'Completado';
  $('pNext').textContent = '';
  $('pBar').style.width = '100%';
  P.playing = false;
  if (P.t) { clearInterval(P.t); P.t = null; }
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · CUERPO · mapa anatómico con volumen real
   ══════════════════════════════════════════════════════════════════════════ */

/** Nivel 1-4 según lo cerca que está del objetivo semanal; 0 si no hay datos. */
function musLevel(m) {
  if (!m || !m.t || !volumeTotal) return 0;
  const pct = (volume[m.n] || 0) / m.t;
  if (pct >= 0.9) return 4;
  if (pct >= 0.7) return 3;
  if (pct >= 0.45) return 2;
  if (pct > 0) return 1;
  return 1;
}

function bodySvg(d, side) {
  const back = side === 'back';
  let out = `<svg class="body${back ? ' rear' : ''}" viewBox="${d.viewBox}" role="img"
    aria-label="Mapa muscular, vista ${back ? 'posterior' : 'frontal'}">
    <path d="${d.outline}" fill="var(--panel-2)" stroke="var(--edge)" stroke-width="2"/>`;
  Object.keys(d.muscles).forEach((sl) => {
    const g = C.SLUG_TO_MUSCLE[sl];
    const lv = musLevel(g);
    const fill = lv ? `url(#mv${lv})` : 'var(--panel-2)';
    const sh = lv === 4 ? ' style="filter:drop-shadow(0 0 5px var(--cy))"' : '';
    const lab = g ? g.n : sl;
    d.muscles[sl].forEach((p) => {
      out += `<path class="m" data-m="${esc(sl)}" d="${p}" fill="${fill}"
        stroke="rgba(160,220,255,.2)" stroke-width="1"${sh}><title>${esc(lab)}</title></path>`;
    });
  });
  return `${out}</svg>`;
}

function renderBody() {
  if (!ANATOMY) {
    $('flipper').innerHTML = '<p class="empty">No se ha podido cargar el mapa corporal.</p>';
  } else {
    const A = ANATOMY[UI.sexo] || ANATOMY.f;
    $('flipper').innerHTML = bodySvg(A.front, 'front') + bodySvg(A.back, 'back');
  }
  renderMuscleList();
}

function renderMuscleList() {
  if (!volumeTotal) {
    $('mlist').innerHTML = `<p class="empty"><b>Aún no hay volumen registrado.</b>
      El mapa se irá encendiendo a medida que marques series en tus sesiones.</p>`;
    return;
  }
  $('mlist').innerHTML = C.MUSCLES.map((m) => {
    const s = volume[m.n] || 0;
    const pct = Math.min(100, Math.round(s / m.t * 100));
    return `<div class="mrow"><div class="grow"><h4>${esc(m.n)}</h4>
      <p>${s} / ${m.t} series · ${pct}%</p>
      <div class="track"><i class="${pct >= 90 ? 'hi' : pct >= 60 ? '' : 'lo'}"
        style="width:${pct}%"></i></div></div></div>`;
  }).join('');
}

function bindBody() {
  $('flipper').addEventListener('click', (ev) => {
    const el = ev.target.closest ? ev.target.closest('[data-m]') : null;
    if (el) openMuscle(el.getAttribute('data-m'));
  });
  document.querySelectorAll('[data-side]').forEach((b) => {
    b.addEventListener('click', () => setSide(b.dataset.side));
  });
  $('flip').addEventListener('click', () => setSide(UI.side === 'front' ? 'back' : 'front'));
  $('sexPick').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sex]');
    if (b) setSexo(b.dataset.sex);
  });
}

function setSide(side) {
  UI.side = side;
  saveUI();
  $('flipper').classList.toggle('back', side === 'back');
  document.querySelectorAll('[data-side]').forEach((x) => {
    x.setAttribute('aria-pressed', String(x.dataset.side === side));
  });
}

function renderSexPick() {
  document.querySelectorAll('[data-sex]').forEach((x) => {
    x.setAttribute('aria-pressed', String(x.dataset.sex === UI.sexo));
  });
}

async function setSexo(sx) {
  UI.sexo = sx === 'm' ? 'm' : 'f';
  saveUI();
  renderSexPick();
  renderBody();
  /* El sexo es parte del perfil: se persiste, sin bloquear la interfaz. */
  try {
    profile = await db.saveProfile(profile.id, { sex: UI.sexo });
  } catch { /* se reintentará al volver a tocarlo */ }
}

function openMuscle(slug) {
  const m = C.SLUG_TO_MUSCLE[slug];
  if (!m) return;
  const s = volume[m.n] || 0;
  const pct = Math.min(100, Math.round(s / m.t * 100));
  const falta = m.t - s;
  $('shLbl').textContent = 'Volumen · 7 días';
  $('shTitle').textContent = m.n;
  if (!volumeTotal) {
    $('shSub').textContent = 'Sin datos todavía';
    $('shList').innerHTML = `<p class="empty"><b>Aún no hay series registradas.</b>
      Cuando entrenes, aquí verás cuántas series semanales llevas de ${esc(m.n.toLowerCase())}
      y cuántas te faltan para el rango objetivo (${m.t}).</p>`;
  } else {
    $('shSub').textContent = `${s} de ${m.t} series en los últimos 7 días`;
    $('shList').innerHTML = `
      <div class="track" style="height:8px"><i class="${pct >= 90 ? 'hi' : pct >= 60 ? '' : 'lo'}"
        style="width:${pct}%"></i></div>
      <p class="mono" style="font-size:var(--fs-xs);color:var(--ink-3);margin:8px 0 0">${pct}% del objetivo</p>
      <p class="hint${falta > 0 ? ' warn' : ' pr'}">${falta > 0
        ? `${falta === 1 ? '<b>Te falta 1 serie</b>' : `<b>Te faltan ${falta} series</b>`} para llegar al rango objetivo.`
        : '<b>Vas bien:</b> estás dentro del rango objetivo.'}</p>`;
  }
  swapCb = null;
  $('sheet').classList.add('open');
}

/* ══════════════════════════════════════════════════════════════════════════
   9 · SESIÓN DE ENTRENO
   ══════════════════════════════════════════════════════════════════════════ */

const SESS = {
  day: null,          // routine_day
  ex: [],             // routine_exercises
  sessionId: null,
  sets: new Map(),    // clave → fila de session_sets (weight_kg canónico)
  rpe: null,
  note: '',
  elapsed: 0,
};

const key = (i, s, warm) => `${warm ? 'w' : ''}${i}:${s}`;

async function openSession(day) {
  SESS.day = day;
  SESS.ex = (day.routine_exercises || []).slice();
  SESS.sets = new Map();
  SESS.sessionId = null;
  SESS.rpe = null;
  SESS.note = '';
  SESS.elapsed = 0;
  UI.exIdx = 0;
  UI.warmOpen = {};        // el desplegable de calentamiento es por sesión
  stripAt = -1;
  saveUI();

  $('sName').textContent = day.name;
  $('sMode').textContent = UI.mode === 'fuerza' ? 'Fuerza · top set' : 'Hipertrofia';
  $('startBox').style.display = 'block';
  $('liveBar').style.display = 'none';
  $('finish').style.display = 'none';
  $('saved').textContent = '';
  $('note').value = '';
  $('rpe').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  $('exlist').innerHTML = '';
  go('v-sess');

  if (!SESS.ex.length) {
    $('exlist').innerHTML = `<p class="empty" style="margin-top:14px"><b>Este día no tiene ejercicios.</b>
      Genera la rutina otra vez desde Crear.</p>`;
    $('strip').innerHTML = '';
    return;
  }

  /* Historial real para la columna Auto y el aviso de "la última vez". */
  try {
    lastBest = await db.getLastBestFor(profile.id, SESS.ex.map((x) => x.name));
  } catch { lastBest = {}; }

  /* ¿Había una sesión sin cerrar de este día? Se reanuda con sus series. */
  try {
    const open = await db.getOpenSession(profile.id, day.id);
    if (open) {
      SESS.sessionId = open.id;
      SESS.elapsed = open.elapsed_s || 0;
      const rows = await db.getSessionSets(open.id);
      rows.forEach((r) => {
        const i = SESS.ex.findIndex((x) => x.name === r.exercise);
        if (i < 0) return;
        SESS.sets.set(key(i, r.set_index, r.is_warmup), r);
      });
      if (rows.length) {
        $('startBox').style.display = 'none';
        $('liveBar').style.display = 'flex';
        $('elapsed').textContent = fmt(SESS.elapsed);
        startSessClock();
      }
    }
  } catch { /* se empieza de cero */ }

  buildSession();
}

/** Peso objetivo canónico de una serie, o null si no hay historial. */
function targetKg(i, s) {
  const e = SESS.ex[i];
  const lb = lastBest[e.name];
  if (!lb || lb.weight_kg == null || Number(lb.weight_kg) <= 0) return null;
  let kg = Number(lb.weight_kg);
  /* En modo fuerza la serie TOP sube un 15 % sobre la última referencia. */
  if (UI.mode === 'fuerza' && s === 0) kg *= 1.15;
  return roundKg(kg);
}

/** Redondea kg canónicos al paso natural del sistema del usuario. */
function roundKg(kg) {
  const u = units();
  const disp = U.roundToStep(U.toDisplay(kg, u), u);
  return U.fromInput(disp, u);
}

function targetReps(i, s) {
  const e = SESS.ex[i];
  if (e.is_time) return e.rep_low;
  if (UI.mode === 'fuerza' && s === 0) return Math.max(3, Math.min(5, e.rep_low));
  return e.rep_low;
}

function targetRir(i, s) {
  const e = SESS.ex[i];
  if (UI.mode === 'fuerza' && s === 0) return 1;
  return e.rir;
}

function repRange(i, s) {
  const e = SESS.ex[i];
  if (e.is_time) return `${e.rep_low}-${e.rep_high} s`;
  if (UI.mode === 'fuerza' && s === 0) return '3-5';
  return `${e.rep_low}-${e.rep_high}`;
}

/** Calentamientos en modo fuerza: barra, 50 % y 75 % del objetivo. */
function warmups(i) {
  const e = SESS.ex[i];
  if (UI.mode !== 'fuerza' || e.is_time || e.equipment !== 'libre') return [];
  const top = targetKg(i, 0);
  if (!top) return [];
  const u = units();
  const bar = U.barKg(u);
  if (U.toDisplay(top, u) < 25) return [];
  return [
    { kg: bar, reps: 8 },
    { kg: roundKg(top * 0.5), reps: 5 },
    { kg: roundKg(top * 0.75), reps: 3 },
  ].filter((w) => w.kg > 0 && w.kg < top);
}

const warmOn = (i) => UI.warmOpen[i] !== false;

/** Crea en memoria las filas de las series que falten. */
function ensureSets(i) {
  const e = SESS.ex[i];
  for (let s = 0; s < e.sets; s++) {
    const k = key(i, s, false);
    if (!SESS.sets.has(k)) {
      const t = targetKg(i, s);
      SESS.sets.set(k, {
        id: uuid(), session_id: null, exercise: e.name, set_index: s, is_warmup: false,
        weight_kg: t == null ? 0 : t,
        reps: e.is_time ? null : targetReps(i, s),
        seconds: e.is_time ? targetReps(i, s) : null,
        rir: null, done: false,
      });
    }
  }
  warmups(i).forEach((w, wi) => {
    const k = key(i, wi, true);
    if (!SESS.sets.has(k)) {
      SESS.sets.set(k, {
        id: uuid(), session_id: null, exercise: e.name, set_index: wi, is_warmup: true,
        weight_kg: w.kg, reps: w.reps, seconds: null, rir: null, done: false,
      });
    }
  });
}

function setsDone(i) {
  const e = SESS.ex[i];
  let n = 0;
  for (let s = 0; s < e.sets; s++) {
    const st = SESS.sets.get(key(i, s, false));
    if (st && st.done) n++;
  }
  return n;
}

function firstOpen(i) {
  const e = SESS.ex[i];
  for (let s = 0; s < e.sets; s++) {
    const st = SESS.sets.get(key(i, s, false));
    if (!st || !st.done) return s + 1;
  }
  return e.sets;
}

/* ── Tira de miniaturas con GIF ── */
let stripAt = -1;

function renderStrip() {
  const host = $('strip');
  host.innerHTML = SESS.ex.map((e, i) => {
    const d = setsDone(i);
    const pct = e.sets ? Math.round(d / e.sets * 100) : 0;
    return `<button class="tw" type="button" data-tile="${i}" aria-current="${i === UI.exIdx}"
      aria-label="${esc(e.name)}, ${d} de ${e.sets} series">
      ${gifHtml(e.name, 'tile')}
      <span class="tp"><i style="width:${pct}%"></i></span></button>`;
  }).join('') + '<span class="tw add" aria-hidden="true"><span class="tile">+</span><span class="tp"></span></span>';
  bindGifs(host);
  if (stripAt !== UI.exIdx) {
    stripAt = UI.exIdx;
    const act = host.children[UI.exIdx];
    if (act) host.scrollLeft = Math.max(0, act.offsetLeft - (host.clientWidth - act.offsetWidth) / 2);
  }
}

/**
 * Marca de imagen del ejercicio: GIF real del dataset con iniciales debajo
 * como respaldo. Las iniciales se ven mientras carga y se quedan si falla.
 */
function gifHtml(name, cls) {
  const item = C.poolByName(name) || { n: name, en: name };
  const url = C.gifUrl(item);
  const ini = C.initials(name);
  if (!url) return `<span class="${cls} gif-wrap"><span class="ini">${esc(ini)}</span></span>`;
  return `<span class="${cls} gif-wrap"><span class="ini">${esc(ini)}</span>
    <img data-gif src="${esc(url)}" alt="" loading="lazy" decoding="async"></span>`;
}

/** Ata load/error a los GIF recién pintados (no se usa HTML en línea: CSP). */
function bindGifs(root) {
  root.querySelectorAll('img[data-gif]').forEach((img) => {
    if (img.dataset.bound) return;
    img.dataset.bound = '1';
    const done = () => {
      img.classList.add('ready');
      if (img.parentNode) img.parentNode.classList.add('done');
    };
    if (img.complete && img.naturalWidth) { done(); return; }
    img.addEventListener('load', done);
    /* Si la imagen no llega, se queda la marca de iniciales. */
    img.addEventListener('error', () => img.remove());
  });
}

/* ── e1RM ── */
function e1Html(i) {
  const e = SESS.ex[i];
  if (e.is_time) return 'sin e1RM';
  const u = units();
  let best = null;
  for (let s = 0; s < e.sets; s++) {
    const st = SESS.sets.get(key(i, s, false));
    if (st && st.done) {
      const v = U.e1rm(st.weight_kg, st.reps);
      if (v && (best === null || v > best)) best = v;
    }
  }
  if (best === null) {
    const st = SESS.sets.get(key(i, 0, false));
    const v = st ? U.e1rm(st.weight_kg, st.reps) : null;
    if (v) best = v;
  }
  if (best === null) return 'sin e1RM';
  const prev = lastBest[e.name] ? U.e1rm(lastBest[e.name].weight_kg, lastBest[e.name].reps) : null;
  const gain = prev && best > prev + 0.05
    ? `<em>+${U.fmtNum(U.toDisplay(best - prev, u), 1)} (${U.fmtNum((best - prev) / prev * 100, 1)}%)</em>` : '';
  return `e1RM ≈ ${U.fmtNum(U.toDisplay(best, u), 1)} ${U.wLabel(u)}${gain}`;
}

/* ── Insignia de RIR ── */
function rirCls(v) {
  if (v === '?' || v == null) return 'rq';
  const n = Number(v);
  if (isNaN(n)) return 'rq';
  return `r${n >= 6 ? 6 : n}`;
}

function rirBadge(i, s) {
  if (SESS.ex[i].is_time) return '';
  const st = SESS.sets.get(key(i, s, false)) || {};
  const has = st.rir != null;
  const val = has ? st.rir : targetRir(i, s);
  return `<span class="rir ${rirCls(val)}${has ? '' : ' dim'}" aria-hidden="true">${val === '?' ? '?' : val}</span>`;
}

/** Texto del campo de un valor, ya convertido a las unidades del usuario. */
function fieldText(i, s, f) {
  const st = SESS.sets.get(key(i, s, false)) || {};
  const u = units();
  if (f === 'kg') {
    const live = KP.open && KP.i === i && KP.s === s && KP.f === 'kg' && KP.buf !== '';
    return live ? KP.buf : U.fmtNum(U.toDisplay(st.weight_kg || 0, u), 1);
  }
  const live = KP.open && KP.i === i && KP.s === s && KP.f === 'reps' && KP.buf !== '';
  if (live) return KP.buf;
  return String(SESS.ex[i].is_time ? (st.seconds || 0) : (st.reps || 0));
}

const unitOf = (i, f) => (f === 'kg' ? U.wLabel(units()) : (SESS.ex[i].is_time ? 's' : 'reps'));

function paintKf(i, s, f) {
  const el = $(`kf-${f}-${i}-${s}`);
  if (!el) return;
  el.innerHTML = `${esc(fieldText(i, s, f))} <small>${unitOf(i, f)}</small>${f === 'reps' ? rirBadge(i, s) : ''}`;
}

/** Prescripción de la columna Auto. */
function autoMain(i, s) {
  const e = SESS.ex[i];
  const u = units();
  if (e.is_time) return `${targetReps(i, s)} s`;
  const t = targetKg(i, s);
  if (t == null) return 'Elige el peso';
  return `${U.fmtNum(U.toDisplay(t, u), 1)} ${U.wLabel(u)} × ${repRange(i, s)}`;
}

function autoSub(i, s) {
  const e = SESS.ex[i];
  if (e.is_time) return 'aguanta';
  const t = targetKg(i, s);
  if (t == null) return `${repRange(i, s)} · ${targetRir(i, s)} RIR`;
  return `${targetRir(i, s)} RIR`;
}

const RIRTXT = { 0: 'al fallo', 1: 'te sobra 1 repe', 2: 'te sobran 2 repes', 3: 'te sobran 3 repes' };

function tickSvg() {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="3"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>`;
}

function renderFocus() {
  const i = UI.exIdx;
  const e = SESS.ex[i];
  if (!e) return;
  const u = units();
  const strength = UI.mode === 'fuerza';
  ensureSets(i);

  const wu = warmups(i);
  const showW = wu.length > 0 && warmOn(i);
  let rows = '';

  if (showW) {
    wu.forEach((w, wi) => {
      const st = SESS.sets.get(key(i, wi, true)) || {};
      const on = !!st.done;
      rows += `<div class="rp-r warm${on ? ' done' : ''}"><span class="rp-n">C${wi + 1}</span>
        <span class="rp-auto">${U.fmtNum(U.toDisplay(w.kg, u), 1)} ${U.wLabel(u)} × ${w.reps}<small>calentamiento</small></span>
        <span class="kf ro">${U.fmtNum(U.toDisplay(w.kg, u), 1)} <small>${U.wLabel(u)}</small></span>
        <span class="kf ro">${w.reps} <small>reps</small></span>
        <button class="tick" type="button" data-act="wtick" data-i="${i}" data-w="${wi}"
          aria-pressed="${on}" aria-label="Calentamiento ${wi + 1} hecho">${tickSvg()}</button></div>`;
    });
  }

  for (let s = 0; s < e.sets; s++) {
    const st = SESS.sets.get(key(i, s, false));
    const isTop = strength && s === 0;
    rows += `<div class="rp-r${st.done ? ' done' : ''}${isTop ? ' top' : ''}" id="rp-${i}-${s}">
      <span class="rp-n">${isTop ? 'TOP' : s + 1}</span>
      <span class="rp-auto">${esc(autoMain(i, s))}<small>${esc(autoSub(i, s))}</small></span>
      <button class="kf" type="button" data-act="field" data-i="${i}" data-s="${s}" data-f="kg"
        id="kf-kg-${i}-${s}" aria-label="Peso de la serie ${s + 1} en ${U.wLabel(u)}">
        ${esc(fieldText(i, s, 'kg'))} <small>${U.wLabel(u)}</small></button>
      <button class="kf" type="button" data-act="field" data-i="${i}" data-s="${s}" data-f="reps"
        id="kf-reps-${i}-${s}" aria-label="${e.is_time ? 'Segundos' : 'Repeticiones'} de la serie ${s + 1}">
        ${esc(fieldText(i, s, 'reps'))} <small>${unitOf(i, 'reps')}</small>${rirBadge(i, s)}</button>
      <button class="tick" type="button" data-act="tick" data-i="${i}" data-s="${s}"
        aria-pressed="${!!st.done}" aria-label="Serie ${s + 1} hecha">${tickSvg()}</button></div>`;
  }

  const rirNow = targetRir(i, strength ? 1 : 0);
  let hints = `<p class="hint"><b>Objetivo:</b> ${strength && !e.is_time
    ? `la serie TOP cerca del límite (${RIRTXT[1]}), y las de después más suaves.`
    : `para cuando ${RIRTXT[rirNow] || `te sobren ${rirNow} repes`}. No hace falta llegar al fallo.`}</p>`;

  const lb = lastBest[e.name];
  if (lb) {
    const when = new Date(lb.started_at);
    const lbl = `${when.getDate()} ${MES_CORTO[when.getMonth()]}`;
    const val = e.is_time
      ? `${lb.seconds || 0} s`
      : `${U.fmtNum(U.toDisplay(lb.weight_kg, u), 1)} ${U.wLabel(u)} × ${lb.reps}`;
    const bump = U.fmtNum(U.step(u), 1);
    hints += `<p class="hint"><b>La última vez (${lbl}):</b> ${esc(val)}${e.is_time
      ? '. Intenta aguantar 5 segundos más.'
      : `. Si te salen todas las repes fáciles, sube ${bump} ${U.wLabel(u)}.`}</p>`;
  } else {
    hints += `<p class="hint warn"><b>Primera vez con este ejercicio.</b>
      Empieza con un peso que puedas mover con técnica limpia y anótalo: la próxima
      sesión ya tendrás referencia.</p>`;
  }
  const pool = C.poolByName(e.name);
  if (pool && pool.c) hints += `<p class="hint"><b>Técnica:</b> ${esc(pool.c)}</p>`;

  const acts = `<div class="mini">
    <button type="button" data-act="info">ⓘ Info</button>
    ${wu.length ? `<button type="button" data-act="warm" aria-pressed="${warmOn(i)}">🔥 Calentamiento</button>` : ''}
    <button type="button" data-act="swap">⇄ Cambiar</button>
    <button type="button" data-act="hist">📈 Historial</button></div>`;

  const nota = notes[e.name] || '';

  $('exlist').innerHTML = `<div class="fx"><div class="fx-h"><div class="grow">
    <h2>${esc(e.name)}</h2>
    <p class="who" id="serieNow">Serie ${firstOpen(i)} de ${e.sets}</p></div>
    <div class="e1" id="e1pill">${e1Html(i)}</div></div>
    <div class="chips" style="margin-top:9px"><span class="chip m">${esc(e.muscle)}</span>
    <span class="chip">${esc(C.EQL[e.equipment] || e.equipment)}</span>
    <span class="chip">${e.rest_s}s desc.</span></div>
    ${gifHtml(e.name, 'ex-gif')}
    ${acts}
    <div class="rp-h"><span>Serie</span><span>Auto</span><span>${U.wLabel(u)}</span>
      <span>${e.is_time ? 'Tiempo' : 'Reps'}</span><span>✓</span></div>
    <div class="rp-b">${rows}</div>${hints}
    <textarea class="ta" id="exNote" style="min-height:52px;margin-top:11px"
      aria-label="Nota para este ejercicio"
      placeholder="Nota para este ejercicio (ej: subir el asiento a 4)">${esc(nota)}</textarea>
    </div>`;

  bindGifs($('exlist'));

  const tn = $('exNote');
  if (tn) {
    tn.addEventListener('input', () => {
      notes[e.name] = tn.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        db.write('note', { profileId: profile.id, exercise: e.name, note: tn.value },
          `note:${e.name}`).catch(() => {});
      }, 700);
    });
  }

  if (KP.open) {
    if (KP.i === i) {
      const kel = kfEl();
      if (kel) { kel.classList.add('on'); paintKf(KP.i, KP.s, KP.f); }
    } else closeKpad();
  }
}

let noteTimer = null;

function buildSession() {
  if (!SESS.ex.length) return;
  if (UI.exIdx < 0 || UI.exIdx >= SESS.ex.length) UI.exIdx = 0;
  SESS.ex.forEach((e, i) => ensureSets(i));
  renderFocus();
  updateSess();
}

function updateSess() {
  let done = 0;
  let tot = 0;
  SESS.ex.forEach((e, i) => {
    tot += e.sets;
    for (let s = 0; s < e.sets; s++) {
      const st = SESS.sets.get(key(i, s, false));
      if (st && st.done) done++;
    }
  });
  ring('rS', tot ? done / tot : 0, 18);
  $('sTxt').textContent = `${done}/${tot}`;
  $('finish').style.display = (tot && done === tot) ? 'block' : 'none';
  renderStrip();
  const sn = $('serieNow');
  if (sn) sn.textContent = `Serie ${firstOpen(UI.exIdx)} de ${SESS.ex[UI.exIdx].sets}`;
  const pill = $('e1pill');
  if (pill) pill.innerHTML = e1Html(UI.exIdx);
}

/**
 * Da de alta la sesión la primera vez que hace falta.
 * El id se genera aquí, en el cliente, así que está disponible al instante
 * incluso sin red: la escritura se encola y las series ya pueden colgar de él.
 */
async function ensureSession() {
  if (SESS.sessionId) return SESS.sessionId;
  const id = uuid();
  SESS.sessionId = id;          // disponible ya, haya red o no
  const row = {
    id,
    profile_id: profile.id,
    day_id: SESS.day.id,
    title: SESS.day.name,
    started_at: new Date().toISOString(),
    elapsed_s: 0,
  };
  await db.write('session_start', { row }, `sess:${id}`).catch((e) => {
    console.warn('sesión no creada', db.msgError(e));
  });
  return id;
}

/** Guarda una serie: upsert idempotente, con cola si no hay red. */
async function persistSet(k) {
  const st = SESS.sets.get(k);
  if (!st) return;
  const sid = await ensureSession();
  st.session_id = sid;
  const row = {
    id: st.id, session_id: sid, exercise: st.exercise, set_index: st.set_index,
    is_warmup: st.is_warmup, weight_kg: st.weight_kg, reps: st.reps,
    seconds: st.seconds, rir: st.rir, done: st.done,
  };
  try {
    await db.write('set', { row }, `set:${st.id}`);
  } catch (e) {
    console.warn('serie no guardada', db.msgError(e));
  }
}

function bindSession() {
  $('strip').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tile]');
    if (!b) return;
    closeKpad();
    UI.exIdx = Number(b.dataset.tile);
    saveUI();
    renderFocus();
    updateSess();
  });

  $('exlist').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    const i = UI.exIdx;
    if (act === 'swap') { closeKpad(); doSwap(i); return; }
    if (act === 'info') { openInfo(i); return; }
    if (act === 'hist') { openHistory(i); return; }
    if (act === 'warm') { UI.warmOpen[i] = !warmOn(i); saveUI(); renderFocus(); return; }
    if (act === 'wtick') {
      const wi = Number(b.dataset.w);
      const k = key(i, wi, true);
      const st = SESS.sets.get(k);
      if (!st) return;
      st.done = !st.done;
      renderFocus();
      persistSet(k);
      return;
    }
    const s = Number(b.dataset.s);
    if (act === 'field') { openKpad(i, s, b.dataset.f); return; }
    if (act === 'tick') {
      const k = key(i, s, false);
      const st = SESS.sets.get(k);
      if (!st) return;
      st.done = !st.done;
      const row = $(`rp-${i}-${s}`);
      if (row) row.classList.toggle('done', st.done);
      b.setAttribute('aria-pressed', String(st.done));
      if (st.done) startTimer(SESS.ex[i].rest_s, 'Descanso'); else stopTimer();
      updateSess();
      persistSet(k);
    }
  });

  $('startBtn').addEventListener('click', async () => {
    $('startBox').style.display = 'none';
    $('liveBar').style.display = 'flex';
    startSessClock();
    await ensureSession();
  });
  $('pauseBtn').addEventListener('click', () => {
    if (sessTimer) {
      clearInterval(sessTimer); sessTimer = null;
      $('pauseBtn').textContent = '▶';
      $('pauseBtn').setAttribute('aria-label', 'Seguir');
    } else {
      startSessClock();
      $('pauseBtn').textContent = '❚❚';
      $('pauseBtn').setAttribute('aria-label', 'Pausar');
    }
  });
  $('stopBtn').addEventListener('click', () => {
    if (sessTimer) { clearInterval(sessTimer); sessTimer = null; }
    $('elapsed').textContent = fmt(SESS.elapsed);
    $('finish').style.display = 'block';
    $('finish').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('rpe').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    SESS.rpe = b.dataset.v;
    $('rpe').querySelectorAll('button').forEach((x) => {
      x.setAttribute('aria-pressed', String(x === b));
    });
  });
  $('note').addEventListener('input', function () { SESS.note = this.value; });
  $('save').addEventListener('click', saveSession);

  $('soundBtn').addEventListener('click', async () => {
    const next = !(profile.sound !== false);
    profile.sound = next;
    paintSound();
    if (next) restAlert();
    try { profile = await db.saveProfile(profile.id, { sound: next }); } catch { /* luego */ }
    renderSettings();
  });

  $('kpad').addEventListener('click', onKpadClick);
  $('skip').addEventListener('click', () => stopTimer());
  $('more').addEventListener('click', () => { left += 30; paintRest(); });
  $('less').addEventListener('click', () => { left = Math.max(5, left - 30); paintRest(); });
}

let sessTimer = null;
function startSessClock() {
  if (sessTimer) clearInterval(sessTimer);
  $('elapsed').textContent = fmt(SESS.elapsed);
  sessTimer = setInterval(() => {
    SESS.elapsed++;
    $('elapsed').textContent = fmt(SESS.elapsed);
  }, 1000);
}

async function saveSession() {
  const btn = $('save');
  btn.disabled = true;
  const out = $('saved');
  out.textContent = 'Guardando…';
  if (sessTimer) { clearInterval(sessTimer); sessTimer = null; }

  let done = 0;
  let vol = 0;
  SESS.ex.forEach((e, i) => {
    for (let s = 0; s < e.sets; s++) {
      const st = SESS.sets.get(key(i, s, false));
      if (st && st.done) { done++; vol += (Number(st.weight_kg) || 0) * (Number(st.reps) || 0); }
    }
  });

  const sid = await ensureSession();
  const patch = {
    ended_at: new Date().toISOString(),
    elapsed_s: SESS.elapsed,
    rpe: SESS.rpe,
    note: SESS.note || null,
  };
  let ok = true;
  if (sid) {
    ok = await db.write('session_end', { sessionId: sid, patch }, `end:${sid}`)
      .catch(() => false);
  } else ok = false;

  const u = units();
  out.textContent = `${ok ? 'Guardado' : 'Guardado en este dispositivo'} · ${done} series · `
    + `${U.fmtInt(U.toDisplay(vol, u))} ${U.wLabel(u)} de volumen · ${fmt(SESS.elapsed)} de sesión.`
    + (ok ? '' : ' Se subirá al volver la conexión.');
  btn.disabled = false;

  /* Refresca lo que depende de datos reales. */
  await loadStats();
  await refreshSetCounts();
  renderDash();
  renderWork();
  renderBody();
}

/** Recuento de series por sesión, para las barras del panel. */
async function refreshSetCounts() {
  sessionSetCount = {};
  distinctEx = 0;
  if (!recentSessions.length) return;
  try {
    const sets = await db.getSetsForSessions(recentSessions.map((s) => s.id));
    const names = new Set();
    sets.forEach((r) => {
      if (!r.done || r.is_warmup) return;
      sessionSetCount[r.session_id] = (sessionSetCount[r.session_id] || 0) + 1;
      const s = recentSessions.find((x) => x.id === r.session_id);
      if (s && (Date.now() - new Date(s.started_at)) < 7 * 864e5) names.add(r.exercise);
    });
    distinctEx = names.size;
  } catch { /* el panel se queda sin barras, no es crítico */ }
}

/* ── Cambio inteligente de ejercicio (persiste en routine_exercises) ── */
function doSwap(i) {
  const e = SESS.ex[i];
  openSwapSheet({ muscle: e.muscle, name: e.name }, async (next) => {
    const patch = { name: next.n, slug: next.en, muscle: next.g, equipment: next.eq, is_time: !!next.time };
    try {
      await db.swapRoutineExercise(e.id, patch);
    } catch (err) {
      console.warn('cambio no guardado', db.msgError(err));
    }
    Object.assign(e, patch);
    /* Las series de ese ejercicio se rehacen: eran de otro movimiento. */
    for (let s = 0; s < e.sets + 4; s++) {
      SESS.sets.delete(key(i, s, false));
      SESS.sets.delete(key(i, s, true));
    }
    try {
      lastBest = await db.getLastBestFor(profile.id, SESS.ex.map((x) => x.name));
    } catch { /* sin referencia */ }
    await loadRoutine();
    buildSession();
    renderWork();
  });
}

/* ══ Info y historial ══ */
function openInfo(i) {
  const e = SESS.ex[i];
  const pool = C.poolByName(e.name);
  closeKpad();
  $('shLbl').textContent = 'Cómo se hace';
  $('shTitle').textContent = e.name;
  $('shSub').textContent = `${C.EQL[e.equipment] || e.equipment} · ${e.muscle}`;
  const steps = pool ? C.stepsFor(pool) : [];
  $('shList').innerHTML = `${gifHtml(e.name, 'ex-gif')}
    ${pool && pool.c ? `<p class="hint"><b>Técnica:</b> ${esc(pool.c)}</p>` : ''}
    ${pool && pool.e ? `<p class="hint warn"><b>Evita:</b> ${esc(pool.e)}</p>` : ''}
    ${steps.length ? `<h2 class="sec">Paso a paso</h2><ol style="margin:0;padding-left:20px;
      font-size:var(--fs-sm);color:var(--ink-2);line-height:1.55">
      ${steps.slice(0, 6).map((s) => `<li style="margin-bottom:5px">${esc(s)}</li>`).join('')}</ol>` : ''}
    <p class="note">Prescripción de esta semana: ${repRange(i, 1)} ${e.is_time ? '' : 'repes'}
    con ${targetRir(i, 1)} RIR y ${e.rest_s} s de descanso.</p>`;
  bindGifs($('shList'));
  swapCb = null;
  $('sheet').classList.add('open');
}

function chartSvg(pts, unit) {
  const W = 300;
  const H = 134;
  const PL = 34;
  const PR = 10;
  const PT = 14;
  const PB = 24;
  const vals = pts.map((p) => p.v);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const sp = mx - mn;
  const lo = mn - Math.max(1, sp * 0.4);
  const hi = mx + Math.max(1, sp * 0.3);
  const X = (a) => Math.round((PL + a * (W - PL - PR) / Math.max(1, pts.length - 1)) * 10) / 10;
  const Y = (v) => Math.round((PT + (hi - v) / (hi - lo) * (H - PT - PB)) * 10) / 10;
  const line = pts.map((p, a) => `${X(a)},${Y(p.v)}`).join(' ');
  let grid = '';
  for (let j = 0; j < 3; j++) {
    const gy = Math.round((PT + j * (H - PT - PB) / 2) * 10) / 10;
    grid += `<line class="gl" x1="${PL}" y1="${gy}" x2="${W - PR}" y2="${gy}" stroke-width="1"/>`;
  }
  const lastX = X(pts.length - 1);
  const lastY = Y(pts[pts.length - 1].v);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Evolución de la mejor serie en las últimas ${pts.length} sesiones">${grid}
    <polygon points="${X(0)},${Y(lo)} ${line} ${lastX},${Y(lo)}" fill="url(#irid)" fill-opacity=".12"/>
    <polyline points="${line}" fill="none" stroke="url(#irid)" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="6" fill="var(--cy)" fill-opacity=".2"/>
    <circle cx="${lastX}" cy="${lastY}" r="3.2" fill="var(--cy)"/>
    <text x="${PL - 6}" y="${Y(mx) + 3}" text-anchor="end" font-size="9">${U.fmtNum(mx, 1)}</text>
    <text x="${PL - 6}" y="${Y(mn) + 3}" text-anchor="end" font-size="9">${U.fmtNum(mn, 1)}</text>
    ${pts.map((p, a) => {
    /* Con muchos puntos se etiqueta uno de cada dos para que no se solapen. */
    if (pts.length > 6 && a % 2 !== pts.length % 2) return '';
    return `<text x="${X(a)}" y="${H - 7}" text-anchor="middle" font-size="8">${esc(p.lab)}</text>`;
  }).join('')}
    <text x="${W - PR}" y="${PT - 4}" text-anchor="end" font-size="8">${esc(unit)}</text></svg></div>`;
}

async function openHistory(i) {
  const e = SESS.ex[i];
  const u = units();
  closeKpad();
  $('shLbl').textContent = 'Historial';
  $('shTitle').textContent = e.name;
  $('shSub').textContent = 'Cargando…';
  $('shList').innerHTML = '';
  swapCb = null;
  $('sheet').classList.add('open');

  let hist = [];
  try {
    hist = await db.getExerciseHistory(profile.id, e.name, 10);
  } catch (err) {
    $('shSub').textContent = '';
    $('shList').innerHTML = `<p class="empty">${esc(db.msgError(err))}</p>`;
    return;
  }

  if (!hist.length) {
    $('shSub').textContent = 'Sin datos todavía';
    $('shList').innerHTML = `<p class="empty"><b>Aún no hay historial de este ejercicio.</b>
      Aparecerá cuando registres tu primera sesión.</p>`;
    return;
  }

  const isTime = e.is_time;
  const pts = hist.map((r) => {
    const d = new Date(r.started_at);
    return {
      lab: `${d.getDate()} ${MES_CORTO[d.getMonth()]}`,
      v: isTime ? (Number(r.seconds) || 0) : U.toDisplay(Number(r.weight_kg) || 0, u),
      reps: r.reps,
      seconds: r.seconds,
      e1: isTime ? null : U.e1rm(r.weight_kg, r.reps),
    };
  });
  $('shSub').textContent = `${pts.length} ${pts.length === 1 ? 'sesión' : 'sesiones'} · `
    + (isTime ? 'segundos aguantados' : 'mejor serie de cada sesión');
  const rows = pts.slice().reverse().map((p) => `<div class="mrow"><div class="grow">
    <h4>${esc(p.lab)}</h4><p>${isTime ? `${p.seconds || 0} s`
    : `${U.fmtNum(p.v, 1)} ${U.wLabel(u)} × ${p.reps} reps`}</p></div>
    <span class="chip mono">${p.e1 ? `e1RM ${U.fmtNum(U.toDisplay(p.e1, u), 1)} ${U.wLabel(u)}` : 'sin e1RM'}</span></div>`).join('');
  $('shList').innerHTML = (pts.length > 1 ? chartSvg(pts, isTime ? 's' : U.wLabel(u)) : '') + rows
    + '<p class="note">Datos reales de tus sesiones registradas.</p>';
}

/* ══════════════════════════════════════════════════════════════════════════
   10 · HOJA INFERIOR: alternativas y calculadora de discos
   ══════════════════════════════════════════════════════════════════════════ */

let swapCb = null;
let sheetPool = [];

function openSwapSheet(current, cb) {
  swapCb = cb;
  const alts = alternatives(current, profile);
  sheetPool = alts;
  $('shLbl').textContent = 'Alternativas';
  $('shTitle').textContent = `Cambiar ${current.name}`;
  if (!alts.length) {
    $('shSub').textContent = '';
    $('shList').innerHTML = `<p class="empty"><b>No hay alternativas para este grupo.</b>
      Con tu equipo y tus molestias no queda otro ejercicio de ${esc(String(current.muscle).toLowerCase())}.</p>`;
  } else {
    $('shSub').textContent = `${alts.length} ${alts.length === 1 ? 'opción' : 'opciones'} para `
      + `${String(current.muscle).toLowerCase()} con tu equipo.`;
    $('shList').innerHTML = alts.map((x, i) => `<button class="opt" type="button" data-alt="${i}">
      ${gifHtml(x.n, 'ico')}
      <div class="grow"><h4>${esc(x.n)}</h4><p>${esc(C.EQL[x.eq])}</p></div>
      <span class="chip m">${esc(x.g)}</span></button>`).join('');
    bindGifs($('shList'));
  }
  $('sheet').classList.add('open');
}

/** Calculadora de discos, íntegramente en las unidades del usuario. */
function openPlates(totalDisplay) {
  const u = units();
  const barSel = UI.barDisplay == null ? U.barDisplay(u) : UI.barDisplay;
  const sp = U.plateSplit(totalDisplay, u, barSel);
  const colors = U.PLATE_COLOR[u];
  const bars = u === 'lb' ? [45, 35, 25] : [20, 15, 10];
  $('shLbl').textContent = 'Calculadora';
  $('shTitle').textContent = `${U.fmtNum(totalDisplay, 1)} ${U.wLabel(u)} en la barra`;
  $('shSub').textContent = sp.list.length
    ? `Barra de ${U.fmtNum(sp.bar, 1)} ${U.wLabel(u)} + ${U.fmtNum(sp.per, 2)} ${U.wLabel(u)} por lado. Pon estos discos a cada lado:`
    : `Solo la barra de ${U.fmtNum(sp.bar, 1)} ${U.wLabel(u)}, sin discos.`;
  const vis = `<div class="barbell">${sp.list.slice().reverse().map((p) => {
    const h = 26 + p * (u === 'lb' ? 0.85 : 1.6);
    return `<span class="pl" style="width:${p >= (u === 'lb' ? 25 : 10) ? 9 : 7}px;height:${h}px;
      background:${colors[p]}">${U.fmtNum(p, 2)}</span>`;
  }).join('')}<span class="rod"></span></div>`;
  $('shList').innerHTML = `${vis}
    <div class="plate-list">${sp.list.map((p) => `<span class="chip">${U.fmtNum(p, 2)} ${U.wLabel(u)}</span>`).join('')}</div>
    <p class="note" style="text-align:center">Se muestra un lado. Pon lo mismo al otro.
    ${sp.rest > 0.01 ? `<br>No cuadra exacto: sobran ${U.fmtNum(sp.rest, 2)} ${U.wLabel(u)} por lado.` : ''}</p>
    <div class="mini" style="justify-content:center;margin-top:12px">
    ${bars.map((b) => `<button type="button" data-bar="${b}"
      ${b === sp.bar ? 'style="border-color:var(--cy);color:var(--cy)"' : ''}>Barra ${b} ${U.wLabel(u)}</button>`).join('')}
    </div>`;
  $('sheet').classList.add('open');
  $('shList').querySelectorAll('[data-bar]').forEach((b) => {
    b.addEventListener('click', () => {
      UI.barDisplay = Number(b.dataset.bar);
      saveUI();
      openPlates(totalDisplay);
      renderKpTop();
    });
  });
}

function bindSheet() {
  $('shList').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-alt]');
    if (!b || !swapCb) return;
    const chosen = sheetPool[Number(b.dataset.alt)];
    const cb = swapCb;
    swapCb = null;
    $('sheet').classList.remove('open');
    if (chosen) cb(chosen);
  });
  $('shClose').addEventListener('click', () => $('sheet').classList.remove('open'));
  $('sheet').addEventListener('click', (ev) => {
    if (ev.target === $('sheet')) $('sheet').classList.remove('open');
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   11 · TECLADO PROPIO
   ══════════════════════════════════════════════════════════════════════════ */

const KP = { open: false, i: -1, s: -1, f: 'kg', buf: '', rir: false };

const kfEl = () => $(`kf-${KP.f}-${KP.i}-${KP.s}`);

function clearKfFocus() {
  document.querySelectorAll('.kf.on').forEach((x) => x.classList.remove('on'));
}

/** Pasa el buffer al estado. El buffer está en unidades de PRESENTACIÓN. */
function commitKpad() {
  if (!KP.open || KP.buf === '') return;
  const k = key(KP.i, KP.s, false);
  const st = SESS.sets.get(k);
  if (!st) { KP.buf = ''; return; }
  const e = SESS.ex[KP.i];
  if (KP.f === 'kg') {
    st.weight_kg = Math.max(0, U.fromInput(KP.buf, units()));
  } else {
    const v = Math.max(0, Math.round(U.num(KP.buf)));
    if (e.is_time) st.seconds = v; else st.reps = v;
  }
  KP.buf = '';
  paintKf(KP.i, KP.s, KP.f);
  const pill = $('e1pill');
  if (pill) pill.innerHTML = e1Html(UI.exIdx);
  persistSet(k);
}

function openKpad(i, s, f) {
  if (KP.open) commitKpad();
  clearKfFocus();
  KP.open = true; KP.i = i; KP.s = s; KP.f = f; KP.buf = '';
  const el = kfEl();
  if (el) el.classList.add('on');
  $('kpad').classList.add('up');
  $('kpad').setAttribute('aria-hidden', 'false');
  $('app').classList.add('kp-on');
  $('kpComma').disabled = f !== 'kg';
  renderDots();
  renderKpTop();
  if (el) {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    catch { el.scrollIntoView(); }
  }
}

function closeKpad() {
  if (!KP.open) return;
  commitKpad();
  clearKfFocus();
  KP.open = false;
  $('kpad').classList.remove('up');
  $('kpad').setAttribute('aria-hidden', 'true');
  $('app').classList.remove('kp-on');
}

function typeCh(c) {
  if (!KP.open) return;
  if (c === ',') {
    if (KP.f !== 'kg' || KP.buf.includes(',')) return;
    if (KP.buf === '') KP.buf = '0';
    KP.buf += ',';
  } else {
    if (KP.buf.replace(',', '').length >= (KP.f === 'kg' ? 5 : 3)) return;
    if (KP.buf === '0') KP.buf = '';
    KP.buf += c;
  }
  paintKf(KP.i, KP.s, KP.f);
  renderKpTop();
}

function delCh() {
  if (!KP.open) return;
  KP.buf = KP.buf === '' ? '0' : KP.buf.slice(0, -1);
  if (KP.buf === '') KP.buf = '0';
  paintKf(KP.i, KP.s, KP.f);
  renderKpTop();
}

function setRir(v) {
  if (!KP.open) return;
  const k = key(KP.i, KP.s, false);
  const st = SESS.sets.get(k);
  if (!st) return;
  st.rir = v === '?' ? null : v;
  paintKf(KP.i, KP.s, 'reps');
  renderDots();
  persistSet(k);
}

function nextField() {
  const { i, s, f } = KP;
  commitKpad();
  if (f === 'kg') { openKpad(i, s, 'reps'); return; }
  if (s + 1 < SESS.ex[i].sets) { openKpad(i, s + 1, 'kg'); return; }
  closeKpad();
}

const DOTS = [[0, 'var(--mg)', '0'], [1, 'var(--mg)', '1'], [2, 'var(--am)', '2'], [3, 'var(--am)', '3'],
  [4, 'var(--gd)', '4'], [5, 'var(--gd)', '5'], [6, 'var(--vi)', '6+'], ['?', 'var(--ink-3)', '?']];

function renderDots() {
  const st = SESS.sets.get(key(KP.i, KP.s, false)) || {};
  const cur = st.rir;
  $('kpDots').innerHTML = DOTS.map((d) => `<button type="button" data-dot="${d[0]}"
    style="--dc:${d[1]}" aria-pressed="${String(cur) === String(d[0])}"
    aria-label="RIR ${d[2]}">${d[2]}</button>`).join('');
  $('kpDots').style.display = KP.rir ? 'flex' : 'none';
  $('kpRirBtn').setAttribute('aria-pressed', String(KP.rir));
}

/** Total en unidades de presentación que se está escribiendo. */
function kpTotalDisplay() {
  const st = SESS.sets.get(key(KP.i, KP.s, false)) || { weight_kg: 0 };
  return KP.buf !== '' ? U.num(KP.buf) : U.toDisplay(st.weight_kg || 0, units());
}

function renderKpTop() {
  const host = $('kpTop');
  if (!host || KP.i < 0) return;
  const e = SESS.ex[KP.i];
  const u = units();
  if (KP.f === 'kg' && e && e.equipment === 'libre' && !e.is_time) {
    const bar = UI.barDisplay == null ? U.barDisplay(u) : UI.barDisplay;
    const total = kpTotalDisplay();
    host.disabled = false;
    host.setAttribute('aria-label', 'Abrir calculadora de discos');
    if (total <= 0) {
      host.innerHTML = `<span class="kp-txt">Escribe el peso <b>total</b> de la barra.</span>`;
      return;
    }
    const sp = U.plateSplit(total, u, bar);
    if (sp.per < 0) {
      host.innerHTML = `<span class="kp-txt">La barra sola ya pesa <b>${U.fmtNum(bar, 1)} ${U.wLabel(u)}</b>.
        <small>Usa mancuernas o una barra más ligera.</small></span>`;
      return;
    }
    const colors = U.PLATE_COLOR[u];
    const bell = `<span class="kp-bell" aria-hidden="true">${sp.list.slice().reverse().map((p) => `
      <span class="pl" style="height:${Math.round(13 + p * (u === 'lb' ? 0.45 : 0.9))}px;background:${colors[p]}"></span>`).join('')}
      <span class="rod"></span></span>`;
    host.innerHTML = `${bell}<span class="kp-txt"><b>${U.fmtNum(sp.per, 2)} ${U.wLabel(u)}</b> por lado
      = ${U.fmtNum(total, 1)} ${U.wLabel(u)} <small>(barra de ${U.fmtNum(bar, 1)} ${U.wLabel(u)})</small>
      ${sp.rest > 0.01 ? `<br><small>No cuadra exacto: sobran ${U.fmtNum(sp.rest, 2)} ${U.wLabel(u)} por lado.</small>` : ''}</span>`;
    return;
  }
  host.disabled = true;
  host.setAttribute('aria-label', 'Prescripción de la serie');
  host.innerHTML = `<span class="kp-txt">Auto: <b>${esc(autoMain(KP.i, KP.s))}</b> · ${esc(autoSub(KP.i, KP.s))}</span>`;
}

function onKpadClick(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.kd !== undefined) { typeCh(d.kd); return; }
  if (d.dot !== undefined) { setRir(d.dot === '?' ? '?' : Number(d.dot)); return; }
  if (d.kfn === 'del') { delCh(); return; }
  if (d.kfn === 'rir') { KP.rir = !KP.rir; renderDots(); return; }
  if (d.kfn === 'fail') { KP.rir = true; setRir(0); return; }
  if (d.kfn === 'ok') { nextField(); return; }
  if (d.kfn === 'close') { closeKpad(); return; }
  if (b.id === 'kpTop' && KP.f === 'kg') openPlates(kpTotalDisplay());
}

/* ══════════════════════════════════════════════════════════════════════════
   12 · DESCANSO, SONIDO Y VIBRACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

let AC = null;
function audioCtx() {
  if (AC) return AC;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try { AC = new Ctor(); } catch { AC = null; }
  return AC;
}
function primeAudio() {
  const c = audioCtx();
  if (c && c.state === 'suspended') c.resume();
}
document.addEventListener('pointerdown', primeAudio, { once: true, capture: true });
document.addEventListener('keydown', primeAudio, { once: true, capture: true });

/** Un pulso de 120 ms con rampa, para que no chasquee. */
function pip(c, at) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(880, at);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.16, at + 0.015);
  g.gain.setValueAtTime(0.16, at + 0.1);
  g.gain.linearRampToValueAtTime(0, at + 0.12);
  o.connect(g);
  g.connect(c.destination);
  o.start(at);
  o.stop(at + 0.15);
}

function restAlert() {
  if (!profile || profile.sound === false) return;
  const c = audioCtx();
  if (c) {
    try {
      if (c.state === 'suspended') c.resume();
      const t0 = c.currentTime + 0.03;
      pip(c, t0);
      pip(c, t0 + 0.19);
    } catch { /* sin audio */ }
  }
  try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch { /* sin vibración */ }
}

function paintSound() {
  const b = $('soundBtn');
  if (!b || !profile) return;
  const on = profile.sound !== false;
  b.textContent = on ? '🔔' : '🔇';
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on
    ? 'Aviso al terminar el descanso: activado'
    : 'Aviso al terminar el descanso: silenciado');
}

let restT = null;
let left = 0;

function paintRest() {
  const txt = fmt(Math.max(0, left));
  $('clock').textContent = txt;
  $('rest2').textContent = restT ? txt : '0:00';
  $('restMini').classList.toggle('live', !!restT);
}

function startTimer(sec, label) {
  left = sec;
  $('hudLab').textContent = label;
  if (restT) clearInterval(restT);
  restT = setInterval(() => {
    left--;
    paintRest();
    if (left <= 0) stopTimer(true);
  }, 1000);
  paintRest();
  $('hud').classList.add('up');
}

function stopTimer(natural) {
  const running = !!restT;
  if (restT) { clearInterval(restT); restT = null; }
  $('hud').classList.remove('up');
  paintRest();
  if (natural === true && running) restAlert();
}

/* ══════════════════════════════════════════════════════════════════════════
   13 · AJUSTES
   ══════════════════════════════════════════════════════════════════════════ */

const GOAL_TXT = { musculo: 'Ganar músculo', fuerza: 'Ganar fuerza', grasa: 'Perder grasa', salud: 'Salud' };
const LEVEL_TXT = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };

function renderSettings() {
  if (!profile) return;
  const u = units();
  $('setWho').textContent = `${profile.name} · ${user.email}`;
  document.querySelectorAll('#unitSeg button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.u === u));
  });
  document.querySelectorAll('#soundSeg button').forEach((b) => {
    b.setAttribute('aria-pressed', String((b.dataset.s === '1') === (profile.sound !== false)));
  });
  $('unitNote').textContent = u === 'lb'
    ? 'Los pesos se guardan en kilos y se muestran en libras. Los incrementos van de 5 en 5 lb y la barra es de 45 lb.'
    : 'Los pesos se guardan y se muestran en kilos. Los incrementos van de 2,5 en 2,5 kg y la barra es de 20 kg.';

  const lim = (profile.limitations || []);
  $('setProfile').innerHTML = `
    <div class="set-row"><div class="grow"><h4>Objetivo</h4>
      <p>${esc(GOAL_TXT[profile.goal] || profile.goal)}</p></div></div>
    <div class="set-row"><div class="grow"><h4>Nivel</h4>
      <p>${esc(LEVEL_TXT[profile.level] || profile.level)}</p></div></div>
    <div class="set-row"><div class="grow"><h4>Frecuencia</h4>
      <p>${profile.days_per_week} días · ${profile.minutes} min por sesión</p></div></div>
    <div class="set-row"><div class="grow"><h4>Altura y peso</h4>
      <p>${profile.height_cm ? esc(U.fmtHeight(profile.height_cm, u)) : 'sin dato'} ·
      ${profile.weight_kg ? `${U.fmtNum(U.toDisplay(profile.weight_kg, u), 1)} ${U.wLabel(u)}` : 'sin dato'}</p></div></div>
    <div class="set-row"><div class="grow"><h4>Equipo</h4>
      <p>${esc((profile.equipment || []).map((e) => C.EQL[e] || e).join(', ') || 'sin definir')}</p></div></div>
    <div class="set-row"><div class="grow"><h4>Zonas a cuidar</h4>
      <p>${lim.length ? esc(lim.join(', ')) : 'ninguna'}</p></div></div>
    <div class="set-row"><div class="grow"><h4>Prioridades</h4>
      <p>${esc((profile.priorities || []).join(', ') || 'sin prioridades')}</p></div></div>`;
}

function bindSettings() {
  $('unitSeg').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    await setUnits(b.dataset.u);
  });
  $('soundSeg').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const on = b.dataset.s === '1';
    profile.sound = on;
    renderSettings();
    paintSound();
    try { profile = await db.saveProfile(profile.id, { sound: on }); } catch { /* luego */ }
  });
  $('redoWiz').addEventListener('click', () => {
    startWizard();
  });
  $('pwSave').addEventListener('click', changePassword);
  $('signOut').addEventListener('click', async () => {
    await db.signOut();
    showGate();
  });
}

/**
 * Cambia el sistema de unidades y REPINTA todo. No se toca ni un dato de la
 * base: solo `profiles.units`, que es una preferencia de presentación.
 */
async function setUnits(u) {
  const next = u === 'lb' ? 'lb' : 'kg';
  if (next === units()) return;
  profile.units = next;
  UI.barDisplay = null;      // la barra por defecto cambia con el sistema
  saveUI();
  renderSettings();
  renderDash();
  renderStudio();
  if (SESS.day && SESS.ex.length) { renderFocus(); updateSess(); }
  if (KP.open) renderKpTop();
  try {
    profile = await db.saveProfile(profile.id, { units: next });
  } catch (e) {
    console.warn('preferencia de unidades no guardada', db.msgError(e));
  }
}

async function changePassword() {
  const a = $('pw1').value;
  const b = $('pw2').value;
  const err = $('pwErr');
  const ok = $('pwOk');
  err.textContent = '';
  ok.textContent = '';
  if (a.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  if (a !== b) { err.textContent = 'Las dos contraseñas no coinciden.'; return; }
  const btn = $('pwSave');
  btn.disabled = true;
  btn.textContent = 'Cambiando…';
  try {
    await db.updatePassword(a);
    ok.textContent = 'Contraseña cambiada. Úsala la próxima vez que entres.';
    $('pw1').value = '';
    $('pw2').value = '';
  } catch (e) {
    err.textContent = db.msgError(e);
  }
  btn.disabled = false;
  btn.textContent = 'Cambiar contraseña';
}

/* ══════════════════════════════════════════════════════════════════════════
   14 · AVISO DE SIN CONEXIÓN
   ══════════════════════════════════════════════════════════════════════════ */

function paintNet(state) {
  const bar = $('netbar');
  const msg = $('netmsg');
  if (!state.online) {
    msg.textContent = state.pending
      ? `Sin conexión · ${state.pending} ${state.pending === 1 ? 'cambio' : 'cambios'} por guardar`
      : 'Sin conexión';
    bar.classList.add('up');
    return;
  }
  if (state.pending) {
    msg.textContent = `Guardando ${state.pending} ${state.pending === 1 ? 'cambio' : 'cambios'}…`;
    bar.classList.add('up');
    return;
  }
  bar.classList.remove('up');
}

/* ══════════════════════════════════════════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════════════════════════════════════════ */

boot().catch((e) => {
  hideBoot();
  $('gate').classList.remove('hidden');
  const n = $('gateNote');
  if (n) n.textContent = db.msgError(e);
});
