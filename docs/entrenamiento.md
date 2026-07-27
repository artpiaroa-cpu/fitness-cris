# Cómo decide la app: estructuras, frecuencia y volumen

Documento de referencia para el generador de rutinas (`web/js/generator.js`).
Recoge lo que dice la evidencia y las decisiones concretas que tomamos a partir
de ella, para que cualquiera pueda discutir los números en vez de adivinar de
dónde salen.

---

## 1. Lo que dice la evidencia

### El volumen es el motor; la frecuencia es el vehículo

El meta-análisis de Schoenfeld y colaboradores de 2016 encontró que, **igualando
el volumen semanal**, entrenar un músculo dos veces por semana daba más
hipertrofia que una. La revisión ampliada de 2019 (25 estudios) matizó el
hallazgo: cuando el volumen se iguala de verdad, **el efecto de la frecuencia
desaparece**.

La lectura práctica no es contradictoria: la frecuencia alta ayuda porque
**permite acumular más volumen semanal con series de mejor calidad**, no porque
repartir tenga magia propia. De ahí la recomendación habitual de tocar cada
grupo **al menos 2 veces por semana**, que es lo que aplicamos por defecto.

### Cuánto volumen

- **10–20 series duras por músculo y semana** es el rango de trabajo para
  hipertrofia.
- Los rendimientos decrecientes aparecen sobre las **20–25 series**.
- Una meta-regresión reciente sitúa la eficiencia intermedia en **11–18 series**:
  a partir de ahí hacen falta ~8,5 series semanales extra para notar más
  hipertrofia, y por encima de 19 hacen falta ~10,75. Es decir: subir volumen
  sigue funcionando, pero cada vez cuesta mucho más.

Importante para no engañarnos con las cuentas: **una "serie dura" es una serie
real cerca del fallo (1–3 repeticiones en reserva)**. Los calentamientos y las
series fáciles no cuentan igual. En la app, las series de calentamiento no se
suman al volumen semanal.

### Fuerza: mucho menos volumen del que la gente cree

Aquí estaba nuestro error. Para trabajo de fuerza en los básicos:

- **3–6 series de trabajo por ejercicio** en el rango de 1–5 repeticiones.
- Los datos específicos de powerlifters apuntan a **3–6 series de trabajo
  semanales por levantamiento** como punto de partida sensato.
- El patrón habitual es **top set + back-offs**: una serie pesada y luego bajar
  el peso para series submáximas que refuerzan técnica sin fundirte.

El generador prescribía **5 series de 3–5 repeticiones en todos los básicos**,
que es aproximadamente el doble de lo razonable y además difícil de sostener.

### Qué estructura para cuántos días

No hay una mejor en abstracto. Una revisión sistemática de 2024 no encontró
diferencias relevantes entre rutinas divididas y de cuerpo completo **cuando se
iguala el volumen**. Lo que sí importa es que la estructura encaje con los días
disponibles:

| Días/semana | Estructura que encaja | Frecuencia por músculo |
| --- | --- | --- |
| 2–3 | Cuerpo completo | 2–3× |
| 3 | Empuje / Tirón / Pierna | 1× |
| 4 | Torso / Pierna | 2× |
| 4 | Empuje / Tirón | 2× |
| 5 | Por grupos musculares | 1× |
| 6 | Empuje / Tirón / Pierna ×2 | 2× |

---

## 2. El solapamiento entre días seguidos

Esto no sale en los meta-análisis pero es decisivo en la práctica, y nos lo trajo
una usuaria: **no quería repetir músculos en días consecutivos porque llegaba
fatigada**.

Es una preferencia legítima que cambia qué estructura recomendar, porque las
estructuras se comportan de forma muy distinta:

| Estructura | Solapamiento en días seguidos |
| --- | --- |
| Cuerpo completo | **Máximo**: todo se repite cada sesión |
| Torso / Pierna | Ninguno: alterna mitades |
| Empuje / Tirón / Pierna | Ninguno: cada día toca músculos distintos |
| Empuje / Tirón | Ninguno |
| Por grupos | Ninguno |

Por eso la app **pregunta explícitamente** por esta preferencia y filtra las
estructuras compatibles antes de recomendar. Quien quiera frecuencia alta puede
elegir cuerpo completo; quien acumule fatiga con la repetición, no verá esa
opción recomendada.

El coste hay que decirlo claro: evitar el solapamiento con pocos días implica
**bajar la frecuencia por músculo**. Con 3 días y sin repetir, cada grupo se
toca una vez por semana, que está por debajo del 2× recomendado. La app avisa de
esa contrapartida en vez de ocultarla.

---

## 3. Ejercicios redundantes

El otro problema real detectado: la rutina generada repetía estímulo (por
ejemplo dos empujes horizontales en la misma sesión), gastando series sin añadir
nada.

La solución es etiquetar cada ejercicio con su **patrón de movimiento** y limitar
cuántos del mismo patrón entran por sesión:

