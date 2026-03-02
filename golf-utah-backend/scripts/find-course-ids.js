// scripts/find-course-ids.js
// Run from inside golf-utah-backend folder: node scripts/find-course-ids.js
//
// Finds Chronogolf course UUIDs by scanning page source of each booking page.
// Add any course slug to COURSES below to find its UUIDs.

const { chromium } = require('playwright');

const COURSES = [
  { name: 'Old Mill',       slug: 'old-mill-slco' },
  { name: 'Soldier Hollow', slug: 'soldier-hollow-golf-club' },
  { name: 'Sky Mountain',   slug: 'sky-mountain-golf-course' },
  { name: 'Riverbend',      slug: 'riverbend-slco' },
];

// UUIDs belonging to Chronogolf's own analytics/cookie infrastructure — not course IDs
const KNOWN_NON_COURSE_UUIDS = [
  'aa692b4b-76a1-46d2-8fcb-72e730477115',
  '7f134db2-8ea7-4919-b245-533c04921ddc',
  '1b752747-577b-429a-a0e0-83861af69088',
  '019450bd-e936-7d6e-a45d-d2801addddbd',
];

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

async function findUuidsForCourse(browser, course) {
  const page = await browser.newPage();
  const networkUuids = [];

  // Method 1: intercept network requests
  page.on('request', r => {
    const url = decodeURIComponent(r.url());
    if (url.includes('/marketplace/v2/teetimes') || url.includes('course_ids=')) {
      const ids = url.match(UUID_REGEX) || [];
      networkUuids.push(...ids);
    }
  });

  await page.goto(`https://www.chronogolf.com/club/${course.slug}`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Method 2: scan page HTML source for UUIDs
  const html = await page.content();
  const pageUuids = [...new Set((html.match(UUID_REGEX) || []).map(id => id.toLowerCase()))]
    .filter(id => !KNOWN_NON_COURSE_UUIDS.includes(id));

  // Method 3: check window state objects
  const stateUuids = await page.evaluate((UUID_REGEX_STR) => {
    const regex = new RegExp(UUID_REGEX_STR, 'gi');
    const found = [];
    const stateKeys = ['__NUXT__', '__NEXT_DATA__', '__INITIAL_STATE__', '__APP_STATE__'];
    for (const key of stateKeys) {
      try {
        if (window[key]) {
          const str = JSON.stringify(window[key]);
          const matches = str.match(regex) || [];
          found.push(...matches);
        }
      } catch {}
    }
    return found;
  }, UUID_REGEX.source);

  await page.close();

  // Combine all methods, dedupe, filter out non-course IDs
  const allUuids = [...new Set([
    ...networkUuids.map(id => id.toLowerCase()),
    ...pageUuids,
    ...stateUuids.map(id => id.toLowerCase()),
  ])].filter(id => !KNOWN_NON_COURSE_UUIDS.includes(id));

  return { networkUuids, pageUuids, allUuids };
}

async function main() {
  console.log('🏌️  Golf Utah — Course UUID Finder');
  console.log('Scanning courses...\n');

  const browser = await chromium.launch({ headless: false });
  const results = [];

  for (const course of COURSES) {
    process.stdout.write(`Scanning ${course.name}...`);
    try {
      const { networkUuids, pageUuids, allUuids } = await findUuidsForCourse(browser, course);

      if (networkUuids.length > 0) {
        console.log(` ✅ Found via network: ${networkUuids.join(', ')}`);
      } else if (allUuids.length > 0) {
        console.log(` ⚠️  Found in page source (verify these): ${allUuids.slice(0, 5).join(', ')}`);
      } else {
        console.log(` ❌ Not found`);
      }

      results.push({ ...course, uuids: networkUuids.length > 0 ? networkUuids : allUuids });
    } catch (err) {
      console.log(` ❌ Error: ${err.message}`);
      results.push({ ...course, uuids: [] });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  await browser.close();

  console.log('\n\n━━━ PASTE THIS TO CLAUDE ━━━\n');
  results.forEach(r => {
    console.log(`${r.name}: ${r.uuids.length ? r.uuids.join(', ') : 'NOT FOUND'}`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
