// ===== Course Data Store =====
// Each course: id, code, name, credits, type, school, gerCategory, description, sections[]
// Each section: id, name, faculty, schedule[] (day, startTime, endTime, room, dates?)
//   dates (optional): [{ from: 'MM-DD', to: 'MM-DD' }] for half-term / short courses.
//   A slot without `dates` runs for the whole term.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00'
];

const COURSE_TYPES = {
  major_elective: { label: 'Major Elective', color: 'major' },
  ger: { label: 'GER', color: 'ger' },
  other: { label: 'Other', color: 'other' }
};

const SCHOOLS = ['AMSOM', 'SAS', 'SEAS'];

// ===== Major Elective course names (from university list) =====
const MAJOR_ELECTIVE_NAMES = [
  'advanced computer arithmetic: algorithms and subsystems',
  'artificial intelligence',
  'big data analytics',
  'cloud computing',
  'computer vision',
  'human computer interactions',
  'integrated circuit devices and fabrication technology',
  'internet of things',
  'introduction to blockchain technologies, applications and research',
  'introduction to blockchain technologies applications and research',
  'parallel and distributed systems',
  'probabilistic graphical models',
  'social network analysis',
  'vlsi design',
  'wireless communication'
];

function isMajorElective(courseName) {
  const lower = (courseName || '').toLowerCase().trim();
  return MAJOR_ELECTIVE_NAMES.some(me => lower.includes(me) || me.includes(lower));
}

// School deduction from course code prefix
function guessSchoolFromCode(code) {
  const prefix = code.replace(/[0-9].*$/, '').toUpperCase();
  const amsom = ['COM', 'ECO', 'FAC', 'MGT', 'MKT', 'TOD', 'QDS', 'IBP', 'ENT', 'BBA', 'MBA'];
  const seas = ['CSE', 'ENR', 'MAT', 'CSC', 'MEC', 'CHE', 'BTE', 'DES', 'ELE', 'ICT', 'CE', 'ME'];
  const sas = ['BIO', 'PHY', 'CHM', 'PSY', 'HST', 'SPS', 'PHI', 'LIT', 'VAD', 'MUS', 'JAP', 'FRE', 'SAN', 'ENV', 'EPP', 'SOC', 'POL', 'ENG', 'HIN', 'GUJ', 'STA', 'MA'];

  if (amsom.includes(prefix)) return 'AMSOM';
  if (seas.includes(prefix)) return 'SEAS';
  if (sas.includes(prefix)) return 'SAS';
  return null; // Will be overridden by user's school selection
}

// Helper to get unique GER categories from loaded courses
function getUniqueGERCategories() {
  const cats = new Set();
  ALL_COURSES.forEach(c => {
    if (c.gerCategory && c.gerCategory.toLowerCase() !== 'not applicable' && c.gerCategory.toLowerCase() !== 'na' && c.gerCategory.toLowerCase() !== 'none' && c.gerCategory.trim() !== '') {
      cats.add(c.gerCategory.trim());
    }
  });
  return Array.from(cats).sort();
}

// Helper to get unique credit values
function getUniqueCredits() {
  const creds = new Set();
  ALL_COURSES.forEach(c => creds.add(c.credits));
  return Array.from(creds).sort((a, b) => a - b);
}

// No mock data — start empty, user imports from AURIS Excel/CSV
let ALL_COURSES = [];

// ===== Import/Export Functions =====

