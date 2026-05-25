====================================================================
ESTÁNDAR FUNCIONAL DE ARCHIVOS CSV
IndustrIA Sigma — Plataforma de Simulación Industrial
====================================================================

Este documento define el estándar funcional de los archivos CSV
que configuran las máquinas de la simulación y contienen los
datos históricos para la calibración automática del sistema.

A diferencia de un enfoque monolítico, el estándar actual
organiza los datos en **un archivo CSV por máquina** dentro
del directorio `Ejemplos CSV/`. El backend (vía `loadCSVDir`)
escanea y carga todos los archivos `.csv` de ese directorio,
fusionando la configuración y los datos históricos de cada uno.

Cada archivo combina DOS tipos de secciones:
- **CONFIG**: define la máquina, sus variables operativas, perfiles
  físicos y umbrales (filas comentadas con `#`).
- **DATA**: contiene mediciones históricas (formato long: ts,
  machine_id, var_name, value) que el sistema usa para
  autocalibrarse.
- **WIDE_DATA** (opcional): vista desnormalizada de los mismos
  datos, incluyendo indicadores derivados (OEE, defectos, yield).
  El backend ignora esta sección; es solo para inspección humana
  o herramientas externas.


====================================================================
1. SECCIÓN DE CONFIGURACIÓN
====================================================================

1.1 FORMATO GENERAL

Cada fila CONFIG representa UNA VARIABLE de UNA MÁQUINA.
Todas las filas CONFIG aparecen al inicio del archivo,
precedidas por `#CONFIG` y con cada fila prefijada por `#`.

  #CONFIG
  #process,machine_id,machine_name,line,var_name,var_type,unit,base_value,noise,spring,min,max,warn,crit,quality_target,quality_usl,quality_lsl,quality_cp
  #BOTTLING,BTL-01,Tanque de almacenamiento,Línea 1,level,operative,%,85,2,0.03,0,100,92,95,,,,
  ...

El loader (`csv-loader.js`) elimina automáticamente el `#`
inicial de cada línea al parsear.

1.2 COLUMNAS DE CONFIGURACIÓN

┌─────────────────────┬──────────┬────────────────────────────────┐
│ Columna              │ Tipo     │ Descripción                    │
├─────────────────────┼──────────┼────────────────────────────────┤
│ process              │ texto    │ BOTTLING o FURNACE             │
│ machine_id           │ texto    │ ID único (ej. BTL-01)          │
│ machine_name         │ texto    │ Nombre descriptivo             │
│ line                 │ texto    │ Línea de producción             │
│ var_name             │ texto    │ Nombre de la variable           │
│ var_type             │ texto    │ operative o quality             │
│ unit                 │ texto    │ Unidad de medida                │
│ base_value           │ número   │ Valor base (target)             │
│ noise                │ número   │ Ruido aleatorio (σ)             │
│ spring               │ número   │ Const. resorte (0.01-0.10)      │
│ min                  │ número   │ Valor mínimo físico              │
│ max                  │ número   │ Valor máximo físico              │
│ warn                 │ número   │ Umbral de advertencia            │
│ crit                 │ número   │ Umbral crítico                   │
│ quality_target       │ número   │ Objetivo de calidad             │
│ quality_usl          │ número   │ USL (SPC)                        │
│ quality_lsl          │ número   │ LSL (SPC)                        │
│ quality_cp           │ número   │ Cp objetivo (meta)               │
└─────────────────────┴──────────┴────────────────────────────────┘

1.3 DESCRIPCIÓN DE COLUMNAS CONFIG

1.3.1 process
Proceso industrial al que pertenece la máquina.
Valores posibles: BOTTLING | FURNACE
Determina qué modelo físico se aplica en el motor de simulación.

1.3.2 machine_id
Identificador único de la máquina.
- BTL-01 a BTL-06 para embotellado
- FUR-01 a FUR-04 para horno
Cada machine_id aparece en múltiples filas (una por variable).

1.3.3 machine_name
Nombre humano legible. Ej: "Tanque de almacenamiento"

1.3.4 line
Línea de producción para agrupar en el dashboard.
Ej: "Línea 1" (embotellado), "Línea 2" (horno)

1.3.5 var_name
Nombre interno en snake_case. Ej: fill_volume, temperature

