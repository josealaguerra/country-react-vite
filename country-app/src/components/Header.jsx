export default function Header({ search, onSearchChange, darkMode, onToggleDark }) {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur shadow-sm dark:bg-slate-900/90">
      <div className="mx-auto max-w-7xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            🌍 Countries<span className="text-amber-500">Dex</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Explora la información de todos los países del mundo ·{' '}
            <a
              href="https://restcountries.com"
              target="_blank"
              rel="noreferrer"
              className="text-amber-600 hover:underline dark:text-amber-400"
            >
              REST Countries
            </a>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            title="Las consultas a REST Countries pasan por el backend"
            className="hidden md:inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300"
          >
            <span className="h-2 w-2 rounded-full bg-green-500" />
            API protegida por backend
          </span>

          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar país…"
            className="w-full sm:w-64 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm
              text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2
              focus:ring-amber-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100
              dark:focus:ring-amber-500/30"
            aria-label="Buscar país"
          />

          <button
            onClick={onToggleDark}
            className="rounded-lg border border-slate-300 p-2 text-lg leading-none hover:bg-slate-100
              dark:border-slate-600 dark:hover:bg-slate-800"
            aria-label="Cambiar modo claro/oscuro"
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  )
}
