import { useState, useEffect } from 'react'
import { DataProvider } from './context/DataContext'
import { Sidebar, Topbar } from './shell'
import { I } from './icons'
import LoginScreen from './screens/login'
import Dashboard from './screens/dashboard'
import MonitorSimScreen from './screens/monitor_sim'
import LSSScreen from './screens/lss'
import AIAlertsScreen from './screens/ai_alerts'
import ReportsScreen from './screens/reports'
import ConfigScreen from './screens/config'
import ProfileScreen from './screens/profile'
import ErrorBoundary from './components/ErrorBoundary'
import { api } from './lib/api'
import { auth } from './lib/auth'

export default function App(){
  const [authed,  setAuthed]  = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [route,   setRoute]   = useState('dashboard');

  // Attempt silent token refresh on startup so a page reload doesn't force re-login
  useEffect(() => {
    if (!auth.hasRefresh()) { setAuthReady(true); return; }
    api.refresh({ refreshToken: auth.getRefresh() })
      .then(data => { auth.setTokens(data); setAuthed(true); })
      .catch(() => { auth.clearTokens(); })
      .finally(() => setAuthReady(true));
  }, []);

  if (!authReady) return null; // brief blank while checking stored token

  if(!authed){
    return <LoginScreen onLogin={()=>setAuthed(true)}/>;
  }

  function handleLogout(){
    api.logout().catch(()=>{});
    auth.clearTokens();
    setAuthed(false);
  }

  const screens = {
    dashboard:   { c: Dashboard,        crumb:'IndustrIA Σ / Overview',     title:'Dashboard' },
    monitor_sim: { c: MonitorSimScreen, crumb:'IndustrIA Σ / Overview',     title:'Monitoreo y Simulación' },
    lss:         { c: LSSScreen,        crumb:'IndustrIA Σ / Análisis',     title:'Lean Six Sigma' },
    ai_alerts:   { c: AIAlertsScreen,   crumb:'IndustrIA Σ / Inteligencia', title:'IA + Alertas' },
    reports:     { c: ReportsScreen,    crumb:'IndustrIA Σ / Admin',        title:'Reportes' },
    config:      { c: ConfigScreen,     crumb:'IndustrIA Σ / Admin',        title:'Configuración' },
    profile:     { c: ProfileScreen,    crumb:'IndustrIA Σ / Admin',        title:'Perfil' },
  };
  const cur = screens[route] || screens.dashboard;
  const C   = cur.c;

  return (
    <DataProvider>
    <div className="h-screen flex relative overflow-hidden" data-screen-label={`Shell · ${cur.title}`}>
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none"/>
      <div className="fixed inset-0 pointer-events-none" style={{
        background:'radial-gradient(900px 500px at 0% 0%, rgba(34,211,238,0.07), transparent 60%), radial-gradient(900px 600px at 100% 100%, rgba(168,85,247,0.07), transparent 60%)'
      }}/>

      <Sidebar active={route} onNavigate={setRoute}/>

      <main className="flex-1 min-w-0 flex flex-col relative ml-[248px]">
        <Topbar title={cur.title} breadcrumb={cur.crumb} onLogout={handleLogout} onNavigate={setRoute}/>
        <div className="flex-1 overflow-y-auto relative">
          <ErrorBoundary key={route}>
            <C/>
          </ErrorBoundary>
        </div>
        <footer className="hairline-top px-6 py-2 flex items-center justify-between text-[10px] text-slate-500 num panel-strong relative z-10">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-grind-400 pulse-dot"/>SYSTEM ONLINE</span>
            <span>NODE · MX-01</span>
            <span>SENSORS · 412/418</span>
            <span>MODEL · NEXUS-AI v2.41</span>
            <span>UPLINK · 42ms</span>
          </div>
          <div className="flex items-center gap-4">
            <span>CPU 23% · MEM 4.1G · NET 1.4MB/s</span>
            <span>BUILD 2026.5.21-r4</span>
            <span>© IndustrIA Sigma</span>
          </div>
        </footer>
      </main>
    </div>
    </DataProvider>
  );
}