1.3.6 var_type
operative → variable operativa (simulada con spring-damper)
quality   → variable de calidad (derivada de operativas)

1.3.7 unit
Unidad de medida. Ej: °C, bar, L/min, %, g, Nm, mL, HRC

1.3.8 base_value
Valor base o target. El modelo spring-damper tiende a
mantener la variable cerca de este valor. También es el
valor central esperado en los datos históricos.

1.3.9 noise
Desviación típica del ruido aleatorio del modelo.
Controla la variabilidad alrededor del valor base.
También es la desviación estándar esperada en datos
históricos.

1.3.10 spring
Constante de resorte (0.01-0.10). Qué tan rápido vuelve
la variable a su base tras una perturbación.
- 0.01 → muy lento (deriva)
- 0.05 → medio
- 0.10 → rápido

1.3.11 min
Valor mínimo físico. La variable nunca baja de aquí.

1.3.12 max
Valor máximo físico. La variable nunca supera esto.

1.3.13 warn
Umbral de advertencia. Si se supera, alerta WARN.

1.3.14 crit
Umbral crítico. Si se supera, alerta CRITICAL.

1.3.15 quality_target
Solo para var_type = quality. Valor objetivo de calidad.

1.3.16 quality_usl
Upper Specification Limit para Cp/Cpk.

1.3.17 quality_lsl
Lower Specification Limit para Cp/Cpk.

1.3.18 quality_cp
Cp objetivo del proceso para esta variable de calidad.


====================================================================
2. SECCIÓN DE DATOS HISTÓRICOS (DATA)
====================================================================

2.1 UBICACIÓN EN EL ARCHIVO

Las filas DATA aparecen DESPUÉS de la sección CONFIG, separadas
por una línea que contiene exactamente:

  #DATA

El sistema detecta automáticamente este separador. Todo lo que
está antes son filas CONFIG. Todo lo que está después son filas
DATA (hasta el siguiente marcador `#`, ej. `#WIDE_DATA`).

2.2 COLUMNAS DE DATOS HISTÓRICOS (LONG FORMAT)

┌──────────────┬──────────┬────────────────────────────────────┐
│ Columna       │ Tipo     │ Descripción                        │
├──────────────┼──────────┼────────────────────────────────────┤
│ ts            │ número   │ Índice de tiempo (0, 1, 2, ...)    │
│ machine_id    │ texto    │ ID de la máquina                   │
│ var_name      │ texto    │ Nombre de la variable medida       │
│ value         │ número   │ Valor de la medición               │
└──────────────┴──────────┴────────────────────────────────────┘

2.3 TS (TIMESTAMP)
Índice secuencial (0, 1, 2, …) o timestamp UNIX en milisegundos
para datos reales. El calibrator.js usa estos valores solo para
calcular tendencias temporales (deriva), no para frecuencia de
muestreo. Los datos sintéticos de ejemplo usan índices enteros
que representan ~1 minuto por tick.

2.4 MACHINE_ID
Debe coincidir exactamente con el machine_id definido en las
filas CONFIG del mismo archivo. Como cada archivo pertenece a
una sola máquina, todas las filas DATA deben compartir el mismo
machine_id.

2.5 VAR_NAME
Debe coincidir con un var_name dentro del machine_id en CONFIG.
Si no coincide, la fila se ignora.

2.6 VALUE
El valor medido de la variable en ese instante.
El valor puede desviarse de la distribución simple por tres
factores adicionales:

  a) Deriva (drift): tendencia gradual modelada por regresión
     lineal sobre ts. El calibrador extrae la pendiente y la
     mapea a drift en la simulación.

  b) Correlaciones cruzadas: el valor de una variable puede
     verse afectado por otra de la misma máquina o proceso.
     Ej: BTL-02 vibration elevada → BTL-02 flow_rate baja

  c) Eventos anómalos: picos o caídas puntuales inyectados
     para probar la detección de anomalías.
     Ej: step 5 → BTL-02 vibration spike +0.4g

  La distribución subyacente sigue siendo:
    valor ≈ base_value ± noise * factor_aleatorio
  pero corregida por deriva, correlaciones y eventos.

