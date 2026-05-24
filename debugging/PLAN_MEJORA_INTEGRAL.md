====================================================================
PLAN DE MEJORA INTEGRAL: FRONTEND + BACKEND
IndustrIA Sigma — Migración a BTL/FUR + Conexión Frontend-Backend
====================================================================

Basado en los documentos:
  - PLANTEAMIENTO_DEL_PROYECTO.md (visión general)
  - PLAN_IMPLEMENTACION_IA_HIBRIDA.md (arquitectura y modelo físico)
  - MAQUINARIA_SIMULADA.md (procesos industriales detallados)
  - ESTRUCTURA_CSV.md (formato de datos y calibración)

====================================================================
ÍNDICE
====================================================================

1. Resumen del estado actual
2. Migración de máquinas: de 8 genéricas a 10 específicas BTL/FUR
3. Backend: modelo físico completo (bottling.js + furnace.js)
4. Backend: calibración desde CSV (csv-loader.js + calibrator.js)
5. Backend: ML completo (anomaly.js, optimizer.js, metrics.js expandido)
6. Backend: servicios LLM multi-provider (estructura services/llm/)
7. Frontend: limpieza y reestructuración
8. Frontend: conexión con backend real por pantalla
9. Frontend: nuevas visualizaciones (anomalías, WECO, optimizer)
10. Frontend: tooltips contextuales y UX
11. Variables completas por máquina (operativas + calidad)
12. Plan de implementación paso a paso


====================================================================
1. RESUMEN DEL ESTADO ACTUAL
====================================================================

