import http from 'node:http'
import { pathToFileURL } from 'node:url'

const DEFAULT_API_URL = 'https://api.restcountries.com/countries/v5'
const MAX_REQUEST_PATH_LENGTH = 2048
const MAX_COUNTRY_PAGES = 50
const PAGE_SIZE = 100
const RESPONSE_FIELDS = [
  'names',
  'codes',
  'tlds',
  'region',
  'subregion',
  'capitals',
  'continents',
  'area',
  'population',
  'coordinates',
  'landlocked',
  'borders',
  'flag',
  'currencies',
  'languages',
  'calling_codes',
  'demonyms',
  'classification',
  'cars',
  'timezones',
  'links',
  'date',
  'economy',
].join(',')

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function normalizeApiUrl(apiUrl) {
  const apiBase = new URL(apiUrl)
  if (!['http:', 'https:'].includes(apiBase.protocol)) {
    throw new Error('REST_COUNTRIES_API_URL must use HTTP or HTTPS.')
  }

  const path = apiBase.pathname.replace(/\/+$/, '')
  if (
    (apiBase.hostname === 'api.restcountries.com' &&
      (path === '/v3.1' || path === '/v5')) ||
    (apiBase.hostname === 'restcountries.com' && path === '/v3.1')
  ) {
    if (apiBase.hostname === 'restcountries.com') {
      apiBase.hostname = 'api.restcountries.com'
    }
    apiBase.pathname = '/countries/v5'
  }

  return apiBase
}

function latestGiniValue(gini) {
  if (typeof gini === 'number') return gini
  if (!gini || typeof gini !== 'object') return undefined

  const values = Object.entries(gini)
    .filter(([, value]) => typeof value === 'number')
    .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))

  return values[0]?.[1]
}

function normalizeCountry(country) {
  if (country.name) return country

  const names = country.names ?? {}
  const codes = country.codes ?? {}
  const flag = country.flag ?? {}
  const classification = country.classification ?? {}
  const callingCodes = country.calling_codes ?? []
  const gini = latestGiniValue(country.economy?.gini_coefficient)
  const spanishTranslation = names.translations?.spa

  return {
    ...country,
    name: {
      common: names.common ?? '',
      official: names.official ?? names.common ?? '',
      nativeName: names.native ?? {},
    },
    topLevelDomain: country.tlds ?? [],
    cca2: codes.alpha_2 ?? '',
    alpha2Code: codes.alpha_2 ?? '',
    cca3: codes.alpha_3 ?? '',
    alpha3Code: codes.alpha_3 ?? '',
    cioc: codes.cioc ?? '',
    fifa: codes.fifa ?? '',
    independent:
      typeof classification.sovereign === 'boolean'
        ? classification.sovereign
        : !classification.dependency,
    status: classification.iso_status ?? '',
    unMember: classification.un_member ?? false,
    idd: { root: callingCodes[0] ?? '', suffixes: [] },
    capital: (country.capitals ?? []).map((capital) =>
      typeof capital === 'string' ? capital : capital.name,
    ),
    continent: country.continents?.[0] ?? '',
    latlng: [country.coordinates?.lat, country.coordinates?.lng],
    area:
      typeof country.area === 'number'
        ? country.area
        : (country.area?.kilometers ?? 0),
    demonym: country.demonyms?.eng?.m ?? country.demonyms?.eng?.f ?? '',
    flag: flag.emoji ?? '',
    flags: { svg: flag.url_svg || '', png: flag.url_png || '' },
    car: {
      side: country.cars?.driving_side ?? '',
      signs: country.cars?.signs ?? [],
    },
    startOfWeek: country.date?.start_of_week ?? '',
    altSpellings: names.alternates ?? [],
    translations: {
      ...names.translations,
      ...(spanishTranslation ? { esp: spanishTranslation } : {}),
    },
    maps: { googleMaps: country.links?.google_maps ?? '' },
    currencies: Object.fromEntries(
      (country.currencies ?? []).map((currency) => [currency.code, currency]),
    ),
    languages: Object.fromEntries(
      (country.languages ?? []).map((language) => [
        language.iso639_3 || language.bcp47,
        language.name,
      ]),
    ),
    gini,
  }
}