2.7 EJEMPLO DE FILAS DATA

  ts,machine_id,var_name,value
  0,BTL-01,level,84.2
  1,BTL-01,level,86.7
  2,BTL-01,level,83.5
  0,BTL-01,temperature,81.8
  1,BTL-01,temperature,82.5
  0,BTL-01,pressure,1.15

Cada archivo contiene ~200 timestamps por variable (aprox. 3h
20min de historia a 1 medición/min).


====================================================================
3. SECCIÓN WIDE_DATA (OPCIONAL — SOLO INSPECCIÓN)
====================================================================

Después de los datos en formato long, puede aparecer un bloque
adicional separado por:

  #WIDE_DATA

Con el siguiente formato:

  fecha_hora,<var1>_<unit>,<var2>_<unit>,...,oee_pct,defectos_pct,yield_pct
  2026-05-24 10:00:00,82.0525,84.2713,1.1549,90.7,1.05,98.95

Propósitos:
- Inspección visual por humanos u hojas de cálculo.
- El backend NO procesa esta sección; solo usa el formato long
  (`#DATA`) para la calibración.
- Las columnas incluyen siempre `oee_pct`, `defectos_pct` e
  `yield_pct` como KPIs derivados.

Cada máquina tiene su propia nomenclatura de columnas wide:
┌──────────┬───────────────────────────────────────────────────┐
│ Máquina   │ Columnas wide                                     │
├──────────┼───────────────────────────────────────────────────┤
│ BTL-01   │ temperatura_C, level_pct, presion_bar              │
│ BTL-02   │ presion_bar, flow_rate_Lmin, vibracion_g           │
│ BTL-03   │ temperatura_C, vibracion_g, fill_time_s,           │
│           │ precision_pct, fill_volume_mL, bottle_weight_g,   │
│           │ fill_level_pct                                    │
│ BTL-04   │ velocidad_cinta_m_min, torque_Nm, vibracion_g,     │
│           │ cycle_time_s                                     │
│ BTL-05   │ torque_Nm, precision_pct, vibracion_g,             │
│           │ cap_torque_Nm                                    │
│ BTL-06   │ position_mm, precision_pct, vibracion_g,           │
│           │ label_position_mm                                │
└──────────┴───────────────────────────────────────────────────┘


====================================================================
4. ALGORITMO DE CALIBRACIÓN
====================================================================

4.1 PROPÓSITO

El `calibrator.js` lee las filas DATA (agregadas de todos los
archivos del directorio) y extrae parámetros estadísticos que
se usan para ajustar la simulación. El objetivo es que los datos
generados por la simulación sean estadísticamente indistinguibles
de los datos históricos.

4.2 QUÉ EXTRAE EL CALIBRADOR

Por cada par (machine_id, var_name), el calibrador calcula:

┌─────────────────┬────────────────────────────────────────────┐
│ Parámetro        │ Cómo se calcula                            │
├─────────────────┼────────────────────────────────────────────┤
│ media (μ)        │ Promedio de todos los valores DATA         │
│                   │ → se asigna a base_value de la variable   │
├─────────────────┼────────────────────────────────────────────┤
│ desviación (σ)   │ Desviación estándar de los valores DATA    │
│                   │ → se asigna a noise de la variable        │
├─────────────────┼────────────────────────────────────────────┤
│ autocorr lag 1   │ Correlación entre valor[t] y valor[t-1]   │
│                   │ → se mapea a spring (resorte)             │
│                   │ autocorr alta → spring bajo (inercia)     │
│                   │ autocorr baja  → spring alto (vuelve      │
│                   │                 rápido a la media)        │
├─────────────────┼────────────────────────────────────────────┤
│ tendencia lineal │ Pendiente de regresión lineal simple       │
│                   │ → se mapea a drift (deriva)              │
│                   │ Pendiente positiva → el valor tiende a    │
│                   │   aumentar con el tiempo                  │
└─────────────────┴────────────────────────────────────────────┘

