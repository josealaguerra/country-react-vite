const REGIONS = [
  'All',
  'Africa',
  'Americas',
  'Asia',
  'Europe',
  'Oceania',
  'Antarctic',
]

const LABELS = {
  All: 'Todos',
  Africa: 'África',
  Americas: 'América',
  Asia: 'Asia',
  Europe: 'Europa',
  Oceania: 'Oceanía',
  Antarctic: 'Antártida',
}

export default function RegionFilter({ region, onRegionChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {REGIONS.map((r) => (
        <button
          key={r}
          onClick={() => onRegionChange(r)}
          className={`btn-filter ${region === r ? 'btn-filter-active' : ''}`}
        >
          {LABELS[r]}
        </button>
      ))}
    </div>
  )
}
