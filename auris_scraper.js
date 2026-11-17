// =================================================================
// AURIS Course Scraper v2 - Gets ALL pages of ALL school tabs
// =================================================================
// 1. Login to AURIS → Course Directory
// 2. Set Semester filter → Click Submit
// 3. Press F12 → Console → type "allow pasting" → Enter
// 4. Paste this ENTIRE script → Enter
// 5. Wait (may take 5-10 minutes for all schools/pages)
// 6. Downloads auris_courses.json automatically
// =================================================================

(async function scrapeAURIS() {
    'use strict';

    const ALL_SCRAPED = [];
    let idCounter = 0;

    console.log('%c🚀 AURIS Scraper v2 — Starting...', 'color: #6366f1; font-size: 16px; font-weight: bold;');

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // Parse "Tue [08:00 to 09:30] [03-08-2026 to 22-11-2026]"
    function parseScheduleLine(line) {
        line = line.trim();
        if (!line || line.length < 5) return null;
        const m = line.match(/^(\w{3})\s*\[(\d{2}:\d{2})\s*to\s*(\d{2}:\d{2})\]/);
        if (m) return { day: m[1], startTime: m[2], endTime: m[3], room: '' };
        return null;
    }

    // Scrape one expanded course row's child content
    function scrapeChildRow(childRow, fallbackFaculty) {
        const text = childRow.textContent || '';
        const html = childRow.innerHTML || '';
        let description = '', gerCategory = '', sections = [];

        // Description
        const descMatch = html.match(/Course Description[\s\S]*?<\/b>\s*([\s\S]*?)(?=<b|<\/td|<\/div|$)/i);
        if (descMatch) description = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 400);

        // GER Category
        // In AURIS, it's often structured like: <b>GER Category</b><br/>Humanities<br/><b>Schedule</b>
        // Or it might be empty if not a GER.
        const gerMatch = text.match(/GER Category\s*\n?([\s\S]*?)(?=Schedule|$)/i);
        if (gerMatch) gerCategory = gerMatch[1].trim();

        // Schedule with sections
        const schedMatch = text.match(/Schedule\s*([\s\S]*?)$/i);
        if (schedMatch) {
            const lines = schedMatch[1].split('\n').map(l => l.trim()).filter(l => l);
            let curSection = null;

            for (const line of lines) {
                // Handle "Section 1 [First Quarter]"
                const secMatch = line.match(/^Section\s*([\w\s\[\]]+)/i);
                if (secMatch && !line.includes('to')) { // Avoid matching "to" from schedule lines just in case
                    if (curSection && curSection.schedule.length > 0) sections.push(curSection);
                    curSection = {
                        id: `s${idCounter++}`,
                        name: `Section ${secMatch[1].trim()}`,
                        faculty: fallbackFaculty,
                        schedule: []
                    };
                    continue;
                }
                const parsed = parseScheduleLine(line);
                if (parsed) {
                    if (!curSection) {
                        curSection = { id: `s${idCounter++}`, name: 'Section 1', faculty: fallbackFaculty, schedule: [] };
                    }
                    const isDup = curSection.schedule.some(s => s.day === parsed.day && s.startTime === parsed.startTime && s.endTime === parsed.endTime);
                    if (!isDup) {
                        curSection.schedule.push(parsed);
                    }
                }
            }
            if (curSection && curSection.schedule.length > 0) sections.push(curSection);
        }

        return { description, gerCategory, sections };
    }

    // Get school/area tabs
    function getSchoolTabs() {
        // Look for nav tabs, pills, or links that represent schools
        let tabs = document.querySelectorAll('.nav-tabs > li > a, .nav-pills > li > a, [role="tab"]');
        if (tabs.length === 0) tabs = document.querySelectorAll('.ui-tabs-nav li a');
        if (tabs.length === 0) tabs = document.querySelectorAll('.card-header-tabs a, .tab-pane');
        return Array.from(tabs);
    }

    // Scrape ALL pages of a specific DataTable wrapper
    async function scrapeTable(wrapper, schoolName) {
        const courses = [];
        const table = wrapper.querySelector('table');
        if (!table) return courses;

        // Try to show ALL rows at once
        let showedAll = false;
        try {
            const lenSelect = wrapper.querySelector('select[name$="_length"]');
            if (lenSelect) {
                const allOpt = Array.from(lenSelect.options).find(o => o.value === '-1' || o.text.toLowerCase().includes('all'));
                if (allOpt) {
                    lenSelect.value = allOpt.value;
                    lenSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await sleep(3000);
                    showedAll = true;
                    console.log('  📖 Showing ALL rows');
                }
            }
        } catch (e) {}

        // Get total count from info text
        const infoEl = wrapper.querySelector('.dataTables_info');
        const totalMatch = infoEl?.textContent?.match(/of\s+(\d+)/);
        const totalCourses = totalMatch ? parseInt(totalMatch[1]) : 0;
        console.log(`  📊 Total courses: ${totalCourses || 'unknown'}`);

        // Process current page's rows
        async function processCurrentRows() {
            const rows = table.querySelectorAll('tbody > tr:not(.child):not(.dt-hasChild + tr.child)');

            for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 4) continue;

                const cellTexts = cells.map(c => c.textContent.trim());

                // Find course code
                let courseCode = '', courseName = '', credits = 3, faculty = '';
                let codeIdx = -1;
                for (let j = 0; j < cellTexts.length; j++) {
                    const m = cellTexts[j].match(/^([A-Z]{2,5}\d{2,4})/);
                    if (m) { courseCode = m[1]; codeIdx = j; break; }
                }
                if (!courseCode || codeIdx < 0) continue;

                // Course name is next cell
                courseName = (cellTexts[codeIdx + 1] || '').split('\n')[0].trim();
                if (!courseName) continue;

                // Credits
                for (const t of cellTexts) {
                    const cm = t.match(/^(\d+\.?\d*)$/);
                    if (cm && parseFloat(cm[1]) <= 8) { credits = parseFloat(cm[1]); break; }
                }

                // Faculty (second to last column usually)
                faculty = (cellTexts[cellTexts.length - 2] || '').replace(/\s+/g, ' ').trim();

                // Expand row for details
                let description = '', gerCategory = '', sections = [];
                const expandBtn = cells[0]?.querySelector('*') || cells[0];
                try {
                    expandBtn.click();
                    await sleep(600);

                    const nextRow = row.nextElementSibling;
                    if (nextRow && nextRow !== row) {
                        const childInfo = scrapeChildRow(nextRow, faculty);
                        description = childInfo.description;
                        gerCategory = childInfo.gerCategory;
                        sections = childInfo.sections;
                    }

                    // Collapse back
                    expandBtn.click();
                    await sleep(300);
                } catch (e) {}

                if (sections.length === 0) {
                    sections = [{ id: `s${idCounter++}`, name: 'Section 1', faculty, schedule: [] }];
                }

                // Determine type from GER category
                let courseType = 'regular'; // default
                const gerLower = (gerCategory || '').toLowerCase();
                
                // If it has any text that isn't "not applicable", it's a GER
                if (gerLower && gerLower !== 'not applicable' && gerLower !== 'na' && gerLower !== 'n/a' && gerLower !== 'none') {
                    courseType = 'ger';
                }

                courses.push({
                    id: `c${idCounter++}`,
                    code: courseCode,
                    name: courseName,
                    credits,
                    type: courseType,
                    school: schoolName,
                    description: description || courseName,
                    gerCategory: gerCategory || 'Not Applicable',
                    faculty,
                    sections
                });

                console.log(`    ✅ ${courseCode}: ${courseName} (${sections.length} sec)`);
            }
        }

        if (showedAll) {
            // All rows visible, just scrape them
            await processCurrentRows();
        } else {
            // Paginate through all pages
            let pageNum = 1;
            let hasNext = true;

            while (hasNext) {
                console.log(`  📄 Page ${pageNum}...`);
                await processCurrentRows();

                // Check for next page button
                const nextBtn = wrapper.querySelector('.paginate_button.next:not(.disabled)') ||
                    wrapper.querySelector('.next:not(.disabled)') ||
                    wrapper.querySelector('[class*="next"]:not(.disabled)');

                if (nextBtn && !nextBtn.classList.contains('disabled')) {
                    nextBtn.click();
                    await sleep(2000); // Wait for page to load
                    pageNum++;
                } else {
                    hasNext = false;
                }
            }
            console.log(`  ✅ Scraped ${pageNum} pages`);
        }

        return courses;
    }

    // ===== MAIN =====
    try {
        // Find EVERY table on the page
        const allTables = document.querySelectorAll('table');
        const courseTables = [];

        // Filter tables that actually contain course data
        for (const t of allTables) {
            // Check if any cell matches a typical course code like ABC123 or ABCD1234
            const hasCourseCode = Array.from(t.querySelectorAll('td')).some(td => /^[A-Z]{2,5}\d{2,4}/.test(td.textContent.trim()));
            if (hasCourseCode) {
                // Get the wrapper if it exists, otherwise use the table's parent
                const wrapper = t.closest('.dataTables_wrapper') || t.parentElement;
                if (!courseTables.includes(wrapper)) {
                    courseTables.push(wrapper);
                }
            }
        }
        
        if (courseTables.length > 0) {
            console.log(`%c📚 Found ${courseTables.length} course tables on this page`, 'color: #f59e0b; font-size: 14px;');

            for (let i = 0; i < courseTables.length; i++) {
                const wrapper = courseTables[i];
                
                // Try to find the school name from a heading immediately preceding the table
                let schoolName = `School ${i+1}`;
                let prev = wrapper.previousElementSibling || wrapper.parentElement?.previousElementSibling;
                let attempts = 0;
                while (prev && attempts < 5) { 
                    if (['H1', 'H2', 'H3', 'H4', 'H5'].includes(prev.tagName)) {
                        schoolName = prev.textContent.trim();
                        break;
                    }
                    if (prev.querySelector && prev.querySelector('h1, h2, h3, h4, h5')) {
                        schoolName = prev.querySelector('h1, h2, h3, h4, h5').textContent.trim();
                        break;
                    }
                    prev = prev.previousElementSibling;
                    attempts++;
                }

                console.log(`%c\n📖 [${i + 1}/${courseTables.length}] Extracting table: ${schoolName}`, 'color: #3b82f6; font-size: 14px; font-weight: bold;');

                const courses = await scrapeTable(wrapper, schoolName);
                ALL_SCRAPED.push(...courses);
                console.log(`  🎯 Got ${courses.length} courses from this table.`);
            }
        } else {
            console.log('%c❌ No course tables found on this page.', 'color: #ef4444;');
        }

        // ===== SUMMARY & DOWNLOAD =====
        console.log(`\n%c✨ DONE! Scraped ${ALL_SCRAPED.length} total courses`, 'color: #10b981; font-size: 16px; font-weight: bold;');

        const bySchool = {};
        ALL_SCRAPED.forEach(c => { bySchool[c.school] = (bySchool[c.school] || 0) + 1; });
        Object.entries(bySchool).forEach(([s, n]) => console.log(`   ${s}: ${n} courses`));

        const withSchedule = ALL_SCRAPED.filter(c => c.sections.some(s => s.schedule.length > 0)).length;
        console.log(`   📅 Courses with schedule data: ${withSchedule}`);

        const blob = new Blob([JSON.stringify(ALL_SCRAPED, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'auris_courses.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('%c📥 Downloaded auris_courses.json!', 'color: #6366f1; font-size: 14px; font-weight: bold;');

    } catch (err) {
        console.error('❌ Error:', err);
        if (ALL_SCRAPED.length > 0) {
            const blob = new Blob([JSON.stringify(ALL_SCRAPED, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'auris_courses_partial.json';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            console.log(`Saved ${ALL_SCRAPED.length} partial results`);
        }
    }
})();
