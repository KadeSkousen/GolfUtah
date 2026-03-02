// ForeUP Scraper
// ForeUP exposes an undocumented but publicly accessible JSON API.
// Their booking pages call it in the background — we call it directly.
//
// Endpoint: GET /index.php/api/booking/times
// Returns: array of tee time objects with time, price, availability

const axios = require('axios');

const FOREUP_BASE = 'https://foreupsoftware.com';

// ForeUP requires these headers to not block the request
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': `${FOREUP_BASE}/`,
};

/**
 * Fetch tee times from a ForeUP course
 * @param {object} course - course config from courses.js
 * @param {string} date - YYYY-MM-DD format
 * @param {number} players - number of players (1-4)
 * @param {number} holes - 9 or 18
 * @returns {array} normalized tee time objects
 */
async function fetchForeUpTimes(course, date, players = 2, holes = 18) {
  const params = new URLSearchParams({
    time: 'all',
    date,
    holes: String(holes),
    players: String(players),
    booking_class: '',
    schedule_id: course.foreupScheduleId,
    specials_only: '0',
    api_key: 'no_limits',   // ForeUP's public API key embedded in all their booking pages
  });

  // ForeUP requires schedule_ids[] as a separate param
  const url = `${FOREUP_BASE}/index.php/api/booking/times?${params}&schedule_ids[]=${course.foreupScheduleId}`;

  try {
    const response = await axios.get(url, {
      headers: {
        ...HEADERS,
        Referer: `${FOREUP_BASE}/index.php/booking/${course.foreupCourseId}/${course.foreupScheduleId}/`,
      },
      timeout: 10000,
    });

    const data = response.data;

    // ForeUP returns either an array directly or { data: [...] }
    const times = Array.isArray(data) ? data : (data.data || []);

    return times
      .filter(t => t.available_spots > 0 || t.spots_available > 0)
      .map(t => normalizeForeUpTime(t, course));

  } catch (err) {
    console.error(`[ForeUP] Error fetching ${course.name}:`, err.message);
    return [];
  }
}

/**
 * Normalize a ForeUP tee time to Golf Utah's standard format
 */
function normalizeForeUpTime(raw, course) {
  // ForeUP time format: "07:00:00" or "7:00 AM"
  const timeStr = raw.time || raw.teetime || '';
  const price = raw.green_fee || raw.price || raw.rate || 0;
  const spots = raw.available_spots || raw.spots_available || 0;

  return {
    courseId: course.id,
    courseName: course.name,
    city: course.city,
    region: course.region,
    time: parseTime(timeStr),           // normalized to "7:00 AM" format
    timeRaw: timeStr,
    price: normalizePrice(price),       // integer cents → display string like "$45"
    availableSpots: spots,
    bookingUrl: buildForeUpBookingUrl(course, raw),
    source: 'foreup',
  };
}

/**
 * Build direct booking URL for a specific ForeUP tee time
 */
function buildForeUpBookingUrl(course, raw) {
  // ForeUP booking pages accept date + time in URL hash for deep linking
  const base = `${FOREUP_BASE}/index.php/booking/${course.foreupCourseId}/${course.foreupScheduleId}/`;
  return base; // ForeUP doesn't support deep-linked time selection, so we link to the booking page
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseTime(raw) {
  if (!raw) return '';
  // Handle "07:00:00" format
  const match24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    let h = parseInt(match24[1]);
    const m = match24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }
  return raw; // already formatted
}

function normalizePrice(raw) {
  if (!raw) return null;
  const num = typeof raw === 'string' ? parseFloat(raw.replace(/[^0-9.]/g, '')) : raw;
  if (isNaN(num)) return null;
  // ForeUP stores prices in cents sometimes, dollars other times
  const dollars = num > 1000 ? num / 100 : num;
  return `$${Math.round(dollars)}`;
}

module.exports = { fetchForeUpTimes };
