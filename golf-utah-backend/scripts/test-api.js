// scripts/test-api.js
// Tests live tee time scraping for all configured courses
// Run: npm run test-api

const { fetchForeupTimes } = require('../src/scrapers/foreup');
const { fetchChronogolfTimes } = require('../src/scrapers/chronogolf');
const { COURSES } = require('../config/courses');

const TEST_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 3); // 3 days from now
  return d.toISOString().split('T')[0];
})();

async function testCourse(course) {
  try {
    let times;
    if (course.system === 'foreup') {
      times = await fetchForeupTimes(course, TEST_DATE, 2, 18);
    } else if (course.system === 'chronogolf') {
      times = await fetchChronogolfTimes(course, TEST_DATE, 2, 18);
    } else {
      return { course: course.name, status: 'skipped', count: 0 };
    }
    return { course: course.name, status: 'ok', count: times.length, sample: times[0] };
  } catch (err) {
    return { course: course.name, status: 'error', error: err.message };
  }
}

async function main() {
  console.log(`🏌️  Golf Utah API Test — ${TEST_DATE}\n`);

  const scrapeable = COURSES.filter(c => c.system === 'foreup' ||
    (c.system === 'chronogolf' && c.chronogolfCourseIds?.length > 0));

  console.log(`Testing ${scrapeable.length} courses...\n`);

  const results = await Promise.all(scrapeable.map(testCourse));

  let passed = 0, failed = 0, empty = 0;

  results.forEach(r => {
    if (r.status === 'error') {
      console.log(`❌ ${r.course}: ${r.error}`);
      failed++;
    } else if (r.count === 0) {
      console.log(`⚠️  ${r.course}: 0 times (course may be closed or no availability)`);
      empty++;
    } else {
      console.log(`✅ ${r.course}: ${r.count} tee times — first: ${r.sample?.time} ${r.sample?.price || ''}`);
      passed++;
    }
  });

  console.log(`\nResults: ${passed} working, ${empty} empty, ${failed} errors`);
  console.log(`\nSkipped (no UUIDs yet): ${COURSES.filter(c => c.system === 'chronogolf' && !c.chronogolfCourseIds?.length).map(c => c.name).join(', ') || 'none'}`);
}

main().catch(console.error);
