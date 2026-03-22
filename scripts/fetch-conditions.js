/**
 * GCSurf Cron Worker
 * Runs every 15 minutes to fetch live conditions data and store in KV.
 *
 * Deploy as a separate Worker with a cron trigger:
 *   npx wrangler deploy scripts/fetch-conditions.js --name gcsurf-cron
 *
 * Data sources:
 *   1. QLD Gov wave buoy CSV (swell, SST)
 *   2. BOM Gold Coast Seaway JSON (wind, air temp)
 *   3. BOM getNextTides JSON (tide predictions)
 */

const WAVE_CSV_URL = 'https://apps.des.qld.gov.au/data-sets/waves/wave-7dayopdata.csv';
const BOM_WEATHER_URL = 'http://www.bom.gov.au/fwo/IDQ60801/IDQ60801.94580.json';
const BOM_TIDES_URL = 'http://www.bom.gov.au/australia/tides/scripts/getNextTides.php?aac=QLD_TP011&offset=false&tz=Australia/Brisbane';

// ── Wave buoy data ──────────────────────────────────────────────

async function fetchWaveData() {
  try {
    const res = await fetch(WAVE_CSV_URL);
    if (!res.ok) throw new Error(`Wave CSV HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    // Find the most recent Gold Coast reading
    // The CSV has multiple sites; we want rows where Site matches Gold Coast
    const siteIdx = headers.indexOf('Site');
    const dateIdx = headers.indexOf('DateTime');
    const hsIdx = headers.indexOf('Hs');
    const hmaxIdx = headers.indexOf('Hmax');
    const tpIdx = headers.indexOf('Tp');
    const dirIdx = headers.findIndex(h => h.includes('Dir_Tp') || h.includes('Peak Direction'));
    const sstIdx = headers.indexOf('SST');

    let gcRows = [];
    for (let i = lines.length - 1; i >= 1; i--) {
      const cols = lines[i].split(',').map(c => c.trim());
      const site = cols[siteIdx] || '';
      if (site.toLowerCase().includes('gold coast')) {
        gcRows.push(cols);
        if (gcRows.length >= 3) break; // last 3 readings
      }
    }

    if (gcRows.length === 0) {
      // Try Tweed Heads as fallback
      for (let i = lines.length - 1; i >= 1; i--) {
        const cols = lines[i].split(',').map(c => c.trim());
        const site = cols[siteIdx] || '';
        if (site.toLowerCase().includes('tweed')) {
          gcRows.push(cols);
          if (gcRows.length >= 1) break;
        }
      }
    }

    if (gcRows.length === 0) return null;

    const latest = gcRows[0];
    const hs = parseFloat(latest[hsIdx]);
    const hmax = parseFloat(latest[hmaxIdx]);
    const tp = parseFloat(latest[tpIdx]);
    const direction = parseFloat(latest[dirIdx]);
    const sst = parseFloat(latest[sstIdx]);
    const dateTime = latest[dateIdx];

    return {
      source: 'qld_gov_wave_buoy',
      dateTime,
      hs: isNaN(hs) || hs < 0 ? null : hs,
      hmax: isNaN(hmax) || hmax < 0 ? null : hmax,
      tp: isNaN(tp) || tp < 0 ? null : tp,
      direction: isNaN(direction) || direction < 0 ? null : direction,
      sst: isNaN(sst) || sst < 0 ? null : sst,
    };
  } catch (err) {
    console.error('Wave data fetch failed:', err.message);
    return null;
  }
}

// ── BOM weather station ─────────────────────────────────────────

async function fetchWeatherData() {
  try {
    const res = await fetch(BOM_WEATHER_URL);
    if (!res.ok) throw new Error(`BOM weather HTTP ${res.status}`);
    const json = await res.json();

    const observations = json?.observations?.data;
    if (!observations || observations.length === 0) return null;

    // Most recent observation is first in array
    const latest = observations[0];

    return {
      source: 'bom_gold_coast_seaway',
      dateTime: latest.local_date_time_full,
      windSpeedKmh: latest.wind_spd_kmh,
      windSpeedKt: latest.wind_spd_kt,
      windDir: latest.wind_dir,
      gustKmh: latest.gust_kmh,
      gustKt: latest.gust_kt,
      airTemp: latest.air_temp,
      apparentTemp: latest.apparent_t,
      humidity: latest.rel_hum,
      pressure: latest.press,
      cloud: latest.cloud,
    };
  } catch (err) {
    console.error('Weather data fetch failed:', err.message);
    return null;
  }
}

// ── BOM tide predictions ────────────────────────────────────────

async function fetchTideData() {
  try {
    const res = await fetch(BOM_TIDES_URL);
    if (!res.ok) throw new Error(`BOM tides HTTP ${res.status}`);
    const json = await res.json();

    const results = json?.results;
    if (!results) return null;

    return {
      source: 'bom_tides_qld_tp011',
      currentTime: results.current_time,
      nextHigh: results.next_high ? {
        time: results.next_high.time,
        height: results.next_high.height,
      } : null,
      nextLow: results.next_low ? {
        time: results.next_low.time,
        height: results.next_low.height,
      } : null,
    };
  } catch (err) {
    console.error('Tide data fetch failed:', err.message);
    return null;
  }
}

// ── Wind analysis helpers ───────────────────────────────────────

function classifyWind(windDir) {
  // Gold Coast beaches generally face E.
  // Offshore = W, SW, NW. Onshore = E, NE, SE. Cross = N, S.
  const offshore = ['W', 'WSW', 'WNW', 'SW'];
  const onshore = ['E', 'ENE', 'ESE', 'NE', 'SE'];
  const cross = ['N', 'NNE', 'NNW', 'S', 'SSE', 'SSW'];

  if (offshore.includes(windDir)) return 'offshore';
  if (onshore.includes(windDir)) return 'onshore';
  if (cross.includes(windDir)) return 'cross-shore';
  return 'variable';
}

function directionToCardinal(degrees) {
  if (degrees === null || degrees === undefined) return null;
  const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                     'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(degrees / 22.5) % 16;
  return cardinals[idx];
}

// ── Main handler ────────────────────────────────────────────────

async function fetchAllConditions() {
  const [wave, weather, tides] = await Promise.all([
    fetchWaveData(),
    fetchWeatherData(),
    fetchTideData(),
  ]);

  const windType = weather?.windDir ? classifyWind(weather.windDir) : null;
  const swellCardinal = wave?.direction ? directionToCardinal(wave.direction) : null;

  return {
    fetchedAt: new Date().toISOString(),
    wave,
    weather: weather ? { ...weather, windType } : null,
    tides,
    swell: wave ? {
      summary: `${wave.hs?.toFixed(1) ?? '?'}m @ ${wave.tp?.toFixed(0) ?? '?'}s`,
      directionCardinal: swellCardinal,
      directionDegrees: wave.direction,
    } : null,
  };
}

// ── Worker exports ──────────────────────────────────────────────

export default {
  // Cron trigger handler
  async scheduled(event, env, ctx) {
    const data = await fetchAllConditions();
    await env.SURF_DATA.put('conditions', JSON.stringify(data), {
      expirationTtl: 3600, // expire after 1 hour if not refreshed
    });
    console.log(`Conditions updated at ${data.fetchedAt}`);
  },

  // Also allow manual trigger via HTTP (useful for testing)
  async fetch(request, env, ctx) {
    const data = await fetchAllConditions();
    await env.SURF_DATA.put('conditions', JSON.stringify(data), {
      expirationTtl: 3600,
    });
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
