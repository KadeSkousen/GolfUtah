// Golf Utah — Alert Routes

const express = require('express');
const router = express.Router();
const {
  createAlert,
  getAlerts,
  deleteAlert,
  toggleAlert,
  runAlertCheck,
} = require('../workers/alertWorker');

// ─── POST /api/alerts ──────────────────────────────────────────────────────
// Create a new tee time alert
//
// Body: {
//   phone: "+18015551234",           (required)
//   courseIds: ["thanksgiving-point", "sleepy-ridge"],
//   date: "2026-04-15",              (one of: date OR dateFrom+dateTo)
//   dateFrom: "2026-04-01",
//   dateTo: "2026-04-30",
//   timeWindows: ["morning", "late-morning"],
//   minPlayers: 2,
//   maxPrice: 65,                    (optional, in dollars)
//   holes: 18,
// }

router.post('/alerts', (req, res) => {
  const { phone, courseIds, date, dateFrom, dateTo, timeWindows, minPlayers, maxPrice, holes } = req.body;

  if (!phone || !/^\+?[1-9]\d{9,14}$/.test(phone.replace(/[\s\-\(\)]/g, ''))) {
    return res.status(400).json({ error: 'Valid phone number required (e.g. +18015551234)' });
  }

  if (!date && (!dateFrom || !dateTo)) {
    return res.status(400).json({ error: 'Provide either date or dateFrom + dateTo' });
  }

  if (!courseIds || !courseIds.length) {
    return res.status(400).json({ error: 'At least one courseId required' });
  }

  const alert = createAlert({
    phone: phone.replace(/[\s\-\(\)]/g, ''),
    courseIds,
    date: date || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    timeWindows: timeWindows || [],
    minPlayers: minPlayers || 2,
    maxPrice: maxPrice || null,
    holes: holes || 18,
  });

  res.status(201).json({ success: true, alert });
});

// ─── GET /api/alerts ───────────────────────────────────────────────────────
// Get all alerts for a phone number
router.get('/alerts', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  res.json({ alerts: getAlerts(phone) });
});

// ─── DELETE /api/alerts/:id ────────────────────────────────────────────────
router.delete('/alerts/:id', (req, res) => {
  const deleted = deleteAlert(req.params.id);
  res.json({ success: deleted });
});

// ─── PATCH /api/alerts/:id ─────────────────────────────────────────────────
// Toggle alert on/off
router.patch('/alerts/:id', (req, res) => {
  const { active } = req.body;
  const alert = toggleAlert(req.params.id, active);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json({ success: true, alert });
});

// ─── POST /api/alerts/check-now ───────────────────────────────────────────
// Manually trigger the alert worker (useful for testing)
router.post('/alerts/check-now', async (req, res) => {
  await runAlertCheck();
  res.json({ success: true, message: 'Alert check triggered' });
});

module.exports = router;
