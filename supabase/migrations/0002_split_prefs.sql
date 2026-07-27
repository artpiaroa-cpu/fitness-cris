-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_split_prefs.sql · Preferencias de estructura y esquema de series
-- ───────────────────────────────────────────────────────────────────────────
-- Lo que añade y por qué:
--
--   profiles.structure     · estructura de la semana elegida en el cuestionario
--                            ('auto' = la elige la app según días y solape)
--   profiles.overlap_pref  · si acepta repetir músculos en días seguidos
--   profiles.volume_pref   · cuánto apretar; modula el rango de series/semana
--   profiles.variety_pref  · pocos ejercicios con más series, o más variedad
--
--   routine_exercises.role   · papel del ejercicio en la sesión
--                              (principal | secundario | aislamiento), que es
--                              lo que decide series y repeticiones
--   routine_exercises.scheme · detalle SERIE A SERIE en JSON. Existe porque el
--                              esquema de fuerza no es uniforme: un top set de
--                              3-5 a RIR 1 más dos back-offs de 5-6 a RIR 2 no
--                              se puede representar con un solo "N×R".
--                              Forma: [{kind,reps_low,reps_high,rir,rest_s}]
--                              kind ∈ top | backoff | recta
--
-- Idempotente: se puede aplicar dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists structure    text not null default 'auto',
  add column if not exists overlap_pref text not null default 'indiferente',
  add column if not exists volume_pref  text not null default 'medio',
  add column if not exists variety_pref text not null default 'variada';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_structure_chk') then
    alter table public.profiles add constraint profiles_structure_chk
      check (structure in ('auto', 'fullbody', 'upper_lower', 'ppl', 'push_pull', 'bro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_overlap_pref_chk') then
    alter table public.profiles add constraint profiles_overlap_pref_chk
      check (overlap_pref in ('evitar', 'indiferente', 'frecuencia'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_volume_pref_chk') then
    alter table public.profiles add constraint profiles_volume_pref_chk
      check (volume_pref in ('bajo', 'medio', 'alto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_variety_pref_chk') then
    alter table public.profiles add constraint profiles_variety_pref_chk
      check (variety_pref in ('pocos', 'variada'));
  end if;
end $$;

alter table public.routine_exercises
  add column if not exists role   text not null default 'secundario',
  add column if not exists scheme jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'routine_exercises_role_chk') then
    alter table public.routine_exercises add constraint routine_exercises_role_chk
      check (role in ('principal', 'secundario', 'aislamiento'));
  end if;
end $$;

comment on column public.profiles.structure is
  'Estructura de la semana: auto | fullbody | upper_lower | ppl | push_pull | bro';
comment on column public.profiles.overlap_pref is
  'Repetir músculos en días seguidos: evitar | indiferente | frecuencia';
comment on column public.profiles.volume_pref is
  'Cuánto apretar: bajo (-25%) | medio | alto (+25%) sobre el rango del nivel';
comment on column public.profiles.variety_pref is
  'pocos = 1 ejercicio por patrón y más series | variada = 2 por patrón si es prioridad';
comment on column public.routine_exercises.role is
  'principal (primer básico del día) | secundario | aislamiento';
comment on column public.routine_exercises.scheme is
  'Series una a una: [{kind,reps_low,reps_high,rir,rest_s}], kind top|backoff|recta';
