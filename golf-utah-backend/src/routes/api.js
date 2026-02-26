// Golf Utah — API Routes

const express = require('express');
const router = express.Router();
const { searchTeeTimes } = require('../scrapers/aggregator');
const { COURSES, REGIONS } = require('../../config/courses');

// Simple in-memory cache — each unique search is cached for 8 minutes
// (In production, swap this for Redis)
const cache = new Map();
const CACHE_TTL_MS = 8 * 60 * 1000;

function cacheKey(params) {
  return `${params.date}|${params.players}|${params.holes}|${(params.courseIds || []).sort().join(',')}|${(params.regions || []).sort().join(',')}`;
}

// ─── GET /api/tee-times ────────────────────────────────────────────────────
// Search for available tee times
//
// Query params:
//   date       YYYY-MM-DD (required)
//   players    1-4 (default: 2)
//   holes      9 or 18 (default: 18)
//   courses    comma-separated course IDs (optional, default: all)
//   regions    comma-separated region slugs (optional)
//
// Response: { windows: [...], directLinks: [...], meta: {...} }

router.get('/tee-times', async (req, res) => {
  const { date, players, holes, courses, regions } = req.query;

  // Validate date
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required in YYYY-MM-DD format' });
  }

  // Don't allow past dates
  const today = new Date().toISOString().split('T')[0];
  if (date < today) {
    return res.status(400).json({ error: 'date cannot be in the past' });
  }

  const params = {
    date,
    players: Math.min(4, Math.max(1, parseInt(players) || 2)),
    holes: [9, 18].includes(parseInt(holes)) ? parseInt(holes) : 18,
    courseIds: courses ? courses.split(',').map(s => s.trim()).filter(Boolean) : [],
    regions: regions ? regions.split(',').map(s => s.trim()).filter(Boolean) : [],
  };

  // Check cache
  const key = cacheKey(params);
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return res.json({ ...cached.data, meta: { ...cached.data.meta, cached: true } });
  }

  try {
    const results = await searchTeeTimes(params);

    // Cache the result
    cache.set(key, { data: results, ts: Date.now() });

    // Clean up old cache entries
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache.entries()) {
        if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
      }
    }

    res.json(results);
  } catch (err) {
    console.error('[API] Search error:', err);
    res.status(500).json({ error: 'Failed to fetch tee times', message: err.message });
  }
});

// ─── GET /api/courses ──────────────────────────────────────────────────────
// List all courses with their metadata
// Optional: ?region=salt-lake

router.get('/courses', (req, res) => {
  const { region } = req.query;
  let courses = COURSES;
  if (region) {
    courses = courses.filter(c => c.region === region);
  }

  res.json({
    courses: courses.map(c => ({
      id: c.id,
      name: c.name,
      city: c.city,
      region: c.region,
      regionName: REGIONS[c.region] || c.region,
      system: c.system,
      bookingUrl: c.bookingUrl,
      lat: c.lat,
      lng: c.lng,
    })),
    regions: Object.entries(REGIONS).map(([id, name]) => ({ id, name })),
  });
});

// ─── GET /api/health ───────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    courses: COURSES.length,
    chronogolfCourses: COURSES.filter(c => c.system === 'chronogolf').length,
    foreupCourses: COURSES.filter(c => c.system === 'foreup').length,
    customCourses: COURSES.filter(c => c.system === 'custom').length,
    uptime: Math.round(process.uptime()),
  });
});

module.exports = router;
