import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createProxyServer } from './server.js'

const API_KEY = 'test-secret-not-for-client'
let server
let baseUrl
let upstreamRequests

function apiCountry(common, alpha2, alpha3) {
  return {
    names: {
      common,
      official: `Republic of ${common}`,
      alternates: [`${common} alternate`],
      translations: {
        spa: { common: `${common} en español`, official: `${common} oficial` },
      },
    },
    codes: { alpha_2: alpha2, alpha_3: alpha3, cioc: alpha3, fifa: alpha3 },
    capitals: [{ name: `${common} City` }],
    continents: ['Test Continent'],
    region: 'Test Region',
    subregion: 'Test Subregion',
    area: { kilometers: 100, miles: 62.1 },
    population: 1000,
    coordinates: { lat: 1, lng: 2 },
    landlocked: false,
    borders: ['TST'],
    flag: { emoji: '🏳️', url_png: 'https://flags.example/test.png', url_svg: 'https://flags.example/test.svg' },
    tlds: ['.ts'],
    calling_codes: ['123'],
    cars: { driving_side: 'right', signs: ['TST'] },
    classification: { dependency: false, sovereign: true, iso_status: 'official', un_member: true },
    currencies: [{ code: 'TSC', name: 'Test coin', symbol: 'T$' }],
    languages: [{ iso639_3: 'tst', bcp47: 'ts', name: 'Testish' }],
    demonyms: { eng: { m: 'Testish', f: 'Testish' } },
    links: { google_maps: 'https://maps.example/test' },
    date: { start_of_week: 'monday' },
    economy: { gini_coefficient: { '2020': 20, '2022': 18 } },
  }
}

