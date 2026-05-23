import { useState } from 'react'
import { DataProvider } from './context/DataContext'
import { Sidebar, Topbar } from './shell'
import { I } from './icons'
import LoginScreen from './screens/login'
import Dashboard from './screens/dashboard'
import MonitoringScreen from './screens/monitoring'
import SimulatorScreen from './screens/simulator'
import LSSScreen from './screens/lss'
import SPCScreen from './screens/spc'
import AIScreen from './screens/ai'
import AlertsScreen from './screens/alerts'
import ReportsScreen from './screens/reports'
import ConfigScreen from './screens/config'
import ProfileScreen from './screens/profile'

export default function App(){
  const [authed, setAuthed] = useState(false);
  const [route,  setRoute]  = useState('dashboard');

  if(!authed){
    return <LoginScreen onLogin={()=>setAuthed(true)}/>;
  }

  const screens = {
    dashboard: { c: Dashboard,         crumb:'IndustrIA Σ / Overview',     title:'Dashboard' },
    monitor:   { c: MonitoringScreen,  crumb:'IndustrIA Σ / Overview',     title:'Monitoreo Real-Time' },
    simulator: { c: SimulatorScreen,   crumb:'IndustrIA Σ / Process',      title:'Simulador' },
    lss:       { c: LSSScreen,         crumb:'IndustrIA Σ / Process',      title:'Lean Six Sigma' },
    spc:       { c: SPCScreen,         crumb:'IndustrIA Σ / Process',      title:'SPC' },
    ai:        { c: AIScreen,          crumb:'IndustrIA Σ / Intelligence', title:'IA Industrial' },
    alerts:    { c: AlertsScreen,      crumb:'IndustrIA Σ / Intelligence', title:'Alertas' },
    reports:   { c: ReportsScreen,     crumb:'IndustrIA Σ / Admin',        title:'Reportes' },
    config:    { c: ConfigScreen,      crumb:'IndustrIA Σ / Admin',        title:'Configuración' },
    profile:   { c: ProfileScreen,     crumb:'IndustrIA Σ / Admin',        title:'Perfil' },
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
        <Topbar title={cur.title} breadcrumb={cur.crumb} onLogout={()=>setAuthed(false)}/>
        <div className="flex-1 overflow-y-auto relative">
          <C/>
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
