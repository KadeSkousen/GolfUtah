const { fetchForeUpTimes } = require('../src/scrapers/foreup');
const { fetchChronogolfTimes } = require('../src/scrapers/chronogolf');
const { COURSES } = require('../config/courses');
function getDate(daysFromNow) {
  const d = new Date(); d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}
async function testCourse(course) {
  const dates = [getDate(3), getDate(7), getDate(10), getDate(14)];
  for (const date of dates) {
    try {
      let times;
      if (course.system === 'foreup') times = await fetchForeUpTimes(course, date, 2, 18);
      else if (course.system === 'chronogolf') times = await fetchChronogolfTimes(course, date, 2, 18);
      else return { course: course.name, status: 'skipped' };
      if (times.length > 0) return { course: course.name, status: 'ok', count: times.length, date, sample: times[0] };
    } catch (err) { return { course: course.name, status: 'error', error: err.message }; }
  }
  return { course: course.name, status: 'empty' };
}
async function main() {
  console.log('Golf Utah API Test — checking multiple dates\n');
  const scrapeable = COURSES.filter(c => c.system === 'foreup' || (c.system === 'chronogolf' && c.chronogolfCourseIds?.length > 0));
  console.log(`Testing ${scrapeable.length} courses...\n`);
  const results = await Promise.all(scrapeable.map(testCourse));
  let passed = 0, failed = 0, empty = 0;
  results.forEach(r => {
    if (r.status === 'error') { console.log(`❌ ${r.course}: ${r.error}`); failed++; }
    else if (r.status === 'empty') { console.log(`⚠️  ${r.course}: no availability found`); empty++; }
    else if (r.status === 'ok') { console.log(`✅ ${r.course}: ${r.count} times on ${r.date} — first: ${r.sample?.time} ${r.sample?.price || ''}`); passed++; }
  });
  console.log(`\nResults: ${passed} working, ${empty} no availability, ${failed} errors`);
}
main().catch(console.error);
