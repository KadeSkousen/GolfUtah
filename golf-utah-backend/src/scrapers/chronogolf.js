// Chronogolf Scraper — v2 API (reverse engineered)
//
// Real API endpoint discovered:
//   GET https://www.chronogolf.com/marketplace/v2/teetimes
//   ?start_date=2026-03-15&course_ids=UUID1,UUID2&holes=9,18&page=1

const axios = require('axios');

const CHRON_BASE = 'https://www.chronogolf.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.chronogolf.com',
  'Referer': 'https://www.chronogolf.com/',
};

async function fetchChronogolfTimes(course, date, players = 2, holes = 18) {
  const courseIds = course.chronogolfCourseIds;

  if (!courseIds || courseIds.length === 0) {
    console.warn(`[Chronogolf] No course UUIDs for ${course.name} — skipping`);
    return [];
  }

  const params = new URLSearchParams({
    start_date: date,
    course_ids: courseIds.join(','),
    holes: '9,18',
    page: '1',
  });

  const url = `${CHRON_BASE}/marketplace/v2/teetimes?${params}`;

  try {
    const response = await axios.get(url, {
      headers: { ...HEADERS, Referer: `${CHRON_BASE}/club/${course.slug}` },
      timeout: 10000,
    });

    const data = response.data;
    const times = data.data || data.teetimes || (Array.isArray(data) ? data : []);

    return times
      .filter(t => {
        const spots = t.available_spots ?? t.nb_spots_available ?? t.spots ?? 4;
        return !t.is_booked && spots >= players;
      })
      .map(t => normalizeChronogolfTime(t, course));

  } catch (err) {
    console.error(`[Chronogolf] Error fetching ${course.name}:`, err.response?.status || err.message);
    return [];
  }
}

function normalizeChronogolfTime(raw, course) {
  const timeStr = raw.start_time || raw.time || raw.teetime_time || '';
  const price = raw.green_fee ?? raw.price ?? raw.rate ?? 0;
  const spots = raw.available_spots ?? raw.nb_spots_available ?? raw.spots ?? 4;

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

function parseTime(raw) {
  if (!raw) return '';
  const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    let h = parseInt(isoMatch[1]), m = isoMatch[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }
  const match24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    let h = parseInt(match24[1]), m = match24[2];
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

module.exports = { fetchChronogolfTimes };
