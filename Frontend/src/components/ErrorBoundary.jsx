import { Component } from 'react'
import { I } from '../icons'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="panel rounded-xl p-8 max-w-lg w-full text-center corners" style={{color:'#EF4444'}}>
            <div className="text-4xl mb-4 text-crit-400">{I.alert}</div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-crit-400 mb-2">// ERROR DE MÓDULO</div>
            <h2 className="font-display text-xl font-bold text-white mb-2">Módulo no disponible</h2>
            <p className="text-sm text-slate-400 mb-4">
              Este módulo encontró un error inesperado y fue aislado para proteger el resto del sistema.
            </p>
            <div className="panel rounded p-3 mb-5 text-left">
              <div className="text-[10px] text-slate-500 mb-1 tracking-widest uppercase">Detalle</div>
              <div className="text-xs num text-crit-400 break-all font-mono">
                {this.state.error.message || String(this.state.error)}
              </div>
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-md text-xs bg-crit-400/15 border border-crit-400/30 text-crit-400 hover:bg-crit-400/25 transition"
            >
              Reintentar módulo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
