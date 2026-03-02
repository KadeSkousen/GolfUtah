// Golf Utah — Tee Time Aggregator
// Takes a search request, fans out to all relevant scrapers in parallel,
// normalizes results, and returns them grouped by time window.

const { fetchForeUpTimes } = require('./foreup');
const { fetchChronogolfTimes } = require('./chronogolf');
const { COURSES } = require('../../config/courses');

// Time windows for the UI
const TIME_WINDOWS = [
  { id: 'early-bird',      label: 'Early Bird',      start: 5,  end: 7  },
  { id: 'morning',         label: 'Morning',          start: 7,  end: 9  },
  { id: 'late-morning',    label: 'Late Morning',     start: 9,  end: 11 },
  { id: 'midday',          label: 'Midday',           start: 11, end: 13 },
  { id: 'early-afternoon', label: 'Early Afternoon',  start: 13, end: 15 },
  { id: 'afternoon',       label: 'Afternoon',        start: 15, end: 20 },
];

/**
 * Main search function — call this from the API route
 *
 * @param {object} opts
 * @param {string} opts.date        - YYYY-MM-DD
 * @param {number} opts.players     - 1-4
 * @param {number} opts.holes       - 9 or 18
 * @param {string[]} opts.courseIds - array of course IDs to search (empty = all)
 * @param {string[]} opts.regions   - array of region slugs to filter by (optional)
 * @returns {object} results grouped by time window
 */
async function searchTeeTimes({ date, players = 2, holes = 18, courseIds = [], regions = [] }) {

  // Filter courses based on request
  let targetCourses = COURSES;

  if (courseIds.length > 0) {
    targetCourses = targetCourses.filter(c => courseIds.includes(c.id));
  }
  if (regions.length > 0) {
    targetCourses = targetCourses.filter(c => regions.includes(c.region));
  }

  // Fan out to all scrapers in parallel
  const results = await Promise.allSettled(
    targetCourses.map(course => fetchCourse(course, date, players, holes))
  );

  // Flatten all results into one array
  const allTimes = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // Group by time window
  return groupByTimeWindow(allTimes);
}

/**
 * Fetch tee times from a single course, routing to the right scraper
 */
async function fetchCourse(course, date, players, holes) {
  switch (course.system) {
    case 'foreup':
      return fetchForeUpTimes(course, date, players, holes);

    case 'chronogolf':
      return fetchChronogolfTimes(course, date, players, holes);

    case 'custom':
      // Custom courses don't scrape — they just show a "Book Direct" card
      return [{
        courseId: course.id,
        courseName: course.name,
        city: course.city,
        region: course.region,
        time: null,
        price: null,
        availableSpots: null,
        bookingUrl: course.bookingUrl,
        source: 'direct-link',
        isDirectLink: true,
      }];

    default:
      return [];
  }
}

/**
 * Group tee times into time windows for the UI
 */
function groupByTimeWindow(times) {
  const windows = TIME_WINDOWS.map(w => ({ ...w, courses: {} }));

  // Filter out direct-link courses (they get their own section)
  const realTimes = times.filter(t => !t.isDirectLink);
  const directLinks = times.filter(t => t.isDirectLink);

  for (const time of realTimes) {
    const hour = parseHour(time.time);
    if (hour === null) continue;

    const window = windows.find(w => hour >= w.start && hour < w.end);
    if (!window) continue;

    // Group by course within each window
    if (!window.courses[time.courseId]) {
      window.courses[time.courseId] = {
        courseId: time.courseId,
        courseName: time.courseName,
        city: time.city,
        region: time.region,
        bookingUrl: time.bookingUrl,
        times: [],
      };
    }
    window.courses[time.courseId].times.push({
      time: time.time,
      price: time.price,
      availableSpots: time.availableSpots,
    });
  }

  // Convert course objects to sorted arrays, remove empty windows
  const result = windows
    .map(w => ({
      ...w,
      courses: Object.values(w.courses).sort((a, b) => a.courseName.localeCompare(b.courseName)),
    }))
    .filter(w => w.courses.length > 0);

  return {
    windows: result,
    directLinks: directLinks.map(t => ({
      courseId: t.courseId,
      courseName: t.courseName,
      city: t.city,
      region: t.region,
      bookingUrl: t.bookingUrl,
    })),
    meta: {
      date,
      totalTimes: realTimes.length,
      totalCourses: new Set(realTimes.map(t => t.courseId)).size,
      fetchedAt: new Date().toISOString(),
    }
  };
}

function parseHour(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h;
}

module.exports = { searchTeeTimes, TIME_WINDOWS };