- Empuje horizontal · Empuje vertical
- Tracción horizontal · Tracción vertical
- Dominante de rodilla · Dominante de cadera
- Aducción · Gemelo · Core
- Aislamiento de bíceps · tríceps · deltoides lateral

Regla: **un ejercicio por patrón y sesión**, con un segundo permitido solo si ese
músculo es prioridad declarada del usuario. Los compuestos van antes que los
aislamientos, porque cubren más masa muscular por serie.

---

## 4. Lo que aplica la app

**Volumen semanal objetivo por músculo**, según nivel, ajustado luego por el
control de volumen que elige el usuario (bajo / medio / alto):

| Nivel | Series/semana por músculo |
| --- | --- |
| Principiante | 8–12 |
| Intermedio | 12–18 |
| Avanzado | 16–22 |

**Series y repeticiones por papel del ejercicio**:

| Papel | Objetivo fuerza | Objetivo músculo | Objetivo definición/salud |
| --- | --- | --- | --- |
| Básico principal | Top set 1×3–5 @ RIR 1 + 2 back-offs ×5–6 @ RIR 2 | 3×6–10 @ RIR 2 | 3×10–15 @ RIR 2 |
| Compuesto secundario | 3×5–8 @ RIR 2 | 3×8–12 @ RIR 2 | 3×12–15 @ RIR 2 |
| Aislamiento | 2×8–12 @ RIR 2 | 2–3×10–15 @ RIR 1 | 2×12–20 @ RIR 2 |

Principiantes: una serie menos por ejercicio y menos aislamientos, porque el
estímulo necesario es más bajo y la técnica pesa más que el volumen.

---

## 5. Fuerza por porcentajes: la ola 5/3/1

Cuando el objetivo es fuerza, la app **ofrece** (no impone) una plantilla de
cuatro días torso/pierna en la que los cuatro básicos van por porcentajes.
Vive en `web/js/strength.js`.

### Por qué sobre el Training Max y no sobre el 1RM

El **Training Max (TM) es el 90 % del 1RM estimado**. Los porcentajes se
calculan sobre él, no sobre el 1RM. El motivo es práctico: un programa que
prescribe el 95 % del máximo real convierte cada semana en un test, y basta
una mala noche para fallar la serie. Con el TM al 90 %, la serie pesada sigue
siendo pesada pero **repetible semana tras semana**.

Son tres números distintos y en la interfaz van siempre con su nombre entero,
porque confundirlos es el error típico:

| Número | Qué es | Ejemplo (banca de Cris) |
| --- | --- | --- |
| 1RM estimado | lo máximo que levantaría una vez | 272 lb |
| Training Max | el 90 % de ese 1RM | 245 lb |
| Peso de la serie | el porcentaje de la semana sobre el TM | 90 % → 220 lb |

### Las cuatro semanas

| Semana | Nombre | Series de trabajo |
| --- | --- | --- |
| 1 | 5s | 65 % ×5 · 75 % ×5 · **85 % ×5+** |
| 2 | 3s | 70 % ×3 · 80 % ×3 · **90 % ×3+** |
| 3 | 5/3/1 | 75 % ×5 · 85 % ×3 · **95 % ×1+** |
| 4 | descarga | 40 % ×5 · 50 % ×5 · 60 % ×5 |

El `+` es una serie **AMRAP**: todas las repeticiones que salgan con técnica
limpia. Es la única medida real de cómo va el programa. La semana 4 no lleva
AMRAP: si la descarga se hace al límite, deja de ser descarga.

- **Calentamiento**: 40 % ×5 · 50 % ×5 · 60 % ×3 antes de las de trabajo. En la
  semana de descarga no se añade, porque las propias series de trabajo son esa
  misma rampa.
- **Respaldo**: tras la AMRAP, 2 series al porcentaje más bajo de la semana.
  Acumulan volumen de calidad sin volver a acercarse al fallo.

### Progresión y reajuste

- Al cerrar la semana 4, la ola avanza: `cycle_num +1`, vuelta a la semana 1 y
  el TM sube **5 lb (2,5 kg) en banca y militar** y **10 lb (5 kg) en sentadilla
  y peso muerto**. El tren inferior progresa al doble de ritmo porque parte de
  cargas mayores y tolera más incremento absoluto.
- **Regla de reajuste**: si la AMRAP del 95 % de la semana 3 sale con **menos de
  3 repeticiones**, el TM va por delante de la fuerza real. La app **propone**
  bajarlo un 10 % y explica por qué; no lo aplica sin confirmación.
- Cada AMRAP registrada estima un 1RM (Epley, contando reps + RIR) y actualiza
  `lift_maxes.e1rm_kg` si supera al anterior, marcándolo `source='calculado'`.
  Un 1RM editado a mano queda como `'manual'` y ya no se reescribe solo.

### Redondeo