function getCountryObjects(body) {
  const objects = body?.data?.objects
  if (!Array.isArray(objects)) {
    throw new Error('REST Countries returned an unexpected country response.')
  }
  return objects
}

export function createProxyServer({
  apiUrl = process.env.REST_COUNTRIES_API_URL || process.env.VITE_API_URL || DEFAULT_API_URL,
  apiKey = process.env.REST_COUNTRIES_API_KEY || process.env.VITE_API_KEY || '',
  fetchImpl = fetch,
} = {}) {
  const apiBase = normalizeApiUrl(apiUrl)
  const basePath = apiBase.pathname.replace(/\/+$/, '')

  async function fetchCountries(path, params = {}) {
    const upstreamUrl = new URL(`${basePath}${path}`, apiBase.origin)
    for (const [name, value] of Object.entries(params)) {
      upstreamUrl.searchParams.set(name, value)
    }

    const headers = { accept: 'application/json' }
    if (apiKey) headers.authorization = apiKey

    const upstreamResponse = await fetchImpl(upstreamUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000),
    })
    const body = await upstreamResponse.json()

    return { upstreamResponse, body }
  }

  return http.createServer(async (request, response) => {
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET')
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }

    if (request.url === '/healthz') {
      sendJson(response, 200, { status: 'ok' })
      return
    }

    let requestUrl
    try {
      requestUrl = new URL(request.url ?? '/', 'http://localhost')
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL' })
      return
    }

    if (requestUrl.pathname.length > MAX_REQUEST_PATH_LENGTH) {
      sendJson(response, 414, { error: 'Request path is too long' })
      return
    }

    if (!requestUrl.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'Not found' })
      return
    }

    const apiPath = requestUrl.pathname.slice('/api'.length)
    const isAllCountries = apiPath === '/all'
    const countryMatch = apiPath.match(/^\/(name|alpha)\/([^/]+)$/)
    if (!isAllCountries && !countryMatch) {
      sendJson(response, 404, { error: 'Not found' })
      return
    }

    try {
      let countries = []

      if (isAllCountries) {
        let offset = 0

        for (let page = 0; page < MAX_COUNTRY_PAGES; page += 1) {
          const { upstreamResponse, body } = await fetchCountries('', {
            limit: String(PAGE_SIZE),
            offset: String(offset),
            response_fields: RESPONSE_FIELDS,
          })

          if (!upstreamResponse.ok) {
            sendJson(response, upstreamResponse.status, body)
            return
          }

          const objects = getCountryObjects(body)
          countries.push(...objects.map(normalizeCountry))

          const hasMore = body.data.meta?.more
          if (hasMore === false || objects.length === 0) break
          if (hasMore !== true && objects.length < PAGE_SIZE) break
          if (page === MAX_COUNTRY_PAGES - 1) {
            throw new Error('REST Countries exceeded the supported country page limit.')
          }
          offset += objects.length
        }

        sendJson(response, 200, { success: true, data: countries })
        return
      }

      let value
      try {
        value = decodeURIComponent(countryMatch[2])
      } catch {
        sendJson(response, 400, { error: 'Invalid country identifier' })
        return
      }

      let path
      const params = { response_fields: RESPONSE_FIELDS }
      if (countryMatch[1] === 'alpha') {
        path = `/codes.alpha_3/${encodeURIComponent(value)}`
      } else if (requestUrl.searchParams.get('fullText') === 'true') {
        path = `/names.common/${encodeURIComponent(value)}`
      } else {
        path = ''
        params.q = value
        params.limit = '25'
      }

      const { upstreamResponse, body } = await fetchCountries(path, params)
      if (!upstreamResponse.ok) {
        sendJson(response, upstreamResponse.status, body)
        return
      }

      countries = getCountryObjects(body).map(normalizeCountry)
      sendJson(response, 200, { success: true, data: countries })
    } catch (error) {
      console.error('REST Countries upstream request failed:', error)
      sendJson(response, 502, { error: 'Unable to retrieve country data from REST Countries' })
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10)
  const server = createProxyServer()
  server.listen(port, '0.0.0.0', () => {
    console.log(`REST Countries proxy listening on port ${port}`)
  })
}
