====================================================================
PLAN DE IMPLEMENTACIÓN: SISTEMA DE IA HÍBRIDO EN NODE.JS
IndustrIA Sigma — Detección de Anomalías + Predicción de Fallas + Copilot Industrial
====================================================================

Arquitectura: 100% Node.js / Express
Stack ML: Isolation Forest en JS + estadística nativa
Stack IA: Groq → Gemini → OpenRouter → Rule-based (fallback 4 niveles)
Persistencia: En memoria (Fase 1) → Supabase (Fase 2)

====================================================================
ÍNDICE
====================================================================

1. Resumen de la arquitectura Node.js
2. Módulos ML nativos en Node.js
3. Sistema LLM multi-provider (Groq → Gemini → OpenRouter → Fallback)
4. Flujo completo de datos
5. Modelo físico — Línea de embotellado
6. Modelo físico — Horno industrial
7. Formato CSV de configuración de maquinaria
8. Plan de implementación paso a paso
9. Código base
10. Integración con Express existente
11. Publicación del proyecto (costo $0)
12. Fase 2: Supabase
13. Ventajas de la arquitectura Node.js


====================================================================
1. RESUMEN DE LA ARQUITECTURA (TODO NODE.JS)
====================================================================

  ┌──────────────────────────────────────────────────────────────────┐
  │                  FRONTEND (React + Vite)                        │
  │  Dashboard · SCADA · SPC · LSS · Simulador · Chat IA · Alertas │
  └──────────────────────────┬───────────────────────────────────────┘
                             │ HTTP + WebSocket
                             ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │              EXPRESS (NODE.JS) :3001                           │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │         CALIBRACIÓN DESDE CSV (al iniciar)                │   │
  │  │  csv-loader.js → parsea CONFIG + DATA rows                │   │
  │  │  calibrator.js → extrae μ, σ, autocorr, tendencia        │   │
  │  │  → actualiza MACHINE_PROFILES con valores calibrados      │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │                MOTOR DE SIMULACIÓN                        │   │
  │  │  engine.js (loop 1 Hz)                                    │   │
  │  │    ├── bottling.js  → 6 submáquinas embotelladora         │   │
  │  │    ├── furnace.js   → 4 submáquinas horno                 │   │
  │  │    └── (usa perfiles calibrados por calibrator.js)        │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │            ANALYTICS + ML (nativo en JS)                  │   │
  │  │  metrics.js → SPC: Cp, Cpk, DPMO, Sigma, WECO 1-8       │   │
  │  │  anomaly.js → Isolation Forest + z-score + IQR            │   │
  │  │  optimizer.js → Nelder-Mead para setpoints óptimos        │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │        SERVICIOS LLM MULTI-PROVIDER                      │   │
  │  │  services/llm/index.js (orquestador)                     │   │
  │  │    ├── provider-groq.js      → Llama 3 70B (primario)    │   │
  │  │    ├── provider-gemini.js    → Gemini 2.0 Flash (fbk 1)  │   │
  │  │    ├── provider-openrouter.js→ Llama 3 8B (fbk 2)        │   │
  │  │    └── provider-fallback.js  → Rule-based actual         │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │             ROUTES REST (12 módulos /api/*)               │   │
  │  │  dashboard · machines · alerts · spc · lss · simulator   │   │
  │  │  ai · reports · config · search · auth · profile         │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │  store/state.js (memoria) ←→ broadcaster.js (WebSocket)  │   │
  │  └──────────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────────────┘
                               │
                    FASE 2 (opcional — solo Auth)
                               ▼
                    ┌──────────────────────┐
                    │ SUPABASE (SOLO AUTH) │
                    │ Email/password, JWT  │
                    │ Roles, RLS           │
                    └──────────────────────┘


====================================================================
2. MÓDULOS ML NATIVOS EN NODE.JS
====================================================================

  NO se necesita Python. Todo el ML corre en JavaScript puro.

  2.1 anomaly.js — Isolation Forest + Detección Estadística

  Implementa 3 niveles de detección que se ejecutan en cada tick:

  NIVEL 1: Z-Score adaptativo
    Por cada variable de cada máquina, se mantiene una media móvil
    y desviación estándar de los últimos N ticks. Si |valor - media|
    > 3 * desv_estándar, se marca como anomalía.
    Esto detecta picos repentinos (ej. presión de bomba cae 40%).

  NIVEL 2: Modified IQR (Rango Intercuartílico)
    Similar al z-score pero basado en percentiles. Más robusto
    ante outliers. Usa Q1 - 1.5*IQR y Q3 + 1.5*IQR.
    Esto detecta valores extremos sin asumir distribución normal.

  NIVEL 3: Isolation Forest (implementación en JS puro)
    Algoritmo completo de Isolation Forest (~150 líneas).
    Construye un ensemble de árboles de aislamiento aleatorios.
    Mientras más rápido se aísla un punto, más anómalo es.
    Features por máquina: [temp, vib, load, rpm, defect, delta_temp]

  SALIDA DEL MÓDULO:
    {
      "BTL-01": { zScore: 0.12, iqr: 0.08, isoForest: 0.05, global: 0.05 },
      "BTL-02": { zScore: 0.89, iqr: 0.76, isoForest: 0.82, global: 0.82 },
      "FUR-01": { zScore: 0.95, iqr: 0.91, isoForest: 0.97, global: 0.95 },
      ...
    }

    El score "global" combina los 3 métodos con pesos:
      global = zScore*0.2 + iqr*0.2 + isoForest*0.6

    threshold > 0.7 → ANOMALÍA

  2.2 metrics.js — SPC y Six Sigma (YA EXISTE, se expande)

  El archivo actual ya implementa:
  - calcSPCStats(): media, sd, ucl, lcl, usl, lsl, cp, cpk
  - calcGlobalMetrics(): OEE, DPMO, Sigma, Yield
  - detectWECO(): Rule 5 (2 de 3 en zona A)
  - calcSimResults(): predicción de calidad según parámetros

  EXPANSIÓN NECESARIA (para nuevas variables de calidad):
  - Agregar soporte para múltiples características por máquina
    (no solo el SPC genérico actual, sino específico: volumen,
    peso, dureza, fragilidad, etc.)
  - Implementar WECO Rules 1, 2, 3, 4, 6, 7, 8 (hoy solo Rule 5)
  - Implementar X̄-R, X̄-S, Individuals, Moving Range completos

  2.3 optimizer.js — Búsqueda de setpoints óptimos

  Implementación del algoritmo Nelder-Mead (descenso simplex) en
  JavaScript puro, que usa la misma función objetivo de calcSimResults
  para encontrar el setpoint que minimiza defectos o maximiza Cp.

  ENTRADA:
    { machine: "BTL-03",
      variable: "fill_speed",
      currentRange: [60, 140],
      objective: "minimize_defects" }

  SALIDA:
    { optimal: 112.5,
      expectedCp: 1.42,
      expectedDefectReduction: "-24%" }

  2.4 csv-loader.js — Carga de configuración desde CSV

  Lee el archivo CSV con el formato definido en la sección 7.
  Parsea cada fila y construye las máquinas en state con todas
  sus variables, perfiles, umbrales y correlaciones.

  FUNCIONAMIENTO:
    import { loadCSV } from './csv-loader.js';
    const machines = await loadCSV('./data/maquinaria.csv');
    // machines → array con todas las submáquinas y sus variables

  Si no hay CSV, carga los valores por defecto definidos en
  state.js (fallback para desarrollo y demo).


====================================================================
3. SISTEMA LLM MULTI-PROVIDER
====================================================================

  3.1 ARQUITECTURA DE TOLERANCIA A FALLOS

  Cadena de 4 proveedores en cascada. Si uno falla, el siguiente
  responde automáticamente:

  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   POST /api/ai/chat                                             │
  │       │                                                         │
  │       ▼                                                         │
  │   services/llm/index.js (orquestador)                          │
  │       │                                                         │
  │       ├── 1. ¿Groq disponible?                                  │
  │       │       ├── SÍ → provider-groq.js (llama3-70b-8192)       │
  │       │       └── NO  → continúa                                │
  │       │                                                         │
  │       ├── 2. ¿Gemini disponible?                                │
  │       │       ├── SÍ → provider-gemini.js (gemini-2.0-flash)    │
  │       │       └── NO  → continúa                                │
  │       │                                                         │
  │       ├── 3. ¿OpenRouter disponible?                            │
  │       │       ├── SÍ → provider-openrouter.js (llama-3-8b)      │
  │       │       └── NO  → continúa                                │
  │       │                                                         │
  │       └── 4. Siempre disponible                                 │
  │               → provider-fallback.js (rule-based actual)        │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘

  DEFINICIÓN DE FALLO:
  - HTTP 429 (rate limit)
  - HTTP 500+ (error de servidor)
  - Timeout > 15 segundos
  - Error de red / DNS
  - API key inválida o ausente

  3.2 PROVEEDOR PRIMARIO: GROQ

  URL: https://api.groq.com/openai/v1/chat/completions
  Modelo: llama3-70b-8192
  API Key: GROQ_API_KEY en .env

  Plan gratuito (indefinido, sin tarjeta):
    - 30 requests/minuto
    - ~14,000 requests/día
    - 500+ tokens/segundo

  3.3 PRIMER FALLBACK: GEMINI

  URL: https://generativelanguage.googleapis.com/v1beta/models/
       gemini-2.0-flash:generateContent?key=GEMINI_API_KEY
  API Key: GEMINI_API_KEY en .env

  Plan gratuito (indefinido, sin tarjeta):
    - 1,500 requests/día
    - 1M tokens de contexto
    - No apto para datos sensibles (fuera de UE)

  3.4 SEGUNDO FALLBACK: OPENROUTER

  URL: https://openrouter.ai/api/v1/chat/completions
  Modelo: meta-llama/llama-3-8b-instruct (free)
  API Key: OPENROUTER_API_KEY en .env

  Plan gratuito:
    - 20 requests/minuto, 50 requests/día
    - Upgrade opcional: $10 (único pago) → 1,000 req/día

  3.5 FALLBACK FINAL: RULE-BASED (routes/ai.js)

  Mismo sistema actual con if/else. Siempre funciona porque
  no depende de APIs externas. Usa datos reales del state.

  3.6 SYSTEM PROMPT (COMPARTIDO ENTRE TODOS LOS PROVIDERS)

  const SYSTEM_PROMPT = `
  Eres un Ingeniero Industrial Senior experto en Lean Six Sigma,
  mantenimiento predictivo y optimización de procesos. Trabajas
  en la planta MX-01 de IndustrIA Sigma.

  REGLAS ESTRICTAS:
  1. SOLO respondes basado en los datos del contexto. NUNCA inventes.
  2. Si no tienes datos, decí: "No tengo datos suficientes...".
  3. Usa español técnico claro.
  4. Prioriza acciones concretas sobre teoría.
  5. Numerá recomendaciones por prioridad.

  FORMATO DE RESPUESTA:
  🔍 Diagnóstico:
  📊 Datos relevantes:
  🛠 Acciones recomendadas:
  1. [inmediata] — (por qué)
  2. [corto plazo] — (por qué)
  3. [mediano plazo] — (por qué)
  ⚠ Riesgo estimado: (bajo / medio / alto)
  `;

  3.7 ESTRUCTURA DE ARCHIVOS

  src/services/llm/
  ├── index.js              ← Orquestador con fallback en cascada
  ├── provider-groq.js      ← Llamada HTTP a Groq API
  ├── provider-gemini.js    ← Llamada HTTP a Gemini API
  ├── provider-openrouter.js← Llamada HTTP a OpenRouter API
  ├── provider-fallback.js  ← Respuesta rule-based con datos reales
  └── prompts.js            ← System prompt + armado de contexto


====================================================================
4. FLUJO COMPLETO DE DATOS
====================================================================

  4.1 INICIALIZACIÓN — CALIBRACIÓN DESDE CSV

  [Servidor inicia]
    → csv-loader.js lee debugging/data/maquinaria_ejemplo.csv
    → Detecta separador #DATA: filas CONFIG antes, DATA después
    → CONFIG: construye state.machines con 10 submáquinas
      con perfiles, umbrales, variables operativas y de calidad
    → DATA: array de mediciones históricas con timestamps
    → calibrator.js procesa DATA:
      ┌─────────────────────┬────────────────────────────────┐
      │ Parámetro extraído   │ Se mapea a simulación          │
      ├─────────────────────┼────────────────────────────────┤
      │ media (μ)           │ base_value de la variable       │
      │ desviación (σ)      │ noise del modelo spring-damper  │
      │ autocorr (r₁)       │ spring (constante de resorte)   │
      │ tendencia lineal    │ drift (deriva gradual)          │
      └─────────────────────┴────────────────────────────────┘
    → Aplica valores calibrados a MACHINE_PROFILES
    → Inicia engine.js (loop 1Hz)

  4.2 CADA TICK (1 segundo)

  [engine.js tick()]
    │
    ├── 1. bottling.js: actualiza 6 submáquinas embotellado
    │      Usa modelo spring-damper calibrado + correlaciones
    │      Correlaciones: speed→precision→defects,
    │      pressure→flow_rate, temp→viscosity
    │      Salida: nuevas variables operativas + calidad
    │
    ├── 2. furnace.js: actualiza 4 submáquinas horno
    │      Usa modelo spring-damper calibrado + correlaciones
    │      Correlaciones: temp→hardness→fragility,
    │      air_flow→uniformity, fan_vibration→defects
    │      Salida: nuevas variables operativas + calidad
    │
    ├── 3. metrics.js: calcula SPC por submáquina
    │      Cp, Cpk, DPMO, Sigma, WECO Rules 1-8
    │      X̄-R, X̄-S, Individuals, Moving Range
    │      Salida: métricas actualizadas en state
    │
    ├── 4. anomaly.js: detecta anomalías
    │      z-score + IQR + Isolation Forest
    │      Score global combinado (0.2*z + 0.2*iqr + 0.6*iso)
    │      Salida: anomalyScore por submáquina
    │
    ├── 5. alerting.js: genera/resuelve alertas
    │      thresholds por variable operativa
    │      Si anomalyScore > 0.7 → alerta
    │      Si se resuelve condición → cierra alerta
    │
    └── 6. broadcaster.js: envía todo a frontend
         machines + metrics + alerts + anomalies + spcSummary

  4.3 CONSULTA AL CHAT IA

  [Usuario escribe: "¿qué está fallando?"]
    │
    ├── POST /api/ai/chat { message, conversationId }
    │
    ├── Express recolecta contexto:
    │   - machines (con anomalyScore, failureProb)
    │   - metrics (OEE, DPMO, Sigma, Cp, Cpk)
    │   - alerts activas
    │   - trends (últimos 10 ticks)
    │
    ├── services/llm/index.js orquesta:
    │   1. Intenta Groq (llama3-70b)
    │   2. Si falla → Gemini (gemini-2.0-flash)
    │   3. Si falla → OpenRouter (llama-3-8b)
    │   4. Si todo falla → rule-based
    │
    └── Respuesta al frontend con:
        { text, meta, provider }


====================================================================
5. MODELO FÍSICO — LÍNEA DE EMBOTELLADO (bottling.js)
====================================================================

  5.1 SUBMÁQUINAS

  ID        Nombre                Variables operativas
  ────────  ────────────────────  ─────────────────────────────────
  BTL-01    Tanque almacenamiento level (nivel %), temp (temperatura °C),
                                   pressure (presión interna bar)
  BTL-02    Bomba industrial      pressure (presión salida bar),
                                   flow_rate (caudal L/min),
                                   vibration (vibración g),
                                   energy (consumo kWh)
  BTL-03    Llenadora automática  fill_time (tiempo llenado s),
                                   precision (precisión %),
                                   speed (velocidad bots/min),
                                   nozzle_state (estado boquilla 0-1)
  BTL-04    Banda transportadora  speed (velocidad m/s),
                                   torque (torque Nm),
                                   vibration (vibración g),
                                   cycle_time (tiempo ciclo s)
  BTL-05    Tapadora              torque (torque cierre Nm),
                                   precision (precisión %),
                                   speed (velocidad taps/min)
  BTL-06    Etiquetadora          position (posición mm),
                                   precision (precisión %),
                                   speed (velocidad etiq/min)

  5.2 VARIABLES DE CALIDAD POR SUBMÁQUINA

  Submáquina     Variable calidad    Objetivo      Unidad
  ────────────   ─────────────────   ────────────   ──────
  BTL-03         fill_volume         volumen llenado mL (KPI)
  BTL-03         bottle_weight       peso botella   g
  BTL-03         fill_level          nivel llenado   %  (SPC)
  BTL-05         cap_torque          torque tapa     Nm
  BTL-06         label_position      posición etiq.  mm
  Global         reject_rate         tasa rechazo    %
  Global         dpmo                DPMO            ppm
  Global         cpk                 Cpk             índice

  5.3 CORRELACIONES INTERNAS

  RELACIÓN 1: Velocidad → Precisión → Defectos
    speed_banda ↑ → fill_time ↓ → precision ↓ → variabilidad ↑
    → reject_rate ↑ → Cp/Cpk ↓

    MODELO: defect_prob = baseDefect + (speed - baseSpeed) * 0.003
            + (vibration - baseVib) * 2.5

  RELACIÓN 2: Vibración → Estabilidad
    vibration_bomba ↑ → nozzle_stability ↓ → dispersion ↑
    → Reglas WECO activadas

    MODELO: fill_dispersion = baseDispersion + vibration * 0.15

  RELACIÓN 3: Presión → Caudal
    pressure_bomba ↓ → flow_rate ↓ → underfill ↑ → reject ↑

    MODELO: flow_rate = baseFlow * (pressure / basePressure) ^ 0.5

  RELACIÓN 4: Temperatura → Viscosidad
    temp_liquido ↑ → viscosity ↓ → flow_irregular ↑
    → fill_variability ↑

    MODELO: fill_variability = baseVar + abs(temp - baseTemp) * 0.02

  5.4 DEFECTOS SIMULABLES

  Defecto               Causa principal          Indicador
  ────────────────────  ──────────────────────── ─────────────────
  Subllenado            Baja presión bomba       fill_volume < 495mL
  Sobrellenado          Error dosificación       fill_volume > 505mL
  Tapa floja            Torque incorrecto        cap_torque < 1.8Nm
  Etiqueta mal puesta   Vibración excesiva       label_position ± > 2mm
  Botella rechazada     Múltiples errores        reject_rate > 5%

  5.5 EVENTOS ANÓMALOS

  Evento                        Frecuencia       Efecto
  ────────────────────────────  ──────────────── ─────────────────
  Boquilla parcialmente tapada  ~cada 3 min      precision ↓ 30%
  Pico vibración bomba          ~cada 5 min      vibration +0.3g
  Caída presión bomba           ~cada 8 min      pressure -1.5bar
  Desalineamiento banda         ~cada 10 min     vibration banda ↑
  Drift gradual llenado         continuo         fill_volume drift


====================================================================
6. MODELO FÍSICO — HORNO INDUSTRIAL (furnace.js)
====================================================================

  6.1 SUBMÁQUINAS

  ID        Nombre                  Variables operativas
  ────────  ──────────────────────  ─────────────────────────────────
  FUR-01    Horno industrial        temperature (temp °C),
                                     residence_time (min),
                                     energy (consumo kWh)
  FUR-02    Sistema ventilación     air_flow (flujo m³/s),
                                     fan_vibration (vibración g),
                                     fan_speed (velocidad RPM)
  FUR-03    Sensores térmicos       precision (precisión °C),
                                     drift (deriva °C/h),
                                     measurement_error (%)
  FUR-04    Controladores PID       setpoint_temp (°C),
                                     response_time (s),
                                     stability (estabilidad 0-1)

  6.2 VARIABLES DE CALIDAD POR SUBMÁQUINA

  Submáquina     Variable calidad    Objetivo        Unidad
  ────────────   ─────────────────   ──────────────   ──────
  FUR-01         hardness            dureza material  HRC (KPI)
  FUR-01         fragility           fragilidad       índice
  FUR-01         residual_humidity   humedad residual %
  FUR-01         thermal_uniformity  uniformidad      % (SPC)
  FUR-02         surface_defects     defectos superfic %
  FUR-03         color_uniformity    uniformidad color índice
  Global         material_resistance resistencia      MPa
  Global         cpk                 Cpk horno         índice

  6.3 CORRELACIONES INTERNAS

  RELACIÓN 1: Temperatura → Dureza → Fragilidad
    temp ↑ → hardness ↓ → fragility ↑ → defects ↑

    MODELO: hardness = baseHardness - (temp - baseTemp) * 0.5
            fragility = baseFragility + (temp - baseTemp) * 0.02

  RELACIÓN 2: Flujo aire → Uniformidad
    air_flow ↓ → thermal_distribution ↓ → variability ↑ → Cp/Cpk ↓

    MODELO: thermal_uniformity = baseUniformity - abs(air_flow
                                    - baseFlow) * 0.1

  RELACIÓN 3: Tiempo residencia → Degradación
    residence_time ↑ → overprocessing ↑ → material_degradation ↑

    MODELO: defect_rate = baseDefect + (residence_time - baseTime)
                                    * 0.005

  RELACIÓN 4: Vibración ventilador → Estabilidad térmica
    fan_vibration ↑ → thermal_instability ↑ → surface_defects ↑

    MODELO: surface_defects = baseDefects + fan_vibration * 5

  6.4 DEFECTOS SIMULABLES

  Defecto                 Causa principal              Indicador
  ──────────────────────  ──────────────────────────── ─────────────────
  Sobrecalentamiento      Temperatura alta             temp > 248°C
  Fragilidad excesiva     Tiempo excesivo              fragility > 7.0
  Color irregular         Flujo aire bajo              color_uniformity
                                                       < 85%
  Material húmedo         Secado insuficiente          residual_humidity
                                                       > 3%
  Variabilidad térmica    Control inestable            thermal_uniformity
                                                       < 90%

  6.5 EVENTOS ANÓMALOS

  Evento                         Frecuencia      Efecto
  ─────────────────────────────  ──────────────  ─────────────────
  Drift térmico gradual          continuo        temp +0.5°C/min
  Sensor temperatura defectuoso  ~cada 10 min    precision ↓ 50%
  Sobrecalentamiento repentino   ~cada 5 min     temp +8°C
  Falla ventilador               ~cada 15 min    air_flow -40%
  Inestabilidad PID              ~cada 7 min     stability ↓ 0.3


====================================================================
7. FORMATO CSV UNIFICADO (CONFIG + DATOS HISTÓRICOS)
====================================================================

  7.1 CONCEPTO DEL ARCHIVO UNIFICADO

  El archivo CSV contiene DOS tipos de filas en un único archivo:

  ┌─────────────────────────────────────────────────────────────────┐
  │  debugging/data/maquinaria_ejemplo.csv                         │
  │                                                                 │
  │  [FILAS CONFIG] ← configuración de máquinas y perfiles         │
  │  process,machine_id,...,quality_cp                              │
  │  BOTTLING,BTL-01,Tanque,...,85,2.0,0.03,...                    │
  │  ... (43 filas, una por variable de las 10 submáquinas)        │
  │                                                                 │
  │  #DATA ← separador                                              │
  │                                                                 │
  │  [FILAS DATA] ← mediciones históricas para calibración         │
  │  ts,machine_id,var_name,value                                   │
  │  0,BTL-01,level,86.68                                          │
  │  1,BTL-01,level,85.02                                          │
  │  ... (~460 filas, ~10 puntos por variable)                     │
  └─────────────────────────────────────────────────────────────────┘

  La razón de combinar ambos en un mismo archivo:
  - La configuración exacta que produjo esos datos históricos
    es conocida y está documentada
  - El sistema extrae los parámetros estadísticos de DATA y
    los aplica a la simulación definida en CONFIG
  - Un solo archivo = una sola fuente de verdad

  7.2 FILAS CONFIG (ANTES DE #DATA)

  Una fila = una variable de una submáquina:
    process       BOTTLING | FURNACE
    machine_id    ID único (BTL-01..06, FUR-01..04)
    machine_name  Nombre descriptivo
    line          Línea de producción
    var_name      Nombre de la variable
    var_type      operative | quality
    unit          Unidad de medida
    base_value    Valor base (target)
    noise         Ruido aleatorio (σ)
    spring        Constante resorte (0.01-0.1)
    min           Mínimo físico
    max           Máximo físico
    warn          Umbral advertencia
    crit          Umbral crítico
    quality_target  Objetivo calidad (solo quality)
    quality_usl     USL para SPC
    quality_lsl     LSL para SPC
    quality_cp      Cp objetivo

  7.3 FILAS DATA (DESPUÉS DE #DATA)

    ts            Timestamp (índice secuencial o UNIX ms)
    machine_id    Debe coincidir con CONFIG
    var_name      Debe coincidir con CONFIG
    value         Valor medido

  7.4 ESTRUCTURA DE ARCHIVOS

  debugging/
  ├── ESTRUCTURA_CSV.md        ← Documentación detallada del formato
  └── data/
      └── maquinaria_ejemplo.csv ← CSV unificado (~500 líneas)
                                    43 CONFIG + #DATA + ~460 DATA


====================================================================
8. PLAN DE IMPLEMENTACIÓN PASO A PASO
====================================================================

  FASE 1: CSV unificado y calibración (3 días)
  ────────────────────────────────────────────────
  [ ] 1.1 Crear debugging/data/maquinaria_ejemplo.csv
        - 43 filas CONFIG (todas las variables de 10 submáquinas)
        - Separador #DATA
        - ~460 filas DATA con mediciones sintéticas
  [ ] 1.2 Crear src/simulation/csv-loader.js
        - Parsear CSV sin dependencias externas
        - Detectar separador #DATA
        - Separar filas CONFIG y DATA automáticamente
        - Construir objeto de máquinas con perfiles desde CONFIG
  [ ] 1.3 Crear src/simulation/calibrator.js
        - Agrupar DATA rows por (machine_id, var_name)
        - Calcular media → mapear a base_value
        - Calcular desviación estándar → mapear a noise
        - Calcular autocorrelación lag 1 → mapear a spring
        - Calcular tendencia lineal → mapear a drift
        - Aplicar valores calibrados a MACHINE_PROFILES

  FASE 2: Modelos físicos calibrados (4-5 días)
  ────────────────────────────────────────────────
  [ ] 2.1 Crear src/simulation/bottling.js
        - Modelo spring-damper para 6 submáquinas BTL
        - Correlaciones: speed→precision→defects,
          pressure→flow_rate, temp→viscosity
        - Usa valores calibrados (base, noise, spring) de
          calibrator.js
  [ ] 2.2 Crear src/simulation/furnace.js
        - Modelo spring-damper para 4 submáquinas FUR
        - Correlaciones: temp→hardness→fragility,
          air_flow→uniformity, fan_vibration→defects
        - Usa valores calibrados de calibrator.js
  [ ] 2.3 Modificar state.js para nuevas máquinas
        - Reemplazar 8 máquinas actuales por 10 nuevas
        - Soportar estructura de variables por máquina
        - Mantener compatibilidad con frontend existente
  [ ] 2.4 Modificar engine.js
        - Integrar csv-loader.js + calibrator.js al inicio
        - Llamar a bottling.js y furnace.js en cada tick
        - Usar perfiles calibrados

  FASE 3: ML nativo en Node.js (2-3 días)
  ────────────────────────────────────────────────
  [ ] 3.1 Implementar anomaly.js
        - Z-score adaptativo con media móvil
        - Modified IQR
        - Isolation Forest en JS puro
        - Score global combinado (0.2*z + 0.2*iqr + 0.6*iso)
  [ ] 3.2 Expandir metrics.js
        - Soportar múltiples variables de calidad por máquina
        - WECO Rules 1-8 completas
        - X̄-R, X̄-S, Individuals, Moving Range
  [ ] 3.3 Implementar optimizer.js
        - Nelder-Mead en JS puro
        - Optimización de setpoints multi-variable

  FASE 4: LLM multi-provider (2 días)
  ────────────────────────────────────────────────
  [ ] 4.1 Crear estructura services/llm/
  [ ] 4.2 Implementar provider-groq.js
  [ ] 4.3 Implementar provider-gemini.js
  [ ] 4.4 Implementar provider-openrouter.js
  [ ] 4.5 Implementar provider-fallback.js
  [ ] 4.6 Implementar orquestador (index.js) con fallback
  [ ] 4.7 Modificar routes/ai.js para usar el orquestador
  [ ] 4.8 Probar con los 3 proveedores + fallback

  FASE 5: Integración y ajuste (2-3 días)
  ────────────────────────────────────────────────
  [ ] 5.1 Conectar anomaly.js + optimizer.js a engine.js
  [ ] 5.2 Conectar metrics.js expandido a engine.js
  [ ] 5.3 Verificar calibración reproduce históricos
  [ ] 5.4 Probar modificación de parámetros post-calibración
  [ ] 5.5 Probar chat IA con datos reales calibrados
  [ ] 5.6 Ajustar thresholds, correlaciones y modelos

  FASE 6: Supabase Auth (opcional, 1 día)
  ────────────────────────────────────────────────
  [ ] 6.1 Configurar proyecto Supabase
  [ ] 6.2 Implementar Supabase Auth (login real, JWT, roles)
  [ ] 6.3 Reemplazar mock de autenticación por Supabase Auth
  [ ] 6.4 Configurar RLS (Row Level Security)
  NOTA: Supabase NO se usa para DB, Storage ni Realtime.
        Solo para autenticación de usuarios.

  FASE 7: Publicación (1 día)
  ────────────────────────────────
  [ ] 7.1 Frontend → Vercel
  [ ] 7.2 Backend (Express unificado) → Render
  [ ] 7.3 Configurar GROQ_API_KEY en variables de entorno
  [ ] 7.4 Verificar funcionamiento integral

  FASE 6: Publicación (1 día)
  ────────────────────────────────
  [ ] 6.1 Frontend → Vercel
  [ ] 6.2 Backend (Express unificado) → Render
  [ ] 6.3 Configurar GROQ_API_KEY en variables de entorno
  [ ] 6.4 Verificar funcionamiento integral


====================================================================
9. CÓDIGO BASE
====================================================================

  9.1 calibrator.js — Calibración estadística desde históricos

  import { MACHINE_PROFILES, state }
    from '../store/state.js';
  import { groupByMachineAndVar }
    from './csv-loader.js';

  // ── Funciones estadísticas base ──────────────────────────────
  function mean(values) {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  function std(values, m) {
    const avg = m ?? mean(values);
    return Math.sqrt(
      values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length
    );
  }

  function autocorrelation(values, lag = 1) {
    if (values.length < lag + 2) return 0;
    const n = values.length;
    const m = mean(values);
    let num = 0, den = 0;
    for (let i = 0; i < n - lag; i++) {
      num += (values[i] - m) * (values[i + lag] - m);
    }
    for (let i = 0; i < n; i++) {
      den += (values[i] - m) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  function linearTrend(values) {
    const n = values.length;
    if (n < 3) return 0;
    const meanX = (n - 1) / 2;
    const meanY = mean(values);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (values[i] - meanY);
      den += (i - meanX) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  // ── Calibración principal ────────────────────────────────────
  export function calibrateFromDataRows(dataRows) {
    const grouped = groupByMachineAndVar(dataRows);
    const calibrations = {};

    for (const [key, rows] of Object.entries(grouped)) {
      const [machineId, varName] = key.split(':');
      if (!calibrations[machineId])
        calibrations[machineId] = {};
      const values = rows
        .map(r => r.value ?? r[varName])
        .filter(v => v != null && isFinite(v));
      if (values.length < 3) continue;

      const m = mean(values);
      const s = std(values, m);
      const ac = autocorrelation(values, 1);
      const trend = linearTrend(values);

      // Mapeo: autocorr → spring, std → noise
      const spring = Math.max(0.01,
        Math.min(0.10, Math.abs(ac) * 0.08 + 0.02));
      const noise = Math.max(0.01, s);

      calibrations[machineId][varName] = {
        calibratedBase:   +m.toFixed(4),
        calibratedNoise:  +noise.toFixed(4),
        calibratedSpring: +spring.toFixed(4),
        calibratedDrift:  +(trend * 0.01).toFixed(6),
        sampleCount: values.length,
        autocorr: +ac.toFixed(4),
      };
    }
    return calibrations;
  }

  export function applyCalibration(calibrations) {
    let count = 0;
    for (const [mid, vars] of Object.entries(calibrations)) {
      const profile = MACHINE_PROFILES[mid];
      const machine = state.machines[mid];
      if (!profile || !machine) continue;
      for (const [vn, cal] of Object.entries(vars)) {
        const pv = profile.vars?.[vn];
        if (!pv) continue;
        pv.base   = cal.calibratedBase;
        pv.noise  = cal.calibratedNoise;
        pv.spring = cal.calibratedSpring;
        if (cal.calibratedDrift &&
            Math.abs(cal.calibratedDrift) > 0.0001) {
          pv.drift = cal.calibratedDrift;
        }
        if (machine.vars?.[vn]) {
          machine.vars[vn].target = cal.calibratedBase;
          machine.vars[vn].value  = cal.calibratedBase;
        }
        count++;
      }
    }
    return count;
  }

  // Uso en engine.js al iniciar:
  // const { dataRows } = loadCSV('./debugging/data/...');
  // const cals = calibrateFromDataRows(dataRows);
  // applyCalibration(cals);

  9.2 anomaly.js — Isolation Forest en JS puro

  class IsolationForest {
    constructor(nTrees = 100, sampleSize = 256) {
      this.nTrees = nTrees;
      this.sampleSize = sampleSize;
      this.trees = [];
      this.limit = Math.ceil(Math.log2(sampleSize));
    }

    fit(data) {
      // data: array de arrays (cada subarray = features de un punto)
      this.trees = [];
      for (let i = 0; i < this.nTrees; i++) {
        const sample = this._sample(data);
        this.trees.push(this._buildTree(sample, 0));
      }
    }

    scoreSamples(data) {
      // Devuelve array con scores 0-1 para cada punto
      return data.map(point => {
        const avgPath = this.trees.reduce(
          (sum, tree) => sum + this._pathLength(point, tree), 0
        ) / this.nTrees;
        const expected = 2 * Math.log(this.sampleSize - 1) + 0.577;
        return Math.pow(2, -avgPath / expected);
      });
    }

    _sample(data) {
      const idx = [];
      while (idx.length < Math.min(this.sampleSize, data.length)) {
        const r = Math.floor(Math.random() * data.length);
        if (!idx.includes(r)) idx.push(r);
      }
      return idx.map(i => data[i]);
    }

    _buildTree(data, depth) {
      if (depth >= this.limit || data.length <= 1) {
        return { size: data.length, isLeaf: true };
      }
      const nFeatures = data[0].length;
      const feat = Math.floor(Math.random() * nFeatures);
      const min = Math.min(...data.map(d => d[feat]));
      const max = Math.max(...data.map(d => d[feat]));
      if (min === max) return { size: data.length, isLeaf: true };

      const split = min + Math.random() * (max - min);
      const left = data.filter(d => d[feat] < split);
      const right = data.filter(d => d[feat] >= split);

      if (left.length === 0 || right.length === 0) {
        return { size: data.length, isLeaf: true };
      }

      return {
        feature: feat,
        split,
        left: this._buildTree(left, depth + 1),
        right: this._buildTree(right, depth + 1),
        isLeaf: false
      };
    }

    _pathLength(point, tree, depth = 0) {
      if (tree.isLeaf) {
        return depth + this._cFactor(tree.size);
      }
      if (point[tree.feature] < tree.split) {
        return this._pathLength(point, tree.left, depth + 1);
      }
      return this._pathLength(point, tree.right, depth + 1);
    }

    _cFactor(n) {
      if (n <= 1) return 0;
      return 2 * Math.log(n - 1) + 0.577 - 2 * (n - 1) / n;
    }
  }

  // Uso en anomaly.js:
  export function detectAnomalies(machines) {
    const features = machines.map(m => [
      m.temp, m.vib, m.load, m.rpm || 0, m.defect || 0,
      m.tempDelta || 0, m.vibDelta || 0
    ]);

    const model = new IsolationForest(100, 256);
    model.fit(features);
    const scores = model.scoreSamples(features);

    return machines.map((m, i) => ({
      id: m.id,
      isoForest: parseFloat(scores[i].toFixed(3)),
      zScore: computeZScore(m),
      iqr: computeIQR(m),
      global: parseFloat(
        (scores[i] * 0.6 + computeZScore(m) * 0.2 + computeIQR(m) * 0.2)
          .toFixed(3)
      )
    }));
  }

  9.2 services/llm/index.js — Orquestador con fallback

  import { groqProvider } from './provider-groq.js';
  import { geminiProvider } from './provider-gemini.js';
  import { openrouterProvider } from './provider-openrouter.js';
  import { fallbackProvider } from './provider-fallback.js';
  import { buildContext, SYSTEM_PROMPT } from './prompts.js';

  const PROVIDERS = [
    { name: 'Groq', fn: groqProvider },
    { name: 'Gemini', fn: geminiProvider },
    { name: 'OpenRouter', fn: openrouterProvider },
  ];

  export async function chatWithAI(question, conversation) {
    const context = buildContext();

    for (const { name, fn } of PROVIDERS) {
      try {
        const response = await fn(context, question, conversation);
        console.log(`✓ Respuesta de ${name}`);
        return { text: response, provider: name };
      } catch (err) {
        console.warn(`⚠ ${name} falló: ${err.message.slice(0, 80)}`);
      }
    }

    // Fallback final
    console.log('ℹ Usando fallback rule-based');
    return { text: fallbackProvider(context, question), provider: 'rule-based' };
  }

  9.3 services/llm/provider-groq.js

  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL = 'llama3-70b-8192';

  export async function groqProvider(context, question, conversation) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY no configurada');

    const messages = buildMessages(context, question, conversation);

    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) throw new Error(`Groq ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();
    return data.choices[0].message.content;
  }

  9.4 services/llm/prompts.js — Armado de contexto

  import { state, getMachinesArray, getActiveAlerts } from
    '../../store/state.js';
  import { calcGlobalMetrics } from '../../simulation/metrics.js';

  export const SYSTEM_PROMPT =
  `Eres un Ingeniero Industrial Senior experto en Lean Six Sigma,
  mantenimiento predictivo y optimización de procesos. Trabajas en
  la planta MX-01 de IndustrIA Sigma.

  REGLAS ESTRICTAS:
  1. SOLO respondes basado en los datos del contexto.
  2. Si no tienes datos, decí que no tenés suficiente información.
  3. Usa español técnico claro.
  4. Prioriza acciones concretas sobre teoría.
  5. Numerá recomendaciones por prioridad.

  FORMATO DE RESPUESTA:
  🔍 Diagnóstico:
  📊 Datos relevantes:
  🛠 Acciones recomendadas:
  1. [inmediata] — (por qué)
  2. [corto plazo] — (por qué)
  3. [mediano plazo] — (por qué)
  ⚠ Riesgo estimado:`;

  export function buildContext() {
    const machines = getMachinesArray();
    const alerts = getActiveAlerts();
    const metrics = calcGlobalMetrics();

    return {
      timestamp: new Date().toLocaleTimeString('es-MX'),
      machines: machines.map(m => ({
        id: m.id, name: m.name, line: m.line,
        process: m.process, status: m.status,
        temp: m.temp, vib: m.vib,
        anomalyScore: m.anomalyScore || 0,
        failureProb: m.failureProb || 0,
        variables: m.variables || {},
        quality: m.quality || {},
      })),
      metrics,
      alerts: alerts.slice(0, 5).map(a => ({
        sev: a.sev, title: a.title, machine: a.machine
      })),
      trends: calculateTrends(machines),
    };
  }

  export function buildMessages(context, question, conversation) {
    const machinesText = context.machines.map(m =>
      `- ${m.id} (${m.name}) [${m.process}]: ${m.status}, ` +
      `temp ${m.temp?.toFixed(1)}°C, vib ${m.vib?.toFixed(3)}g, ` +
      `anomaly ${(m.anomalyScore * 100).toFixed(0)}%, ` +
      `failProb ${(m.failureProb * 100).toFixed(0)}%`
    ).join('\n');

    const alertsText = context.alerts.map(a =>
      `- [${a.sev}] ${a.title} (${a.machine})`
    ).join('\n') || 'Sin alertas activas';

    const trendsText = Object.entries(context.trends).map(
      ([k, v]) => `- ${k}: ${v}`
    ).join('\n') || 'Sin tendencias';

    const userPrompt =
  `DATOS ACTUALES DE LA PLANTA MX-01 (${context.timestamp}):

  MÁQUINAS:
  ${machinesText}

  MÉTRICAS GLOBALES:
  OEE: ${context.metrics.oee}% | DPMO: ${context.metrics.dpmo} |
  Sigma: ${context.metrics.sigma} | Alertas: ${context.metrics.activeAlerts}

  ALERTAS:
  ${alertsText}

  TENDENCIAS:
  ${trendsText}

  PREGUNTA DEL USUARIO:
  ${question}`;

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversation.slice(-6),
      { role: 'user', content: userPrompt },
    ];
  }

  function calculateTrends(machines) {
    const trends = {};
    for (const m of machines) {
      if (m.tempHistory && m.tempHistory.length >= 5) {
        const slice = m.tempHistory.slice(-5);
        trends[`${m.id}_temp_trend`] =
          `${(slice[slice.length-1] - slice[0]).toFixed(2)}°C/5ticks`;
      }
    }
    return trends;
  }


====================================================================
10. INTEGRACIÓN CON EXPRESS EXISTENTE
====================================================================

  10.1 INICIALIZACIÓN CON CALIBRACIÓN DESDE CSV

  // server.js — al arrancar
  import { loadCSV } from './simulation/csv-loader.js';
  import { calibrateFromDataRows, applyCalibration }
    from './simulation/calibrator.js';
  import { buildFromCSV } from './store/state.js';

  const csvData = loadCSV('./debugging/data/maquinaria_ejemplo.csv');
  // csvData.configRows → array de filas CONFIG
  // csvData.dataRows   → array de filas DATA

  // 1. Construir máquinas desde CONFIG
  const { machines, profiles } = buildFromCSV(csvData.configRows);
  Object.assign(state.machines, machines);
  Object.assign(MACHINE_PROFILES, profiles);

  // 2. Calibrar desde DATA
  const calibrations = calibrateFromDataRows(csvData.dataRows);
  const applied = applyCalibration(calibrations);
  console.log(`Calibradas ${applied} variables desde históricos`);

  // 3. Iniciar motor
  startEngine();

  10.2 ENGINE.JS — LOOP 1Hz CON MODELOS CALIBRADOS

  import { updateBottlingMachine }
    from './bottling.js';
  import { updateFurnaceMachine }
    from './furnace.js';
  import { detectAnomalies } from './anomaly.js';
  import { calcSPCStats } from './metrics.js';
  import { calibrateFromDataRows, applyCalibration }
    from './calibrator.js';

  function tick() {
    state.tick++;

    // 1. Actualizar cada submáquina (usa perfiles calibrados)
    for (const machine of Object.values(state.machines)) {
      if (machine.process === 'BOTTLING') {
        updateBottlingMachine(machine);
      } else if (machine.process === 'FURNACE') {
        updateFurnaceMachine(machine);
      }

      // 2. Evaluar estado
      evalStatus(machine);

      // 3. SPC cada 5 ticks por variable de calidad
      if (state.tick % 5 === 0) {
        for (const [vn, pts] of
          Object.entries(state.spcWindows[machine.id] ?? {})) {
          machine.spcStats = machine.spcStats ?? {};
          machine.spcStats[vn] = calcSPCStats(pts);
        }
      }
    }

    // 4. Anomalías (rápido, < 5ms)
    const features = Object.values(state.machines)
      .filter(m => m.status !== 'IDLE')
      .map(m => [m.temp, m.vib, m.load, m.defect ?? 0]);
    const scores = detectAnomalies(features).isoForest;
    // aplicar scores a cada máquina...

    // 5. Alertas y broadcast (ya existen)
  }

  10.2 MODIFICACIONES EN ROUTES/AI.JS

  // Reemplazar el aiRespond() rule-based por el orquestador
  import { chatWithAI } from '../services/llm/index.js';

  router.post('/chat', async (req, res) => {
    const { message, conversationId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message requerido' });

    let conv = state.conversations.find(c => c.id === conversationId);
    if (!conv) {
      conv = { id: `conv-${Date.now()}`, messages: [], createdAt: Date.now() };
      state.conversations.unshift(conv);
    }

    conv.messages.push({ role: 'user', text: message, ts: Date.now() });

    try {
      const { text, provider } = await chatWithAI(message, conv.messages.slice(-6));

      const aiMsg = {
        role: 'ai', ts: Date.now(), text,
        meta: buildMeta(calcGlobalMetrics()),
        provider,
      };
      conv.messages.push(aiMsg);
      res.json({ conversationId: conv.id, response: aiMsg });
    } catch (err) {
      // Fallback extremo: responder con datos básicos
      const metrics = calcGlobalMetrics();
      const aiMsg = {
        role: 'ai', ts: Date.now(),
        text: `Análisis general · Planta MX-01 · OEE: ${metrics.oee}% · Alertas: ${metrics.activeAlerts}`,
        meta: [],
        provider: 'emergency',
      };
      conv.messages.push(aiMsg);
      res.json({ conversationId: conv.id, response: aiMsg });
    }
  });

  10.3 DEPENDENCIAS NPM A AGREGAR

  {
    "dependencies": {
      "csv-parse": "^5.5.0"    // Para cargar CSVs
    }
  }

  No se necesitan más dependencias. El Isolation Forest, z-score,
  IQR, Nelder-Mead y todo el ML se implementa en JS puro.


====================================================================
11. PUBLICACIÓN DEL PROYECTO (COSTO $0)
====================================================================

  11.1 DÓNDE HOSTEAR CADA PARTE

  ┌──────────────────┬──────────────────────┬────────────────────────┐
  │ Componente       │ Plataforma           │ Plan                  │
  ├──────────────────┼──────────────────────┼────────────────────────┤
  │ Frontend (Vite)  │ Vercel               │ Hobby (gratis)        │
  │ Backend (Express)│ Render               │ Free ($0/mes)         │
  │ LLM Groq         │ groq.com/api         │ Free (~14K req/día)   │
  │ LLM Gemini       │ aistudio.google.com  │ Free (~1,500 req/día) │
  │ LLM OpenRouter   │ openrouter.ai        │ Free (~50 req/día)    │
  └──────────────────┴──────────────────────┴────────────────────────┘

  Los 3 proveedores LLM son gratis. El backend corre en un solo
  servicio de Render sin necesidad de microservicios.

  11.2 CONFIGURACIÓN EN RENDER

  1. Crear cuenta en https://render.com
  2. New Web Service → conectar repositorio
  3. Settings:
     - Root Directory: Backend/
     - Build Command: npm install
     - Start Command: node server.js
     - Environment Variables:
       GROQ_API_KEY=gsk_tu_key_principal
       GEMINI_API_KEY=AIza_tu_key_fallback1
       OPENROUTER_API_KEY=sk-or-tu_key_fallback2
  4. Render asigna URL: https://industria-sigma.onrender.com

  11.3 COSTOS MENSUALES

  ┌─────────────────────────────┬──────────┐
  │ Concepto                     │ Costo    │
  ├─────────────────────────────┼──────────┤
  │ Vercel (Frontend)           │ $0       │
  │ Render (Express unificado)  │ $0/mes   │
  │ Groq API                    │ $0/día   │
  │ Gemini API                  │ $0/día   │
  │ OpenRouter API              │ $0/día   │
  │ Supabase (Fase 2)           │ $0/mes   │
  ├─────────────────────────────┼──────────┤
  │ TOTAL                       │ $0/mes   │
  └─────────────────────────────┴──────────┘

  TODO el proyecto funciona con costo $0 mensual.


====================================================================
12. SUPABASE (SOLO AUTH — OPCIONAL, FASE FUTURA)
====================================================================

  12.1 ALCANCE LIMITADO

  Supabase se integra ÚNICAMENTE para autenticación de usuarios.
  NO se usa para:
  - Base de datos (el estado vive en RAM en state.js)
  - Storage (los CSVs están en debugging/data/)
  - Realtime (el WebSocket broadcaster.js es el canal único)
  - Edge Functions (toda la lógica corre en Express)

  12.2 CUÁNDO IMPLEMENTARLA

  Después de que la simulación + ML + LLM estén funcionando
  correctamente. Es opcional: el sistema funciona completo sin
  Supabase usando el sistema mock actual.

  12.3 QUÉ APORTA SUPABASE (SOLO AUTH)

  ┌────────────┬──────────────────────────────────────────────────┐
  │ Auth       │ Login real con email/password                    │
  │            │ Roles: Admin, Plant Engineer, Operator           │
  │            │ JWT para sesiones seguras                        │
  │            │ Reemplaza el mock actual de autenticación        │
  └────────────┴──────────────────────────────────────────────────┘

  12.4 LO QUE NO SE MODIFICA

  - Motor de simulación (engine.js, bottling.js, furnace.js)
  - Calibración desde CSV (csv-loader.js, calibrator.js)
  - ML (anomaly.js, metrics.js, optimizer.js)
  - Servicios LLM multi-provider
  - WebSocket broadcaster.js
  - Ninguna ruta REST excepto /api/auth/*

  12.5 PLAN DE IMPLEMENTACIÓN

  1. Crear proyecto Supabase (plan gratuito)
  2. Configurar Authentication (email/password)
  3. Definir roles: admin, plant_engineer, operator
  4. Instalar @supabase/supabase-js en el backend
  5. Crear Supabase client singleton en src/services/supabase.js
  6. Modificar routes/auth.js para usar Supabase Auth
     en lugar del mock actual
  7. Configurar RLS policies para tablas de usuarios
  8. Registrar en .env: SUPABASE_URL, SUPABASE_ANON_KEY


====================================================================
13. VENTAJAS DE LA ARQUITECTURA NODE.JS
====================================================================

  ✅ Un solo lenguaje (JavaScript/Node.js)
     Frontend y backend en el mismo lenguaje. No hay cambio de
     contexto mental. Menos curvas de aprendizaje.

  ✅ Un solo deploy
     No hay que mantener un microservicio Python aparte. Todo
     Express en un solo servicio de Render.

  ✅ ML sin dependencias externas pesadas
     Isolation Forest, z-score, IQR y Nelder-Mead se implementan
     en JS puro. Sin numpy, scipy, pandas.

  ✅ Calibración determinista desde CSV
     El mismo CSV → siempre la misma calibración. Reproducibilidad
     total. Los datos históricos definen el comportamiento base.

  ✅ Modificación post-calibración
     El usuario cambia parámetros y ve el efecto inmediato,
     manteniendo el realismo de la calibración base.

  ✅ Rendimiento suficiente
     El loop de simulación a 1Hz es liviano. Las predicciones ML
     toman < 5ms en JS. No se justifica Python.

  ✅ Reutilización del código existente
     engine.js, metrics.js, alerting.js y broadcaster.js
     se adaptan, no se reescriben.

  ✅ Fallback multi-provider robusto
     Groq → Gemini → OpenRouter → Rule-based. 4 niveles de
     tolerancia a fallos. El chat nunca se cae.

  ✅ Costo $0
     Sin servidores Python adicionales, sin APIs pagas de ML,
     sin DB externa. TODO funciona gratis.

  ✅ Supabase como opcional y limitado
     Solo Auth, sin dependencia del núcleo de simulación.
     La plataforma es funcional desde el día 1 sin Supabase.

====================================================================
FIN DEL DOCUMENTO
====================================================================
