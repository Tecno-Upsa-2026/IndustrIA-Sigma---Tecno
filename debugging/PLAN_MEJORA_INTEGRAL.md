====================================================================
PLAN DE MEJORA INTEGRAL: FRONTEND + BACKEND (CORREGIDO)
IndustrIA Sigma — Migración a BTL/FUR + Conexión Frontend-Backend
====================================================================

Basado en los documentos:
  - PLANTEAMIENTO_DEL_PROYECTO.md (visión general + prompt original)
  - PLAN_IMPLEMENTACION_IA_HIBRIDA.md (arquitectura y modelo físico)
  - MAQUINARIA_SIMULADA.md (procesos industriales detallados)
  - ESTRUCTURA_CSV.md (formato de datos y calibración)
  - PROMP_DESARROLLO_ESPECIALIZADO.md (prompt original de desarrollo)
  - ULtimaac.md (cambios reales aplicados en el último commit)
  - Backend/src/ (código real existente)

====================================================================
ESTADO REAL DEL PROYECTO (PUNTO DE PARTIDA)
====================================================================

1.1 BACKEND (EXISTENTE)

  state.js → 8 máquinas genéricas:
    CNC-04, PRS-12, INJ-07, WLD-02, OVN-09, PCK-03, CNV-11, CNC-21
    (NO las 10 BTL/FUR especificadas en el plan original)

  physics.js → modelo spring-damper genérico (funciona pero no específico
    por proceso; debiera ser split en bottling.js + furnace.js)

  metrics.js → SPC básico con:
    - calcSPCStats() — media, sd, ucl, lcl, usl, lsl, cp, cpk
    - calcGlobalMetrics() — OEE, DPMO, Sigma, Yield
    - detectWECO() — solo Rule 5 (2 de 3 en zona A)
    - calcSimResults() — predicción de calidad
    FALTAN: WECO Rules 1-8 completas, X̄-R, X̄-S, Individuals,
    Moving Range, calcCapability() por variable de calidad

  engine.js → loop 1Hz correcto, llama a updateMachine() de physics.js
    y checkThresholds() de alerting.js. Emite TICK vía WebSocket.
    NO llama a bottling.js/furnace.js (no existen)
    NO llama a anomaly.js (no existe)
    NO llama a optimizer.js (no existe)

  alerting.js → umbrales de temperatura y vibración solamente.
    FALTAN: anomalyScore > 0.7, pressure, precision, hardness

  routes/* → 12 módulos REST funcionales:
    - auth.js: usa Supabase Auth real + JWT (YA implementado)
    - config.js: CRUD usuarios via Supabase Admin, WECO rules, SPC limits
    - ai.js: chat IA con Groq (solo Groq, NO multi-provider)
    - Simulator: tiene run/stop/reset/scenarios, FALTA /optimize
    - Machines: CRUD + comando setpoint
    - Alerts: acknowledge/escalate/apply/close
    - SPC: stats por machineId
    - LSS: métricas, pareto, yield-by-line, dpmo-trend, dmaic
    - Dashboard, Search, Profile, Reports

  supabase.js → cliente regular + admin service_role (YA implementado)
  broadcaster.js → WebSocket funcional con init() y emit()
  scripts/create-admin.js → script admin funcional (YA implementado)

  NO EXISTEN:
    src/simulation/bottling.js
    src/simulation/furnace.js
    src/simulation/csv-loader.js
    src/simulation/calibrator.js
    src/simulation/anomaly.js
    src/simulation/optimizer.js
    src/services/llm/ (directorio completo)

1.2 FRONTEND (EXISTENTE — ya se aplicaron muchos cambios del plan)

  YA IMPLEMENTADO (según ULtimaac.md):
    - PDF generation (src/lib/pdf.js) con generatePDF() y generateDataReport()
    - Charts nuevos: ParetoChart, LiveWave, Donut, Heatmap (charts.jsx)
    - CSV integrado en dashboard con CSVSection, MachineMini, ParamSlider
    - Login rediseñado con panel izquierdo SVG, bifactor, invite flow
    - Config con 4 tabs: Máquinas, Límites SPC, Usuarios, Variables
    - SPC con datos CSV reales, computeStats(), detectWECO() 4 reglas
    - LSS con computeSPCStats(), computeCSVPareto(), buildCSVIshikawa(), autoPhases()
    - Simulador con selector máquina, sliders, modelo físico local, impacto
    - Reports con modal generación, PDF programático, eliminación
    - Shell sin selector de planta fijo

  AÚN PENDIENTE O CON PROBLEMAS:
    - Las pantallas usan datos mock en lugar del WebSocket TICK
    - Los sliders no envían PATCH al backend
    - Faltan tooltips técnicos
    - Faltan visualizaciones de anomalías desde backend
    - Faltan visualizaciones WECO en charts
    - Faltan conexión optimizer

1.3 CSV DE CALIBRACIÓN

  debugging/data/maquinaria_ejemplo.csv → EXISTE con:
    - 44 filas CONFIG (proceso, machine_id, var_name, base_value, noise, spring, etc.)
    - Separador #DATA
    - ~460 filas DATA con mediciones históricas
  PERO: el backend nunca lo lee. server.js arranca directo sin CSV.

====================================================================
CORRECCIONES AL PLAN ORIGINAL (vs. PROMP_DESARROLLO_ESPECIALIZADO)
====================================================================

El PROMP_DESARROLLO_ESPECIALIZADO.md y PLANTEAMIENTO_DEL_PROYECTO.md
definen la arquitectura final correcta. El PLAN_MEJORA_INTEGRAL original
estaba alineado con esa visión, pero necesita correcciones porque:

  1. Varias tareas de Frontend ya se implementaron en ULtimaac.md
     (PDF, charts, CSV en dashboard, login, config, SPC, LSS, simulator, reports)
  2. El Backend YA tiene Supabase Auth (no es "futuro opcional", ya está)
  3. Falta precisión en las dependencias entre módulos backend
  4. Las estimaciones de tiempo no reflejan que parte del frontend ya está
  5. No se distingue entre "conectar slider a backend" (tarea frontend)
     y "que el backend procese el slider" (tarea backend que ya funciona)

====================================================================
ÍNDICE DEL PLAN CORREGIDO
====================================================================

1. Resumen del estado real actual (corregido)
2. Backend — Migración de máquinas: de 8 genéricas a 10 BTL/FUR
3. Backend — Modelo físico completo (bottling.js + furnace.js)
4. Backend — Calibración desde CSV (csv-loader.js + calibrator.js + server.js)
5. Backend — ML completo (anomaly.js, optimizer.js, metrics.js expandido)
6. Backend — Servicios LLM multi-provider (services/llm/)
7. Frontend — Limpieza de dead code y mocks
8. Frontend — Conexión con backend real por pantalla
9. Frontend — Nuevas visualizaciones (anomalías, WECO, optimizer)
10. Frontend — Tooltips contextuales y UX
11. Verificación e integración
12. Resumen de archivos a crear/modificar/eliminar
13. Plan de implementación paso a paso con dependencias

====================================================================
1. RESUMEN DEL ESTADO REAL ACTUAL (CORREGIDO)
====================================================================

1.1 BACKEND

  ✅ state.js — 8 máquinas genéricas (NO las 10 BTL/FUR)
  ✅ physics.js — modelo spring-damper genérico
  ⚠️ metrics.js — SPC básico, WECO solo Rule 5
  ✅ engine.js — loop 1Hz, broadcast TICK
  ⚠️ alerting.js — solo umbrales temp/vib
  ✅ routes/* — 12 módulos REST funcionales
  ⚠️ routes/ai.js — solo Groq directo (no multi-provider)
  ✅ supabase.js — Auth real con service_role
  ✅ broadcaster.js — WebSocket funcional
  ✅ auth.js — Supabase Auth + JWT
  ✅ config.js — CRUD usuarios, WECO, SPC limits
  ❌ bottling.js — NO EXISTE
  ❌ furnace.js — NO EXISTE
  ❌ csv-loader.js — NO EXISTE
  ❌ calibrator.js — NO EXISTE
  ❌ anomaly.js — NO EXISTE
  ❌ optimizer.js — NO EXISTE
  ❌ services/llm/ — NO EXISTE

1.2 FRONTEND

  ✅ PDF generation (lib/pdf.js)
  ✅ Nuevos charts (ParetoChart, LiveWave, Donut, Heatmap)
  ✅ CSV integrado en dashboard
  ✅ Login rediseñado con invite flow
  ✅ Config con 4 tabs funcionales
  ✅ SPC con datos CSV y WECO 4 reglas
  ✅ LSS con Pareto real, Ishikawa, DMAIC auto
  ✅ Simulador con sliders locales
  ✅ Reports con PDF programático
  ⚠️ Faltan tooltips técnicos
  ⚠️ Faltan conectar sliders al backend
  ⚠️ Faltan anomalías desde backend
  ⚠️ Faltan WECO en charts
  ⚠️ Faltan conexión optimizer

====================================================================
2. BACKEND — MIGRACIÓN DE MÁQUINAS: DE 8 GENÉRICAS A 10 BTL/FUR
====================================================================

2.1 NUEVAS MÁQUINAS (según PLANTEAMIENTO, ESTRUCTURA_CSV y CSV real)

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

2.2 ARCHIVO A MODIFICAR: src/store/state.js

  a) Reemplazar INIT_MACHINES (8 máquinas genéricas) por array que
     contenga las 10 máquinas BTL/FUR. Cada máquina con estructura:

     {
       id: 'BTL-01',
       name: 'Tanque de almacenamiento',
       process: 'BOTTLING',    // ← NUEVO: embotellado o horno
       line: 'Línea 1',
       status: 'RUNNING',
       temp: 82,               // ← se mantiene para compatibilidad
       vib: 0.25,              //    con frontend existente
       rpm: 0,
       load: 0,
       defect: 0,
       oee: 0,
       energy: 38,
       status: 'RUNNING',
       setpointOverride: null,
       vars: {                 // ← NUEVO: variables operativas por máquina
         level: { value: 85, target: 85, min: 0, max: 100, warn: 92, crit: 95 },
         temperature: { value: 82, target: 82, min: 15, max: 100, warn: 90, crit: 95 },
         pressure: { value: 1.2, target: 1.2, min: 0, max: 3, warn: 2.5, crit: 2.8 },
       },
       quality: {              // ← NUEVO: variables de calidad
         fill_volume: { value: 500, target: 500, usl: 505, lsl: 495 },
       },
       anomalyScore: 0,        // ← NUEVO: para anomaly.js
       failureProb: 0,         // ← NUEVO: para optimizer.js
     }

     IMPORTANTE: mantener los campos planos (temp, vib, defect, oee, etc.)
     para que el frontend actual no se rompa. Agregar vars{} y quality{}
     como datos adicionales.

  b) Reemplazar MACHINE_PROFILES con perfiles físicos extraídos del CSV.
     Los valores EXACTOS salen del archivo maquinaria_ejemplo.csv:

     PERFILES POR MÁQUINA (valores desde CSV):
     BTL-01: { tempBase: 82, tempNoise: 1.0, tempSpring: 0.04,
                tempMin: 15, tempMax: 100, tempWarn: 90, tempCrit: 95,
                vibBase: 0.05, vibNoise: 0.005, vibWarn: 0, vibCrit: 0,
                loadBase: 0, loadNoise: 0, energyBase: 0 }
     (...completar para las 10 máquinas con datos del CSV...)

  c) IMPORTANTE: Los valores de MACHINE_PROFILES y estados iniciales
     deben coincidir con lo que define el CSV en sus filas CONFIG.
     El CSV es la fuente de verdad; state.js es solo el fallback.

  d) Agregar función buildFromCSV(configRows) que construye las máquinas
     y perfiles desde las filas CONFIG del CSV, para usar en server.js.

2.3 ARCHIVOS A MODIFICAR EN BACKEND (por compatibilidad)

  routes/machines.js → Verificar que trabaje con la nueva estructura
    (machines[id].vars, machines[id].quality ya existen).
    Mantener endpoints GET/POST/PATCH/DELETE funcionales.

  routes/dashboard.js → Asegurar que calcGlobalMetrics() usa los
    campos planos correctos (temp, vib, oee, defect, etc.).

  routes/spc.js → Asegurar que state.spcWindows[id] funciona igual.

  routes/lss.js → Verificar que yield-by-line usa machines[id].line

2.4 ARCHIVO A MODIFICAR: src/simulation/physics.js

  Este archivo debe convertirse en un puente que delega:
  - Si machine.process === 'BOTTLING' → llama a bottling.js
  - Si machine.process === 'FURNACE' → llama a furnace.js
  - Caso contrario (máquinas viejas o sin proceso) → usa el modelo viejo

  ESTO PERMITE MIGRACIÓN GRADUAL: las rutas y el frontend siguen
  funcionando mientras se construyen los modelos específicos.

====================================================================
3. BACKEND — MODELO FÍSICO COMPLETO
====================================================================

3.1 NUEVO ARCHIVO: src/simulation/bottling.js

  Modelo físico para las 6 máquinas de la línea de embotellado.
  Reemplaza la lógica genérica de physics.js para estas máquinas.

  FUNCIÓN PRINCIPAL:
    updateBottlingMachine(machine, profile)
    - Recibe la máquina y su perfil físico
    - Actualiza machine.vars[varName].value para cada variable operativa
    - Calcula machine.defect, machine.oee, machine.temp, machine.vib
      a partir de las correlaciones (para mantener compatibilidad con
      frontend que lee campos planos)

  MODELO SPRING-DAMPER (reutilizar funciones de physics.js):
    springStep(current, target, spring, noise)
    clamp(v, min, max)

  CORRELACIONES BTL (según PLAN_IMPLEMENTACION sección 5.3):
    speed → precision → defects:
      precision se reduce cuando speed aumenta
      defect_rate = baseDefect + (speed - baseSpeed) * 0.003
    vibration → dispersion:
      fill_dispersion = baseDispersion + vibration * 0.15
    pressure → flow_rate:
      flow_rate = baseFlow * (pressure / basePressure) ^ 0.5
    temperature → viscosity → fill_variability:
      fill_variability = baseVar + abs(temp - baseTemp) * 0.02

  VARIABLES A ACTUALIZAR POR MÁQUINA:
    BTL-01: level, temperature, pressure
    BTL-02: pressure, flow_rate, vibration, energy
    BTL-03: fill_time, precision, speed, nozzle_state
            + quality: fill_volume, bottle_weight, fill_level
    BTL-04: speed, torque, vibration, cycle_time
    BTL-05: torque, precision, speed
            + quality: cap_torque
    BTL-06: position, precision, speed
            + quality: label_position

  SALIDA: machine.vars actualizado, más valores planos:
    machine.temp = machine.vars.temperature.value
    machine.vib = machine.vars.vibration.value (máquina más vibrante)
    machine.defect = tasa de defecto calculada de correlaciones
    machine.oee = disponibilidad * rendimiento * calidad
    machine.energy = consumo energético calculado

3.2 NUEVO ARCHIVO: src/simulation/furnace.js

  Análogo a bottling.js para las 4 máquinas del horno.

  CORRELACIONES FUR (según PLAN_IMPLEMENTACION sección 6.3):
    temperature → hardness → fragility → defects:
      hardness = baseHardness - (temp - baseTemp) * 0.5
      fragility = baseFragility + (temp - baseTemp) * 0.02
      defect_rate = baseDefect + fragility * 0.5
    air_flow → uniformity:
      thermal_uniformity = baseUniformity - abs(air_flow - baseFlow) * 0.1
    residence_time → degradation:
      defect_rate += (residence_time - baseTime) * 0.005
    fan_vibration → surface_defects:
      surface_defects = baseDefects + fan_vibration * 5

  VARIABLES A ACTUALIZAR POR MÁQUINA:
    FUR-01: temperature, residence_time, energy
            + quality: hardness, fragility, residual_humidity, thermal_uniformity
    FUR-02: air_flow, fan_vibration, fan_speed
    FUR-03: precision, drift, measurement_error
            + quality: color_uniformity
    FUR-04: setpoint_temp, response_time, stability

3.3 MODIFICAR: src/simulation/engine.js

  En cada tick, delegar la actualización según el proceso:

  function tick() {
    state.tick++;

    for (const machine of getMachinesArray()) {
      // 1. Modelo físico según proceso
      if (machine.process === 'BOTTLING') {
        updateBottlingMachine(machine, MACHINE_PROFILES[machine.id]);
      } else if (machine.process === 'FURNACE') {
        updateFurnaceMachine(machine, MACHINE_PROFILES[machine.id]);
      } else {
        updateMachine(machine);  // fallback genérico (máquinas legacy)
      }

      // 2. Evaluar estado (WARN/CRITICAL/RUNNING/IDLE)
      const newStatus = evalStatus(machine);
      if (newStatus !== machine.status) {
        addEvent(...);
        broadcaster.emit({ type:'MACHINE_STATUS_CHANGE', ... });
      }
      machine.status = newStatus;

      // 3. Alertas por umbral
      checkThresholds(machine);

      // 4. SPC point cada 5 ticks
      if (state.tick % 5 === 0) {
        addSPCPoint(state.spcWindows, machine.id, machine);
      }
    }

    // 5. Anomalías (Isolation Forest + z-score + IQR)
    const anomalies = detectAnomalies(getMachinesArray());
    applyAnomalies(anomalies);

    // 6. Simulador digital twin
    tickSimulator();

    // 7. Producción histórica
    maybeUpdateProduction();

    // 8. Eventos aleatorios
    maybeGenerateEvent();

    // 9. Broadcast TICK
    broadcaster.emit({
      type: 'TICK', ts: Date.now(), tick: state.tick,
      machines: state.machines,
      alerts: state.alerts.filter(a => a.status !== 'closed').slice(0, 20),
      metrics: calcGlobalMetrics(),
      anomalies: getAnomalyScores(),  // ← NUEVO
      events: state.events.slice(0, 15),
      simulator: { status: state.simulator.status, results: state.simulator.results },
      production: state.productionHistory.slice(-60),
    });
  }

3.4 MODIFICAR: src/simulation/physics.js

  Mantener como módulo de utilidades compartidas:
    - springStep(current, target, spring, noise)
    - clamp(v, min, max)
    - rng — generador pseudoaleatorio determinista

  Exportar estas funciones para que bottling.js y furnace.js las usen.

  La función updateMachine() se mantiene como fallback para máquinas
  que no tengan proceso definido (migración gradual).

3.5 MODIFICAR: src/simulation/metrics.js — WECO 1-8 completas

  EXPANDIR detectWECO() para implementar todas las reglas:

  detectWECO(points, mean, sd):
    R1 — 1 point beyond ±3σ (ya cubierto por oocIndices)
    R2 — 9 consecutive on same side of mean
    R3 — 6 consecutive monotonic (all increasing or decreasing)
    R4 — 14 alternating up/down (oscillation)
    R5 — 2 of 3 in zone A (beyond ±2σ) ← ya existe
    R6 — 4 of 5 in zone B or beyond (beyond ±1σ)
    R7 — 15 consecutive in zone C (within ±1σ)
    R8 — 8 consecutive beyond zone C (outside ±1σ, both sides)

    Retornar: { r1:[indices], r2:[indices], ..., rN:[indices] }

  NUEVA FUNCIÓN: calcCapability(machine, qualityVar)
    - Toma una máquina y el nombre de una variable de calidad
    - Retorna { cp, cpk, mean, sd, usl, lsl, points }
    - Usa los SPC points de state.spcWindows[machine.id][qualityVar]

  NUEVA FUNCIÓN: calcControlCharts(points, type)
    - type: 'XbarR' | 'XbarS' | 'Individuals' | 'MR'
    - Retorna los límites y estadísticos correspondientes

3.6 MODIFICAR: src/simulation/alerting.js

  Además de temperatura y vibración, agregar umbrales:

  checkThresholds(machine):
    - Si machine.anomalyScore > 0.7 → alerta ANOMALÍA
    - Si machine.vars.pressure?.value < pressure_warn → alerta PRESIÓN
    - Si machine.vars.precision?.value < precision_warn → alerta PRECISIÓN
    - Si existe quality.hardness y es < hardness_warn → alerta DUREZA
    - Los umbrales warn/crit se leen de machine.vars[var].warn/crit
      o de MACHINE_PROFILES según corresponda.

====================================================================
4. BACKEND — CALIBRACIÓN DESDE CSV
====================================================================

4.1 NUEVO ARCHIVO: src/simulation/csv-loader.js

  Función: loadCSV(filePath)
    - Lee debugging/data/maquinaria_ejemplo.csv
    - Detecta el separador #DATA
    - Antes de #DATA: filas CONFIG (objeto con columnas del CSV:
      process, machine_id, machine_name, line, var_name, var_type,
      unit, base_value, noise, spring, min, max, warn, crit,
      quality_target, quality_usl, quality_lsl, quality_cp)
    - Después de #DATA: filas DATA (ts, machine_id, var_name, value)
    - Retorna: { configRows: [...], dataRows: [...] }

  SIN DEPENDENCIAS EXTERNAS: usar split + map nativo de Node.js.
  Si se desea, instalar csv-parse para mayor robustez (opcional).

4.2 NUEVO ARCHIVO: src/simulation/calibrator.js

  Funciones estadísticas (implementar en JS puro):
    mean(values)
    std(values, mean)
    autocorrelation(values, lag=1)
    linearTrend(values)

  Función principal: calibrateFromDataRows(dataRows)
    - Agrupa por (machine_id, var_name)
    - Para cada grupo, calcula:
      media (μ) → calibratedBase
      desviación (σ) → calibratedNoise
      autocorrelación (r₁) → spring = clamp(|r₁| * 0.08 + 0.02, 0.01, 0.10)
      tendencia lineal → drift = pendiente * 0.01
    - Retorna: { [machineId]: { [varName]: { calibratedBase,
      calibratedNoise, calibratedSpring, calibratedDrift } } }

  Función: applyCalibration(calibrations)
    - Itera sobre MACHINE_PROFILES y state.machines
    - Actualiza base, noise, spring, drift con valores calibrados
    - Retorna: número de variables calibradas

4.3 MODIFICAR: src/store/state.js (agregar buildFromCSV)

  buildFromCSV(configRows):
    - Parsea las filas CONFIG para construir state.machines
    - Por cada machine_id único:
      * Crea entrada en machines con id, name, process, line
      * Agrupa vars operative y quality
      * Inicializa vars[varName] con { value: base_value,
        target: base_value, min, max, warn, crit }
      * Inicializa quality[varName] para vars type=quality
        con { value, target, usl, lsl }
      * Inicializa campos planos (temp, vib, etc.) de la primera
        variable operative relevante
    - También construye MACHINE_PROFILES actualizados
    - Retorna { machines, profiles }

4.4 MODIFICAR: server.js

  Al arrancar el servidor (ANTES de startEngine):

  import { loadCSV } from './src/simulation/csv-loader.js';
  import { calibrateFromDataRows, applyCalibration } from './src/simulation/calibrator.js';
  import { buildFromCSV } from './src/store/state.js';

  const CSV_PATH = './debugging/data/maquinaria_ejemplo.csv';
  let csvLoaded = false;

  try {
    const csvData = loadCSV(CSV_PATH);
    if (csvData?.configRows?.length) {
      // 1. Construir máquinas desde CONFIG
      const { machines, profiles } = buildFromCSV(csvData.configRows);
      Object.assign(state.machines, machines);
      Object.assign(MACHINE_PROFILES, profiles);

      // 2. Calibrar desde DATA
      if (csvData.dataRows?.length) {
        const calibrations = calibrateFromDataRows(csvData.dataRows);
        const applied = applyCalibration(calibrations);
        console.log(`  [CSV] ${csvData.configRows.length} config rows, ${csvData.dataRows.length} data rows`);
        console.log(`  [CSV] ${applied} variables calibradas desde históricos`);
      }
      csvLoaded = true;
    }
  } catch (e) {
    console.warn(`  [CSV] No se pudo cargar: ${e.message}. Usando valores por defecto.`);
  }

  if (!csvLoaded) {
    console.log('  [CSV] Usando configuración por defecto de state.js');
  }

  // Iniciar motor
  startEngine();

====================================================================
5. BACKEND — ML COMPLETO
====================================================================

5.1 NUEVO ARCHIVO: src/simulation/anomaly.js

  TRES NIVELES DE DETECCIÓN (ejecutar en cada tick o cada N ticks):

  NIVEL 1: Z-Score adaptativo
    - Por cada máquina, mantener media móvil y desviación estándar
      de los últimos N ticks para cada feature
    - Si |valor_actual - media| > 3 * desv → anomalía
    - computeZScore(machine): score 0-1

  NIVEL 2: Modified IQR
    - Mantener ventana de últimos N valores por feature
    - Q1 - 1.5*IQR y Q3 + 1.5*IQR
    - computeIQR(machine): score 0-1

  NIVEL 3: Isolation Forest
    - Implementación en JS puro (~150 líneas)
    - Clase IsolationForest con fit() y scoreSamples()
    - Features por máquina: [temp, vib, load, defect, delta_temp]
    - nTrees = 50 (suficiente para 10 máquinas), sampleSize = 64

  Función principal: detectAnomalies(machines)
    - Construye matriz de features desde machines
    - Ejecuta los 3 niveles
    - Score global = zScore * 0.2 + iqr * 0.2 + isoForest * 0.6
    - Retorna: [{ id, zScore, iqr, isoForest, global }]

  Función auxiliar: applyAnomalies(anomalies)
    - Asigna machine.anomalyScore = anomaly.global
    - Asigna machine.failureProb basado en score

  NOTA DE RENDIMIENTO:
    - Isolation Forest con 50 árboles y 10 máquinas: < 2ms por tick
    - No necesita optimización para 1 Hz
    - Ejecutar cada 5-10 ticks para reducir CPU si es necesario

5.2 NUEVO ARCHIVO: src/simulation/optimizer.js

  Algoritmo: Nelder-Mead (descenso simplex) en JS puro.

  Función: nelderMead(objectiveFn, initialParams, options)
    - objectiveFn(params) → valor a minimizar (ej: defect_rate)
    - initialParams: { temp, speed, pressure, vibration, torque }
    - options: { maxIterations, tolerance }
    - Retorna: { optimalParams, fMin, iterations }

  Función de objetivo: defectFromParams(params)
    - Usa el mismo modelo que calcSimResults() en metrics.js
    - Dado un set de parámetros, calcula defect_rate esperado

  Endpoint: POST /api/simulator/optimize
    - body: { objective: 'minimize_defects' | 'maximize_cp' | 'balance' }
    - Llama a nelderMead() con la función objetivo correspondiente
    - response: { optimalParams, expectedCp, expectedDefectReduction, iterations }

5.3 MODIFICAR: src/routes/simulator.js

  Agregar ruta:
    POST /api/simulator/optimize
      body: { objective }
      usa optimizer.js → nelderMead
      response: { optimalParams, expectedCp, expectedDefectReduction }

5.4 MODIFICAR: engine.js

  - Importar detectAnomalies de anomaly.js
  - Ejecutar detectAnomalies(getMachinesArray()) cada tick
  - Asignar scores a cada máquina con applyAnomalies()
  - Incluir anomalies en el payload del TICK de WebSocket

====================================================================
6. BACKEND — SERVICIOS LLM MULTI-PROVIDER
====================================================================

6.1 NUEVA ESTRUCTURA: src/services/llm/

  ├── index.js               ← Orquestador con fallback en cascada
  ├── provider-groq.js       ← Llamada HTTP a Groq API
  ├── provider-gemini.js     ← Llamada HTTP a Gemini API
  ├── provider-openrouter.js ← Llamada HTTP a OpenRouter API
  ├── provider-fallback.js   ← Respuesta rule-based con datos reales
  └── prompts.js             ← System prompt + armado de contexto

6.2 ORQUESTADOR (index.js)

  chatWithAI(question, conversationHistory):
    context = buildContext()
    for provider in [groqProvider, geminiProvider, openrouterProvider]:
      try:
        response = await provider(context, question, history)
        return { text: response, provider: provider.name }
      catch(err):
        console.warn(...)
    // Fallback final
    return { text: fallbackProvider(context, question), provider: 'rule-based' }

6.3 PROVIDER-GROQ.JS

  usa GROQ_API_KEY de .env
  URL: https://api.groq.com/openai/v1/chat/completions
  Modelo: llama3-70b-8192
  Timeout: 15 segundos
  Manejo de errores: HTTP 429, 500+, timeout

6.4 PROVIDER-GEMINI.JS

  usa GEMINI_API_KEY de .env
  URL: https://generativelanguage.googleapis.com/v1beta/models/
       gemini-2.0-flash:generateContent?key=GEMINI_API_KEY
  Timeout: 15 segundos
  Manejo de errores similar

6.5 PROVIDER-OPENROUTER.JS

  usa OPENROUTER_API_KEY de .env
  URL: https://openrouter.ai/api/v1/chat/completions
  Modelo: meta-llama/llama-3-8b-instruct
  Timeout: 15 segundos

6.6 PROVIDER-FALLBACK.JS

  Función puramente rule-based:
    - Si hay alertas CRITICAL → "Se detectaron alertas críticas..."
    - Si anomalyScore > 0.7 → "Anomalías detectadas en..."
    - Si OEE < 60% → "Rendimiento bajo..."
    - Siempre devuelve un análisis basado en datos de state actual
    - No depende de APIs externas

6.7 PROMPTS.JS

  SYSTEM_PROMPT: mismo del plan original (ingeniero industrial senior)
  buildContext(): arma contexto con máquinas, alertas, métricas, tendencias
  buildMessages(context, question, history): arma array de mensajes

6.8 MODIFICAR: routes/ai.js

  Reemplazar la llamada directa a Groq por:
    import { chatWithAI } from '../services/llm/index.js';
    const { text, provider } = await chatWithAI(message, history);

  El resto del endpoint se mantiene igual (persistencia, inicio sesión, etc.)

====================================================================
7. FRONTEND — LIMPIEZA DE DEAD CODE Y MOCKS
====================================================================

  NOTA: PARTE DE ESTO YA SE HIZO EN ULtimaac.md. Verificar estado real.

7.1 VERIFICAR ARCHIVOS A ELIMINAR

  ┌────────────────────────────┬──────────┬──────────────────────────────┐
  │ Archivo                    │ Estado   │ Acción                       │
  ├────────────────────────────┼──────────┼──────────────────────────────┤
  │ src/screens/monitoring.jsx │ PENDIENTE│ Eliminar (dead code)         │
  │ src/screens/spc.jsx        │ PENDIENTE│ Eliminar (spc.jsx nuevo)     │
  │ src/screens/simulator.jsx  │ PENDIENTE│ Eliminar (monitor_sim existe)│
  │ src/screens/ai.jsx         │ PENDIENTE│ Eliminar (ai_alerts existe)  │
  │ src/screens/alerts.jsx     │ PENDIENTE│ Eliminar (ai_alerts existe)  │
  └────────────────────────────┴──────────┴──────────────────────────────┘

7.2 REFACTOR src/data.jsx

  ┌──────────────────┬─────────────────────────────────────────────┐
  │ Elemento         │ Acción                                      │
  ├──────────────────┼─────────────────────────────────────────────┤
  │ NAV              │ MANTENER (estructura de navegación)          │
  │ mulberry32(seed) │ MOVER a src/lib/utils.js                     │
  │ makeSeries()     │ MOVER a src/lib/utils.js                     │
  │ MACHINES mock    │ ELIMINAR (usar backend vía WebSocket/REST)   │
  │ ALERTS mock      │ ELIMINAR (usar backend vía WebSocket/REST)   │
  │ EVENTS mock      │ ELIMINAR (usar backend vía WebSocket/REST)   │
  │ SPC_DATA mock    │ ELIMINAR (usar backend vía REST)             │
  │ PARETO mock      │ ELIMINAR (usar backend vía REST)             │
  │ ISHIKAWA mock    │ ELIMINAR (usar backend vía REST)             │
  │ PROD_TREND mock  │ ELIMINAR (usar backend vía WebSocket)        │
  └──────────────────┴─────────────────────────────────────────────┘

====================================================================
8. FRONTEND — CONEXIÓN CON BACKEND REAL POR PANTALLA
====================================================================

  NOTA: El frontend actual (según ULtimaac.md) tiene mucho avanzado
  con CSV local, pero los sliders y datos no se sincronizan con el
  backend. Esta fase conecta cada pantalla al backend real.

8.1 DataContext.jsx — Asegurar propagación de TICK

  - Verificar que el TICK del WebSocket se recibe y propaga a:
    machines, alerts, metrics, events, production, simulator, anomalies
  - Si no se recibe TICK por >5 segundos → estado OFFLINE
  - NO usar mock data como fallback para producción

8.2 dashboard.jsx — Dashboard en vivo

  ┌──────────────────────────────────────────────────────────────────┐
  │ ESTADO ACTUAL:                                                   │
  │   - Parseo CSV funcionando (CSVSection, MachineMini)             │
  │   - sliders locales llaman simTick() local                       │
  │   - AI insights desde generateLocalInsights()                    │
  │                                                                  │
  │ CAMBIO NECESARIO:                                                │
  │   - Sliders deben llamar PATCH /api/simulator/params             │
  │   - Resultados desde state.simulator.results del TICK            │
  │   - AI insights desde GET /api/ai/insights                      │
  │   - tooltips en Cp, Cpk, Sigma, DPMO                            │
  └──────────────────────────────────────────────────────────────────┘

8.3 monitor_sim.jsx — Monitoreo + Simulación real

  ┌──────────────────────────────────────────────────────────────────┐
  │ ESTADO ACTUAL:                                                   │
  │   - computeLocal() con modelo matemático casero                  │
  │   - sliders afectan solo predicción local                        │
  │   - MOCK_MACHINES en selector                                    │
  │   - Ya tiene AISuggestion contextual                             │
  │                                                                  │
  │ CAMBIO NECESARIO:                                                │
  │   - Sliders llaman PATCH /api/simulator/params                   │
  │   - Resultados desde state.simulator.results (del TICK)          │
  │   - Botones Run/Stop/Reset usan POST /api/simulator/run|stop     │
  │   - Escenarios desde GET /api/simulator → scenarios              │
  │   - Aplicar escenario: POST /api/simulator/scenarios/:id/load    │
  │   - Máquinas desde WebSocket TICK (BTL-01..06, FUR-01..04)       │
  │   - tooltips en Cp, Cpk, Sigma, Spring, Noise, Drift            │
  └──────────────────────────────────────────────────────────────────┘

8.4 lss.jsx — Lean Six Sigma desde backend real

  ┌──────────────────────────────────────────────────────────────────┐
  │ ESTADO ACTUAL:                                                   │
  │   - computeSPCStats() con datos CSV locales                      │
  │   - computeCSVPareto() desde datos CSV                           │
  │   - buildCSVIshikawa() desde CSV                                 │
  │   - WECO Rules 1,2,3,5 implementadas localmente                 │
  │                                                                  │
  │ CAMBIO NECESARIO:                                                │
  │   - SPC real: GET /api/spc/:machineId → calcSPCStats()          │
  │   - Selector de máquina con BTL-01..06, FUR-01..04              │
  │   - Pareto dinámico: GET /api/lss/pareto                        │
  │   - Indicadores WECO visibles en el chart                        │
  │   - Múltiples variables de calidad por máquina                   │
  │   - tooltips en Cp, Cpk, Sigma, DPMO, USL/LSL, UCL/LCL, WECO   │
  └──────────────────────────────────────────────────────────────────┘

8.5 ai_alerts.jsx — Alertas + IA en vivo

  ┌──────────────────────────────────────────────────────────────────┐
  │ ESTADO ACTUAL:                                                   │
  │   - Alertas desde csv-generadas localmente                       │
  │   - Chat IA funciona con Groq                                    │
  │                                                                  │
  │ CAMBIO NECESARIO:                                                │
  │   - Alertas desde WebSocket TICK (alerting.js del backend)       │
  │   - Alertas nuevas en tiempo real                               │
  │   - SparkLine con datos reales de telemetría                    │
  │   - Botón "Aplicar automático" → POST /api/alerts/:id/apply     │
  │   - tooltips en MTTR, correlación, severidad                    │
  └──────────────────────────────────────────────────────────────────┘

8.6 config.jsx — Configuración

  ┌──────────────────────────────────────────────────────────────────┐
  │ ESTADO ACTUAL: YA CONECTA CON BACKEND                            │
  │ Mejoras:                                                         │
  │   - tooltips en cada regla WECO (explicar qué detecta cada una)  │
  │   - Al editar límites SPC, enviar PATCH /api/config/spc-limits   │
  └──────────────────────────────────────────────────────────────────┘

8.7 profile.jsx — Perfil

  YA CONECTA con el backend. Sin cambios mayores. Verificar que
  PATCH /api/profile funcione correctamente.

====================================================================
9. FRONTEND — NUEVAS VISUALIZACIONES
====================================================================

9.1 VISUALIZACIÓN DE ANOMALÍAS (monitor_sim.jsx)

  Nuevo panel "Anomalías" por máquina, visible cuando el backend
  envía anomalies en el TICK.

  Componentes:
    - AnomalyGauge: gauge 0-1 con threshold 0.7
      (verde < 0.5, amarillo 0.5-0.7, rojo > 0.7)
    - AnomalyBreakdown: barra apilada de zScore, IQR, Isolation Forest
    - TrendLine: sparkline del anomalyScore últimos 60 ticks

  Datos: TICK del WebSocket → anomalies[machineId]

9.2 REGLAS WECO VISIBLES (lss.jsx)

  Sobre el ControlChart, cuando calcSPCStats() devuelva weco rules:
    - Renderizar marcadores visuales en el chart
    - Badge "R1 activa", "R5 activa" junto al chart
    - Tooltip con descripción de la regla violada

  Datos: GET /api/spc/:machineId → wecoIndices (expandido con rules 1-8)

9.3 OPTIMIZADOR NELDER-MEAD (monitor_sim.jsx)

  Botón "Optimizar setpoints" que:
    1. GET /api/simulator/optimize { objective: 'minimize_defects' }
    2. Muestra resultado: "Setpoint óptimo: temp 212°C, speed 88%..."
    3. Botón "Aplicar" → PATCH /api/simulator/params con parámetros óptimos

  Datos: POST /api/simulator/optimize (nuevo endpoint)

9.4 VARIABLES DE CALIDAD COMPLETAS (lss.jsx, dashboard.jsx)

  Por cada máquina, mostrar:
    - Variables operative: sliders con valores actuales
    - Variables quality: cards con valor, target, USL/LSL, Cp/Cpk
    - SPC chart por variable quality seleccionada

====================================================================
10. FRONTEND — TOOLTIPS CONTEXTUALES Y UX
====================================================================

10.1 NUEVO COMPONENTE: Tooltip (en shell.jsx o componente separado)

  <Tooltip text="Explicación del término">
    {children}
  </Tooltip>

  Renderiza span con hover que muestra popup estilizado
  (panel oscuro con borde sutil, texto claro).

10.2 TÉRMINOS CON TOOLTIP (índice completo)

  ┌──────────────┬──────────────────────────────────────────────────┐
  │ Término       │ Tooltip                                          │
  ├──────────────┼──────────────────────────────────────────────────┤
  │ Cp            │ Capacidad potencial del proceso. Cp ≥ 1.33 ...   │
  │ Cpk           │ Capacidad real del proceso. Cpk ≥ 1.33 ...       │
  │ Sigma Level   │ Nivel sigma. 6σ = 3.4 DPMO.                     │
  │ DPMO          │ Defectos Por Millón de Oportunidades.            │
  │ USL / LSL     │ Upper/Lower Specification Limit.                 │
  │ UCL / LCL     │ Upper/Lower Control Limit (±3σ).                │
  │ OEE           │ Overall Equipment Effectiveness. World-class:85% │
  │ WECO Rules    │ (1-8, descripción de cada regla)                 │
  │ Spring        │ Constante resorte spring-damper. 0.01=lento      │
  │ Noise         │ Ruido (desviación estándar) del modelo.          │
  │ Drift         │ Deriva gradual (pendiente temporal).             │
  └──────────────┴──────────────────────────────────────────────────┘

10.3 UBICACIÓN DE CADA TOOLTIP

  - dashboard.jsx: Cp, Cpk, Sigma, DPMO
  - monitor_sim.jsx: Cp, Cpk, Sigma, Spring, Noise, Drift
  - lss.jsx: todos los términos SPC (Cp, Cpk, Sigma, DPMO, USL/LSL, UCL/LCL, WECO)
  - config.jsx: reglas WECO (explicación de cada una)
  - ai_alerts.jsx: MTTR, correlación, severidad

====================================================================
11. VERIFICACIÓN E INTEGRACIÓN
====================================================================

11.1 PRUEBAS UNITARIAS POR MÓDULO

  [ ] csv-loader.js: probar parseo de CONFIG y DATA
  [ ] calibrator.js: probar media, σ, autocorr, tendencia
  [ ] bottling.js: probar actualización de cada máquina BTL
  [ ] furnace.js: probar actualización de cada máquina FUR
  [ ] anomaly.js: probar z-score, IQR, Isolation Forest
  [ ] optimizer.js: probar Nelder-Mead con función cuadrática conocida
  [ ] metrics.js: probar WECO Rules 1-8 con datos conocidos
  [ ] metrics.js: probar calcControlCharts X̄-R, X̄-S, MR

11.2 PRUEBAS DE INTEGRACIÓN

  [ ] server.js: arranque con CSV → máquinas BTL/FUR construidas
  [ ] server.js: calibración aplicada correctamente
  [ ] engine.js: tick produce datos coherentes para cada máquina
  [ ] engine.js: anomaly scores se generan y propagan
  [ ] routes/ai.js: orquestador multi-provider (Groq si no, fallback)
  [ ] WebSocket: TICK contiene anomalies
  [ ] REST: GET /api/machines devuelve BTL/FUR
  [ ] REST: GET /api/spc/:machineId devuelve stats
  [ ] REST: POST /api/simulator/optimize funciona
  [ ] REST: PATCH /api/simulator/params afecta simulación

11.3 PRUEBAS DE FRONTEND

  [ ] DataContext recibe y propaga TICK correctamente
  [ ] Dashboard muestra máquinas BTL/FUR desde backend
  [ ] Sliders de monitor_sim.jsx envían PATCH al backend
  [ ] lss.jsx recibe SPC desde backend
  [ ] ai_alerts.jsx recibe alertas en tiempo real
  [ ] Botón "Aplicar" en alertas funciona
  [ ] Optimizer muestra resultados y aplica
  [ ] Tooltips aparecen en hover
  [ ] Sin mock data en producción

11.4 PRUEBA DE FLUJO COMPLETO

  [ ] 1. Arrancar servidor → carga CSV → calibra → inicia simulación
  [ ] 2. Frontend se conecta vía WebSocket → recibe TICK
  [ ] 3. Dashboard muestra máquinas BTL/FUR con datos vivos
  [ ] 4. Modificar slider → PATCH al backend → simulación reacciona
  [ ] 5. SPC muestra datos reales con WECO rules
  [ ] 6. Anomalías se detectan y muestran
  [ ] 7. Optimizer encuentra setpoints óptimos
  [ ] 8. Chat IA responde con contexto real de planta
  [ ] 9. Alertas aparecen en tiempo real
  [ ] 10. Sin errores en consola del servidor

====================================================================
12. RESUMEN DE ARCHIVOS A CREAR / MODIFICAR / ELIMINAR
====================================================================

12.1 CREAR (Backend — 11 archivos)

  src/simulation/bottling.js        ← Modelo físico embotelladora
  src/simulation/furnace.js         ← Modelo físico horno
  src/simulation/csv-loader.js      ← Parseo de CSV (CONFIG + DATA)
  src/simulation/calibrator.js      ← Calibración estadística
  src/simulation/anomaly.js         ← Isolation Forest + z-score + IQR
  src/simulation/optimizer.js       ← Nelder-Mead
  src/services/llm/index.js         ← Orquestador multi-provider
  src/services/llm/provider-groq.js ← Provider Groq
  src/services/llm/provider-gemini.js← Provider Gemini
  src/services/llm/provider-openrouter.js ← Provider OpenRouter
  src/services/llm/provider-fallback.js   ← Provider rule-based
  src/services/llm/prompts.js       ← System prompt + buildContext

12.2 MODIFICAR (Backend — 8 archivos)

  src/store/state.js                ← BTL/FUR + vars/quality + buildFromCSV
  src/simulation/engine.js          ← bottling + furnace + anomaly
  src/simulation/physics.js         ← Utilidades compartidas springStep/clamp
  src/simulation/metrics.js         ← WECO 1-8 + calcCapability + control charts
  src/simulation/alerting.js        ← Nuevos umbrales + anomalyScore
  src/routes/ai.js                  ← Usar orquestador LLM
  src/routes/simulator.js           ← Agregar /optimize
  server.js                         ← Cargar CSV + calibrar al iniciar

12.3 MODIFICAR (Frontend — 8 archivos)

  src/lib/utils.js                  ← mulberry32, makeSeries (crear si no existe)
  src/shell.jsx                     ← Agregar componente Tooltip
  src/data.jsx                      ← Solo NAV, eliminar mocks
  src/context/DataContext.jsx       ← Asegurar TICK propaga anomalies
  src/screens/dashboard.jsx         ← Sliders → backend, tooltips
  src/screens/monitor_sim.jsx       ← Sliders → backend, anomalías, optimizer
  src/screens/lss.jsx               ← SPC real, WECO visible, tooltips
  src/screens/ai_alerts.jsx         ← Alertas reales, aplicar funcional

12.4 ELIMINAR (Frontend — 5 archivos)

  src/screens/monitoring.jsx        ← Dead code
  src/screens/spc.jsx               ← Dead code
  src/screens/simulator.jsx         ← Dead code
  src/screens/ai.jsx                ← Dead code
  src/screens/alerts.jsx            ← Dead code

====================================================================
13. PLAN DE IMPLEMENTACIÓN PASO A PASO (ORDENADO POR DEPENDENCIAS)
====================================================================

  DIAGRAMA DE DEPENDENCIAS:

  Fase 1 ──► Fase 2 ──► Fase 4 ──► Fase 5 ──► Fase 7
    │          │                                │
    └──► Fase 3────────────────────────────────┘
                                                  │
                  ◄───────────────────────────────┘
                  │
                  ▼
            Fase 6 ──► Fase 8 ──► Fase 9 ──► Fase 10 ──► Fase 11

====================================================================
FASE 1: MIGRAR state.js a BTL/FUR (estructural, sin lógica nueva)
────────────────────────────────────────────────────────────────────
Duración estimada: medio día

[ ] 1.1 Reemplazar INIT_MACHINES (8 genéricas) por 10 BTL/FUR
      - IDs: BTL-01..06, FUR-01..04
      - Agregar campo process ('BOTTLING' | 'FURNACE')
      - Agregar estructura vars{} y quality{} por máquina
      - Mantener campos planos (temp, vib, defect, oee) para compatibilidad
      - Máquinas inician con valores del CSV (base_value como target)
[ ] 1.2 Reemplazar MACHINE_PROFILES con perfiles del CSV
[ ] 1.3 Agregar función buildFromCSV(configRows)
[ ] 1.4 Verificar que server.js inicia sin errores
[ ] 1.5 Verificar que routes responden (GET /api/machines)

====================================================================
FASE 2: MODELOS FÍSICOS ESPECÍFICOS (bottling.js + furnace.js)
────────────────────────────────────────────────────────────────────
Duración estimada: 2 días

[ ] 2.1 Refactorizar physics.js como utilidad compartida
      - Mover springStep(), clamp() y rng() a exports
      - Mantener updateMachine() como fallback genérico
[ ] 2.2 Crear src/simulation/bottling.js
      - updateBottlingMachine(machine, profile)
      - Modelo spring-damper para cada variable operative
      - Correlaciones: speed→precision→defects, pressure→flow_rate, temp→viscosity
      - Cálculo de variables quality derivadas
      - Actualización de campos planos (temp, vib, defect, oee)
[ ] 2.3 Crear src/simulation/furnace.js
      - updateFurnaceMachine(machine, profile)
      - Correlaciones: temp→hardness→fragility, air_flow→uniformity, etc.
      - Análogo a bottling.js
[ ] 2.4 Modificar engine.js para usar bottling/furnace según process
[ ] 2.5 Verificar que la simulación genera datos coherentes
      - temp no se dispara, defect coherente con correlaciones
      - OEE > 0 para máquinas RUNNING

====================================================================
FASE 3: CALIBRACIÓN DESDE CSV (csv-loader.js + calibrator.js)
────────────────────────────────────────────────────────────────────
Duración estimada: 1 día

[ ] 3.1 Crear src/simulation/csv-loader.js
      - loadCSV(filePath) → { configRows, dataRows }
      - Sin dependencias externas (split + map)
[ ] 3.2 Crear src/simulation/calibrator.js
      - mean(), std(), autocorrelation(), linearTrend()
      - calibrateFromDataRows(dataRows) → calibraciones
      - applyCalibration(calibrations) → actualiza perfiles
[ ] 3.3 Modificar server.js
      - loadCSV al arrancar
      - buildFromCSV(configRows) → state.machines + MACHINE_PROFILES
      - calibrateFromDataRows(dataRows) → calibraciones
      - applyCalibration() → ajusta perfiles
      - Fallback a state.js si no hay CSV
[ ] 3.4 Verificar que al arrancar se cargan y calibran las 10 máquinas

====================================================================
FASE 4: ML COMPLETO (anomaly.js + optimizer.js + metrics expandido)
────────────────────────────────────────────────────────────────────
Duración estimada: 2 días

[ ] 4.1 Crear src/simulation/anomaly.js
      - computeZScore(), computeIQR()
      - Clase IsolationForest (fit + scoreSamples)
      - detectAnomalies(machines) → [{id, zScore, iqr, isoForest, global}]
      - applyAnomalies(anomalies) → asigna scores a máquinas
[ ] 4.2 Conectar anomaly.js a engine.js
      - Ejecutar detectAnomalies() cada tick
      - applyAnomalies() después
      - Incluir anomalies en payload TICK
[ ] 4.3 Crear src/simulation/optimizer.js
      - nelderMead(objectiveFn, initialParams, options)
      - defectFromParams(params) → función objetivo
[ ] 4.4 Agregar POST /api/simulator/optimize en routes/simulator.js
[ ] 4.5 Expandir metrics.js
      - detectWECO() completo (Rules 1-8)
      - calcCapability(machine, qualityVar)
      - calcControlCharts(points, type)

====================================================================
FASE 5: LLM MULTI-PROVIDER (services/llm/)
────────────────────────────────────────────────────────────────────
Duración estimada: 1 día

[ ] 5.1 Crear src/services/llm/prompts.js
      - SYSTEM_PROMPT
      - buildContext() → arma contexto de planta
      - buildMessages() → arma array de mensajes para API
[ ] 5.2 Crear src/services/llm/provider-groq.js
[ ] 5.3 Crear src/services/llm/provider-gemini.js
[ ] 5.4 Crear src/services/llm/provider-openrouter.js
[ ] 5.5 Crear src/services/llm/provider-fallback.js
[ ] 5.6 Crear src/services/llm/index.js (orquestador con fallback)
[ ] 5.7 Modificar routes/ai.js para usar chatWithAI() del orquestador
[ ] 5.8 Verificar cadena: Groq funciona, si falla → Gemini, si falla → rule-based

====================================================================
FASE 6: LIMPIEZA FRONTEND (dead code + mocks)
────────────────────────────────────────────────────────────────────
Duración estimada: medio día

[ ] 6.1 Eliminar 5 screens muertas (monitoring, spc, simulator, ai, alerts)
[ ] 6.2 Refactor data.jsx: mover utilidades a lib/utils.js
[ ] 6.3 Eliminar mocks: MACHINES, ALERTS, EVENTS, SPC_DATA, PARETO, ISHIKAWA, PROD_TREND
[ ] 6.4 Verificar que app.jsx no importa archivos eliminados

====================================================================
FASE 7: CONEXIÓN FRONTEND CON BACKEND
────────────────────────────────────────────────────────────────────
Duración estimada: 2 días

[ ] 7.1 DataContext.jsx: asegurar que TICK propaga anomalies + machines nuevas
[ ] 7.2 dashboard.jsx: sliders → PATCH /api/simulator/params
[ ] 7.3 dashboard.jsx: insights → GET /api/ai/insights
[ ] 7.4 monitor_sim.jsx: sliders → backend, Run/Stop/Reset, escenarios
[ ] 7.5 lss.jsx: SPC desde GET /api/spc/:machineId
[ ] 7.6 ai_alerts.jsx: alertas desde TICK, botón aplicar funcional

====================================================================
FASE 8: NUEVAS VISUALIZACIONES
────────────────────────────────────────────────────────────────────
Duración estimada: 1 día

[ ] 8.1 Panel de anomalías en monitor_sim.jsx (AnomalyGauge + Breakdown)
[ ] 8.2 Marcadores WECO en chart de lss.jsx
[ ] 8.3 Botón optimizer + resultados en monitor_sim.jsx
[ ] 8.4 Variables de calidad completas en lss.jsx y dashboard.jsx

====================================================================
FASE 9: TOOLTIPS + UX
────────────────────────────────────────────────────────────────────
Duración estimada: medio día

[ ] 9.1 Crear componente Tooltip en shell.jsx
[ ] 9.2 Tooltips en dashboard.jsx (Cp, Cpk, Sigma, DPMO)
[ ] 9.3 Tooltips en monitor_sim.jsx (Cp, Cpk, Spring, Noise, Drift)
[ ] 9.4 Tooltips en lss.jsx (todos los términos SPC)
[ ] 9.5 Tooltips en config.jsx (reglas WECO)
[ ] 9.6 Tooltips en ai_alerts.jsx (MTTR, correlación)

====================================================================
FASE 10: VERIFICACIÓN DE INTEGRACIÓN
────────────────────────────────────────────────────────────────────
Duración estimada: 1 día

[ ] 10.1 Verificar flujo: CSV → calibración → simulación → frontend
[ ] 10.2 Probar sliders → PATCH al backend → simulación reacciona
[ ] 10.3 Probar detección de anomalías en monitor_sim.jsx
[ ] 10.4 Probar optimización Nelder-Mead
[ ] 10.5 Probar chat IA con contexto real de planta
[ ] 10.6 Probar alertas en tiempo real (subir temp de una máquina)
[ ] 10.7 Verificar que NO hay mock data en producción
[ ] 10.8 Verificar que las 10 máquinas BTL/FUR se muestran correctamente

====================================================================
FIN DEL DOCUMENTO — PLAN DE MEJORA INTEGRAL CORREGIDO
====================================================================
