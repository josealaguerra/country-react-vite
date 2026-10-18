// Las peticiones pasan por el backend para que las credenciales nunca lleguen al navegador.
const API_URL = '/api'

const FIELDS = [
  'name','topLevelDomain','cca2','alpha2Code','cca3','alpha3Code','independent',
  'status','unMember','idd','capital','continent','region','subregion','languages',
  'translations','maps','population','latlng','landlocked','borders','area','demonym',
  'flag','flags','coatOfArms','car','timezones','startOfWeek','altSpellings',
  'currencies','currency','gini','fifa',
].join(',')

// Normaliza el "envelope" { success, data, errors } que devuelven las
// versiones nuevas de la API, además de las respuestas en array planas.
async function parseResponse(res) {
  let body
  try {
    body = await res.json()
  } catch {
    throw new Error(`Error ${res.status}: respuesta no válida (JSON) de la API`)
  }
  if (body && typeof body === 'object' && !Array.isArray(body) && 'success' in body) {
    if (!body.success) {
      const msg = body.errors?.map((e) => e.message).join(' | ') || 'Error desconocido de la API'
      const err = new Error(msg)
      err.status = res.status
      err.notFound = /not\s*found/i.test(msg) || res.status === 404
      throw err
    }
    return body.data
  }
  if (!res.ok) {
    const messages = body?.errors?.map((error) => error.message || error.code).filter(Boolean)
    const message = messages?.join(' | ') || body?.error
    const err = new Error(
      message || `Error ${res.status} al consultar la API: ${res.statusText}`,
    )
    err.status = res.status
    err.notFound = res.status === 404 || /not\s*found/i.test(message ?? '')
    throw err
  }
  return body
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  return parseResponse(res)
}

/** Devuelve todos los países con los campos necesarios para la ficha. */
export async function fetchAllCountries() {
  const data = await getJson(`${API_URL}/all?fields=${FIELDS}`)
  return Array.isArray(data) ? data : []
}

/** Busca países por nombre (coincidencia parcial). Devuelve [] si no hay resultados. */
export async function searchCountriesByName(query) {
  const q = encodeURIComponent(query.trim())
  try {
    const data = await getJson(`${API_URL}/name/${q}?fullText=false&fields=${FIELDS}`)
    return Array.isArray(data) ? data : []
  } catch (err) {
    if (err.notFound) return []
    throw err
  }
}

/** Obtiene un país exacto por su nombre common. */
export async function fetchCountryByName(name) {
  const q = encodeURIComponent(name)
  try {
    return await getJson(`${API_URL}/name/${q}?fullText=true&fields=${FIELDS}`)
  } catch (err) {
    if (err.notFound) return []
    throw err
  }
}

/** Obtiene los países dados una lista de códigos alpha3 (para vecinos). */
export async function fetchCountriesByCodes(codes) {
  const results = await Promise.all(
    codes.map((code) =>
      getJson(`${API_URL}/alpha/${code}?fields=name,cca3,alpha3Code,population,flag,flags`).catch(() => null),
    ),
  )
  return results.filter(Boolean).map((arr) => arr[0]).filter(Boolean)
}
