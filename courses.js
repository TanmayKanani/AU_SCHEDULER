// ===== AU Scheduler - Main App Logic =====

(function () {
    'use strict';

    // ===== State =====
    let selectedCourseIds = new Set();
    let preferredSections = {}; // courseId -> sectionIndex
    let currentFilter = 'all';
    let currentSchool = 'all';
    let currentGERCategory = 'all';
    let currentCredit = 'all';
    let timeFrom = '';
    let timeTo = '';
    let searchQuery = '';
    let generatedSchedules = [];
    let currentScheduleIndex = 0;
    let pinnedSections = new Set();
    let isDarkMode = localStorage.getItem('theme') === 'dark';

    // ===== DOM References =====
    const $ = id => document.getElementById(id);
    const courseGrid = $('courseGrid');
    const emptyState = $('emptyState');
    const emptyMessage = $('emptyMessage');
    const catalogSection = $('catalogSection');
    const scheduleSection = $('scheduleSection');
    const btnGenerate = $('btnGenerate');
    const searchInput = $('searchInput');
    const schoolSelect = $('schoolSelect');
    const gerCategorySelect = $('gerCategorySelect');
    const creditSelect = $('creditSelect');
    const timeFromInput = $('timeFrom');
    const timeToInput = $('timeTo');
    const importModal = $('importModal');
    const selectedPanel = $('selectedPanel');
    const selectedChips = $('selectedChips');
    const selectedCount = $('selectedCount');
    const timetable = $('timetable');
    const scheduleSummary = $('scheduleSummary');
    const scheduleStats = $('scheduleStats');
    const scheduleCounter = $('scheduleCounter');
    const noSchedule = $('noSchedule');
    const timetableContainer = $('timetableContainer');
    const courseModal = $('courseModal');
    const modalBody = $('modalBody');
    const toast = $('toast');
    const toastMessage = $('toastMessage');

    // ===== Init =====
    function init() {
        if (isDarkMode) document.documentElement.setAttribute('data-theme', 'dark');
        populateSchoolFilter();
        populateGERCategoryFilter();
        populateCreditFilter();
        updateDashboard();
        $('targetCreditsInput').addEventListener('input', () => updateDashboard());

        // Parse shared link if exists
        parseSharedURL();

        renderCourses();
        updateDashboard();
        
        $('btnShareCode').addEventListener('click', () => {
            if (selectedCourseIds.size === 0) {
                showToast('No courses selected to share!');
                return;
            }
            const codes = [];
            selectedCourseIds.forEach(id => {
                const c = ALL_COURSES.find(crs => crs.id === id);
                if (c) codes.push(c.code);
            });
            const pins = [];
            pinnedSections.forEach(pid => {
                for (const id of selectedCourseIds) {
                    const c = ALL_COURSES.find(crs => crs.id === id);
                    if (c) {
                        const s = c.sections.find(sec => sec.id === pid);
                        if (s) {
                            pins.push(`${c.code}::${s.name}`);
                            break;
                        }
                    }
                }
            });
            
            const payload = codes.join(',') + '|' + pins.join(',');
            const base64Code = btoa(payload);
            
            navigator.clipboard.writeText(base64Code).then(() => {
                showToast('📋 Share Code copied to clipboard! Send it to your friends.');
            });
        });
        
        $('btnImportCode').addEventListener('click', () => {
            const code = prompt('📥 Paste the shared schedule code here:');
            if (!code) return;
            
            try {
                const decoded = atob(code.trim());
                const [sharedCourses, sharedPins] = decoded.split('|');
                
                if (sharedCourses) {
                    const parsedCodes = sharedCourses.split(',');
                    let importedCount = 0;
                    parsedCodes.forEach(cCode => {
                        const c = ALL_COURSES.find(crs => crs.code === cCode);
                        if (c && !selectedCourseIds.has(c.id)) {
                            let currentCredits = 0;
                            selectedCourseIds.forEach(id => {
                                const crs = ALL_COURSES.find(x => x.id === id);
                                if (crs) currentCredits += crs.credits;
                            });
                            
                            const targetInput = $('targetCreditsInput');
                            const targetLimit = targetInput ? (parseInt(targetInput.value) || 22) : 22;
                            
                            if (currentCredits + c.credits <= targetLimit && selectedCourseIds.size < 10) {
                                selectedCourseIds.add(c.id);
                                importedCount++;
                            }
                        }
                    });
                    
                    if (sharedPins) {
                        const parsedPins = sharedPins.split(',');
                        parsedPins.forEach(pin => {
                            const parts = pin.split('::');
                            if (parts.length === 2) {
                                const c = ALL_COURSES.find(crs => crs.code === parts[0]);
                                if (c) {
                                    const s = c.sections.find(sec => sec.name === parts[1]);
                                    if (s) pinnedSections.add(s.id);
                                }
                            }
                        });
                    }
                    
                    if (importedCount > 0) {
                        showToast(`✨ Successfully imported ${importedCount} courses!`);
                        if (selectedCourseIds.size > 0) {
                            $('selectedPanel').classList.remove('hidden');
                            updateSelectedPanel();
                            updateDashboard();
                            renderCourses();
                        }
                    } else {
                        showToast('No new courses were found or added from this code.');
                    }
                }
            } catch (e) {
                showToast('❌ Invalid code format. Please check and try again.');
            }
        });
        
        // Help Modal
        const helpModal = $('helpModal');
        $('btnHelp').addEventListener('click', () => {
            helpModal.classList.remove('hidden');
        });
        $('closeHelpModal').addEventListener('click', () => {
            helpModal.classList.add('hidden');
        });
        
        bindEvents();
    }

    function parseSharedURL() {
        // Keeping URL parsing as fallback
        const params = new URLSearchParams(window.location.search);
        const sharedCourses = params.get('courses');
        const sharedPins = params.get('pins');

        if (sharedCourses) {
            const codes = sharedCourses.split(',');
            codes.forEach(code => {
                const c = ALL_COURSES.find(crs => crs.code === code);
                if (c) selectedCourseIds.add(c.id);
            });
            
            if (sharedPins) {
                const pins = sharedPins.split(',');
                pins.forEach(pin => {
                    const parts = pin.split('::');
                    if (parts.length === 2) {
                        const c = ALL_COURSES.find(crs => crs.code === parts[0]);
                        if (c) {
                            const s = c.sections.find(sec => sec.name === parts[1]);
                            if (s) pinnedSections.add(s.id);
                        }
                    }
                });
            }
            
            window.history.replaceState({}, document.title, window.location.pathname);
            
            if (selectedCourseIds.size > 0) {
                $('selectedPanel').classList.remove('hidden');
                updateSelectedPanel();
            }
        }
    }

    // ===== Dashboard stats =====
    function updateDashboard() {
        $('statTotal').textContent = ALL_COURSES.length;
        const major = ALL_COURSES.filter(c => c.type === 'major_elective').length;
        const ger = ALL_COURSES.filter(c => c.type === 'ger').length;
        $('statMajor').textContent = major;
        $('statGER').textContent = ger;

        let totalCreds = 0;
        let majorCreds = 0, gerCreds = 0, freeCreds = 0;
        selectedCourseIds.forEach(id => {
            const course = ALL_COURSES.find(c => c.id === id);
            if (course) {
                totalCreds += course.credits;
                if (course.type === 'major_elective') majorCreds += course.credits;
                else if (course.type === 'ger') gerCreds += course.credits;
                else freeCreds += course.credits;
            }
        });
        
        // Update Circular Tracker
        $('statCredits').textContent = totalCreds;
        const ceiling = 22; 
        let percentage = (totalCreds / ceiling) * 100;
        if (percentage > 100) percentage = 100;
        const dashArray = `${percentage}, 100`;
        $('creditRingFill').setAttribute('stroke-dasharray', dashArray);
        
        if (totalCreds > ceiling) {
            $('creditRingFill').style.stroke = '#ef4444'; // red if over
        } else {
            $('creditRingFill').style.stroke = '#6366f1';
        }

        // Update Graduation Segmented Tracker
        const targetInput = $('targetCreditsInput');
        if (targetInput) {
            const target = parseInt(targetInput.value) || 22;
            $('lblTargetCreds').textContent = target;
            $('lblTotalCreds').textContent = totalCreds;
            $('lblMajorCreds').textContent = majorCreds;
            $('lblGerCreds').textContent = gerCreds;
            $('lblFreeCreds').textContent = freeCreds;

            const maxFill = Math.max(totalCreds, target, 1);
            $('gradMajorFill').style.width = `${(majorCreds / maxFill) * 100}%`;
            $('gradGerFill').style.width = `${(gerCreds / maxFill) * 100}%`;
            $('gradFreeFill').style.width = `${(freeCreds / maxFill) * 100}%`;
        }
    }

    // ===== Selected courses panel =====
    function updateSelectedPanel() {
        const count = selectedCourseIds.size;
        selectedCount.textContent = count;
        btnGenerate.disabled = count < 2;

        if (count === 0) {
            selectedPanel.classList.add('hidden');
            return;
        }

        selectedPanel.classList.remove('hidden');

        const selectedCourses = ALL_COURSES.filter(c => selectedCourseIds.has(c.id));
        selectedChips.innerHTML = selectedCourses.map(c => {
            const secIdx = preferredSections[c.id] || 0;
            const sec = c.sections[secIdx];
            const secTime = sec?.schedule?.map(s => `${s.day} ${s.startTime}`).join(', ') || 'TBA';
            return `
                <div class="selected-chip" data-id="${c.id}">
                    <div class="chip-info">
                        <span class="chip-code">${c.code}</span>
                        <span class="chip-name">${c.name}</span>
                        <span class="chip-sec">${sec?.name || 'Sec 1'} • ${secTime}</span>
                    </div>
                    <button class="chip-remove" data-id="${c.id}" title="Remove">✕</button>
                </div>
            `;
        }).join('');

        // Bind remove buttons
        selectedChips.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCourse(btn.dataset.id);
            });
        });
    }

    // ===== Populate filters =====
    function populateSchoolFilter() {
        schoolSelect.innerHTML = '<option value="all">All Schools</option>';
        getUniqueSchools().forEach(s => {
            const opt = document.createElement('option');
            opt.value = s; opt.textContent = s;
            schoolSelect.appendChild(opt);
        });
    }

    function populateGERCategoryFilter() {
        gerCategorySelect.innerHTML = '<option value="all">All GER Categories</option>';
        getUniqueGERCategories().forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.textContent = cat;
            gerCategorySelect.appendChild(opt);
        });
    }

    function populateCreditFilter() {
        creditSelect.innerHTML = '<option value="all">All Credits</option>';
        getUniqueCredits().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = `${c} Credit${c !== 1 ? 's' : ''}`;
            creditSelect.appendChild(opt);
        });
    }

    // ===== Time filter helper =====
    function courseMatchesTimeRange(course) {
        if (!timeFrom && !timeTo) return true;
        const fromMin = timeFrom ? timeToMin(timeFrom) : 0;
        const toMin = timeTo ? timeToMin(timeTo) : 1440;
        return course.sections.some(s => s.schedule.some(slot => {
            const slotStart = timeToMin(slot.startTime);
            const slotEnd = timeToMin(slot.endTime);
            return slotStart >= fromMin && slotEnd <= toMin;
        }));
    }

    function timeToMin(t) {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + (m || 0);
    }

    // ===== Render course cards =====
    function renderCourses() {
        const filtered = ALL_COURSES.filter(c => {
            const matchType = currentFilter === 'all' || c.type === currentFilter;
            const matchSchool = currentSchool === 'all' || c.school === currentSchool;
            const matchGER = currentGERCategory === 'all' || (c.gerCategory && c.gerCategory.trim() === currentGERCategory);
            const matchCredit = currentCredit === 'all' || c.credits === parseFloat(currentCredit);
            const matchTime = courseMatchesTimeRange(c);
            const q = searchQuery.toLowerCase();
            const matchSearch = !q ||
                c.name.toLowerCase().includes(q) ||
                c.code.toLowerCase().includes(q) ||
                (c.description || '').toLowerCase().includes(q) ||
                c.school.toLowerCase().includes(q) ||
                (c.gerCategory && c.gerCategory.toLowerCase().includes(q)) ||
                (c.faculty && c.faculty.toLowerCase().includes(q));
            return matchType && matchSchool && matchGER && matchCredit && matchTime && matchSearch;
        });

        // Sort: selected courses appear FIRST
        filtered.sort((a, b) => {
            const aSelected = selectedCourseIds.has(a.id) ? 0 : 1;
            const bSelected = selectedCourseIds.has(b.id) ? 0 : 1;
            if (aSelected !== bSelected) return aSelected - bSelected;
            return a.name.localeCompare(b.name);
        });

        courseGrid.innerHTML = '';

        if (ALL_COURSES.length === 0) {
            emptyState.classList.remove('hidden');
            courseGrid.classList.add('hidden');
            emptyMessage.textContent = 'Import AURIS data to get started! Click "Import AURIS Data" above.';
            return;
        }

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            courseGrid.classList.add('hidden');
            emptyMessage.textContent = 'No courses found matching your filters.';
            return;
        }

        emptyState.classList.add('hidden');
        courseGrid.classList.remove('hidden');

        filtered.forEach((course, index) => {
            const card = document.createElement('div');
            const isSelected = selectedCourseIds.has(course.id);
            card.className = `course-card${isSelected ? ' selected' : ''}`;
            card.dataset.courseId = course.id;
            card.dataset.type = course.type;
            card.style.animation = 'fadeInUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards';
            card.style.animationDelay = `${Math.min(index * 0.05, 0.4)}s`;

            const facultyDisplay = course.faculty || 'TBA';
            const selectedSecIdx = preferredSections[course.id] || 0;

            card.innerHTML = `
                <div class="card-top">
                    <span class="card-code">${course.code}</span>
                    <div class="card-badges">
                        <span class="card-type ${course.type}">${COURSE_TYPES[course.type]?.label || course.type}</span>
                        <span class="card-school-badge">${course.school || 'N/A'}</span>
                    </div>
                </div>
                <div class="card-title">${course.name}</div>
                ${course.gerCategory && course.type === 'ger' ? `<div class="card-ger-category">📋 ${course.gerCategory}</div>` : ''}
                <div class="card-meta">
                    <span class="card-credits">${course.credits} Credits</span>
                    <span>${course.sections.length} Section${course.sections.length > 1 ? 's' : ''}</span>
                </div>
                <div class="card-faculty-line">👤 <strong>Faculty:</strong> ${facultyDisplay}</div>

                <div class="card-all-sections">
                    ${course.sections.map((s, si) => `
                        <div class="section-block ${si === selectedSecIdx ? 'sec-selected' : ''}" data-section-idx="${si}" data-course-id="${course.id}">
                            <div class="section-header">
                                <div class="sec-radio">
                                    <input type="radio" name="sec_${course.id}" ${si === selectedSecIdx ? 'checked' : ''} />
                                    <span class="sec-name">${s.name}</span>
                                </div>
                                <button class="pin-btn ${pinnedSections.has(s.id) ? 'pinned' : ''}" data-sec-id="${s.id}" title="Pin this section">
                                    📌 <span class="pin-text">${pinnedSections.has(s.id) ? 'Pinned' : 'Pin Section'}</span>
                                </button>
                            </div>
                            <div class="section-times">
                                ${s.schedule.length > 0 ? s.schedule.map(slot => `
                                    <span class="sec-time-chip">${slot.day} ${slot.startTime}–${slot.endTime}</span>
                                `).join('') : '<span class="sec-time-chip no-schedule">No schedule</span>'}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="card-details-dropdown">
                    <div class="card-desc-full">
                        <strong>📝 Description:</strong><br/>
                        ${course.description || 'No description available.'}
                    </div>
                </div>

                <div class="card-actions">
                    <button class="btn-card-select ${isSelected ? 'selected' : ''}" data-id="${course.id}">
                        ${isSelected ? '✓ Added to Schedule' : '+ Add to Schedule'}
                    </button>
                    <button class="btn-card-expand">▼ Details</button>
                </div>
            `;

            // Section selection
            card.querySelectorAll('.section-block').forEach(block => {
                block.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const secIdx = parseInt(block.dataset.sectionIdx);
                    const cId = block.dataset.courseId;
                    preferredSections[cId] = secIdx;
                    card.querySelectorAll('.section-block').forEach(b => b.classList.remove('sec-selected'));
                    block.classList.add('sec-selected');
                    card.querySelectorAll(`input[name="sec_${cId}"]`).forEach((r, ri) => r.checked = ri === secIdx);
                    updateSelectedPanel(); // Update chips with new section
                });
            });

            // Pin button
            card.querySelectorAll('.pin-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const secId = btn.dataset.secId;
                    if (pinnedSections.has(secId)) {
                        pinnedSections.delete(secId);
                        btn.classList.remove('pinned');
                        btn.querySelector('.pin-text').textContent = 'Pin Section';
                    } else {
                        course.sections.forEach(s => pinnedSections.delete(s.id));
                        pinnedSections.add(secId);
                        card.querySelectorAll('.pin-btn').forEach(b => {
                            b.classList.remove('pinned');
                            b.querySelector('.pin-text').textContent = 'Pin Section';
                        });
                        btn.classList.add('pinned');
                        btn.querySelector('.pin-text').textContent = 'Pinned';
                        
                        const block = btn.closest('.section-block');
                        if (block && !block.classList.contains('sec-selected')) {
                            block.click();
                        }
                    }
                });
            });

            // Select button
            card.querySelector('.btn-card-select').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCourse(course.id);
            });

            // Expand button
            const expandBtn = card.querySelector('.btn-card-expand');
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                card.classList.toggle('expanded');
                expandBtn.textContent = card.classList.contains('expanded') ? '▲ Hide' : '▼ Details';
            });

            courseGrid.appendChild(card);
        });
    }

    // ===== Toggle course selection =====
    function toggleCourse(courseId) {
        if (selectedCourseIds.has(courseId)) {
            selectedCourseIds.delete(courseId);
        } else {
            // CHECK TARGET CREDITS LIMIT
            const course = ALL_COURSES.find(c => c.id === courseId);
            if (course) {
                let currentCredits = 0;
                selectedCourseIds.forEach(id => {
                    const c = ALL_COURSES.find(crs => crs.id === id);
                    if (c) currentCredits += c.credits;
                });
                
                const targetInput = $('targetCreditsInput');
                const targetLimit = targetInput ? (parseInt(targetInput.value) || 22) : 22;
                
                if (currentCredits + course.credits > targetLimit) {
                    showToast(`Cannot add ${course.code}: Exceeds target credits limit (${targetLimit})!`);
                    return;
                }
                
                if (selectedCourseIds.size >= 10) {
                    showToast('Maximum 10 courses can be selected!');
                    return;
                }
                selectedCourseIds.add(courseId);
            }
        }
        updateSelectedPanel();
        updateDashboard();
        renderCourses();
    }

    // ===== Generate schedules =====
    function generateSchedules() {
        const selectedCourses = ALL_COURSES.filter(c => selectedCourseIds.has(c.id));
        if (selectedCourses.length < 2) return;

        btnGenerate.textContent = 'Generating...';
        btnGenerate.disabled = true;

        setTimeout(() => {
            generatedSchedules = scheduler.generate(selectedCourses, preferredSections, pinnedSections);
            currentScheduleIndex = 0;

            catalogSection.classList.add('hidden');
            selectedPanel.classList.add('hidden');
            $('dashboard').classList.add('hidden');
            scheduleSection.classList.remove('hidden');

            if (generatedSchedules.length === 0) {
                noSchedule.classList.remove('hidden');
                timetableContainer.classList.add('hidden');
                scheduleSummary.classList.add('hidden');
                scheduleStats.innerHTML = '';
                scheduleCounter.textContent = '0 / 0';
                renderClashView(selectedCourses);
            } else {
                noSchedule.classList.add('hidden');
                timetableContainer.classList.remove('hidden');
                scheduleSummary.classList.remove('hidden');
                showToast(`Found ${generatedSchedules.length} valid schedule${generatedSchedules.length > 1 ? 's' : ''}!`);
                renderSchedule();
            }

            btnGenerate.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Generate Schedules`;
            btnGenerate.disabled = false;
        }, 50);
    }

    // ===== Render timetable =====
    function renderSchedule() {
        if (generatedSchedules.length === 0) return;
        const combo = generatedSchedules[currentScheduleIndex];

        scheduleCounter.textContent = `${currentScheduleIndex + 1} / ${generatedSchedules.length}`;
        $('prevSchedule').disabled = currentScheduleIndex === 0;
        $('nextSchedule').disabled = currentScheduleIndex === generatedSchedules.length - 1;

        const stats = scheduler.getStats(combo);
        scheduleStats.innerHTML = `
            <div class="stat-item">
                <span class="stat-value">${stats.totalCredits}</span>
                <span class="stat-label">Credits</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.totalHours}h</span>
                <span class="stat-label">Weekly</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.daysCount}</span>
                <span class="stat-label">Days</span>
            </div>
        `;

        // Build timetable grid
        let minTime = 1440, maxTime = 0;
        combo.forEach(({ section }) => {
            section.schedule.forEach(s => {
                minTime = Math.min(minTime, scheduler.timeToMinutes(s.startTime));
                maxTime = Math.max(maxTime, scheduler.timeToMinutes(s.endTime));
            });
        });
        minTime = Math.floor(minTime / 60) * 60;
        maxTime = Math.ceil(maxTime / 60) * 60;

        const timeSlots = [];
        for (let t = minTime; t < maxTime; t += 60) { timeSlots.push(t); }

        const colorMap = {};
        combo.forEach(({ course }, i) => { colorMap[course.id] = i % 10; });

        let html = '';
        html += '<div class="tt-header"></div>';
        DAYS.forEach(d => { html += `<div class="tt-header">${d}</div>`; });

        timeSlots.forEach(t => {
            const timeStr = scheduler.minutesToTime(t);
            html += `<div class="tt-time">${timeStr}</div>`;

            DAYS.forEach(day => {
                let blockHtml = '';
                combo.forEach(({ course, section }) => {
                    section.schedule.forEach(slot => {
                        const slotStart = scheduler.timeToMinutes(slot.startTime);
                        if (slot.day === day && slotStart >= t && slotStart < t + 60) {
                            const colorClass = `tt-color-${colorMap[course.id]}`;
                            blockHtml = `
                                <div class="tt-block ${colorClass}" title="${course.name} | ${section.name}">
                                    <span class="tt-block-name">${course.code}</span>
                                    <span class="tt-block-section">${section.name}</span>
                                    <span class="tt-block-room">${slot.startTime}-${slot.endTime}</span>
                                </div>
                            `;
                        }
                    });
                });
                html += `<div class="tt-cell">${blockHtml}</div>`;
            });
        });

        timetable.innerHTML = html;

        // Build summary cards
        scheduleSummary.innerHTML = combo.map(({ course, section }, i) => {
            const colorIdx = colorMap[course.id];
            const colors = ['#818cf8','#c084fc','#38bdf8','#34d399','#fbbf24','#f472b6','#fb7185','#a78bfa', '#60a5fa', '#f87171'];
            return `
                <div class="summary-card" style="border-left-color: ${colors[colorIdx]}">
                    <div class="summary-dot" style="background: ${colors[colorIdx]}"></div>
                    <div class="summary-info">
                        <div class="summary-name">${course.code} — ${course.name}</div>
                        <div class="summary-detail">${section.name} • ${course.faculty || 'TBA'} • ${course.credits}cr</div>
                        <div class="summary-detail">${section.schedule.map(s => `${s.day} ${s.startTime}-${s.endTime}`).join(' | ')}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== Render Clash View =====
    function renderClashView(selectedCourses) {
        const combo = selectedCourses.map(course => {
            const pinned = course.sections.find(s => pinnedSections.has(s.id));
            if (pinned) return { course, section: pinned };
            const prefIdx = preferredSections[course.id] || 0;
            return { course, section: course.sections[prefIdx] };
        });

        const allBlocks = [];
        combo.forEach(({course, section}, courseIdx) => {
            section.schedule.forEach(slot => {
                allBlocks.push({ course, section, slot, courseIdx, isClash: false });
            });
        });
        
        for (let i=0; i<allBlocks.length; i++) {
            for (let j=i+1; j<allBlocks.length; j++) {
                if (scheduler.slotsOverlap(allBlocks[i].slot, allBlocks[j].slot)) {
                    allBlocks[i].isClash = true;
                    allBlocks[j].isClash = true;
                }
            }
        }
        
        let minTime = 1440, maxTime = 0;
        allBlocks.forEach(b => {
            minTime = Math.min(minTime, scheduler.timeToMinutes(b.slot.startTime));
            maxTime = Math.max(maxTime, scheduler.timeToMinutes(b.slot.endTime));
        });
        if (allBlocks.length === 0) { minTime = 480; maxTime = 1080; }
        minTime = Math.floor(minTime / 60) * 60;
        maxTime = Math.ceil(maxTime / 60) * 60;

        const timeSlots = [];
        for (let t = minTime; t < maxTime; t += 60) { timeSlots.push(t); }

        let html = '<div class="tt-header"></div>';
        DAYS.forEach(d => { html += `<div class="tt-header">${d}</div>`; });

        timeSlots.forEach(t => {
            const timeStr = scheduler.minutesToTime(t);
            html += `<div class="tt-time">${timeStr}</div>`;

            DAYS.forEach(day => {
                let blockHtml = '';
                allBlocks.forEach(b => {
                    const slotStart = scheduler.timeToMinutes(b.slot.startTime);
                    if (b.slot.day === day && slotStart >= t && slotStart < t + 60) {
                        const colorClass = `tt-color-${b.courseIdx % 10}`;
                        const clashClass = b.isClash ? 'clash' : '';
                        blockHtml += `
                            <div class="tt-block ${colorClass} ${clashClass}" title="${b.course.name} | ${b.section.name}">
                                <span class="tt-block-name">${b.course.code}</span>
                                <span class="tt-block-section">${b.section.name}</span>
                                <span class="tt-block-room">${b.slot.startTime}-${b.slot.endTime}</span>
                            </div>
                        `;
                    }
                });
                html += `<div class="tt-cell">${blockHtml}</div>`;
            });
        });

        $('clashTimetable').innerHTML = html;
    }

    // ===== Toast =====
    function showToast(msg) {
        toastMessage.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // ===== Import =====
    function handleFileImport() {
        importModal.classList.remove('hidden');
    }

    function processImportFile(schoolOverride) {
        importModal.classList.add('hidden');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.csv,.xlsx,.xls';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const ext = file.name.split('.').pop().toLowerCase();
            const reader = new FileReader();

            reader.onload = (ev) => {
                let result;
                try {
                    if (ext === 'json') {
                        result = importCoursesFromJSON(ev.target.result);
                    } else if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
                        const data = new Uint8Array(ev.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const rows = XLSX.utils.sheet_to_json(worksheet);
                        result = importCoursesFromExcel(rows, schoolOverride === 'auto' ? null : schoolOverride);
                    } else {
                        showToast(`Unsupported file type: ${ext}`);
                        return;
                    }

                    if (result.success) {
                        showToast(`✅ Imported ${result.count} new courses! (Total: ${result.total})`);
                        selectedCourseIds.clear();
                        populateSchoolFilter();
                        populateGERCategoryFilter();
                        populateCreditFilter();
                        updateDashboard();
                        updateSelectedPanel();
                        renderCourses();
                    } else {
                        showToast(`Import failed: ${result.error}`);
                    }
                } catch (err) {
                    console.error(err);
                    showToast(`Error parsing file: ${err.message}`);
                }
            };

            if (ext === 'json') {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
        input.click();
    }

    // ===== Event Bindings =====
    function bindEvents() {
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentFilter = tab.dataset.filter;
                renderCourses();
            });
        });

        // Search
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderCourses();
        });

        // School filter
        schoolSelect.addEventListener('change', (e) => {
            currentSchool = e.target.value;
            renderCourses();
        });

        // GER category filter
        gerCategorySelect.addEventListener('change', (e) => {
            currentGERCategory = e.target.value;
            if (currentGERCategory !== 'all') {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('[data-filter="ger"]').classList.add('active');
                currentFilter = 'ger';
            }
            renderCourses();
        });

        // Credit filter
        creditSelect.addEventListener('change', (e) => {
            currentCredit = e.target.value;
            renderCourses();
        });

        // Time range filter
        timeFromInput.addEventListener('change', () => {
            timeFrom = timeFromInput.value;
            renderCourses();
        });
        timeToInput.addEventListener('change', () => {
            timeTo = timeToInput.value;
            renderCourses();
        });
        $('timeClear').addEventListener('click', () => {
            timeFrom = ''; timeTo = '';
            timeFromInput.value = ''; timeToInput.value = '';
            renderCourses();
        });

        // Generate
        btnGenerate.addEventListener('click', generateSchedules);

        // Import
        $('btnImport').addEventListener('click', handleFileImport);
        document.querySelectorAll('.import-school-btn').forEach(btn => {
            btn.addEventListener('click', () => processImportFile(btn.dataset.school));
        });
        $('importCancel').addEventListener('click', () => importModal.classList.add('hidden'));

        // Export
        $('btnExportJSON').addEventListener('click', () => {
            if (ALL_COURSES.length === 0) { showToast('No courses to export!'); return; }
            exportCoursesToJSON();
            showToast('Exported courses as JSON!');
        });

        // Back buttons
        $('btnBack').addEventListener('click', goBackToCatalog);
        $('btnBackAlt').addEventListener('click', goBackToCatalog);

        // Schedule navigation
        $('prevSchedule').addEventListener('click', () => {
            if (currentScheduleIndex > 0) { currentScheduleIndex--; renderSchedule(); }
        });
        $('nextSchedule').addEventListener('click', () => {
            if (currentScheduleIndex < generatedSchedules.length - 1) { currentScheduleIndex++; renderSchedule(); }
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                courseModal.classList.add('hidden');
                importModal.classList.add('hidden');
            }
            if (scheduleSection.classList.contains('hidden')) return;
            if (e.key === 'ArrowLeft') { $('prevSchedule').click(); }
            if (e.key === 'ArrowRight') { $('nextSchedule').click(); }
        });

        // Theme toggle
        $('themeToggle').addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            if (isDarkMode) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
            }
        });
        
        // Export image
        const btnExportImg = $('btnExportImg');
        if (btnExportImg) {
            btnExportImg.addEventListener('click', () => {
                const target = $('timetableContainer');
                if (!target || target.classList.contains('hidden')) return;
                
                const originalBg = isDarkMode ? '#1a1d2e' : '#ffffff';
                showToast('Generating high-res image...');
                
                if (window.html2canvas) {
                    html2canvas(target, {
                        backgroundColor: originalBg,
                        scale: 2
                    }).then(canvas => {
                        const link = document.createElement('a');
                        link.download = 'AU_Schedule.png';
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                        showToast('✅ Image downloaded successfully!');
                    }).catch(err => {
                        console.error(err);
                        showToast('❌ Failed to export image');
                    });
                }
            });
        }
    }

    function goBackToCatalog() {
        scheduleSection.classList.add('hidden');
        catalogSection.classList.remove('hidden');
        $('dashboard').classList.remove('hidden');
        updateSelectedPanel();
    }

    // ===== Start =====
    document.addEventListener('DOMContentLoaded', init);
})();