function exportCoursesToJSON() {
  const blob = new Blob([JSON.stringify(ALL_COURSES, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'au_courses.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importCoursesFromJSON(jsonData) {
  try {
    const courses = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    if (!Array.isArray(courses)) throw new Error('Data must be an array of courses');
    courses.forEach((c, i) => {
      if (!c.code || !c.name || !c.sections) {
        throw new Error(`Course at index ${i} missing required fields (code, name, sections)`);
      }
      c.id = c.id || `imported_${i}`;
      c.credits = c.credits || 3;
      c.school = c.school || guessSchoolFromCode(c.code) || 'Other';
      c.description = c.description || '';
      c.gerCategory = c.gerCategory || '';
      // Determine type
      if (c.type === 'ger') { /* keep */ }
      else if (isMajorElective(c.name)) { c.type = 'major_elective'; }
      else { c.type = c.type || 'other'; }
      c.sections.forEach((s, j) => {
        s.id = s.id || `imported_${i}_s${j}`;
        s.name = s.name || `Section ${String.fromCharCode(65 + j)}`;
        s.faculty = s.faculty || 'TBA';
        if (!s.schedule || !Array.isArray(s.schedule)) {
          throw new Error(`Section ${s.name} in ${c.code} missing schedule`);
        }
      });
    });
    ALL_COURSES = courses;
    return { success: true, count: courses.length, total: courses.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// =================================================================
// AURIS schedule parsing
// =================================================================
// AURIS has changed how it writes class timings more than once, so the
// parser accepts every format seen so far instead of one exact pattern:
//
//   AURIS (old):   "Section 1 Mon [08:00 to 09:30] Wed [08:00 to 09:30]"
//   AURIS2 (new):  "Section 1: Mon, Wed 08:00-09:30
//                   Section 2: Tue 16:00-17:30 (4 Jan – 19 Feb); Fri 11:00-12:30"
//
// It also copes with full day names (Monday), 12-hour times (2:30 PM),
// "to" / "-" / "–" between times, and dates written as "4 Jan", "Jan 4",
// "04/01/2027" or "2027-01-04".

const DAY_NAMES = {
  mon: 'Mon', monday: 'Mon',
  tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
  fri: 'Fri', friday: 'Fri',
  sat: 'Sat', saturday: 'Sat',
  sun: 'Sun', sunday: 'Sun'
};
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_LONG = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Regex building blocks (non-capturing, so they can be combined freely)
const RANGE_SEP_SRC = '\\s*(?:-|–|—|\\bto\\b|\\btill\\b|\\buntil\\b)\\s*';
const MONTH_SRC = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const DATE_SRC =
  `(?:\\d{1,2}(?:st|nd|rd|th)?\\s*${MONTH_SRC}(?:,?\\s*\\d{4})?` +   // 4 Jan [2027]
  `|${MONTH_SRC}\\s*\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?` +       // Jan 4 [2027]
  `|\\d{4}-\\d{1,2}-\\d{1,2}` +                                         // 2027-01-04
  `|\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4})`;                                 // 04/01/2027
const TIME_SRC = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:[ap]\\.?\\s?m\\b\\.?)?';
const DAY_SRC = '\\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\b';

// One token per match: 1 = date range, 2 = time range, 3 = day, 4 = separator
const SCHEDULE_TOKEN_RE = new RegExp(
  `(${DATE_SRC}${RANGE_SEP_SRC}${DATE_SRC})` +
  `|(${TIME_SRC}${RANGE_SEP_SRC}${TIME_SRC})` +
  `|(${DAY_SRC})` +
  `|([;\\n|])`,
  'gi'
);
const DATE_RANGE_PARTS_RE = new RegExp(`^(${DATE_SRC})${RANGE_SEP_SRC}(${DATE_SRC})$`, 'i');
const TIME_RANGE_PARTS_RE = new RegExp(`^(${TIME_SRC})${RANGE_SEP_SRC}(${TIME_SRC})$`, 'i');
// "Section 1:", "Section A -", "Section" ... (label is optional)
const SECTION_MARK_RE = /\bsection(?![a-z])\s*[-#]?\s*(\d{1,3}[a-z]?(?![a-z])|[a-z](?![a-z]))?\s*[:.)\-–]?/gi;

function minutesToHHMM(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function parseClockTime(text) {
  const m = String(text).trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?\s?m\.?)?$/i);
  if (!m) return null;
  return {
    h: Number(m[1]),
    m: m[2] ? Number(m[2]) : 0,
    hasMinutes: Boolean(m[2]),
    meridiem: m[3] ? m[3].toLowerCase() : null,
    zeroPadded: m[1].length === 2 && m[1][0] === '0'
  };
}

// "08:00-09:30", "8:00 to 9:30", "2:30 PM - 4:00 PM", "11:00-12:30 pm" -> { startTime, endTime }
function parseTimeRange(text) {
  const parts = String(text).trim().match(TIME_RANGE_PARTS_RE);
  if (!parts) return null;
  const a = parseClockTime(parts[1]);
  const b = parseClockTime(parts[2]);
  if (!a || !b) return null;
  // A bare "4 - 19" is not a time: each side needs minutes or AM/PM
  if ((!a.hasMinutes && !a.meridiem) || (!b.hasMinutes && !b.meridiem)) return null;
  if (a.h > 23 || b.h > 23 || a.m > 59 || b.m > 59) return null;

  const toMinutes = (t, meridiem) => {
    let h = t.h;
    if (meridiem === 'p' && h < 12) h += 12;
    if (meridiem === 'a' && h === 12) h = 0;
    return h * 60 + t.m;
  };

  let end = toMinutes(b, b.meridiem);
  let start;
  if (a.meridiem) {
    start = toMinutes(a, a.meridiem);
  } else if (b.meridiem === 'p') {
    // "1:00 - 2:30 PM" is afternoon, "11:00 - 12:30 PM" starts in the morning
    const asPm = toMinutes(a, 'p');
    start = asPm < end ? asPm : toMinutes(a, null);
  } else {
    start = toMinutes(a, null);
  }

  if (!a.meridiem && !b.meridiem) {
    // 12-hour clock without AM/PM ("2:30-4:00"). Classes run between 8 AM
    // and 9 PM, so an un-padded hour from 1 to 6 must be in the afternoon.
    if (!a.zeroPadded && a.h >= 1 && a.h <= 6) start += 720;
    if (!b.zeroPadded && b.h >= 1 && b.h <= 6) end += 720;
  }
  if (end <= start && end < 720 && end + 720 > start) end += 720; // "11:00-1:00", "5:30-7:00"
  if (end <= start || end > 24 * 60) return null;

  return { startTime: minutesToHHMM(start), endTime: minutesToHHMM(end) };
}

function toMonthDay(monthIdx, day) {
  if (!(monthIdx >= 0 && monthIdx <= 11) || !(day >= 1 && day <= 31)) return null;
  return `${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthIndexFromName(name) {
  const lower = String(name).toLowerCase();
  return MONTH_NAMES.findIndex(m => lower.startsWith(m.toLowerCase()));
}

// "4 Jan", "Jan 4", "2027-01-04", "04/01/2027" (DD/MM) -> "01-04"
function parseMonthDay(text) {
  const s = String(text).trim();
  let m;
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*([a-z]+)/i))) return toMonthDay(monthIndexFromName(m[2]), Number(m[1]));
  if ((m = s.match(/^([a-z]+)\.?\s*(\d{1,2})/i))) return toMonthDay(monthIndexFromName(m[1]), Number(m[2]));
  if ((m = s.match(/^\d{4}-(\d{1,2})-(\d{1,2})/))) return toMonthDay(Number(m[1]) - 1, Number(m[2]));
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.]\d{2,4}/))) return toMonthDay(Number(m[2]) - 1, Number(m[1]));
  return null;
}

function parseDateRange(text) {
  const m = String(text).trim().match(DATE_RANGE_PARTS_RE);
  if (!m) return null;
  const from = parseMonthDay(m[1]);
  const to = parseMonthDay(m[2]);
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

// Merge identical day/time slots. A full-term meeting covers any date range,
// otherwise the date ranges are combined.
function mergeScheduleSlots(slots) {
  const byKey = new Map();
  slots.forEach(slot => {
    const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
    const existing = byKey.get(key);
    if (!existing) {
      const copy = { day: slot.day, startTime: slot.startTime, endTime: slot.endTime, room: slot.room || '' };
      if (Array.isArray(slot.dates) && slot.dates.length) copy.dates = slot.dates.map(r => ({ ...r }));
      byKey.set(key, copy);
      return;
    }
    if (!existing.dates || !Array.isArray(slot.dates) || !slot.dates.length) {
      delete existing.dates;
      return;
    }
    slot.dates.forEach(r => {
      if (!existing.dates.some(e => e.from === r.from && e.to === r.to)) existing.dates.push({ ...r });
    });
  });
  return Array.from(byKey.values())
    .map(s => {
      if (s.dates) s.dates.sort((x, y) => x.from.localeCompare(y.from));
      return s;
    })
    .sort((x, y) => DAY_ORDER.indexOf(x.day) - DAY_ORDER.indexOf(y.day) || x.startTime.localeCompare(y.startTime));
}

// Parse the timings of ONE section, e.g.
//   "Mon, Wed 08:00-09:30 (4 Jan – 19 Feb); Fri 11:00-12:30"
//   "Mon [08:00 to 09:30] Wed [08:00 to 09:30]"
function parseSlotsFromText(text) {
  const slots = [];
  let days = [];            // days waiting for their time
  let pendingTime = null;   // time written before its days ("08:00-09:30 Mon, Wed")
  let attachTo = null;      // slots a following date range belongs to
  let pendingDates = [];    // date range written before its days/time

  const emit = (time) => {
    const group = days.map(day => ({ day, startTime: time.startTime, endTime: time.endTime, room: '' }));
    if (pendingDates.length) {
      group.forEach(s => { s.dates = pendingDates.map(r => ({ ...r })); });
      pendingDates = [];
    }
    slots.push(...group);
    attachTo = group;
    days = [];
  };

  const re = new RegExp(SCHEDULE_TOKEN_RE.source, 'gi');
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const [, dateTok, timeTok, dayTok] = m;
    if (dateTok) {
      if (pendingTime && days.length) { emit(pendingTime); pendingTime = null; }
      const range = parseDateRange(dateTok);
      if (!range) continue;
      if (attachTo && attachTo.length) {
        attachTo.forEach(s => { s.dates = (s.dates || []).concat({ ...range }); });
      } else {
        pendingDates.push(range);
      }
    } else if (timeTok) {
      const time = parseTimeRange(timeTok);
      if (!time) continue;
      if (days.length && pendingTime) {
        emit(pendingTime);          // "08:00-09:30 Mon Wed 10:00-11:30 Fri"
        pendingTime = time;
      } else if (days.length) {
        emit(time);                 // "Mon, Wed 08:00-09:30"
      } else {
        pendingTime = time;         // time first, days come next
        attachTo = null;
      }
    } else if (dayTok) {
      const day = DAY_NAMES[dayTok.toLowerCase()];
      if (!day) continue;           // e.g. "Monsoon"
      if (!days.length) attachTo = null; // a new day group starts
      if (!days.includes(day)) days.push(day);
    } else {
      // separator (; newline |)
      if (pendingTime && days.length) emit(pendingTime);
      pendingTime = null;
      days = [];
      attachTo = null;
    }
  }
  if (pendingTime && days.length) emit(pendingTime);

  return mergeScheduleSlots(slots);
}

// Parse a whole AURIS "Schedule" cell into sections:
//   [{ name: 'Section 1', schedule: [slot, ...] }, ...]
// Returns [] when there are no sections at all (empty / "TBA").
function parseScheduleText(text) {
  const raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim();
  if (!raw) return [];

  const marks = Array.from(raw.matchAll(new RegExp(SECTION_MARK_RE.source, 'gi')));
  const chunks = [];
  if (marks.length === 0) {
    chunks.push({ label: null, text: raw });
  } else {
    const before = raw.slice(0, marks[0].index);
    if (before.trim()) chunks.push({ label: null, text: before });
    marks.forEach((mark, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index : raw.length;
      chunks.push({
        label: mark[1] ? mark[1].toUpperCase() : null,
        text: raw.slice(mark.index + mark[0].length, end)
      });
    });
  }

  const sections = [];
  const byLabel = {};
  chunks.forEach(chunk => {
    const slots = parseSlotsFromText(chunk.text);
    if (chunk.label === null && slots.length === 0 && marks.length > 0) return; // stray text
    if (chunk.label !== null && byLabel[chunk.label]) {
      // Same section listed twice: combine its timings
      byLabel[chunk.label].schedule = mergeScheduleSlots(byLabel[chunk.label].schedule.concat(slots));
      return;
    }
    const section = { label: chunk.label, schedule: slots };
    if (chunk.label !== null) byLabel[chunk.label] = section;
    sections.push(section);
  });

  if (sections.length === 1 && sections[0].label === null && sections[0].schedule.length === 0) return [];
  return sections.map((s, i) => ({ name: `Section ${s.label || i + 1}`, schedule: s.schedule }));
}

// ===== Display helpers for date-limited slots =====
function formatMonthDay(md) {
  const [mm, dd] = String(md).split('-').map(Number);
  return MONTH_NAMES[mm - 1] ? `${dd} ${MONTH_NAMES[mm - 1]}` : String(md);
}

// '' for full-term slots, otherwise e.g. "4 Jan – 19 Feb"
function formatSlotDates(slot) {
  if (!slot || !Array.isArray(slot.dates) || slot.dates.length === 0) return '';
  return slot.dates.map(r => `${formatMonthDay(r.from)} – ${formatMonthDay(r.to)}`).join(', ');
}

// =================================================================
// Reading the AURIS workbook
// =================================================================
const SCHEDULE_HEADERS = ['schedule', 'class schedule', 'schedule details', 'timings', 'timing', 'class timings', 'timetable', 'time table'];

function normalizeHeader(h) {
  return String(h == null ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase();
}

function cellText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeRowKeys(row) {
  const out = {};
  Object.keys(row || {}).forEach(k => {
    const key = normalizeHeader(k);
    if (key && !(key in out)) out[key] = row[k];
  });
  return out;
}

// First non-empty value among several possible column names
function pickField(row, ...names) {
  for (const name of names) {
    const v = row[normalizeHeader(name)];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

// "Section Timings" style sheet (one row per section, one column per weekday)
// -> one row per course with an AURIS-style Schedule text
function timingsRowsToDirectoryRows(rows) {
  const byCode = new Map();
  rows.forEach(row => {
    const code = cellText(pickField(row, 'Course Code'));
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, { row: { ...row }, lines: [] });

    // A day cell can hold several meetings: "10:00-11:00, 17:00-19:00 (4 Jan – 19 Feb)".
    // Put the weekday in front of every time range so each one is read.
    const parts = [];
    DAY_ORDER.forEach(day => {
      const cell = cellText(pickField(row, day, DAY_NAMES_LONG[day]));
      if (!cell) return;
      const tagged = cell.replace(
        new RegExp(`(${DATE_SRC}${RANGE_SEP_SRC}${DATE_SRC})|(${TIME_SRC}${RANGE_SEP_SRC}${TIME_SRC})`, 'gi'),
        (match, dateRange, timeRange) => (timeRange ? `${day} ${timeRange}` : match)
      );
      parts.push(tagged.replace(/[;\n]+/g, ', '));
    });
    let line = parts.join('; ');
    if (!line) line = cellText(pickField(row, 'Timing Summary', 'Timings', 'Schedule'));

    const section = cellText(pickField(row, 'Section'));
    const hasLabel = section && !/^(tba|tbd|-)$/i.test(section);
    byCode.get(code).lines.push(hasLabel ? `Section ${section}: ${line || 'TBA'}` : (line || 'TBA'));
  });

  return Array.from(byCode.values()).map(({ row, lines }) => {
    row.schedule = lines.join('\n');
    return row;
  });
}

// Find the sheet + header row that holds the course list. AURIS exports are
// not always laid out the same way (extra sheets, title rows above the
// header), so we look for the "Course Code" header instead of assuming row 1
// of the first sheet.
function readCourseRowsFromWorkbook(workbook) {
  let best = null;
  workbook.SheetNames.forEach(sheetName => {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });
    const headerIdx = grid.slice(0, 25).findIndex(r => Array.isArray(r) && r.some(c => normalizeHeader(c) === 'course code'));
    if (headerIdx < 0) return;

    const headers = grid[headerIdx].map(normalizeHeader);
    const has = name => headers.includes(name);
    let kind = 'plain';
    if (SCHEDULE_HEADERS.some(has)) kind = 'directory';
    else if (has('section') && DAY_ORDER.some(d => has(d.toLowerCase()) || has(DAY_NAMES_LONG[d].toLowerCase()))) kind = 'timings';
    const rank = { directory: 3, timings: 2, plain: 1 }[kind];
    if (best && best.rank >= rank) return;

    const rows = grid.slice(headerIdx + 1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h && !(h in obj)) obj[h] = r[i]; });
      return obj;
    });
    best = { rank, kind, sheetName, rows };
  });

  if (!best) {
    // Fall back to the old behaviour: first sheet, first row is the header
    const first = workbook.SheetNames[0];
    if (!first) return { kind: null, sheetName: null, rows: [] };
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: '', raw: false }).map(normalizeRowKeys);
    return { kind: 'plain', sheetName: first, rows };
  }
  if (best.kind === 'timings') best.rows = timingsRowsToDirectoryRows(best.rows);
  return { kind: best.kind, sheetName: best.sheetName, rows: best.rows };
}

// ===== Import from AURIS Excel/CSV Export =====
// rows: objects keyed by column header (any capitalisation)
// schoolOverride: school picked in the import dialog (AMSOM, SAS, SEAS) or null
//   for auto-detect. It is used for rows without a "School" column value.
function importCoursesFromExcel(rows, schoolOverride) {
  try {
    let addedCount = 0;
    let importedCount = 0;
    let sectionCount = 0;
    let timedSectionCount = 0;
    let unreadable = [];

    rows.forEach(rawRow => {
      const row = normalizeRowKeys(rawRow);
      const rawCode = cellText(pickField(row, 'Course Code', 'Code'));
      const name = cellText(pickField(row, 'Course Name', 'Course Title', 'Title'));
      if (!rawCode || !name) return;

      // 1. Course Code (e.g. "FAC121[Undergraduate]" -> "FAC121")
      const compactCode = rawCode.toUpperCase().replace(/\s+/g, '');
      const codeMatch = compactCode.match(/^([A-Z0-9]+)/);
      const code = codeMatch ? codeMatch[1] : compactCode;

      // 2. Credits, Faculty, Description
      const parsedCredits = parseFloat(cellText(pickField(row, 'Credits', 'Credit')));
      const credits = Number.isFinite(parsedCredits) ? parsedCredits : 3;
      const description = cellText(pickField(row, 'Course Description', 'Description'));

      // Old exports glued names together ("Amrita BihaniJatin Christie");
      // only split them when the cell has no commas of its own.
      let faculty = cellText(pickField(row, 'Faculty', 'Faculty Name', 'Instructor')) || 'TBA';
      if (!faculty.includes(',')) faculty = faculty.replace(/([a-z])([A-Z])/g, '$1, $2');
      faculty = faculty.replace(/\s{2,}/g, ' ').trim();

      // 3. GER Category & Type ("GER Category" in old exports, "GER Categories" in AURIS2)
      const gerRaw = cellText(pickField(row, 'GER Categories', 'GER Category', 'GER'));
      const gerLower = gerRaw.toLowerCase();
      let type = 'other';
      if (gerLower && gerLower !== 'not applicable' && gerLower !== 'na' && gerLower !== 'none') {
        type = 'ger';
      } else if (isMajorElective(name)) {
        type = 'major_elective';
      }

      // 4. School — the file's own School column wins, then the dialog choice, then a guess
      const school = cellText(pickField(row, 'School', 'School Name')) || schoolOverride || guessSchoolFromCode(code) || 'Other';

      // 5. Schedule — every section with its timings
      const schedString = cellText(pickField(row, ...SCHEDULE_HEADERS));
      const stamp = Date.now();
      let sections = parseScheduleText(schedString).map((s, idx) => ({
        id: `s_${code}_${idx + 1}_${stamp}`,
        name: s.name,
        schedule: s.schedule
      }));
      if (sections.length === 0) {
        sections = [{ id: `s_${code}_1_${stamp}`, name: 'Section 1', schedule: [] }];
      }

      sectionCount += sections.length;
      timedSectionCount += sections.filter(s => s.schedule.length > 0).length;
      const looksLikeTimings = /\d{1,2}[:.]\d{2}/.test(schedString);
      if (looksLikeTimings && sections.every(s => s.schedule.length === 0)) unreadable.push(code);

      const newCourse = {
        id: `c_${code}_${stamp}`,
        code: code,
        name: name,
        credits: credits,
        type: type,
        school: school,
        gerCategory: gerRaw,
        faculty: faculty,
        description: description,
        sections: sections
      };

      // Merge — avoid duplicates by code
      importedCount++;
      const existsIndex = ALL_COURSES.findIndex(c => c.code === newCourse.code);
      if (existsIndex >= 0) {
        ALL_COURSES[existsIndex] = newCourse;
      } else {
        ALL_COURSES.push(newCourse);
        addedCount++;
      }
    });

    return {
      success: true,
      count: addedCount,
      imported: importedCount,
      total: ALL_COURSES.length,
      sections: sectionCount,
      timedSections: timedSectionCount,
      unreadable: unreadable
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getUniqueSchools() {
  const schools = new Set();
  ALL_COURSES.forEach(c => schools.add(c.school));
  return Array.from(schools).sort();
}