Los pesos se redondean al incremento cargable del sistema del usuario: **5 lb
con barra de 45 lb** y **2,5 kg con barra de 20 kg**, que es lo que dan dos
discos de 2,5 lb o de 1,25 kg. El TM se redondea primero, para que 111,13 kg no
se convierta en 244,99 lb y arrastre ese ruido a todos los porcentajes.

---

## 6. Peso propuesto para el resto de ejercicios

El 5/3/1 solo cubre cuatro levantamientos. Para los demás, la app propone el
peso de cada serie con la operación inversa de la que usa para estimar el 1RM:

```
peso = 1RM del ejercicio × pct(n)      n = repeticiones + RIR
pct(n) = ( 1/(1 + n/30)  +  (37 − n)/36 ) / 2
          └─ Epley⁻¹ ─┘     └─ Brzycki⁻¹ ┘
```

Se promedian las dos fórmulas porque cada una se desvía hacia un lado, que es
el mismo criterio con el que se estima el e1RM. Vive en `units.pctForReps()`.

| n (reps + RIR) | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| % del 1RM | 100 | 95,5 | 92,7 | 90,0 | 87,3 | 84,7 | 79,8 | 75,0 | 70,4 |

Dos acotaciones deliberadas:

- **n ≤ 12.** Por encima, las dos fórmulas se separan tanto de la realidad que
  el número deja de significar algo (Brzycki llega a cero en 37). Una serie
  prescrita de 12-15 usa el porcentaje de 12.
- **n = 1 → 100 %.** El peso que solo se levanta una vez *es* el 1RM. Brzycki
  lo respeta; Epley está calibrado por encima de la repetición única y daría
  96,8 %, así que el promedio crudo se quedaría en un 98,4 % sin sentido.

Decisiones de aplicación, todas en `web/js/suggest.js`:

- Se usa la parte **alta** del rango de repeticiones prescrito. Más
  repeticiones significan menos porcentaje: la propuesta se queda corta antes
  que pasarse, porque quedarse corto se arregla subiendo peso y pasarse se
  arregla fallando la serie.
- **Isométricos** (planchas) no llevan peso: lo que se prescribe son segundos.
- **Peso corporal**: el 1RM que se guarda de unas dominadas suele ser el peso
  *añadido*, no la carga total. Como no hay forma de distinguirlo, no se
  propone nada y la interfaz dice «peso corporal».
- El redondeo es el mismo de siempre: incremento cargable del sistema (5 lb /
  2,5 kg), y en los cuatro básicos, además, nunca por debajo de la barra vacía.

**Prioridad del peso que aparece en la sesión**, de más a menos:
lo que ha escrito el usuario → el 5/3/1 en sus cuatro básicos → «la última
vez» → el porcentaje del 1RM. El porcentaje solo rellena el hueco que antes
quedaba vacío con un «Elige el peso».

**El 1RM se aprende solo.** Al completar una serie de trabajo se estima el 1RM
con las repeticiones más el RIR y, si supera al guardado, se actualiza con
`source='calculado'`. Nunca baja, y nunca reescribe una fila puesta a mano
(`source='manual'`). Así un ejercicio sin histórico se calibra tras su primera
sesión.

**La duplicidad de `lift_maxes`.** La columna `lift` es texto libre y conviven
las claves de básico (`banca`) con los nombres del POOL (`Press de banca con
barra`), que son el mismo levantamiento. La resolución es **primero por nombre
de ejercicio y después por clave de básico**, y al guardar el máximo de un
básico se **escriben las dos claves a la vez** para que no se desincronicen.
El Training Max queda fuera de esa resolución: lo lee la ola por su clave y
solo se mueve al cerrar un ciclo.

---

## Fuentes

- Schoenfeld, Grgic et al. — [*Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis*](https://www.researchgate.net/publication/301578131_Effects_of_Resistance_Training_Frequency_on_Measures_of_Muscle_Hypertrophy_A_Systematic_Review_and_Meta-Analysis) (2016)
- Schoenfeld, Grgic, Krieger — [*How many times per week should a muscle be trained to maximize muscle hypertrophy?*](https://pubmed.ncbi.nlm.nih.gov/30558493/) (2019)
- [*The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency*](https://pubmed.ncbi.nlm.nih.gov/41343037/)
- [*Resistance Training Variables for Optimization of Muscle Hypertrophy: An Umbrella Review*](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2022.949021/full)
- Stronger by Science — [*The New Approach to Training Volume*](https://www.strongerbyscience.com/the-new-approach-to-training-volume/)
- Juggernaut Training Systems — [*Understanding Volume*](https://www.jtsstrength.com/understanding-volume/)
- PowerliftingTechnique — [*How Powerlifters Use Top and Working Sets*](https://powerliftingtechnique.com/how-powerlifters-use-top-and-working-sets-to-build-max-strength/)

> Nota: estas fuentes son literatura general de entrenamiento. El coach de
> NotebookLM del repo (`scripts/ask_cited.py`) permite además citar los vídeos
> concretos de Jeff Nippard sobre cada punto, y es el camino a seguir si se
> quiere justificar una decisión con su criterio.
