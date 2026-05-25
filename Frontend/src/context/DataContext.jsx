import { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { ws  } from '../lib/ws.js';

// ── Initial state (shown while loading / backend offline) ──────────────────────
const INITIAL = {
  connected:      false,
  loading:        true,
  machines:       {},
  alerts:         [],
  metrics:        {},
  events:         [],
  production:     [],
  simulator:      { status: 'idle', results: {}, history: [], params: {}, scenarios: [] },
  spcData:        {},
  lss:            null,
  reports:        [],
  config:         null,
  users:          [],
  profile:        null,
  aiInsights:     [],
  aiModels:       [],
  conversations:  [],
  anomaly:        {},
  // Rolling 60-point history per machine, populated by TICK
  // Structure: { [machineId]: { temp: number[], vib: number[], oee: number[] } }
  machineHistory: {},
  // CSV files uploaded once in Dashboard, shared across all screens
  // Structure: { [machineId]: { name, header, rows } }
  csvFiles:       {},
  activeCsvId:    null,
};

// ── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':       return { ...state, loading: action.v };
    case 'SET_CONNECTED':     return { ...state, connected: action.v };
    case 'SEED':              return { ...state, ...action.data, loading: false };

    // WebSocket TICK — core live data
    case 'TICK': {
      let history = state.machineHistory;
      if (action.machines) {
        history = { ...state.machineHistory };
        Object.entries(action.machines).forEach(([id, m]) => {
          const prev = history[id] || {};
          const next = {
            temp: [...(prev.temp || []), m.temp ?? 0].slice(-60),
            vib:  [...(prev.vib  || []), m.vib  ?? 0].slice(-60),
            oee:  [...(prev.oee  || []), m.oee  ?? 0].slice(-60),
          };
          // Track all variable series for live charts
          if (m.vars) {
            for (const [k, e] of Object.entries(m.vars)) {
              next[k] = [...(prev[k] || []), e.value ?? 0].slice(-60);
            }
          }
          history[id] = next;
        });
      }
      return {
        ...state,
        machines:       action.machines   ?? state.machines,
        alerts:         action.alerts     ?? state.alerts,
        metrics:        action.metrics    ?? state.metrics,
        events:         action.events     ?? state.events,
        production:     action.production ?? state.production,
        simulator:      action.simulator
          ? { ...state.simulator, ...action.simulator }
          : state.simulator,
        anomaly:        action.anomaly    ?? state.anomaly,
        machineHistory: history,
      };
    }

    // Individual REST-triggered updates
    case 'SET_MACHINES':      return { ...state, machines:       action.v };
    case 'SET_ALERTS':        return { ...state, alerts:         action.v };
    case 'SET_SPC':           return { ...state, spcData:        { ...state.spcData, [action.machineId]: action.v } };
    case 'SET_SPC_ALL':       return { ...state, spcData:        action.v };
    case 'SET_LSS':           return { ...state, lss:            action.v };
    case 'SET_REPORTS':       return { ...state, reports:        action.v };
    case 'SET_CONFIG':        return { ...state, config:         action.v };
    case 'SET_USERS':         return { ...state, users:          action.v };
    case 'SET_PROFILE':       return { ...state, profile:        action.v };
    case 'SET_SIMULATOR':     return { ...state, simulator:      { ...state.simulator, ...action.v } };
    case 'SET_AI_INSIGHTS':   return { ...state, aiInsights:     action.v };
    case 'SET_AI_MODELS':     return { ...state, aiModels:       action.v };
    case 'SET_CONVERSATIONS': return { ...state, conversations:  action.v };

    case 'ADD_CSV': {
      const next = { ...state.csvFiles, [action.id]: action.data };
      return { ...state, csvFiles: next, activeCsvId: action.id };
    }
    case 'REMOVE_CSV': {
      const next = { ...state.csvFiles };
      delete next[action.id];
      const ids = Object.keys(next);
      return { ...state, csvFiles: next, activeCsvId: ids.length ? ids[ids.length - 1] : null };
    }
    case 'SET_ACTIVE_CSV': return { ...state, activeCsvId: action.id };

    default: return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────
const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const initialized = useRef(false);

  // ── Bootstrap: fetch seed data once ────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    Promise.allSettled([
      api.getDashboard(),
      api.getMachines(),
      api.getAlerts(),
      api.getSPCAll(),
      api.getLSSMetrics(),
      api.getConfig(),
      api.getSimulator(),
      api.getConversations(),
      api.getAIInsights(),
      api.getAIModels(),
      api.getProfile(),
    ]).then(([dash, machines, alerts, spc, lss, config, simulator, conversations, aiInsights, aiModels, profile]) => {
      const data = {};
      if (dash.status     === 'fulfilled') Object.assign(data, dash.value);
      if (machines.status === 'fulfilled') {
        const map = {};
        machines.value.forEach(m => { map[m.id] = m; });
        data.machines = map;
      }
      if (alerts.status   === 'fulfilled') data.alerts  = alerts.value;
      if (spc.status      === 'fulfilled') data.spcData = spc.value;
      if (lss.status      === 'fulfilled') data.lss = lss.value;
      if (config.status   === 'fulfilled') data.config = config.value;
      if (simulator.status=== 'fulfilled') data.simulator = { ...data.simulator, ...simulator.value };
      if (conversations.status === 'fulfilled') data.conversations = conversations.value;
      if (aiInsights.status === 'fulfilled') data.aiInsights = aiInsights.value;
      if (aiModels.status === 'fulfilled') data.aiModels = aiModels.value;
      if (profile.status  === 'fulfilled') data.profile = profile.value;
      dispatch({ type: 'SEED', data });
    });

    ws.connect();
    return () => ws.disconnect();
  }, []);

  // ── WebSocket events ────────────────────────────────────────────────────────
  useEffect(() => {
    const offConn  = ws.on('_connected',    () => dispatch({ type: 'SET_CONNECTED', v: true  }));
    const offDisc  = ws.on('_disconnected', () => dispatch({ type: 'SET_CONNECTED', v: false }));
    const offTick  = ws.on('TICK', (msg) => {
      const machines = {};
      if (msg.machines) Object.entries(msg.machines).forEach(([k, v]) => { machines[k] = v; });
      dispatch({
        type:       'TICK',
        machines:   Object.keys(machines).length ? machines : undefined,
        alerts:     msg.alerts,
        metrics:    msg.metrics,
        events:     msg.events,
        production: msg.production,
        simulator:  msg.simulator,
        anomaly:    msg.anomaly,
      });
    });
    return () => { offConn(); offDisc(); offTick(); };
  }, []);

  // ── Action creators (passed to screens via context) ─────────────────────────
  const actions = {
    // Machines
    commandMachine: useCallback(async (id, body) => {
      const res = await api.commandMachine(id, body);
      return res;
    }, []),

    // Alerts
    acknowledgeAlert: useCallback(async (id) => {
      await api.acknowledgeAlert(id);
      const alerts = await api.getAlerts();
      dispatch({ type: 'SET_ALERTS', v: alerts });
    }, []),
    closeAlert: useCallback(async (id) => {
      await api.closeAlert(id);
      const alerts = await api.getAlerts();
      dispatch({ type: 'SET_ALERTS', v: alerts });
    }, []),
    markAllAlertsRead: useCallback(async () => {
      await api.markAllAlertsRead();
      const alerts = await api.getAlerts();
      dispatch({ type: 'SET_ALERTS', v: alerts });
    }, []),

    // SPC
    fetchSPC: useCallback(async (machineId) => {
      const data = await api.getSPC(machineId);
      dispatch({ type: 'SET_SPC', machineId, v: data });
      return data;
    }, []),
    fetchSPCAll: useCallback(async () => {
      const data = await api.getSPCAll();
      dispatch({ type: 'SET_SPC_ALL', v: data });
      return data;
    }, []),

    // LSS
    fetchLSS: useCallback(async () => {
      const [metrics, pareto, yieldByLine, dpmoTrend, dmaic] = await Promise.all([
        api.getLSSMetrics(), api.getPareto(), api.getYieldByLine(),
        api.getDPMOTrend(), api.getDMAIC(),
      ]);
      const lss = { metrics, pareto, yieldByLine, dpmoTrend, dmaic };
      dispatch({ type: 'SET_LSS', v: lss });
      return lss;
    }, []),

    // Simulator
    updateSimParams: useCallback(async (params) => {
      const res = await api.updateSimParams(params);
      dispatch({ type: 'SET_SIMULATOR', v: { params: res.params ?? params } });
    }, []),
    runSimulator: useCallback(async () => {
      const res = await api.runSimulator();
      dispatch({ type: 'SET_SIMULATOR', v: { status: res.status } });
    }, []),
    stopSimulator: useCallback(async () => {
      const res = await api.stopSimulator();
      dispatch({ type: 'SET_SIMULATOR', v: { status: res.status } });
    }, []),
    resetSimulator: useCallback(async () => {
      const res = await api.resetSimulator();
      dispatch({ type: 'SET_SIMULATOR', v: res });
    }, []),
    optimizeSimulator: useCallback(async (body) => {
      const res = await api.optimizeSimulator(body);
      dispatch({ type: 'SET_SIMULATOR', v: { optimizedSetpoints: res.recommendations ?? [], optimizedMachineId: res.machineId ?? body?.machineId } });
      return res;
    }, []),
    saveScenario: useCallback(async (body) => {
      const res = await api.saveScenario(body);
      return res;
    }, []),

    // Reports
    fetchReports: useCallback(async () => {
      const data = await api.getReports();
      dispatch({ type: 'SET_REPORTS', v: data });
      return data;
    }, []),
    createReport: useCallback(async (body) => {
      const rep = await api.createReport(body);
      dispatch({ type: 'SET_REPORTS', v: [rep, ...state.reports] });
      // Poll until ready
      const poll = setInterval(async () => {
        const updated = await api.getReports();
        dispatch({ type: 'SET_REPORTS', v: updated });
        if (updated.find(r => r.id === rep.id)?.estado !== 'Generando') clearInterval(poll);
      }, 1000);
      setTimeout(() => clearInterval(poll), 10000);
      return rep;
    }, [state.reports]),
    deleteReport: useCallback(async (id) => {
      await api.deleteReport(id);
      dispatch({ type: 'SET_REPORTS', v: state.reports.filter(r => r.id !== id) });
    }, [state.reports]),

    // Config
    fetchConfig: useCallback(async () => {
      const [config, users] = await Promise.all([api.getConfig(), api.getUsers()]);
      dispatch({ type: 'SET_CONFIG', v: config });
      dispatch({ type: 'SET_USERS',  v: users  });
    }, []),
    toggleWECO: useCallback(async (rule, on) => {
      await api.toggleWECO(rule, on);
      const config = await api.getConfig();
      dispatch({ type: 'SET_CONFIG', v: config });
    }, []),
    inviteUser: useCallback(async (body) => {
      const user = await api.inviteUser(body);
      const users = await api.getUsers();
      dispatch({ type: 'SET_USERS', v: users });
      return user;
    }, []),
    updateUser: useCallback(async (id, body) => {
      await api.updateUser(id, body);
      const users = await api.getUsers();
      dispatch({ type: 'SET_USERS', v: users });
    }, []),
    deleteUser: useCallback(async (id) => {
      await api.deleteUser(id);
      const users = await api.getUsers();
      dispatch({ type: 'SET_USERS', v: users });
    }, []),

    // Profile
    fetchProfile: useCallback(async () => {
      const data = await api.getProfile();
      dispatch({ type: 'SET_PROFILE', v: data });
      return data;
    }, []),
    updateProfile: useCallback(async (body) => {
      const data = await api.updateProfile(body);
      dispatch({ type: 'SET_PROFILE', v: data });
      return data;
    }, []),

    // AI
    fetchAIInsights: useCallback(async () => {
      const [insights, models] = await Promise.all([api.getAIInsights(), api.getAIModels()]);
      dispatch({ type: 'SET_AI_INSIGHTS', v: insights });
      dispatch({ type: 'SET_AI_MODELS',   v: models   });
    }, []),
    fetchConversations: useCallback(async () => {
      const data = await api.getConversations();
      dispatch({ type: 'SET_CONVERSATIONS', v: data });
      return data;
    }, []),
    chat: useCallback(async (message, conversationId, csvContext) => {
      const res = await api.chat({ message, conversationId, ...(csvContext ? { csvContext } : {}) });
      const convs = await api.getConversations();
      dispatch({ type: 'SET_CONVERSATIONS', v: convs });
      return res;
    }, []),

    // CSV — uploaded once in Dashboard, consumed everywhere
    addCsv:      (id, data) => dispatch({ type: 'ADD_CSV',        id, data }),
    removeCsv:   (id)       => dispatch({ type: 'REMOVE_CSV',     id }),
    setActiveCsv:(id)       => dispatch({ type: 'SET_ACTIVE_CSV', id }),

    // Recalibrate backend simulation from a CSV the user uploaded
    recalibrateFromCsv: useCallback(async (machineIdOrPayload, csvContent, fileName) => {
      const payload = typeof machineIdOrPayload === 'object' && machineIdOrPayload !== null
        ? machineIdOrPayload
        : { machineId: machineIdOrPayload, csvContent, fileName };
      return api.recalibrateFromCsv(payload);
    }, []),
  };

  return (
    <DataCtx.Provider value={{ ...state, actions }}>
      {children}
    </DataCtx.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
