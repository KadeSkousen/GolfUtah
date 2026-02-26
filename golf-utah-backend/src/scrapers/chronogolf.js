// Chronogolf Scraper
//
// Chronogolf's public booking widget (chronogolf.com/club/{slug}) loads
// tee times via a background API call. We intercept and call it directly.
//
// Two approaches here:
//   1. Direct API call (fast, works once we find the club ID)
//   2. Playwright fallback (for slugs where direct call doesn't work)
//
// Chronogolf API endpoint (reverse engineered from their booking widget):
//   GET https://www.chronogolf.com/marketplace/clubs/{clubId}/teetimes
//   Query params: date, nb_holes, nb_players, green_fee_type_ids[]

const axios = require('axios');

const CHRON_BASE = 'https://www.chronogolf.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.chronogolf.com',
  'Referer': 'https://www.chronogolf.com/',
};

// Known club IDs (reverse engineered from network requests on each course's booking page)
// To find a new one: open devtools → Network tab → filter "teetimes" → get the club ID from the URL
const KNOWN_CLUB_IDS = {
  'thanksgiving-point':         1234,   // TODO: replace with real ID — see README
  'sleepy-ridge':               1235,
  'soldier-hollow-golf-course': 1236,
  'wasatch-mountain-state-park':1237,
  'bonneville-golf-course':     1238,
  'rose-park-golf-course':      1239,
  'mountain-dell':              1240,
  'glendale-golf-course':       1241,
  'forest-dale-golf-course':    1242,
  'old-mill-golf-course':       1243,
  'meadow-brook-golf-course':   1244,
  'riverbend-golf-course':      1245,
  'sand-hollow-resort':         1246,
};
// NOTE: The IDs above are placeholders. See README.md for instructions on
// how to find the real club IDs in 2 minutes using browser dev tools.

/**
 * Fetch tee times from a Chronogolf course
 */
async function fetchChronogolfTimes(course, date, players = 2, holes = 18) {
  const clubId = KNOWN_CLUB_IDS[course.slug];

  if (!clubId) {
    console.warn(`[Chronogolf] No club ID for ${course.slug} — skipping`);
    return [];
  }

  // Format date as YYYY-MM-DD (Chronogolf expects this)
  const params = new URLSearchParams({
    date,
    nb_holes: String(holes),
    nb_players: String(players),
  });

  const url = `${CHRON_BASE}/marketplace/clubs/${clubId}/teetimes?${params}`;

  try {
    const response = await axios.get(url, {
      headers: {
        ...HEADERS,
        Referer: `${CHRON_BASE}/club/${course.slug}`,
      },
      timeout: 10000,
    });

    const data = response.data;

    // Chronogolf returns: { teetimes: [...] } or just [...]
    const times = data.teetimes || data.data || (Array.isArray(data) ? data : []);

    return times
      .filter(t => !t.is_booked && (t.available_spots > 0 || t.nb_spots_available > 0))
      .map(t => normalizeChronogolfTime(t, course));

  } catch (err) {
    // If direct API fails, return empty — Playwright fallback handles it
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.warn(`[Chronogolf] Auth required for ${course.name} — needs Playwright fallback`);
    } else {
      console.error(`[Chronogolf] Error fetching ${course.name}:`, err.message);
    }
    return [];
  }
}

/**
 * Playwright-based fallback for Chronogolf courses where direct API doesn't work.
 * Opens the booking page in a headless browser, intercepts the network call.
 */
async function fetchChronogolfWithPlaywright(course, date, players = 2, holes = 18) {
  let playwright, browser;
  try {
    playwright = require('playwright');
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: HEADERS['User-Agent'],
    });
    const page = await context.newPage();

    let teetimesData = null;

    // Intercept the background API call
    page.on('response', async (response) => {
      if (response.url().includes('/teetimes') && response.status() === 200) {
        try {
          teetimesData = await response.json();
        } catch {}
      }
    });

    // Navigate to booking page and set date/players
    const bookingUrl = `${CHRON_BASE}/club/${course.slug}`;
    await page.goto(bookingUrl, { waitUntil: 'networkidle', timeout: 20000 });

    // Wait for the tee times widget to load and trigger the API call
    // The widget loads when you interact with the date picker
    await page.waitForTimeout(3000);

    // If teetimes weren't captured yet, try clicking on the date picker
    if (!teetimesData) {
      // Try to find and interact with the date input to trigger a fresh fetch
      const datePicker = await page.$('[data-testid="date-picker"], input[type="date"], .date-picker');
      if (datePicker) {
        await datePicker.fill(date);
        await page.waitForTimeout(2000);
      }
    }

    await browser.close();

    if (!teetimesData) return [];

    const times = teetimesData.teetimes || teetimesData.data || (Array.isArray(teetimesData) ? teetimesData : []);
    return times
      .filter(t => !t.is_booked && (t.available_spots > 0 || t.nb_spots_available > 0))
      .map(t => normalizeChronogolfTime(t, course));

  } catch (err) {
    console.error(`[Chronogolf/Playwright] Error for ${course.name}:`, err.message);
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

/**
 * Normalize a Chronogolf tee time to Golf Utah's standard format
 */
function normalizeChronogolfTime(raw, course) {
  // Chronogolf format: start_time is "07:00:00" or ISO datetime
  const timeStr = raw.start_time || raw.time || '';
  const price = raw.green_fee || raw.price || raw.rate || 0;
  const spots = raw.available_spots || raw.nb_spots_available || 4;

  return {
    courseId: course.id,
    courseName: course.name,
    city: course.city,
    region: course.region,
    time: parseTime(timeStr),
    timeRaw: timeStr,
    price: normalizePrice(price),
    availableSpots: spots,
    bookingUrl: course.bookingUrl,
    source: 'chronogolf',
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseTime(raw) {
  if (!raw) return '';
  // Handle "07:00:00", "2026-03-01T07:00:00", "7:00 AM"
  const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    let h = parseInt(isoMatch[1]);
    const m = isoMatch[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }
  const match24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    let h = parseInt(match24[1]);
    const m = match24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }
  return raw;
}

function normalizePrice(raw) {
  if (!raw) return null;
  const num = typeof raw === 'string' ? parseFloat(raw.replace(/[^0-9.]/g, '')) : raw;
  if (isNaN(num)) return null;
  const dollars = num > 1000 ? num / 100 : num;
  return `$${Math.round(dollars)}`;
}

module.exports = { fetchChronogolfTimes, fetchChronogolfWithPlaywright };