4.3 FÓRMULAS DEL CALIBRADOR

  4.3.1 Media:
    μ = (1/n) * Σ valor[i]

  4.3.2 Desviación estándar:
    σ = sqrt((1/n) * Σ (valor[i] - μ)²)

  4.3.3 Autocorrelación (lag 1):
    r₁ = Σ ((valor[i] - μ) * (valor[i+1] - μ)) / Σ (valor[i] - μ)²

    Mapeo a spring:
    spring = clamp(|r₁| * 0.08 + 0.02, 0.01, 0.10)
    Si r₁ es negativo (oscilación), spring se ajusta a 0.06

  4.3.4 Tendencia lineal (drift):
    pendiente = Σ ((i - ī) * (valor[i] - μ)) / Σ (i - ī)²
    drift = pendiente * 0.01  (escalado por tick rate)

4.4 DETERMINISMO

El algoritmo de calibración es determinista: dado el mismo
conjunto de CSVs de entrada, siempre produce los mismos
parámetros de simulación. Esto garantiza reproducibilidad total.

4.5 MODIFICACIÓN POST-CALIBRACIÓN

Una vez calibrada la simulación, el usuario puede modificar
cualquier parámetro (base_value, noise, spring, thresholds)
a través de la API REST y ver el efecto inmediato en la
simulación. La calibración solo establece los valores
iniciales; no bloquea cambios posteriores.


====================================================================
5. VARIABLES POR MÁQUINA — EMBOTELLADO (BOTTLING)
====================================================================

Cada máquina tiene su propio archivo CSV en `Ejemplos CSV/`,
siguiendo el patrón de nombre `BTL-NN_historico.csv`.

5.1 BTL-01 — Tanque de almacenamiento
   Archivo: `Ejemplos CSV/BTL-01_historico.csv`

Variables operative:
  level         Nivel del tanque (%) — fluctúa con consumo
  temperature   Temperatura del líquido (°C)
  pressure      Presión interna (bar)

5.2 BTL-02 — Bomba industrial
   Archivo: `Ejemplos CSV/BTL-02_historico.csv`

Variables operative:
  pressure      Presión de salida (bar)
  flow_rate     Caudal (L/min)
  vibration     Vibración del motor (g)
  energy        Consumo energético (kWh)

5.3 BTL-03 — Llenadora automática
   Archivo: `Ejemplos CSV/BTL-03_historico.csv`

Variables operative:
  fill_time     Tiempo de llenado (s)
  precision     Precisión de dosificación (%)
  speed         Velocidad (botellas/min)
  vibration     Vibración (g)
  nozzle_state  Estado de boquilla (0-1, 1=óptimo)

Variables quality:
  fill_volume   Volumen llenado por botella (mL) — KPI
  bottle_weight Peso de botella llena (g)
  fill_level    Nivel de llenado (%) — SPC

5.4 BTL-04 — Banda transportadora
   Archivo: `Ejemplos CSV/BTL-04_historico.csv`

Variables operative:
  speed         Velocidad (m/s)
  torque        Torque del motor (Nm)
  vibration     Vibración (g)
  cycle_time    Tiempo de ciclo (s)

5.5 BTL-05 — Tapadora
   Archivo: `Ejemplos CSV/BTL-05_historico.csv`

Variables operative:
  torque        Torque de cierre (Nm)
  precision     Precisión de posicionamiento (%)
  speed         Velocidad (tapas/min)
  vibration     Vibración (g)

Variables quality:
  cap_torque    Torque real aplicado a la tapa (Nm)

5.6 BTL-06 — Etiquetadora
   Archivo: `Ejemplos CSV/BTL-06_historico.csv`

Variables operative:
  position      Posición de la etiqueta (mm)
  precision     Precisión de colocación (%)
  speed         Velocidad (etiquetas/min)
  vibration     Vibración (g)

Variables quality:
  label_position Error de posición de etiqueta (mm)


====================================================================
6. VARIABLES POR MÁQUINA — HORNO INDUSTRIAL (FURNACE)
====================================================================

Actualmente las máquinas FURNACE no tienen archivos individuales
en `Ejemplos CSV/`. Su configuración se define mediante el
fallback de `state.js` (ver sección 9). Cuando se incorporen,
deberán seguir el mismo estándar: un archivo por máquina con
nombre `FUR-NN_historico.csv`.

6.1 FUR-01 — Horno industrial

Variables operative:
  temperature       Temperatura interna (°C)
  residence_time    Tiempo de residencia (min)
  energy            Consumo energético (kWh)

