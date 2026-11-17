// ===== Schedule Generator Engine =====
// Finds all valid (clash-free) combinations of course sections

class ScheduleEngine {
    constructor() {
        this.validSchedules = [];
        this.maxResults = 200; // Cap results for performance
    }

    // Convert time string "HH:MM" to minutes since midnight
    timeToMinutes(t) {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    // Check if two time slots overlap on the same day
    slotsOverlap(a, b) {
        if (a.day !== b.day) return false;
        const aStart = this.timeToMinutes(a.startTime);
        const aEnd = this.timeToMinutes(a.endTime);
        const bStart = this.timeToMinutes(b.startTime);
        const bEnd = this.timeToMinutes(b.endTime);
        return aStart < bEnd && bStart < aEnd;
    }

    // Check if a section clashes with any slot in existing schedule
    hasClash(section, existingSlots) {
        for (const slot of section.schedule) {
            for (const existing of existingSlots) {
                if (this.slotsOverlap(slot, existing)) return true;
            }
        }
        return false;
    }

    // Generate all valid schedules using backtracking
    // preferredSections: { courseId -> sectionIndex } from user's radio selection
    // pinnedSections: Set of section IDs that must be included
    generate(selectedCourses, preferredSections = {}, pinnedSections = new Set()) {
        this.validSchedules = [];
        if (selectedCourses.length === 0) return [];

        // Reorder sections so preferred one comes first for each course
        const coursesWithOrderedSections = selectedCourses.map(course => {
            const prefIdx = preferredSections[course.id] || 0;
            let sections = [...course.sections];
            
            // If a section is pinned, ONLY try that section
            const pinned = sections.find(s => pinnedSections.has(s.id));
            if (pinned) {
                sections = [pinned];
            } else if (prefIdx > 0 && prefIdx < sections.length) {
                const pref = sections.splice(prefIdx, 1)[0];
                sections.unshift(pref);
            }
            return { ...course, sections };
        });

        this._backtrack(coursesWithOrderedSections, 0, [], []);
        // Sort schedules by score (best first)
        this.validSchedules.sort((a, b) => this.scoreSchedule(b) - this.scoreSchedule(a));
        return this.validSchedules;
    }

    _backtrack(courses, courseIdx, currentCombo, occupiedSlots) {
        if (this.validSchedules.length >= this.maxResults) return;

        if (courseIdx === courses.length) {
            this.validSchedules.push([...currentCombo]);
            return;
        }

        const course = courses[courseIdx];
        for (const section of course.sections) {
            if (!this.hasClash(section, occupiedSlots)) {
                // Choose this section
                const newSlots = section.schedule.map(s => ({
                    ...s,
                    courseId: course.id,
                    courseName: course.name,
                    courseCode: course.code,
                    sectionName: section.name,
                    faculty: course.faculty || 'TBA',
                    courseType: course.type || '' // add type for AI
                }));
                currentCombo.push({ course, section });
                occupiedSlots.push(...newSlots);

                this._backtrack(courses, courseIdx + 1, currentCombo, occupiedSlots);

                // Undo
                currentCombo.pop();
                occupiedSlots.splice(occupiedSlots.length - newSlots.length, newSlots.length);
            }
        }
    }

    // Score a schedule (higher = better)
    scoreSchedule(combo) {
        let score = 0;
        const allSlots = [];
        combo.forEach(({ course, section }) => {
            section.schedule.forEach(s => allSlots.push({...s, courseType: course.type}));
        });

        // 1. Fewer days with classes = better (+10 per free day)
        const daysUsed = new Set(allSlots.map(s => s.day));
        score += (6 - daysUsed.size) * 10;

        // 2. Later start times
        const daySlots = {};
        allSlots.forEach(s => {
            if (!daySlots[s.day]) daySlots[s.day] = [];
            daySlots[s.day].push(s);
        });
        for (const day in daySlots) {
            const earliest = Math.min(...daySlots[day].map(s => this.timeToMinutes(s.startTime)));
            if (earliest >= 600) score += 5;  // starts at or after 10:00
            if (earliest >= 540) score += 3;  // starts at or after 9:00
        }

        // 3. Fewer gaps between classes = better
        for (const day in daySlots) {
            const sorted = daySlots[day].sort((a, b) =>
                this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime)
            );
            for (let i = 1; i < sorted.length; i++) {
                const gap = this.timeToMinutes(sorted[i].startTime) - this.timeToMinutes(sorted[i - 1].endTime);
                if (gap <= 30) {
                    score += 5;    // tight schedule
                } else if (gap <= 60) {
                    score += 2;
                } else {
                    score -= 2;              // big gap
                }
            }
        }

        // 4. Even distribution across days
        const counts = Object.values(daySlots).map(s => s.length);
        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length;
        score -= variance * 3;

        return score;
    }

    // Get schedule statistics
    getStats(combo) {
        const allSlots = [];
        combo.forEach(({ course, section }) => {
            section.schedule.forEach(s => allSlots.push({ ...s, courseCode: course.code }));
        });

        const daysUsed = new Set(allSlots.map(s => s.day));
        const totalCredits = combo.reduce((sum, { course }) => sum + course.credits, 0);

        // Calculate total class hours per week
        let totalMinutes = 0;
        allSlots.forEach(s => {
            totalMinutes += this.timeToMinutes(s.endTime) - this.timeToMinutes(s.startTime);
        });

        // Earliest and latest times
        let earliest = 1440, latest = 0;
        allSlots.forEach(s => {
            earliest = Math.min(earliest, this.timeToMinutes(s.startTime));
            latest = Math.max(latest, this.timeToMinutes(s.endTime));
        });

        return {
            daysCount: daysUsed.size,
            totalCredits,
            totalHours: Math.round(totalMinutes / 60 * 10) / 10,
            earliestClass: this.minutesToTime(earliest),
            latestClass: this.minutesToTime(latest),
            freeDays: DAYS.filter(d => !daysUsed.has(d))
        };
    }

    minutesToTime(m) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    }
}

const scheduler = new ScheduleEngine();
