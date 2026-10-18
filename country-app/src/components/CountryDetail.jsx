import { useEffect, useState } from 'react'
import { fetchCountriesByCodes } from '../api/countriesApi'

const fmt = new Intl.NumberFormat('es-ES')

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-700">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-800 dark:text-slate-100">{children}</span>
    </div>
  )
}

export default function CountryDetail({ country, onClose, onSelectCountry }) {
  const [neighbors, setNeighbors] = useState([])

  useEffect(() => {
    let active = true
    setNeighbors([])
    if (country.borders?.length) {
      fetchCountriesByCodes(country.borders).then((data) => {
        if (active) setNeighbors(data)
      })
    }
    return () => {
      active = false
    }
  }, [country])

  const currencies = country.currencies
    ? Object.values(country.currencies)
        .map((c) => `${c.name}${c.symbol ? ` (${c.symbol})` : ''}`)
        .join(', ')
    : 'N/A'

  const languages = country.languages ? Object.values(country.languages).join(', ') : 'N/A'
  const timezones = country.timezones?.join(', ') ?? 'N/A'
  const translations = country.translations?.esp?.common ?? country.translations?.fra?.common ?? null

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalles de ${country.name.common}`}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="relative">
          <img
            src={country.flags?.svg ?? country.flag}
            alt={`Bandera de ${country.name.common}`}
            className="h-52 w-full rounded-t-2xl object-cover"
          />
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1 text-sm font-bold text-white hover:bg-black/70"
            aria-label="Cerrar"
          >
            ✕
          </button>
          <div className="absolute bottom-3 left-4">
            <p className="font-mono text-xs text-white/80 drop-shadow">
              #{String(country.cca26 ?? '').padStart(3, '0')} · {country.alpha3Code} ·{' '}
              {country.alpha2Code}
            </p>
            <h2 className="text-3xl font-extrabold text-white drop-shadow-lg">
              {country.name.common}
            </h2>
            {translations && (
              <p className="text-sm text-white/90 drop-shadow">Traducción: {translations}</p>
            )}
          </div>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          {/* Columna datos generales */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600">
              Información general
            </h3>
            <Row label="Nombre oficial">{country.name.official}</Row>
            <Row label="Capital">{country.capital?.join(', ') ?? 'N/A'}</Row>
            <Row label="Continente">{country.continent ?? 'N/A'}</Row>
            <Row label="Región">{country.region ?? 'N/A'}</Row>
            <Row label="Subregión">{country.subregion ?? 'N/A'}</Row>
            <Row label="Independiente">{country.independent ? 'Sí' : (country.status ?? 'No')}</Row>
            <Row label="Miembro ONU">{country.unMember ? 'Sí' : 'No'}</Row>
            <Row label="Gentilicio">{country.demonym ?? 'N/A'}</Row>
            <Row label="Superficie">{fmt.format(country.area ?? 0)} km²</Row>
            <Row label="País sin litoral">{country.landlocked ? 'Sí' : 'No'}</Row>
            <Row label="Dominio .top">{country.topLevelDomain?.join(', ') ?? 'N/A'}</Row>
            <Row label="Código FIFA">{country.fifa ?? 'N/A'}</Row>
            <Row label="Código CIC">{country.cioc ?? 'N/A'}</Row>
          </section>

          {/* Columna datos demográficos */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600">
              Demografía y economía
            </h3>
            <Row label="Población">{fmt.format(country.population)}</Row>
            <Row label="Idiomas">{languages}</Row>
            <Row label="Moneda">{currencies}</Row>
            <Row label="Coeficiente Gini">{country.gini ? `${country.gini.toFixed(1)}%` : 'N/A'}</Row>
            <Row label="Prefijo telefónico">
              +{country.idd?.root ?? 'N/A'}
              {country.idd?.suffixes?.length ? ` (${country.idd.suffixes.join(', ')})` : ''}
            </Row>
            <Row label="Zonas horarias">{timezones}</Row>
            <Row label="Primer día de semana">{country.startOfWeek ?? 'N/A'}</Row>
            <Row label="Conducción">{country.car?.side ? `Lado ${country.car.side}` : 'N/A'}</Row>
            {country.car?.signs?.length ? (
              <Row label="Señalización">{country.car.signs.join(', ')}</Row>
            ) : null}
            <Row label="Coordenadas">
              {country.latlng?.[0]}, {country.latlng?.[1]}
            </Row>
            <Row label="Google Maps">
              <a
                href={country.maps?.googleMaps}
                target="_blank"
                rel="noreferrer"
                className="text-amber-600 hover:underline dark:text-amber-400"
              >
                Abrir mapa ↗
              </a>
            </Row>
            {country.coatOfArms && (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={country.coatOfArms.svg ?? country.coatOfArms.png}
                  alt={`Escudo de ${country.name.common}`}
                  className="h-16 w-16 object-contain"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">Escudo nacional</span>
              </div>
            )}
          </section>
        </div>

        {/* Vecinos */}
        <section className="border-t border-slate-100 px-6 pb-6 pt-4 dark:border-slate-700">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600">
            Países fronterizos ({neighbors.length})
          </h3>
          {neighbors.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Este país no comparte fronteras terrestres.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {neighbors.map((n) => (
                <button
                  key={n.alpha3Code}
                  onClick={() => onSelectCountry(n.name.common)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm
                    font-medium text-slate-700 transition-colors hover:border-amber-500 hover:text-amber-600
                    dark:border-slate-600 dark:text-slate-200 dark:hover:border-amber-400"
                >
                  <img src={n.flags?.svg ?? n.flag} alt="" className="h-4 w-6 rounded object-cover" />
                  {n.name.common}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
