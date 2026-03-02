// Golf Utah — SMS Alert Worker
//
// Runs every 10 minutes, checks all active alerts against live tee time data,
// and sends an SMS via Twilio when a match is found.
//
// Alert schema:
//   userId, phone, courseIds[], date or dateRange, timeWindows[],
//   minPlayers, maxPrice, active, lastTriggered

const cron = require('node-cron');
const twilio = require('twilio');
const { searchTeeTimes } = require('../scrapers/aggregator');

// In-memory alert store for now (replace with DB in production)
// Structure: Map<alertId, AlertObject>
const alerts = new Map();

let twilioClient = null;

function initTwilio() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[Alerts] Twilio credentials not set — SMS alerts disabled');
    return false;
  }
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('[Alerts] Twilio initialized, SMS alerts active');
  return true;
}

// ─── ALERT CRUD ───────────────────────────────────────────────────────────────

function createAlert(alertData) {
  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const alert = {
    id,
    ...alertData,
    active: true,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    triggerCount: 0,
  };
  alerts.set(id, alert);
  console.log(`[Alerts] Created alert ${id} for ${alertData.phone}`);
  return alert;
}

function getAlerts(phone) {
  return [...alerts.values()].filter(a => a.phone === phone);
}

function deleteAlert(id) {
  return alerts.delete(id);
}

function toggleAlert(id, active) {
  const alert = alerts.get(id);
  if (alert) {
    alert.active = active;
    return alert;
  }
  return null;
}

// ─── ALERT MATCHING ───────────────────────────────────────────────────────────

/**
 * Check a single alert against live tee time data
 * Returns array of matching tee times
 */
async function checkAlert(alert) {
  const matches = [];
  const dates = getDatesToCheck(alert);

  for (const date of dates) {
    const results = await searchTeeTimes({
      date,
      players: alert.minPlayers || 2,
      holes: alert.holes || 18,
      courseIds: alert.courseIds || [],
    });

    for (const window of (results.windows || [])) {
      // Check if this window matches the alert's time preferences
      if (alert.timeWindows && alert.timeWindows.length > 0) {
        if (!alert.timeWindows.includes(window.id)) continue;
      }

      for (const course of window.courses) {
        for (const time of course.times) {
          // Check price filter
          if (alert.maxPrice && time.price) {
            const priceNum = parseInt(time.price.replace(/[^0-9]/g, ''));
            if (priceNum > alert.maxPrice) continue;
          }

          matches.push({
            date,
            window: window.label,
            courseName: course.courseName,
            city: course.city,
            time: time.time,
            price: time.price,
            spots: time.availableSpots,
            bookingUrl: course.bookingUrl,
          });
        }
      }
    }
  }

  return matches;
}

function getDatesToCheck(alert) {
  const dates = [];
  if (alert.date) {
    // Single date alert
    dates.push(alert.date);
  } else if (alert.dateFrom && alert.dateTo) {
    // Date range alert
    const from = new Date(alert.dateFrom);
    const to = new Date(alert.dateTo);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (d >= today) {
        dates.push(d.toISOString().split('T')[0]);
      }
    }
  }
  return dates;
}

// ─── SMS SENDING ──────────────────────────────────────────────────────────────

async function sendAlertSMS(alert, matches) {
  if (!twilioClient) return;
  if (!matches.length) return;

  // Build a concise SMS (max ~160 chars per segment)
  const first = matches[0];
  const extra = matches.length > 1 ? ` (+${matches.length - 1} more)` : '';

  const message =
    `⛳ Golf Utah Alert!\n` +
    `${first.courseName} — ${first.date}\n` +
    `${first.time} | ${first.price || 'Price TBD'} | ${first.spots || '?'} spots${extra}\n` +
    `Book: ${first.bookingUrl}`;

  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: alert.phone,
    });
    console.log(`[Alerts] SMS sent to ${alert.phone} for alert ${alert.id}`);
  } catch (err) {
    console.error(`[Alerts] Failed to send SMS to ${alert.phone}:`, err.message);
  }
}

// ─── MAIN WORKER LOOP ─────────────────────────────────────────────────────────

async function runAlertCheck() {
  const activeAlerts = [...alerts.values()].filter(a => a.active);
  if (!activeAlerts.length) return;

  console.log(`[Alerts] Checking ${activeAlerts.length} active alerts...`);

  for (const alert of activeAlerts) {
    try {
      // Don't spam — require at least 30 min between triggers for same alert
      if (alert.lastTriggered) {
        const msSince = Date.now() - new Date(alert.lastTriggered).getTime();
        if (msSince < 30 * 60 * 1000) continue;
      }

      const matches = await checkAlert(alert);

      if (matches.length > 0) {
        await sendAlertSMS(alert, matches);
        alert.lastTriggered = new Date().toISOString();
        alert.triggerCount++;
      }
    } catch (err) {
      console.error(`[Alerts] Error checking alert ${alert.id}:`, err.message);
    }
  }
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

function startAlertWorker() {
  initTwilio();

  // Run every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    await runAlertCheck();
  });

  console.log('[Alerts] Worker started — checking every 10 minutes');
}

module.exports = {
  startAlertWorker,
  createAlert,
  getAlerts,
  deleteAlert,
  toggleAlert,
  runAlertCheck, // exported for manual triggering in routes
};
