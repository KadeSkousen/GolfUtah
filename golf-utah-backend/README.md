# Golf Utah — Backend API

Tee time aggregation backend for the Golf Utah app. Scrapes live tee time 
data from Chronogolf and ForeUP booking pages and serves it through a 
unified REST API.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers (needed for Chronogolf scraping)
npx playwright install chromium

# Copy env file and fill in your values
cp .env.example .env

# Start the server
npm run dev
```

The server starts on port 3001. Test it:
```
http://localhost:3001/api/health
http://localhost:3001/api/courses
http://localhost:3001/api/tee-times?date=2026-03-15&players=2
```

---

## IMPORTANT: Finding Real Course IDs

The Chronogolf club IDs in `src/scrapers/chronogolf.js` are placeholders.
You need to find the real ones. Here's how — takes 2 minutes per course:

### Finding Chronogolf Club IDs

1. Open Chrome and go to a course's Chronogolf booking page:
   `https://www.chronogolf.com/club/thanksgiving-point`

2. Open DevTools (F12) → click the **Network** tab → filter by "teetimes"

3. Click on a date in the booking widget to trigger a time fetch

4. Look for a request to `/marketplace/clubs/{NUMBER}/teetimes`

5. That `{NUMBER}` is the club ID. Add it to `KNOWN_CLUB_IDS` in chronogolf.js

### Finding ForeUP Course IDs

Much easier — they're right in the URL:
`https://foreupsoftware.com/index.php/booking/19615/1935/`
                                                  ↑        ↑
                                            courseId   scheduleId

Add these to the course entry in `config/courses.js`.

---

## API Reference

### GET /api/tee-times

Search for available tee times.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| date | string | required | YYYY-MM-DD format |
| players | number | 2 | Number of players (1-4) |
| holes | number | 18 | Holes to play (9 or 18) |
| courses | string | all | Comma-separated course IDs |
| regions | string | all | Comma-separated region slugs |

**Example:**
```
GET /api/tee-times?date=2026-03-15&players=4&courses=thanksgiving-point,sleepy-ridge
```

**Response:**
```json
{
  "windows": [
    {
      "id": "morning",
      "label": "Morning",
      "start": 7,
      "end": 9,
      "courses": [
        {
          "courseId": "thanksgiving-point",
          "courseName": "Thanksgiving Point Golf Course",
          "city": "Lehi",
          "bookingUrl": "https://www.chronogolf.com/club/thanksgiving-point",
          "times": [
            { "time": "7:00 AM", "price": "$55", "availableSpots": 4 },
            { "time": "7:12 AM", "price": "$55", "availableSpots": 2 }
          ]
        }
      ]
    }
  ],
  "directLinks": [...],
  "meta": {
    "date": "2026-03-15",
    "totalTimes": 47,
    "totalCourses": 8,
    "fetchedAt": "2026-03-01T14:22:00Z"
  }
}
```

### GET /api/courses

List all courses.

### POST /api/alerts

Create an SMS alert.

**Body:**
```json
{
  "phone": "+18015551234",
  "courseIds": ["thanksgiving-point", "sleepy-ridge"],
  "dateFrom": "2026-04-01",
  "dateTo": "2026-04-30",
  "timeWindows": ["morning", "late-morning"],
  "minPlayers": 2,
  "maxPrice": 65
}
```

### GET /api/alerts?phone=+18015551234

Get all alerts for a phone number.

### DELETE /api/alerts/:id

Delete an alert.

### PATCH /api/alerts/:id

Toggle alert on/off: `{ "active": false }`

---

## Deploying to Render (Free)

1. Push this folder to a GitHub repo
2. Go to render.com → New → Web Service → connect your repo
3. Build command: `npm install && npx playwright install chromium`
4. Start command: `npm start`
5. Add environment variables from `.env.example`
6. Deploy — Render gives you a live URL like `https://golf-utah-api.onrender.com`

That URL is what you give to Lightspeed when you apply for partner API access
to prove you have a real running product.

---

## Adding a New Course

1. Find its booking URL
2. Determine which system it uses (chronogolf / foreup / custom)
3. Add an entry to `config/courses.js`
4. If Chronogolf: find the club ID using browser devtools (see above)
5. If ForeUP: grab courseId and scheduleId from the booking URL
6. Restart the server — the course is live immediately
