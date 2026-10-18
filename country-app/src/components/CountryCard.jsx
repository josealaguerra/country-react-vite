const REGION_COLORS = {
  Africa: 'bg-amber-500',
  Americas: 'bg-emerald-500',
  Asia: 'bg-red-500',
  Europe: 'bg-blue-500',
  Oceania: 'bg-purple-500',
  Antarctic: 'bg-cyan-500',
}

export default function CountryCard({ country, onSelect }) {
  const fmt = new Intl.NumberFormat('es-ES')
  return (
    <article
      className="card overflow-hidden"
      onClick={() => onSelect(country)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(country)}
      aria-label={`Ver detalles de ${country.name.common}`}
    >
      <div className="relative">
        <img
          src={country.flags?.svg ?? country.flag}
          alt={`Bandera de ${country.name.common}`}
          className="h-40 w-full object-cover"
          loading="lazy"
        />
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
            REGION_COLORS[country.region] ?? 'bg-slate-500'
          }`}
        >
          {country.region ?? '—'}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
            {country.name.common}
          </h2>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            #{String(country.cca26 ?? country.alpha3Code ?? '').padStart(3, '0')}
          </span>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500 dark:text-slate-400">Población:</dt>
            <dd className="info-label">{fmt.format(country.population)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500 dark:text-slate-400">Capital:</dt>
            <dd className="info-label truncate">{country.capital?.[0] ?? 'N/A'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500 dark:text-slate-400">Región:</dt>
            <dd className="info-label truncate">{country.subregion ?? country.region ?? 'N/A'}</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}
