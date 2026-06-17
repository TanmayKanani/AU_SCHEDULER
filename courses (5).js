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

    // ===== Number tween helper =====
    function tweenNumber(el, to, duration = 700) {
        if (!el) return;
        const from = parseFloat(el.textContent) || 0;
        if (from === to) { el.textContent = to; return; }
        const start = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 3);
        function tick(now) {
            const t = Math.min(1, (now - start) / duration);
            const v = from + (to - from) * ease(t);
            el.textContent = Number.isInteger(to) ? Math.round(v) : (Math.round(v * 10) / 10);
            if (t < 1) requestAnimationFrame(tick);
            else el.textContent = to;
        }
        requestAnimationFrame(tick);
    }

    // ===== Dashboard stats =====
    function updateDashboard() {
        tweenNumber($('statTotal'), ALL_COURSES.length);
        const major = ALL_COURSES.filter(c => c.type === 'major_elective').length;
        const ger = ALL_COURSES.filter(c => c.type === 'ger').length;
        tweenNumber($('statMajor'), major);
        tweenNumber($('statGER'), ger);

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
        tweenNumber($('statCredits'), totalCreds);
        const ceiling = 22; 
        let percentage = (totalCreds / ceiling) * 100;
        if (percentage > 100) percentage = 100;
        const dashArray = `${percentage}, 100`;
        $('creditRingFill').setAttribute('stroke-dasharray', dashArray);
        
        if (totalCreds > ceiling) {
            $('creditRingFill').style.filter = 'drop-shadow(0 0 4px var(--au-300))';
        } else {
            $('creditRingFill').style.filter = 'none';
        }

        // Update Graduation Segmented Tracker
        const targetInput = $('targetCreditsInput');
        if (targetInput) {
            const target = parseInt(targetInput.value) || 22;
            $('lblTargetCreds').textContent = target;
            tweenNumber($('lblTotalCreds'), totalCreds);
            tweenNumber($('lblMajorCreds'), majorCreds);
            tweenNumber($('lblGerCreds'), gerCreds);
            tweenNumber($('lblFreeCreds'), freeCreds);

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
                ${course.gerCategory && course.type === 'ger' ? `<div class="card-ger-category">${course.gerCategory}</div>` : ''}
                <div class="card-meta">
                    <span class="card-credits">${course.credits} cr</span>
                    <span>${course.sections.length} section${course.sections.length > 1 ? 's' : ''}</span>
                </div>
                <div class="card-faculty-line"><strong>Faculty</strong> · ${facultyDisplay}</div>

                <div class="card-all-sections">
                    ${course.sections.map((s, si) => `
                        <div class="section-block ${si === selectedSecIdx ? 'sec-selected' : ''}" data-section-idx="${si}" data-course-id="${course.id}">
                            <div class="section-header">
                                <div class="sec-radio">
                                    <input type="radio" name="sec_${course.id}" ${si === selectedSecIdx ? 'checked' : ''} />
                                    <span class="sec-name">${s.name}</span>
                                </div>
                                <button class="pin-btn ${pinnedSections.has(s.id) ? 'pinned' : ''}" data-sec-id="${s.id}" title="Pin this section">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
                                    <span class="pin-text">${pinnedSections.has(s.id) ? 'Pinned' : 'Pin'}</span>
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
                        ${course.description || 'No description available.'}
                    </div>
                </div>

                <div class="card-actions">
                    <button class="btn-card-select ${isSelected ? 'selected' : ''}" data-id="${course.id}">
                        ${isSelected ? '✓ Added' : '+ Add to Schedule'}
                    </button>
                    <button class="btn-card-expand">More ↓</button>
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
                        btn.querySelector('.pin-text').textContent = 'Pin';
                    } else {
                        course.sections.forEach(s => pinnedSections.delete(s.id));
                        pinnedSections.add(secId);
                        card.querySelectorAll('.pin-btn').forEach(b => {
                            b.classList.remove('pinned');
                            b.querySelector('.pin-text').textContent = 'Pin';
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
                expandBtn.textContent = card.classList.contains('expanded') ? 'Less ↑' : 'More ↓';
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

            $('scheduleEmpty').classList.add('hidden');
            $('scheduleSection').classList.remove('hidden');
            switchTab('schedule');

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
        
        // Export image — custom canvas renderer (modern-CSS safe, high resolution)
        const btnExportImg = $('btnExportImg');
        if (btnExportImg) {
            btnExportImg.addEventListener('click', () => {
                if (generatedSchedules.length === 0) return;
                showToast('Rendering image…');
                try {
                    const combo = generatedSchedules[currentScheduleIndex];
                    const canvas = renderScheduleToCanvas(combo, currentScheduleIndex, generatedSchedules.length);
                    canvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.download = `AU_Schedule_${currentScheduleIndex+1}_of_${generatedSchedules.length}.png`;
                        link.href = url;
                        link.click();
                        URL.revokeObjectURL(url);
                        showToast('Image downloaded');
                    }, 'image/png');
                } catch (err) {
                    console.error(err);
                    showToast('Could not render image');
                }
            });
        }
    }

    function goBackToCatalog() {
        switchTab('catalog');
        updateSelectedPanel();
    }

    // ==============================================================
    // TAB NAVIGATION
    // ==============================================================
    let currentTab = 'catalog';

    function switchTab(name) {
        if (!['catalog', 'schedule', 'insights'].includes(name)) return;
        currentTab = name;
        document.querySelectorAll('[data-panel]').forEach(p => {
            p.classList.toggle('hidden', p.dataset.panel !== name);
        });
        // desktop tabs
        document.querySelectorAll('.tab-nav .tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === name);
        });
        // mobile tabs
        document.querySelectorAll('.mobile-nav .mobile-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === name);
        });
        updateTabIndicators();

        // tab-specific actions
        if (name === 'schedule') {
            const hasSchedules = generatedSchedules.length > 0;
            $('scheduleEmpty').classList.toggle('hidden', hasSchedules);
            $('scheduleSection').classList.toggle('hidden', !hasSchedules);
            renderSavedStrip();
        }
        if (name === 'insights') {
            renderInsights();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateTabIndicators() {
        // Desktop pill indicator
        const desk = document.querySelector('.tab-nav.desktop-tabs');
        if (desk) {
            const active = desk.querySelector('.tab-btn.active');
            const indicator = desk.querySelector('.tab-indicator');
            if (active && indicator) {
                const rect = active.getBoundingClientRect();
                const parentRect = desk.getBoundingClientRect();
                indicator.style.width = rect.width + 'px';
                indicator.style.transform = `translateX(${rect.left - parentRect.left - 4}px)`;
            }
        }
        // Mobile bottom-nav indicator
        const mob = document.querySelector('.mobile-nav');
        if (mob) {
            const active = mob.querySelector('.mobile-tab.active');
            const indicator = mob.querySelector('.mobile-tab-indicator');
            if (active && indicator) {
                const rect = active.getBoundingClientRect();
                const parentRect = mob.getBoundingClientRect();
                indicator.style.width = rect.width + 'px';
                indicator.style.transform = `translateX(${rect.left - parentRect.left}px)`;
            }
        }
    }

    function setupTabs() {
        document.querySelectorAll('[data-tab]').forEach(b => {
            b.addEventListener('click', () => switchTab(b.dataset.tab));
        });
        // Initial position
        requestAnimationFrame(() => requestAnimationFrame(updateTabIndicators));
        window.addEventListener('resize', updateTabIndicators);
        // Re-position once fonts load
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(updateTabIndicators);
        }
        const goCat = $('goCatalogBtn');
        if (goCat) goCat.addEventListener('click', () => switchTab('catalog'));
    }

    // ==============================================================
    // MORE MENU (3-dot dropdown)
    // ==============================================================
    function setupMoreMenu() {
        const btn = $('btnMoreMenu');
        const menu = $('moreMenu');
        if (!btn || !menu) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== btn) {
                menu.classList.add('hidden');
            }
        });
        menu.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => menu.classList.add('hidden'));
        });
    }

    // ==============================================================
    // SAVED SCHEDULES
    // ==============================================================
    const SAVED_KEY = 'au_saved_schedules_v1';
    function getSavedSchedules() {
        try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
        catch { return []; }
    }
    function setSavedSchedules(list) {
        localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    }

    let compareMode = false;
    let compareSelection = []; // array of saved-schedule ids (max 2)

    function openSaveModal() {
        const m = $('saveScheduleModal');
        const input = $('saveNameInput');
        const def = `${selectedCourseIds.size} courses · ${new Date().toLocaleDateString('en-IN', {day:'numeric', month:'short'})}`;
        input.value = def;
        m.classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 50);
    }
    function closeSaveModal() {
        $('saveScheduleModal').classList.add('hidden');
    }

    function saveCurrentSchedule(name) {
        if (generatedSchedules.length === 0) return;
        const combo = generatedSchedules[currentScheduleIndex];
        const list = getSavedSchedules();
        const stats = scheduler.getStats(combo);
        list.unshift({
            id: 'sv_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
            name: (name || 'Untitled').trim().slice(0, 60) || 'Untitled',
            createdAt: Date.now(),
            courseIds: combo.map(({course}) => course.id),
            // courseCode → sectionId mapping for lookups
            sectionMap: Object.fromEntries(combo.map(({course, section}) => [course.code, section.id])),
            preferredSections: { ...preferredSections },
            pinnedSections: Array.from(pinnedSections),
            stats: { credits: stats.totalCredits, hours: stats.totalHours, days: stats.daysCount },
            // for unique recovery in case courses re-imported (id changes)
            courseCodes: combo.map(({course}) => course.code),
        });
        setSavedSchedules(list.slice(0, 30));
        showToast('Schedule saved');
        renderSavedStrip();
    }

    function findScheduleMatchingMap(map) {
        // find index in generatedSchedules whose combo matches the section map by code
        for (let i = 0; i < generatedSchedules.length; i++) {
            const combo = generatedSchedules[i];
            const ok = combo.every(({course, section}) =>
                !map[course.code] || map[course.code] === section.id ||
                map[course.code] === section.name || section.id.endsWith(map[course.code])
            );
            if (ok) return i;
        }
        return 0;
    }

    function loadSavedSchedule(id) {
        const saved = getSavedSchedules().find(s => s.id === id);
        if (!saved) return;
        // Restore selections by course code (id may have changed across re-imports)
        selectedCourseIds.clear();
        pinnedSections.clear();
        Object.keys(preferredSections).forEach(k => delete preferredSections[k]);

        let missing = [];
        saved.courseCodes.forEach((code, i) => {
            const course = ALL_COURSES.find(c => c.code === code);
            if (course) {
                selectedCourseIds.add(course.id);
                // Try to find matching section by name within the section map
                const wantedName = saved.sectionMap[code];
                const matchingIdx = course.sections.findIndex(s => s.id === wantedName || s.name === wantedName);
                if (matchingIdx >= 0) preferredSections[course.id] = matchingIdx;
            } else {
                missing.push(code);
            }
        });

        if (missing.length) {
            showToast(`${missing.length} course${missing.length>1?'s':''} not in current data: ${missing.join(', ')}`);
        }

        updateSelectedPanel();
        updateDashboard();
        renderCourses();
        if (selectedCourseIds.size >= 2) {
            // generate and pick best matching
            generatedSchedules = scheduler.generate(
                ALL_COURSES.filter(c => selectedCourseIds.has(c.id)),
                preferredSections,
                pinnedSections
            );
            currentScheduleIndex = findScheduleMatchingMap(saved.sectionMap);
            if (generatedSchedules.length === 0) {
                $('scheduleEmpty').classList.remove('hidden');
                $('scheduleSection').classList.add('hidden');
            } else {
                $('scheduleEmpty').classList.add('hidden');
                $('scheduleSection').classList.remove('hidden');
                $('noSchedule').classList.add('hidden');
                $('timetableContainer').classList.remove('hidden');
                $('scheduleSummary').classList.remove('hidden');
                renderSchedule();
            }
            switchTab('schedule');
            showToast(`Loaded "${saved.name}"`);
        }
    }

    function deleteSavedSchedule(id) {
        const list = getSavedSchedules().filter(s => s.id !== id);
        setSavedSchedules(list);
        compareSelection = compareSelection.filter(x => x !== id);
        renderSavedStrip();
    }

    function renderSavedStrip() {
        const strip = $('savedStrip');
        const list = getSavedSchedules();
        $('savedStripCount').textContent = list.length;
        $('btnCompareToggle').classList.toggle('hidden', list.length < 2);

        if (list.length === 0) {
            strip.classList.add('hidden');
            return;
        }
        strip.classList.remove('hidden');

        const courseColor = (code) => {
            // deterministic color from code hash
            let h = 0;
            for (const c of code) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
            return Math.abs(h) % 10;
        };

        $('savedList').innerHTML = list.map((s, idx) => {
            const date = new Date(s.createdAt);
            const dateStr = date.toLocaleDateString('en-IN', {day:'numeric', month:'short'}) + ' · ' +
                date.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
            const selected = compareMode && compareSelection.includes(s.id);
            return `
                <div class="saved-card ${selected?'compare-selected':''}" data-saved-id="${s.id}" style="animation-delay: ${idx*40}ms">
                    <div class="saved-card-top">
                        <div>
                            <div class="saved-card-name">${s.name}</div>
                            <div class="saved-card-date">${dateStr}</div>
                        </div>
                        <div class="saved-card-actions">
                            <button class="rename-btn" title="Rename" data-action="rename">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="delete-btn" title="Delete" data-action="delete">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="saved-card-courses">
                        ${s.courseCodes.map(c => `<span class="mini-code tt-color-${courseColor(c)}">${c}</span>`).join('')}
                    </div>
                    <div class="saved-card-stats">
                        <span><strong>${s.stats.credits}</strong>cr</span>
                        <span><strong>${s.stats.hours}</strong>h/wk</span>
                        <span><strong>${s.stats.days}</strong>days</span>
                    </div>
                </div>
            `;
        }).join('');

        // Bind events
        $('savedList').querySelectorAll('.saved-card').forEach(card => {
            const id = card.dataset.savedId;
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                if (compareMode) {
                    const idx = compareSelection.indexOf(id);
                    if (idx >= 0) compareSelection.splice(idx, 1);
                    else if (compareSelection.length < 2) compareSelection.push(id);
                    else { compareSelection.shift(); compareSelection.push(id); }
                    renderSavedStrip();
                    if (compareSelection.length === 2) renderCompareView();
                } else {
                    loadSavedSchedule(id);
                }
            });
            card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this saved schedule?')) deleteSavedSchedule(id);
            });
            card.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
                e.stopPropagation();
                const list = getSavedSchedules();
                const s = list.find(x => x.id === id);
                if (!s) return;
                const newName = prompt('Rename schedule:', s.name);
                if (newName !== null && newName.trim()) {
                    s.name = newName.trim().slice(0, 60);
                    setSavedSchedules(list);
                    renderSavedStrip();
                }
            });
        });
    }

    // Compare mode
    function toggleCompareMode() {
        compareMode = !compareMode;
        compareSelection = [];
        $('btnCompareToggle').classList.toggle('active', compareMode);
        $('btnCompareToggle').querySelector('svg + *')?.replaceWith?.(document.createTextNode(compareMode ? 'Exit' : 'Compare'));
        const txt = $('btnCompareToggle');
        txt.innerHTML = compareMode
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg> Compare';
        if (compareMode) {
            showToast('Select 2 saved schedules to compare');
        } else {
            $('compareView').classList.add('hidden');
            $('scheduleEmpty').classList.toggle('hidden', generatedSchedules.length > 0);
            $('scheduleSection').classList.toggle('hidden', generatedSchedules.length === 0);
            $('savedStrip').classList.remove('hidden');
        }
        renderSavedStrip();
    }

    function renderCompareView() {
        const list = getSavedSchedules();
        const a = list.find(s => s.id === compareSelection[0]);
        const b = list.find(s => s.id === compareSelection[1]);
        if (!a || !b) return;

        // Hide other views temporarily
        $('scheduleSection').classList.add('hidden');
        $('scheduleEmpty').classList.add('hidden');
        $('savedStrip').classList.add('hidden');
        $('compareView').classList.remove('hidden');

        const aCodes = new Set(a.courseCodes);
        const bCodes = new Set(b.courseCodes);
        const onlyA = a.courseCodes.filter(c => !bCodes.has(c));
        const onlyB = b.courseCodes.filter(c => !aCodes.has(c));

        $('compareStats').innerHTML = `
            <span class="stat-item"><span class="stat-value">${a.stats.hours - b.stats.hours > 0 ? '+' : ''}${(a.stats.hours - b.stats.hours).toFixed(1)}h</span><span class="stat-label">Δ hours</span></span>
            <span class="stat-item"><span class="stat-value">${a.stats.days - b.stats.days > 0 ? '+' : ''}${a.stats.days - b.stats.days}</span><span class="stat-label">Δ days</span></span>
        `;

        function buildPane(sv, otherCodes, diffCodes) {
            // Reconstruct combo from current ALL_COURSES + sectionMap
            const combo = [];
            sv.courseCodes.forEach(code => {
                const c = ALL_COURSES.find(x => x.code === code);
                if (!c) return;
                const wantedSec = sv.sectionMap[code];
                const sec = c.sections.find(s => s.id === wantedSec || s.name === wantedSec) || c.sections[0];
                combo.push({course: c, section: sec});
            });
            const html = buildTimetableHtml(combo);
            const courseColor = (code) => {
                let h = 0; for (const ch of code) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
                return Math.abs(h) % 10;
            };
            const courseRows = sv.courseCodes.map(code => {
                const c = ALL_COURSES.find(x => x.code === code);
                const isDiff = diffCodes.includes(code);
                return `<div class="compare-course-row ${isDiff?'diff':''}">
                    <span class="dot" style="background: var(--c${courseColor(code)});"></span>
                    <span>${c ? c.name : code}</span>
                    <span class="mini-code">${code}</span>
                </div>`;
            }).join('');
            return `
                <div class="compare-pane">
                    <div class="compare-pane-header">
                        <div class="compare-pane-name">${sv.name}</div>
                        <div class="compare-pane-meta">
                            <span><strong>${sv.stats.credits}</strong>cr</span>
                            <span><strong>${sv.stats.hours}</strong>h/wk</span>
                            <span><strong>${sv.stats.days}</strong> days</span>
                        </div>
                    </div>
                    <div class="timetable-container" style="padding:0;border:none;box-shadow:none;background:transparent;">
                        <div class="timetable">${html}</div>
                    </div>
                    <div class="compare-courses">
                        <h5>Courses (${sv.courseCodes.length}) ${diffCodes.length?'· highlighted differ':''}</h5>
                        ${courseRows}
                    </div>
                </div>
            `;
        }
        $('compareGrid').innerHTML = buildPane(a, bCodes, onlyA) + buildPane(b, aCodes, onlyB);
    }

    function buildTimetableHtml(combo) {
        let minTime = 1440, maxTime = 0;
        combo.forEach(({section}) => {
            section.schedule.forEach(s => {
                minTime = Math.min(minTime, scheduler.timeToMinutes(s.startTime));
                maxTime = Math.max(maxTime, scheduler.timeToMinutes(s.endTime));
            });
        });
        if (combo.length === 0 || minTime >= maxTime) { minTime = 540; maxTime = 1080; }
        minTime = Math.floor(minTime / 60) * 60;
        maxTime = Math.ceil(maxTime / 60) * 60;
        const slots = []; for (let t = minTime; t < maxTime; t += 60) slots.push(t);
        const colorMap = {};
        combo.forEach(({course}, i) => { colorMap[course.id] = i % 10; });
        let html = '<div class="tt-header"></div>';
        DAYS.forEach(d => { html += `<div class="tt-header">${d}</div>`; });
        slots.forEach(t => {
            html += `<div class="tt-time">${scheduler.minutesToTime(t)}</div>`;
            DAYS.forEach(day => {
                let block = '';
                combo.forEach(({course, section}) => {
                    section.schedule.forEach(slot => {
                        const ss = scheduler.timeToMinutes(slot.startTime);
                        if (slot.day === day && ss >= t && ss < t + 60) {
                            block = `<div class="tt-block tt-color-${colorMap[course.id]}"><span class="tt-block-name">${course.code}</span><span class="tt-block-section">${section.name}</span></div>`;
                        }
                    });
                });
                html += `<div class="tt-cell">${block}</div>`;
            });
        });
        return html;
    }

    // ==============================================================
    // INSIGHTS
    // ==============================================================
    function renderInsights() {
        const body = $('insightsBody');
        const empty = $('insightsEmpty');
        if (generatedSchedules.length === 0) {
            body.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }
        body.classList.remove('hidden');
        empty.classList.add('hidden');

        const combo = generatedSchedules[currentScheduleIndex];
        $('insightsScheduleName').textContent = `Schedule ${currentScheduleIndex+1} of ${generatedSchedules.length}`;

        // Gather all slots
        const allSlots = [];
        combo.forEach(({course, section}) => {
            section.schedule.forEach(s => allSlots.push({...s, course}));
        });

        // KPIs
        const daysUsed = new Set(allSlots.map(s => s.day));
        const totalMinutes = allSlots.reduce((a, s) =>
            a + (scheduler.timeToMinutes(s.endTime) - scheduler.timeToMinutes(s.startTime)), 0);
        const totalHours = (totalMinutes / 60).toFixed(1);
        const totalCredits = combo.reduce((a, {course}) => a + course.credits, 0);
        const freeDays = DAYS.filter(d => !daysUsed.has(d));
        let earliest = 1440, latest = 0;
        allSlots.forEach(s => {
            earliest = Math.min(earliest, scheduler.timeToMinutes(s.startTime));
            latest = Math.max(latest, scheduler.timeToMinutes(s.endTime));
        });

        // Per-day hours
        const dayHours = {};
        DAYS.forEach(d => dayHours[d] = 0);
        allSlots.forEach(s => {
            const dur = scheduler.timeToMinutes(s.endTime) - scheduler.timeToMinutes(s.startTime);
            dayHours[s.day] += dur / 60;
        });
        const longestEntry = Object.entries(dayHours).reduce((a, b) => b[1] > a[1] ? b : a, ['—', 0]);

        // Compactness: ratio of total class time to (latest - earliest) * daysUsed
        let compactness = 0;
        if (daysUsed.size > 0) {
            const dayStretches = {};
            allSlots.forEach(s => {
                if (!dayStretches[s.day]) dayStretches[s.day] = {min: 1440, max: 0};
                dayStretches[s.day].min = Math.min(dayStretches[s.day].min, scheduler.timeToMinutes(s.startTime));
                dayStretches[s.day].max = Math.max(dayStretches[s.day].max, scheduler.timeToMinutes(s.endTime));
            });
            const occupied = totalMinutes;
            const stretch = Object.values(dayStretches).reduce((a,d) => a + (d.max - d.min), 0);
            compactness = stretch > 0 ? Math.round((occupied / stretch) * 100) : 0;
        }

        const kpis = [
            { label: 'Total credits', value: totalCredits, sub: `${combo.length} courses` },
            { label: 'Weekly hours', value: totalHours + 'h', sub: `${allSlots.length} sessions` },
            { label: 'Longest day', value: longestEntry[1].toFixed(1) + 'h', sub: longestEntry[0] || '—' },
            { label: 'Earliest start', value: scheduler.minutesToTime(earliest), sub: 'across the week' },
            { label: 'Latest end', value: scheduler.minutesToTime(latest), sub: 'across the week' },
            { label: 'Free days', value: freeDays.length, sub: freeDays.join(', ') || 'busy every day' },
            { label: 'Compactness', value: compactness + '%', sub: compactness > 70 ? 'tight schedule' : compactness > 40 ? 'moderate' : 'spread out' },
        ];
        $('insightsKpis').innerHTML = kpis.map((k, i) => `
            <div class="kpi" style="animation-delay:${i*60}ms">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-sub">${k.sub}</div>
                <div class="kpi-dot"></div>
            </div>
        `).join('');

        // Heatmap (6 days × hourly grid based on min/max)
        const hStart = Math.max(8, Math.floor(earliest/60) - 0);
        const hEnd = Math.min(20, Math.ceil(latest/60) + 1);
        const heatHours = [];
        for (let h = hStart; h < hEnd; h++) heatHours.push(h);
        // density: each cell = total minutes of class in that day-hour
        const density = {};
        heatHours.forEach(h => DAYS.forEach(d => density[`${d}_${h}`] = 0));
        allSlots.forEach(s => {
            const start = scheduler.timeToMinutes(s.startTime);
            const end = scheduler.timeToMinutes(s.endTime);
            for (let h = hStart; h < hEnd; h++) {
                const cellStart = h * 60, cellEnd = (h+1)*60;
                const overlap = Math.max(0, Math.min(end, cellEnd) - Math.max(start, cellStart));
                if (overlap > 0) density[`${s.day}_${h}`] += overlap;
            }
        });
        const maxD = Math.max(60, ...Object.values(density));
        let heatHtml = '<div class="heat-corner"></div>';
        DAYS.forEach(d => heatHtml += `<div class="heat-day-label">${d}</div>`);
        heatHours.forEach((h, hi) => {
            heatHtml += `<div class="heat-hour-label">${h.toString().padStart(2,'0')}:00</div>`;
            DAYS.forEach((d, di) => {
                const v = density[`${d}_${h}`];
                const intensity = (v / maxD).toFixed(3);
                heatHtml += `<div class="heat-cell" data-active="${v>0}" style="--intensity:${intensity}; animation-delay:${(hi*6+di)*15}ms" title="${d} ${h}:00 — ${(v/60).toFixed(1)}h"></div>`;
            });
        });
        $('heatmap').innerHTML = heatHtml;

        // Balance bars
        const maxHrs = Math.max(...Object.values(dayHours), 1);
        $('balanceBars').innerHTML = DAYS.map(d => {
            const h = dayHours[d];
            const empty = h === 0;
            return `
                <div class="balance-row ${empty?'empty':''}">
                    <div class="balance-day">${d}</div>
                    <div class="balance-track"><div class="balance-fill" style="--pct: ${(h/maxHrs)*100}%"></div></div>
                    <div class="balance-val ${empty?'empty':''}">${empty?'free':h.toFixed(1)+'h'}</div>
                </div>
            `;
        }).join('');

        // Per-day breakdown
        const dayClasses = {};
        DAYS.forEach(d => dayClasses[d] = []);
        combo.forEach(({course, section}, ci) => {
            section.schedule.forEach(s => {
                dayClasses[s.day].push({...s, course, colorIdx: ci % 10});
            });
        });
        // sort each day by start time
        DAYS.forEach(d => dayClasses[d].sort((a,b) => scheduler.timeToMinutes(a.startTime) - scheduler.timeToMinutes(b.startTime)));

        $('perdayGrid').innerHTML = DAYS.map((d, di) => {
            const cls = dayClasses[d];
            if (cls.length === 0) {
                return `
                    <div class="perday-card empty" style="animation-delay:${di*60}ms">
                        <div class="perday-day-name">${d}</div>
                        <div class="perday-day-sub">No classes</div>
                        <span class="perday-empty-tag">Free</span>
                    </div>
                `;
            }
            const totalMin = cls.reduce((a,c)=>a + (scheduler.timeToMinutes(c.endTime)-scheduler.timeToMinutes(c.startTime)), 0);
            return `
                <div class="perday-card" style="animation-delay:${di*60}ms">
                    <div class="perday-day-name">${d}</div>
                    <div class="perday-day-sub">${cls.length} class${cls.length>1?'es':''} · ${cls[0].startTime}–${cls[cls.length-1].endTime}</div>
                    <div class="perday-classes">
                        ${cls.map(c => {
                            const colorMap = {};
                            combo.forEach(({course}, i) => { colorMap[course.id] = i % 10; });
                            return `
                            <div class="perday-class tt-color-${colorMap[c.course.id]}" style="border-left-color: var(--c${colorMap[c.course.id]});">
                                <span class="perday-class-time">${c.startTime}–${c.endTime}</span>
                                <span class="perday-class-code">${c.course.code}</span>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="perday-summary">
                        <span><strong>${(totalMin/60).toFixed(1)}</strong>h class</span>
                        <span>${cls.length>1 ? `<strong>${gapBetween(cls)}</strong>min gap` : 'no gaps'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function gapBetween(cls) {
        if (cls.length < 2) return 0;
        let total = 0;
        for (let i = 1; i < cls.length; i++) {
            total += Math.max(0, scheduler.timeToMinutes(cls[i].startTime) - scheduler.timeToMinutes(cls[i-1].endTime));
        }
        return total;
    }

    // ==============================================================
    // SWIPE GESTURES on timetable (mobile)
    // ==============================================================
    function setupSwipe() {
        const target = $('timetableContainer');
        if (!target) return;
        let startX = 0, startY = 0, startT = 0, moved = false;
        target.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startT = Date.now();
            moved = false;
        }, {passive: true});
        target.addEventListener('touchmove', (e) => {
            if (!startT) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (Math.abs(dx) > 40 && Math.abs(dy) < 50) moved = true;
        }, {passive: true});
        target.addEventListener('touchend', (e) => {
            if (!startT) return;
            const dx = (e.changedTouches[0]?.clientX || 0) - startX;
            const dt = Date.now() - startT;
            if (moved && dt < 600 && Math.abs(dx) > 60) {
                if (dx < 0 && currentScheduleIndex < generatedSchedules.length - 1) {
                    currentScheduleIndex++; renderSchedule();
                } else if (dx > 0 && currentScheduleIndex > 0) {
                    currentScheduleIndex--; renderSchedule();
                }
            }
            startT = 0;
        });
    }

    // ==============================================================
    // CANVAS RENDERER — high-res schedule image (modern-CSS safe)
    // ==============================================================
    function renderScheduleToCanvas(combo, schedIndex, total) {
        // Time range
        let minTime = 1440, maxTime = 0;
        combo.forEach(({section}) => {
            section.schedule.forEach(s => {
                minTime = Math.min(minTime, scheduler.timeToMinutes(s.startTime));
                maxTime = Math.max(maxTime, scheduler.timeToMinutes(s.endTime));
            });
        });
        if (minTime >= maxTime) { minTime = 540; maxTime = 1080; }
        minTime = Math.floor(minTime / 60) * 60;
        maxTime = Math.ceil(maxTime / 60) * 60;
        const hours = Math.ceil((maxTime - minTime) / 60);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const P = {
            bg:       isDark ? '#15120e' : '#f4efe7',
            paper:    isDark ? '#211c16' : '#ede6d9',
            card:     isDark ? '#1f1a14' : '#fbf8f2',
            ink:      isDark ? '#f3eee4' : '#1d1a16',
            inkSoft:  isDark ? '#d5cebe' : '#423d36',
            inkMute:  isDark ? '#948a78' : '#807870',
            rule:     isDark ? '#38312a' : '#d9d2c2',
            ruleSoft: isDark ? '#2a241e' : '#e5dfcf',
            au:       '#8a2326',
        };

        // 10-color palette — RGB approximations of the oklch wheel in styles.css
        const palette = [
            { bg: '#fbeded', border: '#8a2326', text: '#5e171a' }, // AU
            { bg: '#fce0d2', border: '#c2532f', text: '#5a1f0a' }, // 30
            { bg: '#f6e4be', border: '#a87333', text: '#4d3408' }, // 60
            { bg: '#dde9c8', border: '#5e8a2a', text: '#26380a' }, // 130
            { bg: '#c8e6e0', border: '#1e8e87', text: '#0a3833' }, // 180
            { bg: '#c8def0', border: '#2e76b8', text: '#0a2a4d' }, // 220
            { bg: '#d6dbf2', border: '#4a5fc4', text: '#1a214d' }, // 260
            { bg: '#e6d4ec', border: '#8a4dab', text: '#36154d' }, // 300
            { bg: '#f3d5e1', border: '#bb3f7c', text: '#4a0e2e' }, // 340
            { bg: '#ece7c2', border: '#8e8327', text: '#3a350a' }, // 90
        ];
        // Dark-mode block recoloring
        if (isDark) {
            palette.forEach((p, i) => {
                p.bg = `color-mix-safe-${i}`; // placeholder, will overwrite
            });
            const darkBg = ['#3a1518','#41201a','#3e3009','#23310a','#0c2e2c','#0e2440','#1a2052','#2e1144','#42102e','#332f0c'];
            const darkText = ['#f5d5d6','#f5d6c5','#ecd9a6','#cdd7a8','#a9d3cc','#a4c8e8','#bcc1f0','#d6b6e2','#f2bdce','#dad29c'];
            palette.forEach((p, i) => { p.bg = darkBg[i]; p.text = darkText[i]; });
        }

        // Dimensions
        const DPR = 2;
        const W = 1800;
        const PAD = 64;
        const headerH = 120;
        const dayHeaderH = 56;
        const rowH = 110;
        const footerH = 64;
        const H = headerH + dayHeaderH + hours * rowH + footerH + PAD * 2;

        const canvas = document.createElement('canvas');
        canvas.width = W * DPR;
        canvas.height = H * DPR;
        const ctx = canvas.getContext('2d');
        ctx.scale(DPR, DPR);

        // Subtle textured background
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, W, H);

        // ===== HEADER =====
        ctx.fillStyle = P.au;
        ctx.font = '600 11px "Geist Mono", ui-monospace, monospace';
        ctx.textBaseline = 'top';
        ctx.fillText('AHMEDABAD UNIVERSITY · COURSE SCHEDULE', PAD, PAD);

        ctx.fillStyle = P.ink;
        ctx.font = '400 44px "Newsreader", Georgia, serif';
        ctx.fillText(`Schedule ${schedIndex + 1} of ${total}`, PAD, PAD + 24);

        const totalCredits = combo.reduce((a, {course}) => a + course.credits, 0);
        const totalMins = combo.reduce((a, {section}) =>
            a + section.schedule.reduce((b, s) =>
                b + (scheduler.timeToMinutes(s.endTime) - scheduler.timeToMinutes(s.startTime)), 0), 0);
        const daysUsed = new Set();
        combo.forEach(({section}) => section.schedule.forEach(s => daysUsed.add(s.day)));

        ctx.fillStyle = P.inkSoft;
        ctx.font = '400 18px "Newsreader", Georgia, serif';
        ctx.fillStyle = P.inkMute;
        ctx.fillText(`${combo.length} courses  ·  ${totalCredits} credits  ·  ${(totalMins/60).toFixed(1)} hrs/week  ·  ${daysUsed.size} active day${daysUsed.size>1?'s':''}`,
            PAD, PAD + 80);

        // Date on right
        ctx.textAlign = 'right';
        ctx.font = '500 11px "Geist Mono", monospace';
        ctx.fillStyle = P.inkMute;
        const dateStr = new Date().toLocaleDateString('en-IN', {day:'numeric', month:'long', year:'numeric'}).toUpperCase();
        ctx.fillText(dateStr, W - PAD, PAD);
        ctx.textAlign = 'left';

        // Divider
        ctx.strokeStyle = P.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, PAD + headerH - 8);
        ctx.lineTo(W - PAD, PAD + headerH - 8);
        ctx.stroke();

        // ===== GRID =====
        const gridLeft = PAD;
        const gridTop = PAD + headerH;
        const gridWidth = W - 2*PAD;
        const timeColW = 90;
        const dayColW = (gridWidth - timeColW) / 6;

        // Day header row background
        ctx.fillStyle = P.paper;
        roundedRect(ctx, gridLeft, gridTop, gridWidth, dayHeaderH, 8);
        ctx.fill();

        // Day labels
        ctx.fillStyle = P.inkSoft;
        ctx.font = '600 13px "Geist Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        DAYS.forEach((d, i) => {
            ctx.fillText(d.toUpperCase(),
                gridLeft + timeColW + dayColW*i + dayColW/2,
                gridTop + dayHeaderH/2);
        });

        // Time column + horizontal grid lines
        ctx.textAlign = 'right';
        ctx.font = '500 13px "Geist Mono", monospace';
        ctx.fillStyle = P.inkMute;
        for (let h = 0; h < hours; h++) {
            const t = minTime + h * 60;
            const y = gridTop + dayHeaderH + h * rowH;
            ctx.fillText(scheduler.minutesToTime(t), gridLeft + timeColW - 14, y + rowH/2);
        }

        ctx.strokeStyle = P.rule;
        ctx.lineWidth = 1;
        for (let h = 0; h <= hours; h++) {
            const y = gridTop + dayHeaderH + h * rowH;
            ctx.beginPath();
            ctx.moveTo(gridLeft + timeColW - 2, y);
            ctx.lineTo(gridLeft + gridWidth, y);
            ctx.stroke();
        }
        for (let i = 0; i <= 6; i++) {
            const x = gridLeft + timeColW + dayColW * i;
            ctx.beginPath();
            ctx.moveTo(x, gridTop + dayHeaderH);
            ctx.lineTo(x, gridTop + dayHeaderH + hours * rowH);
            ctx.stroke();
        }

        // Course color map
        const colorMap = {};
        combo.forEach(({course}, i) => { colorMap[course.id] = i % 10; });

        // ===== BLOCKS =====
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        combo.forEach(({course, section}) => {
            const cIdx = colorMap[course.id];
            const c = palette[cIdx];
            section.schedule.forEach(slot => {
                const dayIdx = DAYS.indexOf(slot.day);
                if (dayIdx < 0) return;
                const startMin = scheduler.timeToMinutes(slot.startTime);
                const endMin = scheduler.timeToMinutes(slot.endTime);
                const top = gridTop + dayHeaderH + ((startMin - minTime) / 60) * rowH + 4;
                const height = ((endMin - startMin) / 60) * rowH - 8;
                const left = gridLeft + timeColW + dayColW * dayIdx + 4;
                const width = dayColW - 8;

                // Background
                ctx.fillStyle = c.bg;
                roundedRect(ctx, left, top, width, height, 8);
                ctx.fill();

                // Left accent
                ctx.fillStyle = c.border;
                ctx.fillRect(left, top, 4, height);

                // Course code
                ctx.fillStyle = c.text;
                ctx.font = '700 15px "Geist Mono", monospace';
                ctx.fillText(course.code, left + 14, top + 14);

                // Course name (wrapped)
                ctx.font = '500 14px "Newsreader", Georgia, serif';
                wrapText(ctx, course.name, left + 14, top + 36, width - 24, 18, height > 90 ? 3 : 2);

                // Bottom meta
                ctx.font = '500 11px "Geist Mono", monospace';
                ctx.globalAlpha = 0.7;
                ctx.fillText(`${section.name}  ·  ${slot.startTime}\u2013${slot.endTime}`, left + 14, top + height - 22);
                ctx.globalAlpha = 1;
            });
        });

        // ===== LEGEND / COURSE LIST under grid =====
        const legendTop = gridTop + dayHeaderH + hours * rowH + 28;
        ctx.fillStyle = P.inkMute;
        ctx.font = '600 11px "Geist Mono", monospace';
        ctx.fillText('COURSES IN THIS SCHEDULE', PAD, legendTop);

        // Legend rows
        const legendY = legendTop + 22;
        const cols = combo.length <= 4 ? combo.length : Math.ceil(combo.length / 2);
        const colW = (gridWidth) / cols;
        combo.forEach(({course, section}, i) => {
            const row = combo.length > 4 ? Math.floor(i / cols) : 0;
            const col = combo.length > 4 ? (i % cols) : i;
            const x = PAD + col * colW;
            const y = legendY + row * 24;
            const c = palette[colorMap[course.id]];
            // Color dot
            ctx.fillStyle = c.border;
            ctx.beginPath();
            ctx.arc(x + 6, y + 8, 5, 0, Math.PI*2);
            ctx.fill();
            // Code
            ctx.fillStyle = P.ink;
            ctx.font = '600 12px "Geist Mono", monospace';
            ctx.fillText(course.code, x + 18, y + 2);
            // Name
            ctx.fillStyle = P.inkSoft;
            ctx.font = '500 13px "Newsreader", Georgia, serif';
            const codeW = ctx.measureText(course.code).width;
            ctx.font = '400 13px "Newsreader", Georgia, serif';
            const maxNameW = colW - 24 - codeW - 60;
            const truncName = truncText(ctx, course.name, maxNameW);
            ctx.fillText(truncName, x + 18 + codeW + 10, y + 2);
            // Section + credits
            ctx.fillStyle = P.inkMute;
            ctx.font = '500 11px "Geist Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${section.name} · ${course.credits}cr`, x + colW - 14, y + 2);
            ctx.textAlign = 'left';
        });

        // ===== FOOTER =====
        ctx.textAlign = 'center';
        ctx.fillStyle = P.inkMute;
        ctx.font = '500 10px "Geist Mono", monospace';
        ctx.fillText('GENERATED BY AU SCHEDULER  ·  AHMEDABAD UNIVERSITY', W/2, H - PAD - 12);

        return canvas;
    }

    function roundedRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w/2, h/2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && line) {
                lines.push(line);
                line = w;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        const shown = lines.slice(0, maxLines);
        if (lines.length > maxLines && shown.length > 0) {
            let last = shown[shown.length - 1];
            while (ctx.measureText(last + '…').width > maxW && last.length > 1) {
                last = last.slice(0, -1);
            }
            shown[shown.length - 1] = last + '…';
        }
        shown.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    }
    function truncText(ctx, text, maxW) {
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
        return t + '…';
    }

    // ==============================================================
    // DEMO DATA — for first-time visitors
    // ==============================================================
    function loadDemoCourses() {
        const mk = (code, n, day, st, en) => ({
            id: `s_${code}_${n}_${Math.random().toString(36).slice(2,5)}`,
            name: `Section ${n}`,
            schedule: Array.isArray(day) ? day : [{day, startTime: st, endTime: en, room: ''}]
        });
        const demo = [
            {code:'CSE523', name:'Artificial Intelligence', credits:4, type:'major_elective', school:'SEAS', faculty:'Mehul Raval, Pratik Shah',
              description:'Foundational concepts of AI: search, knowledge representation, planning, and machine learning.',
              sections:[mk('CSE523',1,'Mon','09:00','10:30'), mk('CSE523',2,'Wed','11:00','12:30'), mk('CSE523',3,'Fri','14:00','15:30')]},
            {code:'CSE516', name:'Computer Vision', credits:4, type:'major_elective', school:'SEAS', faculty:'Anjali Patel',
              description:'Image formation, feature detection, segmentation, and object recognition.',
              sections:[mk('CSE516',1,'Tue','14:00','15:30'), mk('CSE516',2,'Thu','10:00','11:30')]},
            {code:'CSE545', name:'Cloud Computing', credits:4, type:'major_elective', school:'SEAS', faculty:'Rakesh Bhatt',
              description:'Distributed systems, virtualization, container orchestration, cloud architectures.',
              sections:[mk('CSE545',1,'Wed','09:00','10:30'), mk('CSE545',2,'Fri','11:00','12:30')]},
            {code:'PHI201', name:'Introduction to Philosophy', credits:3, type:'ger', school:'SAS',
              gerCategory:'Humanities & Languages', faculty:'Riya Shah',
              description:'Survey of major philosophical traditions, ethics, and metaphysics.',
              sections:[mk('PHI201',1,'Mon','14:00','15:30'), mk('PHI201',2,'Thu','14:00','15:30')]},
            {code:'ECO102', name:'Principles of Microeconomics', credits:3, type:'ger', school:'AMSOM',
              gerCategory:'Social Sciences', faculty:'Vivek Iyer',
              description:'Demand, supply, market structures, consumer behavior, welfare economics.',
              sections:[mk('ECO102',1,'Wed','14:00','15:30'), mk('ECO102',2,'Fri','09:00','10:30')]},
            {code:'LIT110', name:'Literature & Society', credits:3, type:'ger', school:'SAS',
              gerCategory:'Humanities & Languages', faculty:'Anjana Mehta',
              description:'Reading literature as a lens onto cultural and political formations.',
              sections:[mk('LIT110',1,'Tue','09:00','10:30'), mk('LIT110',2,'Thu','16:00','17:30')]},
            {code:'MAT220', name:'Linear Algebra', credits:4, type:'other', school:'SAS', faculty:'Suresh Kumar',
              description:'Vector spaces, linear maps, eigenvalues, applications in data science.',
              sections:[mk('MAT220',1,'Mon','11:00','12:30'), mk('MAT220',2,'Thu','11:00','12:30')]},
            {code:'BIO115', name:'Cell Biology', credits:3, type:'ger', school:'SAS',
              gerCategory:'Natural Sciences', faculty:'Priya Desai',
              description:'Structure and function of eukaryotic cells, membranes, signaling.',
              sections:[mk('BIO115',1,'Tue','11:00','12:30'), mk('BIO115',2,'Fri','14:00','15:30')]},
            {code:'CSE418', name:'Internet of Things', credits:3, type:'major_elective', school:'SEAS', faculty:'Karthik Nair',
              description:'Embedded systems, sensor networks, edge computing, IoT protocols.',
              sections:[mk('CSE418',1,'Mon','16:00','17:30'), mk('CSE418',2,'Wed','16:00','17:30')]},
            {code:'PSY101', name:'Introduction to Psychology', credits:3, type:'ger', school:'SAS',
              gerCategory:'Social Sciences', faculty:'Neha Joshi',
              description:'Major schools of psychological thought; cognition, learning, behavior.',
              sections:[mk('PSY101',1,'Thu','09:00','10:30'), mk('PSY101',2,'Fri','16:00','17:30')]},
        ];
        ALL_COURSES.length = 0;
        demo.forEach((c, i) => {
            c.id = `demo_${c.code}_${i}`;
            c.gerCategory = c.gerCategory || '';
            c.description = c.description || '';
            ALL_COURSES.push(c);
        });
        populateSchoolFilter();
        populateGERCategoryFilter();
        populateCreditFilter();
        updateDashboard();
        renderCourses();
        showToast('Loaded 10 sample courses — try selecting a few');
    }

    // ==============================================================
    // KEYBOARD SHORTCUTS
    // ==============================================================
    function setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Skip when typing in inputs
            const inField = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
            if (inField && e.key !== 'Escape') return;

            if (e.key === '1') { switchTab('catalog'); e.preventDefault(); }
            if (e.key === '2') { switchTab('schedule'); e.preventDefault(); }
            if (e.key === '3') { switchTab('insights'); e.preventDefault(); }
            if (e.key === '/' && !inField) {
                const si = $('searchInput');
                if (si) { si.focus(); si.select(); e.preventDefault(); }
            }
            if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey && !inField) {
                $('themeToggle')?.click();
            }
        });
    }

    // ==============================================================
    // EXPOSE init additions
    // ==============================================================
    document.addEventListener('DOMContentLoaded', () => {
        init(); // original init: dashboard, filters, courses render
        setTimeout(() => {
            setupTabs();
            setupMoreMenu();
            setupKeyboard();
            renderSavedStrip();

            // Demo data button removed; keep handler safe-no-op
            const btnDemo = $('btnDemo');
            if (btnDemo) btnDemo.addEventListener('click', loadDemoCourses);

            // Save modal events
            const saveModal = $('saveScheduleModal');
            $('btnSaveSchedule').addEventListener('click', openSaveModal);
            $('saveScheduleClose').addEventListener('click', closeSaveModal);
            $('saveCancelBtn').addEventListener('click', closeSaveModal);
            $('saveConfirmBtn').addEventListener('click', () => {
                saveCurrentSchedule($('saveNameInput').value);
                closeSaveModal();
            });
            $('saveNameInput').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    saveCurrentSchedule($('saveNameInput').value);
                    closeSaveModal();
                } else if (e.key === 'Escape') closeSaveModal();
            });
            saveModal.addEventListener('click', (e) => {
                if (e.target === saveModal) closeSaveModal();
            });

            $('btnCompareToggle').addEventListener('click', toggleCompareMode);
            $('btnCompareBack').addEventListener('click', () => {
                if (compareMode) toggleCompareMode();
            });

            setupSwipe();
        }, 10);
    });
})();
