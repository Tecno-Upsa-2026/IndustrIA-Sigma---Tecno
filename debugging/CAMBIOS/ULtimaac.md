quí está el análisis completo de todos los cambios del commit c567cac (vs d3bf350):
---
Resumen: +2988 líneas, -949 líneas, 16 archivos modificados
---
1. Backend/scripts/create-admin.js (NUEVO)
Script para crear/actualizar la cuenta admin (flavialozadar@gmail.com / Prueba123456) en Supabase Auth con rol Administrator y acceso Total. Se ejecuta con node scripts/create-admin.js.
2. Backend/src/lib/supabase.js
Se agregó supabaseAdmin — un cliente service_role para invitaciones de usuarios y gestión administrativa (nunca enviado al frontend).
3. Backend/src/routes/auth.js
Ahora usa Supabase Auth real para login (supabase.auth.signInWithPassword) en lugar de validación mock. Los tokens JWT se firman localmente con el payload { sub, email, role }. El refresh token usa un secret separado. Se agregó fallback a Supabase Auth si el backend no responde.
4. Backend/src/routes/config.js
- Endpoints para WECO rules: toggle on/off via PATCH /weco/:rule, listar con GET /weco.
- Endpoints para SPC limits: CRUD completo (GET/POST/PATCH/DELETE /spc-limits/:id).
- Endpoints para Users: POST /users invita via Supabase Admin (envía email real), PATCH /users/:id actualiza rol/acceso, DELETE /users/:id elimina (protege al usuario propio).
5. Backend/src/store/state.js
Se expandió con MACHINE_PROFILES — perfiles físicos por máquina (temp base, noise, spring constants, thresholds). Las ventanas SPC se inicializan con 40 puntos por máquina. Se agregó productionHistory (últimos 60 minutos de producción simulada).
6. Frontend/src/lib/pdf.js (+247 líneas)
Sistema de generación de PDFs completo:
- generatePDF() — Captura pantalla vía html2canvas y genera PDF con múltiples páginas si es necesario. Guarda automáticamente a Supabase Storage + tabla reports.
- generateDataReport() — Genera PDF programático (sin canvas) con: header corporativo oscuro, metadatos (tipo, máquina, variable, registros), tabla de estadísticas SPC (media, UCL, LCL, Cp, Cpk), veredicto de capacidad (capaz/marginal/no capaz), nivel sigma, yield estimado, tabla de alertas activas. Guarda a Supabase.
- downloadSavedPDF() — Descarga un PDF desde Supabase Storage.
7. Frontend/src/charts.jsx
Se agregaron 4 nuevos componentes de chart:
- ParetoChart — gráfico de barras + línea de acumulado al 80%.
- LiveWave — waveform animada con autoscroll y suavizado exponencial.
- Donut — gráfico de anillo con color dinámico.
- Heatmap — cuadrícula 24h × 7d con intensidad variable.
8. Frontend/src/screens/dashboard.jsx
Sistema de CSV completamente integrado:
- Parseo de archivos CSV con detección automática de machine ID por nombre de archivo.
- CSVSection — interfaz para subir/múltiples CSVs, mini trend charts por variable, tabla de datos.
- Mapeo de columnas CSV a sensores (temperatura_c → temp, vibracion_g → vib, etc.).
- ParamSlider — sliders interactivos con target indicator verde.
- MachineMini — cards de máquina con status, OEE, LiveWave, CSV badge.
- simTick() — simulación física local con overrides de variables de proceso.
- generateLocalInsights() — insights IA locales sin backend (críticos, temperatura, vibración, OEE).
- Sincronización de sliders con última fila del CSV cuando se selecciona una máquina.
- Carga de CSVs desde Supabase Storage en montaje.
9. Frontend/src/screens/login.jsx
Login completamente rediseñado con:
- Panel izquierdo con animación SVG (órbitas, partículas, radar).
- Autenticación bifactor simulada con opciones SSO/SAML/Azure AD.
- Flujo de invitación: detecta tokens invite/recovery en URL hash, permite crear contraseña mediante supabase.auth.updateUser(), con medidor de fortaleza de contraseña.
- Fallback: si el backend Express no responde, intenta login directo contra Supabase Auth.
- Diseño premium con gradientes, glows, panel-strong y grid-bg.
10. Frontend/src/screens/config.jsx (+709 líneas)
Pantalla de Configuración del sistema con 4 pestañas:
- Máquinas: tabla de catálogo con datos CSV en tiempo real (temperatura, OEE, vibración), confirmación de eliminación, detección de tipo de máquina por ID.
- Límites SPC: calculados dinámicamente de los CSVs cargados (media, USL/LSL, UCL/LCL, Cp, Cpk), con fallback a datos demo. Muestra N, unidad, y color coding según capacidad.
- Usuarios: tabla con avatar gradient, roles, acceso, estado (pendiente/activo). Modal de invitación con validación de email, selección de rol/permiso. Envía invitación real via Supabase Admin.
- Variables: catálogo de variables de proceso extraídas del CSV con min/mean/max, colores, tags estilo OPC-UA (io.inj-07.temperatura).
11. Frontend/src/screens/spc.jsx
SPC ahora trabaja con datos CSV reales:
- computeStats() — calcula media, desviación, Cp, Cpk, skewness de un array de valores.
- detectWECO() — implementación real de reglas WECO R1 (1 punto fuera de 3σ), R2 (9 puntos mismo lado), R3 (6 puntos tendencia monotónica), R5 (2 de 3 en zona A). Las reglas R4, R6, R7, R8 se listan pero no implementadas.
- Selector de máquina + columna CSV para análisis.
- Gráficos de control, MR chart, histograma con datos reales.
- Tabla de datos con últimas 10 lecturas, timestamp, MR, estado OOC/WARN, reglas WECO detectadas.
- Botón PDF que captura la pantalla vía generatePDF().
12. Frontend/src/screens/lss.jsx
Lean Six Sigma ahora con datos CSV:
- Cálculo SPC real con computeSPCStats() — media, desviación, Cp, Cpk, Pp, Ppk, sigma level, yield vía CDF normal, skewness, moving range.
- computeCSVPareto() — correlación de Pearson entre columnas numéricas y defectos/yield para generar Pareto real.
- buildCSVIshikawa() — mapeo de columnas CSV a las 6M (Máquina, Material, Método, Medición, Mano obra, Medio ambiente) con coeficiente de variación.
- autoPhases() — progreso automático DMAIC basado en datos reales (Define=CSV cargado, Measure=filas≥30, Analyze=OOC detectado, Improve=Cpk≥1.33, Control=últimos 10 puntos en control).
- DMAIC phases editables manualmente con persistencia a Supabase dmaic_projects.
- Selector de máquina y columna SPC.
- Ishikawa diagram SVG con 6 ramas y causas mapeadas.
13. Frontend/src/screens/monitor_sim.jsx
Simulador de escenarios rediseñado:
- Selector de máquina con badge CSV.
- Barra de "último registro CSV" con valores actuales y botón de resincronización.
- Sliders de proceso (temperatura, velocidad, presión, vibración, torque) con ideal markers verdes.
- Modelo físico computeLocal() que calcula defecto, yield, Cp, Cpk, sigma, producción.
- ImpactRow — tarjetas de impacto con delta vs target y color coding.
- Indicador visual de calidad con barra de progreso gradient.
- AISuggestion — sugerencia contextual basada en desviación de parámetros.
14. Frontend/src/screens/reports.jsx
Sistema de reportes:
- Modal de generación de reporte con selección de: tipo (SPC/LSS/Alertas/DMAIC/Energía/General), máquina/CSV, columna variable, nombre, autor.
- Genera PDF programático (sin html2canvas) con estadísticas SPC y alertas activas.
- Confirmación de eliminación con modal.
- Tabla de reportes guardados con descarga desde Supabase Storage.
- Info contextual según haya CSVs cargados o no.
15. Frontend/src/shell.jsx
Se eliminó el selector de planta fijo ("Querétaro · MX-01") del sidebar.
---
Arquitectura general de cómo funciona:
1. CSV como fuente de verdad: El usuario sube un archivo CSV en Dashboard. El sistema detecta automáticamente el machine ID por el nombre del archivo. Los valores de la última fila se usan como valores actuales de sensores.
2. Persistencia en Supabase: CSVs se guardan en csv-files (Storage) + tabla csv_files, reportes en reports (Storage + tabla), fases DMAIC en dmaic_projects.
3. Estadísticas bajo demanda: Cada pantalla (SPC, LSS, Reports, Config) calcula stats, límites, correlaciones directamente del CSV en el cliente — sin backend.
4. Simulación física: monitor_sim.jsx usa un modelo matemático local donde defecto, cp, yield se derivan de temperatura, vibración, velocidad. El dashboard tiene simTick() para simulación multi-máquina.
5. WECO real: spc.jsx implementa detección de 4 de 8 reglas WECO directamente en el cliente.
6. Autenticación: Login con fallback (backend Express → Supabase Auth directo). Invitaciones con email real via Supabase Admin service_role.
7. PDF dual: generatePDF() para capturas visuales (html2canvas), generateDataReport() para PDFs programáticos con datos estructurados.