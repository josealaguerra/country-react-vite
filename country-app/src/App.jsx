import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from './components/Header.jsx'
import RegionFilter from './components/RegionFilter.jsx'
import CountryCard from './components/CountryCard.jsx'
import CountryDetail from './components/CountryDetail.jsx'
import { fetchAllCountries, fetchCountryByName } from './api/countriesApi.js'
import { toSafeUserError } from './components/ErrorBoundary.jsx'
import { sanitizeSearchInput } from './utils/security.js'

const PAGE_SIZE = 24

export default function App() {
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('All')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [selected, setSelected] = useState(null)
  const [darkMode, setDarkMode] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  const handleSearchChange = useCallback((value) => {
    try {
      setSearch(sanitizeSearchInput(value))
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetchAllCountries()
      .then((data) => {
        if (active) {
          setCountries(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          setError(toSafeUserError(err).message)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return countries.filter((c) => {
      const matchesRegion = region === 'All' || c.region === region
      const matchesSearch =
        !q ||
        c.name.common.toLowerCase().includes(q) ||
        c.name.official.toLowerCase().includes(q) ||
        (c.capital ?? []).some((cap) => cap.toLowerCase().includes(q))
      return matchesRegion && matchesSearch
    })
  }, [countries, search, region])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, region])

  const openByName = useCallback(
    async (name) => {
      try {
        const data = await fetchCountryByName(name)
        if (data?.[0]) setSelected(data[0])
      } catch {
        // fallback: buscar en los datos ya cargados
        const found = countries.find((c) => c.name.common === name)
        if (found) setSelected(found)
      }
    },
    [countries],
  )

  const visible = filtered.slice(0, visibleCount)

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-900 dark:text-slate-100">
      <Header
        search={search}
        onSearchChange={handleSearchChange}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
      />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <RegionFilter region={region} onRegionChange={setRegion} />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Cargando…' : `${filtered.length} país(es)`}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            ⚠️ {error}. Verifica tu conexión o la configuración de <code>.env</code>.
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card animate-pulse overflow-hidden">
                <div className="h-40 bg-slate-200 dark:bg-slate-700" />
                <div className="space-y-3 p-4">
                  <div className="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-slate-500 dark:text-slate-400">
            No se encontraron países con esos criterios. 🔍
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((c) => (
                <CountryCard key={c.cca3 ?? c.alpha3Code} country={c} onSelect={setSelected} />
              ))}
            </div>
            {visibleCount < filtered.length && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                  className="rounded-lg bg-amber-500 px-6 py-2.5 font-semibold text-white shadow hover:bg-amber-600 transition-colors"
                >
                  Cargar más ({filtered.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Datos y banderas provistos por{' '}
        <a href="https://restcountries.com" target="_blank" rel="noreferrer" className="underline">
          REST Countries
        </a>{' '}
        · consultas gestionadas por el backend
      </footer>

      {selected && (
        <CountryDetail
          country={selected}
          onClose={() => setSelected(null)}
          onSelectCountry={openByName}
        />
      )}
    </div>
  )
}