Variables quality:
  hardness          Dureza del material (HRC) — KPI
  fragility         Índice de fragilidad
  residual_humidity Humedad residual (%)
  thermal_uniformity Uniformidad térmica (%) — SPC

6.2 FUR-02 — Sistema de ventilación

Variables operative:
  air_flow          Flujo de aire (m³/s)
  fan_vibration     Vibración del ventilador (g)
  fan_speed         Velocidad del ventilador (RPM)

6.3 FUR-03 — Sensores térmicos

Variables operative:
  precision         Precisión de medición (°C)
  drift             Deriva del sensor (°C/h)
  measurement_error Error de medición (%)

Variables quality:
  color_uniformity  Uniformidad de color (%)

6.4 FUR-04 — Controladores PID

Variables operative:
  setpoint_temp     Temperatura de consigna (°C)
  response_time     Tiempo de respuesta (s)
  stability         Estabilidad del control (0-1)


====================================================================
6. CORRELACIONES AUTOMÁTICAS
====================================================================

El sistema NO necesita columnas de correlación en el CSV.
Las correlaciones se aplican automáticamente según el nombre
de la variable y el proceso industrial:

┌─────────────────────┬──────────────────────────────────────────┐
│ var_name contiene    │ Correlación aplicada                     │
├─────────────────────┼──────────────────────────────────────────┤
│ speed               │ Afecta precision, fill_time, cycle_time   │
│ vibration           │ Afecta precision, dispersion, defects     │
│ pressure            │ Afecta flow_rate, fill_time               │
│ temperature         │ Afecta viscosity, fill_variability,       │
│                     │ hardness, fragility                       │
│ air_flow            │ Afecta thermal_uniformity, defects        │
│ residence_time      │ Afecta hardness, fragility, degradation   │
│ fan_vibration       │ Afecta thermal_uniformity, color, defects │
└─────────────────────┴──────────────────────────────────────────┘

El motor detecta estas correlaciones por nombre de variable y
aplica los modelos matemáticos definidos en bottling.js y
furnace.js.


====================================================================
7. FLUJO DE CARGA DEL CSV
====================================================================

El proceso completo al iniciar el servidor:

1. csv-loader.js lee debugging/data/maquinaria_ejemplo.csv

2. Detecta el separador #DATA:
   - Antes: filas CONFIG → construye state.machines
     con perfiles, umbrales y variables
   - Después: filas DATA → array de datos históricos

3. calibrator.js procesa las filas DATA:
   - Agrupa por (machine_id, var_name)
   - Calcula μ, σ, autocorr, tendencia para cada grupo
   - Actualiza MACHINE_PROFILES con valores calibrados
   - Actualiza state.machines con targets calibrados

4. engine.js inicia el loop 1 Hz usando los perfiles
   calibrados

5. El usuario puede modificar parámetros vía API REST
   y ver el efecto inmediato en la simulación


====================================================================
8. VALORES POR DEFECTO (SI NO HAY CSV)
====================================================================

Si no hay archivo CSV al iniciar, el sistema carga valores
por defecto definidos en src/store/state.js. Esto permite
desarrollo y demo sin CSV.

Los valores por defecto son equivalentes a los del archivo
debugging/data/maquinaria_ejemplo.csv.


====================================================================
9. EJEMPLO DE ARCHIVO COMPLETO
====================================================================

El archivo debugging/data/maquinaria_ejemplo.csv contiene un
ejemplo completo con:
- 43 filas CONFIG (todas las variables de ambas líneas)
- Separador #DATA
- ~460 filas DATA (datos sintéticos que incluyen:
  · distribuciones normales alrededor de base_value ± noise
  · deriva gradual (drift) en variables térmicas y de sensor
  · correlaciones cruzadas entre submáquinas del mismo proceso
  · eventos anómalos inyectados para probar detección ML)

El sistema lee este archivo al iniciar y se calibra
automáticamente para que la simulación replique el
comportamiento histórico.

Para cargar un CSV personalizado en Fase 2 (con Supabase):
- El usuario sube el CSV desde el frontend
- Supabase Storage lo almacena
- El backend lo descarga y procesa para recalibrar

====================================================================
FIN DEL DOCUMENTO
====================================================================
