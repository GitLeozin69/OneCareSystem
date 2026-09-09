import Equipamentos from './pages/Equipamentos.jsx'

function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4">Pular para o conteúdo</a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-5 py-5 sm:px-10">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-teal-800 text-sm font-bold tracking-tight text-white">OC</span>
          <div><span className="text-lg font-semibold tracking-tight">OneCare</span><p className="text-xs text-slate-500">Gestão de equipamentos</p></div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-10 sm:py-10"><Equipamentos /></main>
    </>
  )
}

export default App
