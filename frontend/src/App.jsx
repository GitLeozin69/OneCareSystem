import { useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Equipamentos from './pages/Equipamentos.jsx'

function App() {
  const [destination, setDestination] = useState({ page: 'equipamentos' })

  function showEquipamentos(mode = 'active', status = '') {
    setDestination({ page: 'equipamentos', mode, status })
  }

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4">Pular para o conteúdo</a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-5 py-5 sm:px-10">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-teal-800 text-sm font-bold tracking-tight text-white">OC</span>
          <div className="mr-auto"><span className="text-lg font-semibold tracking-tight">OneCare</span><p className="text-xs text-slate-500">Gestão de equipamentos</p></div>
          <nav aria-label="Navegação principal" className="flex gap-2">
            <button type="button" className="btn btn-secondary" aria-current={destination.page === 'dashboard' ? 'page' : undefined} onClick={() => setDestination({ page: 'dashboard' })}>Dashboard</button>
            <button type="button" className="btn btn-secondary" aria-current={destination.page === 'equipamentos' ? 'page' : undefined} onClick={() => showEquipamentos()}>Equipamentos</button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-10 sm:py-10">
        {destination.page === 'dashboard'
          ? <Dashboard onNavigate={showEquipamentos} />
          : <Equipamentos key={`${destination.mode}-${destination.status}`} initialMode={destination.mode} initialStatus={destination.status} />}
      </main>
    </>
  )
}

export default App