1.1 BACKEND (actual)

  state.js → 8 máquinas genéricas:
    CNC-04, PRS-12, INJ-07, WLD-02, OVN-09, PCK-03, CNV-11, CNC-21

  physics.js → modelo spring-damper genérico (funciona, no específico)
  metrics.js → SPC básico, WECO rule 5 solo, Cp/Cpk genérico
  engine.js → loop 1Hz, actualiza máquinas, alertas, SPC, broadcast
  alerting.js → alertas por umbral de temperatura/vibración
  routes/* → 12 módulos REST funcionales
  routes/ai.js → chat IA con Groq + contexto de planta

  NO existen:
    bottling.js, furnace.js, csv-loader.js, calibrator.js
    anomaly.js, optimizer.js
    services/llm/ (estructura multi-provider)

1.2 FRONTEND (actual)

  app.jsx → 7 rutas activas, 5 screens muertas
  data.jsx → mock MACHINES (8 genéricas), ALERTS, SPC_DATA mock
  dashboard.jsx → sliders locales, no conectan al backend
  monitor_sim.jsx → computeLocal() cuadrático, no usa backend
  lss.jsx → usa SPC_DATA mock, solo INJ-07
  ai_alerts.jsx → ALERTS mock, chat IA funciona
  DataContext.jsx → buena estructura, TICK de WS se recibe

  Problemas principales:
    - Sliders solo afectan predicción local, no envían PATCH al backend
    - Pantallas usan mock data en lugar de datos del WebSocket TICK
    - 5 screens son dead code
    - No hay visualización de anomalías, WECO, ni optimizer
    - Faltan tooltips técnicos


====================================================================
2. MIGRACIÓN DE MÁQUINAS: DE 8 GENÉRICAS A 10 ESPECÍFICAS BTL/FUR
====================================================================

2.1 NUEVAS MÁQUINAS (según PLANTEAMIENTO y MAQUINARIA_SIMULADA)

  ┌─────────┬──────────────────────────┬──────────┬──────────────────────┐
  │ ID      │ Nombre                   │ Proceso  │ Línea                │
  ├─────────┼──────────────────────────┼──────────┼──────────────────────┤
  │ BTL-01  │ Tanque almacenamiento    │ BOTTLING │ Línea 1 · Embotellado│
  │ BTL-02  │ Bomba industrial         │ BOTTLING │ Línea 1 · Embotellado│
  │ BTL-03  │ Llenadora automática     │ BOTTLING │ Línea 1 · Embotellado│
  │ BTL-04  │ Banda transportadora     │ BOTTLING │ Línea 1 · Embotellado│
  │ BTL-05  │ Tapadora                 │ BOTTLING │ Línea 1 · Embotellado│
  │ BTL-06  │ Etiquetadora             │ BOTTLING │ Línea 1 · Embotellado│
  │ FUR-01  │ Horno industrial         │ FURNACE  │ Línea 2 · Horno      │
  │ FUR-02  │ Sistema ventilación      │ FURNACE  │ Línea 2 · Horno      │
  │ FUR-03  │ Sensores térmicos        │ FURNACE  │ Línea 2 · Horno      │
  │ FUR-04  │ Controladores PID        │ FURNACE  │ Línea 2 · Horno      │
  └─────────┴──────────────────────────┴──────────┴──────────────────────┘

2.2 VARIABLES OPERATIVAS POR MÁQUINA (según ESTRUCTURA_CSV.md)

  BTL-01: level, temperature, pressure
  BTL-02: pressure, flow_rate, vibration, energy
  BTL-03: fill_time, precision, speed, nozzle_state
  BTL-04: speed, torque, vibration, cycle_time
  BTL-05: torque, precision, speed
  BTL-06: position, precision, speed
  FUR-01: temperature, residence_time, energy
  FUR-02: air_flow, fan_vibration, fan_speed
  FUR-03: precision, drift, measurement_error
  FUR-04: setpoint_temp, response_time, stability

2.3 VARIABLES DE CALIDAD POR MÁQUINA

  BTL-03: fill_volume (KPI), bottle_weight, fill_level (SPC)
  BTL-05: cap_torque
  BTL-06: label_position
  FUR-01: hardness (KPI), fragility, residual_humidity,
          thermal_uniformity (SPC)
  FUR-03: color_uniformity

2.4 ARCHIVOS A MODIFICAR EN BACKEND

  Archivo: src/store/state.js
    - Reemplazar INIT_MACHINES con las 10 nuevas máquinas
    - Reemplazar MACHINE_PROFILES con perfiles específicos BTL/FUR
    - Cada máquina tiene estructura { id, name, process, line, status,
      vars: { [varName]: { value, target, min, max, warn, crit } },
      quality: { [varName]: { value, target, usl, lsl } },
      anomalyScore, failureProb }

2.5 ARCHIVOS A MODIFICAR EN FRONTEND

  Los screens que referencian MACHINES deben actualizarse para
  mostrar las nuevas máquinas (BTL-01..06, FUR-01..04).


====================================================================
3. BACKEND: MODELO FÍSICO COMPLETO
====================================================================

3.1 NUEVO ARCHIVO: src/simulation/bottling.js

  Reemplaza el physics.js genérico para las 6 máquinas BTL.
  Implementa el modelo spring-damper con correlaciones:

  CORRELACIONES BTL (según PLAN_IMPLEMENTACION sección 5.3):
    speed → precision → defects
    vibration → nozzle stability → dispersion
    pressure → flow_rate → underfill
    temperature → viscosity → fill_variability

  Función principal: updateBottlingMachine(machine, profile)
    - Por cada variable operative: springStep(target, noise, spring)
    - Aplica correlaciones entre variables
    - Calcula variables de quality derivadas de operative
    - machine.vars[].value se actualiza en cada tick

3.2 NUEVO ARCHIVO: src/simulation/furnace.js

  Análogo a bottling.js para las 4 máquinas FUR.

  CORRELACIONES FUR (según PLAN_IMPLEMENTACION sección 6.3):
    temperature → hardness → fragility → defects
    air_flow → thermal_uniformity → Cp/Cpk
    residence_time → degradation → defects
    fan_vibration → thermal_instability → surface_defects

3.3 MODIFICAR: src/simulation/engine.js

  En cada tick, llamar a updateBottlingMachine() o updateFurnaceMachine()
  según machine.process.

  ┌──────────────────────────────────────────────────────────────────┐
  │ function tick() {                                                │
  │   state.tick++;                                                  │
  │   for (const machine of getMachinesArray()) {                    │
  │     if (machine.process === 'BOTTLING')                          │
  │       updateBottlingMachine(machine);                            │
  │     else if (machine.process === 'FURNACE')                      │
  │       updateFurnaceMachine(machine);                             │
  │     evalStatus(machine);                                         │
  │     checkThresholds(machine);                                    │
  │     if (state.tick % 5 === 0) addSPCPoint(machine);             │
  │   }                                                              │
  │   const anomalies = detectAnomalies(getMachinesArray());         │
  │   applyAnomalies(anomalies);                                     │
  │   tickSimulator();                                               │
  │   maybeUpdateProduction();                                       │
  │   broadcaster.emit(TICK payload);                                │
  │ }                                                                │
  └──────────────────────────────────────────────────────────────────┘

3.4 MODIFICAR: src/simulation/metrics.js

  Expandir para soportar múltiples variables de calidad por máquina
  (no solo el SPC genérico actual).

  - calcSPCStats(points) → ya existe, funciona para cualquier array
  - detectWECO() → expandir a Rules 1, 2, 3, 4, 6, 7, 8
  - calcCapability(machine, qualityVar) → Cp/Cpk por variable calidad
  - calcGlobalMetrics() → promediar todas las variables de calidad

3.5 MODIFICAR: src/simulation/alerting.js

  Además de temperatura y vibración, agregar umbrales para:
    - anomalyScore > 0.7 → alerta ANOMALÍA
    - pressure < threshold → alerta SUBLLENADO
    - precision < threshold → alerta PRECISIÓN
    - hardness < threshold → alerta DUREZA


====================================================================
4. BACKEND: CALIBRACIÓN DESDE CSV
====================================================================

4.1 NUEVO ARCHIVO: src/simulation/csv-loader.js

  Lee debugging/data/maquinaria_ejemplo.csv y parsea:
    - Filas antes de #DATA → configRows (43 filas CONFIG)
    - Filas después de #DATA → dataRows (~460 filas DATA)
    - Retorna { configRows, dataRows }

4.2 NUEVO ARCHIVO: src/simulation/calibrator.js

  Toma dataRows y para cada (machine_id, var_name):
    - Calcula: media (μ), desviación (σ), autocorrelación (r₁),
               tendencia lineal (drift)
    - Mapea: μ → base_value, σ → noise, r₁ → spring, drift → drift
    - Retorna objeto con calibraciones

4.3 MODIFICAR: src/store/state.js

  buildFromCSV(configRows):
    - Parsea las 43 filas CONFIG
    - Construye las 10 máquinas con sus perfiles
    - Retorna { machines, profiles }

4.4 MODIFICAR: server.js

  Al arrancar:
    1. Cargar CSV
    2. buildFromCSV(configRows) → state.machines + MACHINE_PROFILES
    3. calibrateFromDataRows(dataRows) → calibraciones
    4. applyCalibration(calibraciones) → ajusta perfiles
    5. startEngine()

  Si no hay CSV: cargar valores por defecto desde state.js (fallback).


====================================================================
5. BACKEND: ML COMPLETO
====================================================================

5.1 NUEVO ARCHIVO: src/simulation/anomaly.js

  Tres niveles de detección (según PLAN_IMPLEMENTACION sección 2.1):

  NIVEL 1: Z-Score adaptativo
    media_móvil + 3σ → marca anomalía
    Por cada variable de cada máquina

  NIVEL 2: Modified IQR
    Q1 - 1.5*IQR y Q3 + 1.5*IQR
    Más robusto ante outliers

  NIVEL 3: Isolation Forest
    Implementación en JS puro (~150 líneas)
    Ensemble de árboles de aislamiento aleatorios
    Features por máquina: [temp, vib, load, rpm, defect]

  SCORE GLOBAL:
    global = zScore * 0.2 + iqr * 0.2 + isoForest * 0.6
    threshold > 0.7 → ANOMALÍA

5.2 NUEVO ARCHIVO: src/simulation/optimizer.js

  Algoritmo Nelder-Mead en JS puro.
  Encuentra setpoints óptimos para minimizar defectos o maximizar Cp.

  Endpoint: POST /api/simulator/optimize
    body: { objective: 'minimize_defects' | 'maximize_cp' }
    response: { optimalParams, expectedCp, expectedDefectReduction }

5.3 MODIFICAR: engine.js

  Ejecutar detectAnomalies() en cada tick y asignar scores a cada
  máquina. Incluir en el payload del TICK de WebSocket:
    anomalies: { machineId: { global, zScore, iqr, isoForest } }


====================================================================
6. BACKEND: SERVICIOS LLM MULTI-PROVIDER
====================================================================

6.1 NUEVA ESTRUCTURA: src/services/llm/

  ├── index.js               ← Orquestador con fallback en cascada
  ├── provider-groq.js       ← Llamada HTTP a Groq API
  ├── provider-gemini.js     ← Llamada HTTP a Gemini API
  ├── provider-openrouter.js ← Llamada HTTP a OpenRouter API
  ├── provider-fallback.js   ← Respuesta rule-based con datos reales
  └── prompts.js             ← System prompt + armado de contexto

  (según PLAN_IMPLEMENTACION sección 3)

6.2 CADENA DE FALLBACK (según PLAN_IMPLEMENTACION sección 3.1)

  1. Groq (llama3-70b-8192) — primario
  2. Gemini (gemini-2.0-flash) — fallback 1
  3. OpenRouter (llama-3-8b) — fallback 2
  4. Rule-based (siempre disponible) — fallback final

6.3 MODIFICAR: routes/ai.js

  Delegar a services/llm/index.js en lugar de llamar a Groq
  directamente.


====================================================================
7. FRONTEND: LIMPIEZA Y REESTRUCTURACIÓN
====================================================================

7.1 ELIMINAR DEAD CODE

  Archivos a eliminar:
    src/screens/monitoring.jsx
    src/screens/spc.jsx
    src/screens/simulator.jsx
    src/screens/ai.jsx
    src/screens/alerts.jsx

  Razón: No están registrados en app.jsx y fueron reemplazados por
  monitor_sim.jsx, lss.jsx y ai_alerts.jsx.

7.2 REFACTOR data.jsx

  Mantener solo: NAV (estructura de navegación)
  Mover utilidades a: src/lib/utils.js
    - mulberry32(seed)
    - makeSeries(n, base, amp, drift)

  Eliminar: MACHINES, ALERTS, EVENTS, SPC_DATA, PARETO, ISHIKAWA,
            PROD_TREND

  Razón: Todas las pantallas deben leer datos del backend vía
  DataContext (WebSocket TICK o REST), no de mocks locales.

7.3 NAVEGACIÓN ACTUALIZADA

  En data.jsx, actualizar NAV para reflejar las nuevas máquinas:
    - Dashboard, Monitoreo y Simulación, Lean Six Sigma,
      IA + Alertas, Reportes, Configuración, Perfil

  (La estructura actual de 7 rutas es correcta, solo cambiar
   labels si es necesario.)


====================================================================
8. FRONTEND: CONEXIÓN CON BACKEND REAL POR PANTALLA
====================================================================

8.1 DataContext.jsx — Asegurar datos vivos

  El TICK de WebSocket ya envía:
    machines, alerts, metrics, events, production, simulator
  → Asegurar que se propagan correctamente a state.

  Si el frontend no recibe TICK (backend caído), mostrar estado
  "OFFLINE" con indicador visual, NO mock data.

8.2 dashboard.jsx — Dashboard en vivo

  ┌──────────────────────────────────────────────────────────────────┐
  │ ANTES:                                                          │
  │   - MOCK_MACHINES como fallback                                │
  │   - sliders locales, no envían al backend                      │
  │   - AI insights desde mock                                     │
  │                                                                 │
  │ DESPUÉS:                                                        │
  │   - machines desde WebSocket TICK (machinesMap)                │
  │   - sliders llaman PATCH /api/simulator/params                │
  │   - resultados se leen de state.simulator.results del TICK     │
  │   - AI insights desde GET /api/ai/insights                    │
  │   - tooltips en Cp, Cpk, Sigma, DPMO                          │
  └──────────────────────────────────────────────────────────────────┘

8.3 monitor_sim.jsx — Monitoreo + Simulación real

  ┌──────────────────────────────────────────────────────────────────┐
  │ ANTES:                                                          │
  │   - computeLocal() cuadrático casero                           │
  │   - sliders afectan solo predicción local                      │
  │   - MOCK_MACHINES en selector                                 │
  │                                                                 │
  │ DESPUÉS:                                                        │
  │   - sliders llaman PATCH /api/simulator/params → resultados   │
  │   - resultados desde state.simulator.results (del TICK)        │
  │   - botones Run/Stop/Reset: POST /api/simulator/run|stop|reset │
  │   - cargar escenarios: GET /api/simulator → scenarios         │
  │   - aplicar escenario: POST /api/simulator/scenarios/:id/load  │
  │   - máquinas desde WebSocket TICK (BTL-01..06, FUR-01..04)     │
  │   - tooltips en métricas de impacto (Cp, Cpk, Sigma)           │
  └──────────────────────────────────────────────────────────────────┘

8.4 lss.jsx — Lean Six Sigma desde backend real

  ┌──────────────────────────────────────────────────────────────────┐
  │ ANTES:                                                          │
  │   - SPC_DATA mock (40 puntos fijos)                           │
  │   - Solo INJ-07                                               │
  │   - WECO no visible                                           │
  │                                                                 │
  │ DESPUÉS:                                                        │
  │   - SPC real: GET /api/spc/:machineId → calcSPCStats()       │
  │   - Selector de máquina (BTL-01..06, FUR-01..04)              │
  │   - Pareto dinámico: GET /api/lss/pareto                      │
  │   - Indicadores WECO en el chart (badges cuando se disparan)   │
  │   - Múltiples variables de calidad por máquina                  │
  │   - tooltips en Cp, Cpk, Sigma, DPMO, USL/LSL, UCL/LCL, WECO  │
  └──────────────────────────────────────────────────────────────────┘

8.5 ai_alerts.jsx — Alertas + IA en vivo

  ┌──────────────────────────────────────────────────────────────────┐
  │ ANTES:                                                          │
  │   - MOCK_ALERTS                                                │
  │   - SparkLine con datos generados localmente                   │
  │                                                                 │
  │ DESPUÉS:                                                        │
  │   - alertas desde WebSocket TICK (se emiten por alerting.js)   │
  │   - alertas nuevas aparecen en tiempo real                     │
  │   - SparkLine con datos reales de telemetría                   │
  │   - botón "Aplicar automático" llama POST /api/alerts/:id/apply│
  │   - tooltips en MTTR, correlación, severidad                   │
  └──────────────────────────────────────────────────────────────────┘

8.6 config.jsx — Configuración

  Ya conecta con el backend. Mejoras:
    - tooltips en cada regla WECO (explicar qué detecta cada una)
    - Al editar límites SPC, enviar PATCH /api/config/spc-limits

8.7 profile.jsx — Perfil

  Ya conecta con el backend. Sin cambios mayores.


====================================================================
9. FRONTEND: NUEVAS VISUALIZACIONES
====================================================================

9.1 VISUALIZACIÓN DE ANOMALÍAS (NUEVO)

  Dónde: monitor_sim.jsx — nuevo panel "Anomalías" por máquina

  Componentes:
    - AnomalyGauge: gauge 0-1 con threshold 0.7
      (verde < 0.5, amarillo 0.5-0.7, rojo > 0.7)
    - AnomalyBreakdown: barra apilada mostrando contribución
      de zScore, IQR e Isolation Forest al score global
    - TrendLine: sparkline del anomalyScore últimos 60 ticks

  Datos desde: TICK del WebSocket → anomalies[machineId]

9.2 REGLAS WECO VISIBLES (NUEVO)

  Dónde: lss.jsx — sobre el ControlChart

  Implementación:
    - Cuando calcSPCStats() devuelve wecoIndices con índices,
      renderizar marcadores en el chart indicando qué regla se violó
    - Badge "R1 activa", "R5 activa" etc. junto al chart
    - Tooltip con descripción de la regla violada

  Datos desde: GET /api/spc/:machineId → wecoIndices

9.3 OPTIMIZADOR NELDER-MEAD (NUEVO)

  Dónde: monitor_sim.jsx — botón "Optimizar setpoints"

  Flujo:
    1. Usuario hace clic en "Optimizar"
    2. POST /api/simulator/optimize { objective: 'minimize_defects' }
    3. Backend ejecuta Nelder-Mead
    4. Respuesta: { optimalParams, expectedCp, expectedReduction }
    5. Frontend muestra: "Setpoint óptimo: temp 212°C, speed 88%,
       presión 145 bar — Cp esperado: 1.48 (-24% defectos)"
    6. Botón "Aplicar" para enviar optimalParams a PATCH /api/simulator/params

9.4 VARIABLES DE CALIDAD COMPLETAS (NUEVO)

  Dónde: lss.jsx y dashboard.jsx

  Por cada máquina, mostrar:
    - Variables operative: sliders con valores actuales
    - Variables quality: cards con valor, target, USL/LSL, Cp/Cpk
    - SPC chart por variable quality seleccionada


====================================================================
10. FRONTEND: TOOLTIPS CONTEXTUALES Y UX
====================================================================

10.1 NUEVO COMPONENTE: Tooltip en shell.jsx

  <Tooltip text="Explicación del término">
    {children}
  </Tooltip>

  Renderiza un span con hover que muestra un popup estilizado
  (panel oscuro con borde sutil, texto claro).

10.2 TÉRMINOS CON TOOLTIP

  ┌──────────────┬──────────────────────────────────────────────────┐
  │ Término       │ Tooltip                                          │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ Cp            │ Capacidad potencial del proceso. Mide si la      │
  │               │ variación del proceso cabe dentro de las         │
  │               │ especificaciones. Cp ≥ 1.33 es deseable.         │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ Cpk           │ Capacidad real del proceso. Considera el         │
  │               │ centrado. Cpk ≥ 1.33 indica proceso capaz y     │
  │               │ centrado. Cpk < Cp sugiere descentrado.          │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ Sigma Level   │ Nivel sigma del proceso. 6σ = 3.4 DPMO.         │
  │               │ Industria general: 4σ = 6,210 DPMO.             │
  │               │ World-class: > 5σ.                               │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ DPMO          │ Defectos Por Millón de Oportunidades.            │
  │               │ Meta Six Sigma: < 3.4 DPMO.                     │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ USL / LSL     │ Upper/Lower Specification Limit. Límites de     │
  │               │ especificación del cliente/diseño.               │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ UCL / LCL     │ Upper/Lower Control Limit. Límites de control   │
  │               │ estadístico a ±3σ de la media del proceso.      │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ OEE           │ Overall Equipment Effectiveness.                 │
  │               │ OEE = Disponibilidad × Rendimiento × Calidad     │
  │               │ World-class: > 85%.                              │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ WECO Rule 1   │ 1 punto fuera de ±3σ (zona A). Indica           │
  │               │ cambio significativo en el proceso.              │
  │ WECO Rule 2   │ 9 puntos consecutivos del mismo lado de         │
  │               │ la media. Indica descentrado.                    │
  │ WECO Rule 3   │ 6 puntos consecutivos creciendo o decreciendo.  │
  │               │ Indica tendencia (drift).                        │
  │ WECO Rule 4   │ 14 puntos alternando arriba/abajo. Indica       │
  │               │ sobre-control (oscilación).                      │
  │ WECO Rule 5   │ 2 de 3 puntos en zona A (fuera ±2σ).           │
  │ WECO Rule 6   │ 4 de 5 puntos en zona B o más allá (fuera ±σ). │
  │ WECO Rule 7   │ 15 puntos consecutivos en zona C (±1σ).        │
  │               │ Indica variabilidad menor de lo esperado.        │
  │ WECO Rule 8   │ 8 puntos consecutivos fuera de zona C (±1σ).   │
  │               │ Indica estratificación o mezcla.                 │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ Spring        │ Constante de resorte del modelo spring-damper.  │
  │               │ 0.01 = vuelve lento a la media (inercia alta).  │
  │               │ 0.10 = vuelve rápido a la media.                 │
  │ Noise         │ Ruido aleatorio (desviación estándar) del       │
  │               │ modelo de simulación. Controla variabilidad.     │
  │ Drift         │ Deriva gradual. Pendiente de cambio sostenido   │
  │               │ en el tiempo (ej: temperatura que sube 0.5°C/h).│
  └──────────────┴──────────────────────────────────────────────────┘

10.3 CUÁNDO APARECE CADA TOOLTIP

  - Al hacer hover sobre cualquier métrica (Cp, Cpk, Sigma, etc.)
  - En los encabezados de tabla (USL, LSL, UCL, LCL)
  - En los nombres de las reglas WECO en Config
  - En los labels de los sliders (spring, noise, drift)
  - En el panel de impacto predicho


====================================================================
11. VARIABLES COMPLETAS POR MÁQUINA
====================================================================

11.1 RESUMEN DE VARIABLES A IMPLEMENTAR

  OPERATIVAS (17 en total):
    level, temperature, pressure,
    flow_rate, vibration, energy,
    fill_time, precision, speed, nozzle_state,
    torque, cycle_time,
    position,
    residence_time,
    air_flow, fan_vibration, fan_speed,
    measurement_error, drift_sensor, response_time, stability

  CALIDAD (9 en total):
    fill_volume, bottle_weight, fill_level,
    cap_torque,
    label_position,
    hardness, fragility, residual_humidity,
    thermal_uniformity, color_uniformity

11.2 DÓNDE SE MUESTRA CADA VARIABLE EN EL FRONTEND

  Dashboard (dashboard.jsx):
    - Resumen: cards con las 3 variables principales por máquina
    - Sliders de las 5 variables operativas más importantes

  Monitor + Simulación (monitor_sim.jsx):
    - TODAS las variables operative de la máquina seleccionada
    - Panel de impacto con las métricas de calidad resultantes
    - SparkLines de tendencia por variable

  Lean Six Sigma (lss.jsx):
    - Variables quality con chart SPC (X̄, MR, Histograma)
    - Cp/Cpk por variable quality seleccionada
    - Pareto de defectos por causa

  Configuración (config.jsx):
    - Tabla de todas las variables con sus límites
    - Edición de USL/LSL/warn/crit


====================================================================
12. PLAN DE IMPLEMENTACIÓN PASO A PASO
====================================================================

FASE 1: BACKEND — MIGRACIÓN DE MÁQUINAS (2 días)
────────────────────────────────────────────────
[ ] 1.1 Modificar src/store/state.js
      - Reemplazar INIT_MACHINES con BTL-01..06 + FUR-01..04
      - Nueva estructura con vars{} y quality{}
      - MACHINE_PROFILES con perfiles específicos
[ ] 1.2 npm test (verificar que el servidor inicia)
[ ] 1.3 Verificar que routes responden con nuevas máquinas

FASE 2: BACKEND — MODELOS FÍSICOS (3 días)
──────────────────────────────────────────
[ ] 2.1 Crear src/simulation/bottling.js
[ ] 2.2 Crear src/simulation/furnace.js
[ ] 2.3 Modificar src/simulation/engine.js para usar bottling/furnace
[ ] 2.4 Verificar que la simulación genera datos coherentes

FASE 3: BACKEND — CALIBRACIÓN DESDE CSV (2 días)
────────────────────────────────────────────────
[ ] 3.1 Crear debugging/data/maquinaria_ejemplo.csv (o verificar existe)
[ ] 3.2 Crear src/simulation/csv-loader.js
[ ] 3.3 Crear src/simulation/calibrator.js
[ ] 3.4 Modificar server.js para cargar y calibrar al iniciar

FASE 4: BACKEND — ML + OPTIMIZADOR (2 días)
────────────────────────────────────────────
[ ] 4.1 Crear src/simulation/anomaly.js (Isolation Forest + z-score + IQR)
[ ] 4.2 Conectar anomaly.js a engine.js (detectar en cada tick)
[ ] 4.3 Crear src/simulation/optimizer.js (Nelder-Mead)
[ ] 4.4 Agregar ruta POST /api/simulator/optimize
[ ] 4.5 Expandir metrics.js (WECO 1-8 completas)

FASE 5: BACKEND — LLM MULTI-PROVIDER (1 día)
─────────────────────────────────────────────
[ ] 5.1 Crear estructura src/services/llm/
[ ] 5.2 Implementar provider-groq.js, gemini.js, openrouter.js, fallback.js
[ ] 5.3 Implementar orquestador (index.js)
[ ] 5.4 Modificar routes/ai.js para usar el orquestador
[ ] 5.5 Verificar cadena de fallback

FASE 6: FRONTEND — LIMPIEZA (1 día)
────────────────────────────────────
[ ] 6.1 Eliminar 5 screens muertas (monitoring, spc, simulator, ai, alerts)
[ ] 6.2 Refactor data.jsx: mover utilidades a lib/utils.js
[ ] 6.3 Eliminar mocks MACHINES, ALERTS, SPC_DATA, etc.

FASE 7: FRONTEND — CONEXIÓN CON BACKEND (3 días)
─────────────────────────────────────────────────
[ ] 7.1 dashboard.jsx: sliders conectados a PATCH /api/simulator/params
[ ] 7.2 monitor_sim.jsx: sliders conectados, Run/Stop/Reset, escenarios
[ ] 7.3 lss.jsx: SPC real desde backend, selector de máquina, WECO visible
[ ] 7.4 ai_alerts.jsx: alertas desde TICK, botón "Aplicar" funcional
[ ] 7.5 DataContext.jsx: asegurar que TICK propaga todo correctamente

FASE 8: FRONTEND — NUEVAS VISUALIZACIONES (2 días)
───────────────────────────────────────────────────
[ ] 8.1 Panel de anomalías por máquina (monitor_sim.jsx)
[ ] 8.2 Marcadores WECO en chart (lss.jsx)
[ ] 8.3 Botón optimizer + mostrar resultados (monitor_sim.jsx)
[ ] 8.4 Variables de calidad completas visibles (lss.jsx, dashboard.jsx)

FASE 9: FRONTEND — TOOLTIPS + UX (1 día)
─────────────────────────────────────────
[ ] 9.1 Crear componente Tooltip en shell.jsx
[ ] 9.2 Tooltips en dashboard.jsx (Cp, Cpk, Sigma, DPMO)
[ ] 9.3 Tooltips en monitor_sim.jsx (Cp, Cpk, Spring, Noise, Drift)
[ ] 9.4 Tooltips en lss.jsx (todos los términos SPC)
[ ] 9.5 Tooltips en config.jsx (reglas WECO)
[ ] 9.6 Tooltips en ai_alerts.jsx (MTTR, correlación)

FASE 10: VERIFICACIÓN E INTEGRACIÓN (1 día)
────────────────────────────────────────────
[ ] 10.1 Verificar flujo completo: CSV → calibración → simulación → frontend
[ ] 10.2 Probar modificación de parámetros vía sliders
[ ] 10.3 Probar detección de anomalías
[ ] 10.4 Probar optimización Nelder-Mead
[ ] 10.5 Probar chat IA con contexto de planta
[ ] 10.6 Probar alertas en tiempo real
[ ] 10.7 Probar exportación PDF de LSS
[ ] 10.8 Verificar que no hay mock data en producción


====================================================================
RESUMEN DE ARCHIVOS A CREAR / MODIFICAR / ELIMINAR
====================================================================

CREAR (Backend):
  src/simulation/bottling.js        ← Modelo físico embotelladora
  src/simulation/furnace.js         ← Modelo físico horno
  src/simulation/csv-loader.js      ← Parseo de CSV
  src/simulation/calibrator.js      ← Calibración estadística
  src/simulation/anomaly.js         ← Isolation Forest + z-score + IQR
  src/simulation/optimizer.js       ← Nelder-Mead
  src/services/llm/index.js         ← Orquestador multi-provider
  src/services/llm/provider-groq.js
  src/services/llm/provider-gemini.js
  src/services/llm/provider-openrouter.js
  src/services/llm/provider-fallback.js
  src/services/llm/prompts.js

MODIFICAR (Backend):
  src/store/state.js                ← BTL/FUR + estructura vars/quality
  src/simulation/engine.js          ← bottling.js + furnace.js + anomaly.js
  src/simulation/metrics.js         ← WECO 1-8 + multi-quality
  src/simulation/alerting.js        ← Nuevos umbrales
  src/routes/ai.js                  ← Usar orquestador LLM
  src/routes/simulator.js           ← Agregar /optimize
  server.js                         ← Cargar CSV y calibrar al iniciar

CREAR (Frontend):
  src/lib/utils.js                  ← mulberry32, makeSeries
  (Tooltip en shell.jsx como componente)

MODIFICAR (Frontend):
  src/data.jsx                      ← Solo NAV, eliminar mocks
  src/shell.jsx                     ← Agregar componente Tooltip
  src/screens/dashboard.jsx         ← Sliders → backend, máquinas reales
  src/screens/monitor_sim.jsx       ← Sliders → backend, anomalías, optimizer
  src/screens/lss.jsx               ← SPC real, WECO, multi-máquina, tooltips
  src/screens/ai_alerts.jsx         ← Alertas reales, botón aplicar funcional
  src/screens/config.jsx            ← Tooltips WECO
  src/context/DataContext.jsx       ← Asegurar TICK propaga todo

ELIMINAR (Frontend):
  src/screens/monitoring.jsx        ← Dead code
  src/screens/spc.jsx               ← Dead code
  src/screens/simulator.jsx         ← Dead code
  src/screens/ai.jsx                ← Dead code
  src/screens/alerts.jsx            ← Dead code

ELIMINAR (Frontend — de data.jsx):
  MACHINES, ALERTS, EVENTS          ← Mocks reemplazados por backend
  SPC_DATA, PARETO, ISHIKAWA       ← Mocks reemplazados por backend
  PROD_TREND                        ← Mocks reemplazados por backend


====================================================================
DEPENDENCIAS ENTRE FASES
====================================================================

  Fase 1 ──► Fase 2 ──► Fase 4 ──► Fase 5
    │                      │
    └──► Fase 3 ───────────┘
                              │
                              ▼
                         Fase 6 ──► Fase 7 ──► Fase 8 ──► Fase 9
                                                              │
                                                              ▼
                                                         Fase 10

  Nota: Las Fases 1-5 son de backend y pueden ejecutarse en
  paralelo con las Fases 6-9 de frontend (trabajo independiente).


====================================================================
FIN DEL DOCUMENTO
====================================================================
