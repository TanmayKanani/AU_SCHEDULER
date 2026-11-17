// ===== Course Data Store =====
// Each course: id, code, name, credits, type, school, gerCategory, description, sections[]
// Each section: id, name, faculty, schedule[] (day, startTime, endTime, room)

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

// ===== Import from AURIS Excel/CSV Export =====
// schoolOverride: user-selected school name (AMSOM, SAS, SEAS)
function importCoursesFromExcel(rows, schoolOverride) {
  try {
    let addedCount = 0;

    rows.forEach((row, i) => {
      if (!row['Course Code'] || !row['Course Name']) return;

      // 1. Course Code (e.g. "FAC121[Undergraduate]" -> "FAC121")
      let rawCode = row['Course Code'] || '';
      let codeMatch = rawCode.match(/^([A-Z0-9]+)/);
      let code = codeMatch ? codeMatch[1] : rawCode;

      // 2. Name, Credits, Faculty
      let name = row['Course Name'] || 'Unknown Course';
      let credits = parseFloat(row['Credits']) || 3;
      let rawFaculty = row['Faculty'] || 'TBA';
      let description = row['Course Description'] || '';

      // Fix faculty name: split concatenated names like "Amrita BihaniJatin Christie"
      // Insert comma+space before uppercase letter that follows a lowercase letter with no space
      let faculty = rawFaculty
        .replace(/([a-z])([A-Z])/g, '$1, $2')  // "BihaniJatin" → "Bihani, Jatin"
        .replace(/\s{2,}/g, ' ')                 // collapse multiple spaces
        .trim();

      // 3. GER Category & Type
      let gerRaw = (row['GER Category'] || '').trim();
      let gerLower = gerRaw.toLowerCase();
      let type = 'other'; // default
      if (gerLower && gerLower !== 'not applicable' && gerLower !== 'na' && gerLower !== 'none') {
        type = 'ger';
      } else if (isMajorElective(name)) {
        type = 'major_elective';
      }

      // 4. School — use override first, then guess from code
      let school = schoolOverride || guessSchoolFromCode(code) || 'Other';

      // 5. Parse Schedule — extract ALL sections, numbered sequentially
      let schedString = row['Schedule'] || '';
      let sections = [];
      let sectionCounter = 0;

      if (schedString.includes('Section')) {
        let parts = schedString.split(/Section\s+/i);
        for (let part of parts) {
          if (!part.trim()) continue;

          let scheduleSlots = [];
          let slotRegex = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*\[(\d{2}:\d{2})\s+to\s+(\d{2}:\d{2})\]/g;
          let slotMatch;
          while ((slotMatch = slotRegex.exec(part)) !== null) {
            scheduleSlots.push({
              day: slotMatch[1],
              startTime: slotMatch[2],
              endTime: slotMatch[3],
              room: ''
            });
          }

          // Remove duplicates
          scheduleSlots = scheduleSlots.filter((slot, index, self) =>
            index === self.findIndex((t) => (
              t.day === slot.day && t.startTime === slot.startTime && t.endTime === slot.endTime
            ))
          );

          sectionCounter++;
          sections.push({
            id: `s_${code}_${sectionCounter}_${Date.now()}`,
            name: `Section ${sectionCounter}`,
            schedule: scheduleSlots
          });
        }
      } else if (schedString.trim().length > 0) {
        let scheduleSlots = [];
        let slotRegex = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*\[(\d{2}:\d{2})\s+to\s+(\d{2}:\d{2})\]/g;
        let slotMatch;
        while ((slotMatch = slotRegex.exec(schedString)) !== null) {
          scheduleSlots.push({
            day: slotMatch[1],
            startTime: slotMatch[2],
            endTime: slotMatch[3],
            room: ''
          });
        }
        
        // Remove duplicates
        scheduleSlots = scheduleSlots.filter((slot, index, self) =>
          index === self.findIndex((t) => (
            t.day === slot.day && t.startTime === slot.startTime && t.endTime === slot.endTime
          ))
        );
        sections.push({
          id: `s_${code}_1_${Date.now()}`,
          name: 'Section 1',
          schedule: scheduleSlots
        });
      } else {
        sections.push({
          id: `s_${code}_1_${Date.now()}`,
          name: 'Section 1',
          schedule: []
        });
      }

      let newCourse = {
        id: `c_${code}_${Date.now()}`,
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
      const existsIndex = ALL_COURSES.findIndex(c => c.code === newCourse.code);
      if (existsIndex >= 0) {
        ALL_COURSES[existsIndex] = newCourse;
      } else {
        ALL_COURSES.push(newCourse);
        addedCount++;
      }
    });

    return { success: true, count: addedCount, total: ALL_COURSES.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getUniqueSchools() {
  const schools = new Set();
  ALL_COURSES.forEach(c => schools.add(c.school));
  return Array.from(schools).sort();
}
