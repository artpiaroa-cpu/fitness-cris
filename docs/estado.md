# Estado del proyecto

Resumen de dónde está todo, para retomar el trabajo sin reconstruir el contexto.
Última actualización: julio de 2026.

## Qué es

App de entrenamiento privada para tres personas: **Cris**, **Laura** y
**Sócrates**. Empezó como un coach basado en un notebook de NotebookLM con los
vídeos de Jeff Nippard, y creció hasta ser una app web desplegada con backend
propio.

## Infraestructura

| Pieza | Dónde |
| --- | --- |
| Repo | `artpiaroa-cpu/fitness-cris`, rama `claude/saludos-14qwh9` |
| Web | `web/` — estática, sin bundler ni framework |
| Deploy | Netlify `trainingcris.netlify.app`, conectado a la rama, publica `web/` |
| Backend | Supabase, proyecto `fitness-cris` (`owhxwqktbkpiqrnqnkhn`) |

Las cuentas son `cris@entreno.app`, `laura@entreno.app` y
`socrates@entreno.app`. La contraseña inicial es compartida y **debe cambiarse**;
Supabase exige 6 caracteres como mínimo para cambiarla, aunque una más corta
siga sirviendo para entrar.

`supabase-js` va servido desde `web/vendor/supabase.js`, **no desde un CDN**: al
importarlo de `esm.sh` la app se quedaba en blanco cuando el CDN no respondía.
La clave que usa el cliente es la `anon` clásica (JWT), no la `sb_publishable_`,
porque esa última devolvía un error vacío en el login.

## Qué hay construido

- **Login** por selección de perfil y contraseña, con sesión persistente.
- **Cuestionario** de varios pasos: datos, objetivo y nivel, logística,
  limitaciones articulares, preferencias, estructura semanal, volumen y variedad.
- **Generador de rutinas** con estructuras seleccionables (cuerpo completo,
  torso/pierna, empuje-tirón-pierna, empuje/tirón, por grupos), reparto de
  frecuencia, exclusión por lesiones y una regla de patrón de movimiento que
  evita dos ejercicios redundantes en la misma sesión.
- **Sesión** con tira de ejercicios, columna de prescripción, teclado numérico
  propio, calculadora de discos, calentamiento, cronómetro y descanso con aviso
  sonoro y vibración.
- **Fuerza por porcentajes**: ola 5/3/1 de cuatro semanas sobre el Training Max,
  con AMRAP, progresión automática y regla de reajuste. Vive en `strength.js`.
- **Peso sugerido** para todos los ejercicios, derivado del 1RM propio de cada
  uno y del porcentaje que implican las repeticiones prescritas (`suggest.js`).
- **Mapa muscular anatómico** con modelos femenino y masculino, frente y
  espalda, coloreado por volumen semanal.
- **Estudio**: rutinas guiadas de casa, pilates, movilidad y cardio.
- **Historial** por ejercicio, exportación a CSV y cola de escrituras offline
  para no perder series registradas sin cobertura.

## Convenciones que no hay que romper

- La base guarda **siempre kg y cm**. La preferencia lb/kg es solo de
  presentación, para que cambiar de unidad no altere datos históricos.
- Los números de entrenamiento (volumen, frecuencia, series, porcentajes) salen
  de `docs/entrenamiento.md`, que cita las fuentes. Si se cambian, se cambian
  ahí primero.
- Regenerar una rutina **desactiva** la anterior en vez de borrarla: las
  sesiones registradas cuelgan de ella.
- Prioridad del peso mostrado: lo que escribe el usuario > su última vez >
  sugerencia por porcentaje. En los básicos de una rutina 5/3/1 manda la ola.

## Limitación del entorno de desarrollo

El sandbox donde se ejecuta el agente **no tiene salida a `*.supabase.co` ni a
Netlify**. Todo se ha verificado contra simuladores de PostgREST y GoTrue, y la
aritmética contra la base real por SQL. Queda sin probar de punta a punta:

- que PostgREST acepte las consultas anidadas y los upsert tal como se escriben,
- las políticas RLS de `lift_maxes` y `strength_cycles` bajo uso real.

**La prueba de humo pendiente** es: entrar, completar el cuestionario, marcar dos
series y abrir el historial de ese ejercicio.

## Datos de fuerza de Cris

Sacados de un export real de MacroFactor (64 sesiones, marzo a julio de 2026,
1.371 series con RIR). 1RM estimado promediando Epley y Brzycki sobre
repeticiones más RIR:

| Levantamiento | 1RM | Training Max |
| --- | --- | --- |
| Peso muerto | 372 lb | 335 lb |
| Sentadilla | 278 lb | 250 lb |
| Press banca | 272 lb | 245 lb |
| Press militar | 148 lb | 135 lb |

Hay además catorce ejercicios accesorios con 1RM sembrado desde ese histórico.
Su banca llevaba seis semanas oscilando sin subir, y había abandonado sentadilla,
peso muerto y militar mientras seguía haciendo banca treinta veces: la ola 5/3/1
existe en parte para corregir eso.

## Pendiente

1. La prueba de humo contra Supabase real.
2. Cambiar las contraseñas compartidas.
3. Fusionar la rama a `main` y apuntar Netlify ahí.
4. La organización de Supabase (plan gratuito) superó su cuota en el ciclo
   anterior; conviene revisar el consumo antes del 21 de agosto de 2026.