function responseWithCountries(objects, meta = {}) {
  return new Response(JSON.stringify({ data: { objects, meta } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function startProxy(options) {
  const proxy = createProxyServer(options)
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  return {
    proxy,
    url: `http://127.0.0.1:${proxy.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        proxy.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

before(async () => {
  upstreamRequests = []
  server = createProxyServer({
    apiUrl: 'https://api.restcountries.com/v3.1',
    apiKey: API_KEY,
    fetchImpl: async (url, options) => {
      upstreamRequests.push({ url: new URL(url), options })
      return responseWithCountries([apiCountry('Testland', 'TS', 'TST')])
    },
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('migrates v3.1 country lookups to v5 and normalizes the response', async () => {
  const response = await fetch(`${baseUrl}/api/name/Testland?fullText=true`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.success, true)
  assert.equal(body.data[0].name.common, 'Testland')
  assert.equal(body.data[0].name.official, 'Republic of Testland')
  assert.equal(body.data[0].cca3, 'TST')
  assert.deepEqual(body.data[0].capital, ['Testland City'])
  assert.deepEqual(body.data[0].currencies.TSC, { code: 'TSC', name: 'Test coin', symbol: 'T$' })
  assert.equal(body.data[0].languages.tst, 'Testish')
  assert.equal(body.data[0].gini, 18)
  assert.equal(body.data[0].translations.esp.common, 'Testland en español')

  const upstream = upstreamRequests[0]
  assert.equal(
    upstream.url.href.split('?')[0],
    'https://api.restcountries.com/countries/v5/names.common/Testland',
  )
  assert.equal(upstream.url.searchParams.get('response_fields'), 'names,codes,tlds,region,subregion,capitals,continents,area,population,coordinates,landlocked,borders,flag,currencies,languages,calling_codes,demonyms,classification,cars,timezones,links,date,economy')
  assert.equal(upstream.options.headers.authorization, API_KEY)
  assert.equal(upstream.options.headers['x-rapidapi-key'], undefined)
  assert.equal(JSON.stringify(body).includes(API_KEY), false)
})

test('loads every country in pages that fit the account limit', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    apiCountry(`Country ${index}`, `T${String(index).padStart(1, '0')}`, `TS${index}`),
  )
  const pageRequests = []
  const proxy = await startProxy({
    apiKey: API_KEY,
    fetchImpl: async (url) => {
      const requestUrl = new URL(url)
      pageRequests.push(requestUrl)
      const offset = Number(requestUrl.searchParams.get('offset'))
      return offset === 0
        ? responseWithCountries(firstPage, { more: true })
        : responseWithCountries([apiCountry('Lastland', 'LL', 'LST')], { more: false })
    },
  })

  try {
    const response = await fetch(`${proxy.url}/api/all?fields=name,cca3`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.data.length, 101)
    assert.equal(body.data[100].name.common, 'Lastland')
    assert.deepEqual(
      pageRequests.map((url) => url.searchParams.get('offset')),
      ['0', '100'],
    )
    assert.ok(pageRequests.every((url) => url.searchParams.get('limit') === '100'))
  } finally {
    await proxy.close()
  }
})

test('uses the v5 query endpoint for partial name searches', async () => {
  let upstreamUrl
  const proxy = await startProxy({
    fetchImpl: async (url) => {
      upstreamUrl = new URL(url)
      return responseWithCountries([apiCountry('Canada', 'CA', 'CAN')])
    },
  })

  try {
    const response = await fetch(`${proxy.url}/api/name/can?fullText=false`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.data[0].name.common, 'Canada')
    assert.equal(upstreamUrl.pathname, '/countries/v5')
    assert.equal(upstreamUrl.searchParams.get('q'), 'can')
    assert.equal(upstreamUrl.searchParams.get('limit'), '25')
  } finally {
    await proxy.close()
  }
})

test('uses the v5 ISO code endpoint for neighboring countries', async () => {
  let upstreamUrl
  const proxy = await startProxy({
    fetchImpl: async (url) => {
      upstreamUrl = new URL(url)
      return responseWithCountries([apiCountry('Testland', 'TS', 'TST')])
    },
  })

  try {
    const response = await fetch(`${proxy.url}/api/alpha/TST`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.data[0].alpha3Code, 'TST')
    assert.equal(upstreamUrl.pathname, '/countries/v5/codes.alpha_3/TST')
  } finally {
    await proxy.close()
  }
})

test('answers health checks without contacting upstream', async () => {
  upstreamRequests = []
  const response = await fetch(`${baseUrl}/healthz`)

  assert.equal(response.status, 200)
  assert.equal(await response.json().then((body) => body.status), 'ok')
  assert.equal(upstreamRequests.length, 0)
})

test('rejects unsupported methods without contacting upstream', async () => {
  upstreamRequests = []
  const response = await fetch(`${baseUrl}/api/all`, { method: 'POST' })

  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET')
  assert.equal(upstreamRequests.length, 0)
})

test('rejects paths outside the supported country endpoints', async () => {
  upstreamRequests = []
  const response = await fetch(`${baseUrl}/api/https://attacker.example/secret`)

  assert.equal(response.status, 404)
  assert.equal(upstreamRequests.length, 0)
})

test('rejects oversized request paths', async () => {
  upstreamRequests = []
  const response = await fetch(`${baseUrl}/api/name/${'a'.repeat(2050)}`)

  assert.equal(response.status, 414)
  assert.equal(upstreamRequests.length, 0)
})

test('preserves upstream errors without disclosing the API key', async () => {
  const proxy = await startProxy({
    apiKey: API_KEY,
    fetchImpl: async () =>
      new Response(JSON.stringify({ errors: [{ code: 'authKeyInvalid', message: 'Invalid key' }] }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
  })

  try {
    const response = await fetch(`${proxy.url}/api/all`)
    const body = await response.text()
    assert.equal(response.status, 401)
    assert.match(body, /Invalid key/)
    assert.equal(body.includes(API_KEY), false)
  } finally {
    await proxy.close()
  }
})

test('reports upstream transport failures without disclosing the API key', async () => {
  const proxy = await startProxy({
    apiKey: API_KEY,
    fetchImpl: async () => {
      throw new Error('upstream unavailable')
    },
  })

  try {
    const response = await fetch(`${proxy.url}/api/all`)
    const body = await response.text()
    assert.equal(response.status, 502)
    assert.equal(body.includes(API_KEY), false)
  } finally {
    await proxy.close()
  }
})
