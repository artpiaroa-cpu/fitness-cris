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
