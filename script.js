/* =========================================================
   AQUA REMIND — DESKTOP APPLICATION CONTROLLER
   ========================================================= */

const STORAGE = {
    TASKS: 'aquoremind_desktop_tasks_v1',
    SETTINGS: 'aquoremind_desktop_settings_v1',
    PRAYER: 'aquoremind_desktop_prayer_v1',
    POMO: 'aquoremind_desktop_pomo_v1',
    ALERTS: 'aquoremind_desktop_alerts_v1'
};

const DEFAULT_CFG = {
    userName: 'Pelajar Desktop',
    mascot: 'bear',      // bear | cat | bunny | hamster
    theme: 'light',      // light | dark
    cityMode: 'auto',    // 'auto' or 'lat,lon,CityName'
    notifTask: true,
    leadMinutes: 30,
    notifPrayer: true,
    sound: true
};

const state = {
    tasks: [],
    cfg: { ...DEFAULT_CFG },
    prayerTimings: null,
    hijriDate: '',
    locationName: 'Jakarta',
    coords: { lat: -6.2088, lon: 106.8456 },
    taskFilter: 'all',
    searchTerm: '',
    pomoCount: 0,
    sentAlerts: {},
    deferredPrompt: null
};

const timer = {
    mode: 'pomodoro',     // pomodoro | shortBreak | longBreak | custom | stopwatch
    status: 'idle',       // idle | running | paused
    totalSec: 25 * 60,
    remainSec: 25 * 60,
    elapsedSec: 0,
    endAt: null,
    startedAt: null
};

// =========================================================
// INITIALIZATION
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    applyTheme(state.cfg.theme);
    renderMascot(state.cfg.mascot, 'happy');
    initCursorEyeTracking();
    initNavigation();
    initDynamicIsland();
    initFloatingReminder();
    initTasksUI();
    initPrayerUI();
    initTimerUI();
    initSettingsUI();
    initPWA();

    refreshNotifPermissionBadge();
    runTick();
    setInterval(runTick, 1000);
});

function loadData() {
    try {
        const rawTasks = localStorage.getItem(STORAGE.TASKS);
        if (rawTasks) state.tasks = JSON.parse(rawTasks);

        const rawCfg = localStorage.getItem(STORAGE.SETTINGS);
        if (rawCfg) state.cfg = { ...DEFAULT_CFG, ...JSON.parse(rawCfg) };

        const rawPomo = localStorage.getItem(STORAGE.POMO);
        if (rawPomo) state.pomoCount = parseInt(rawPomo, 10) || 0;

        const rawAlerts = localStorage.getItem(STORAGE.ALERTS);
        if (rawAlerts) state.sentAlerts = JSON.parse(rawAlerts);
    } catch (err) {
        console.error('Gagal membaca LocalStorage:', err);
    }
}

function persistTasks() {
    localStorage.setItem(STORAGE.TASKS, JSON.stringify(state.tasks));
}

function persistCfg() {
    localStorage.setItem(STORAGE.SETTINGS, JSON.stringify(state.cfg));
}

function persistAlerts() {
    localStorage.setItem(STORAGE.ALERTS, JSON.stringify(state.sentAlerts));
}

// =========================================================
// NAVIGATION, DYNAMIC ISLAND & FLOATING REMINDER
// =========================================================
function initNavigation() {
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', () => activateSection(btn.dataset.section));
    });
    document.querySelectorAll('[data-jump]').forEach(btn => {
        btn.addEventListener('click', () => activateSection(btn.dataset.jump));
    });
}

function activateSection(sectionKey) {
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionKey);
    });
    document.querySelectorAll('.workspace-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `section-${sectionKey}`);
    });
}

function initDynamicIsland() {
    const island = document.getElementById('dynamicIsland');
    island.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = island.classList.toggle('expanded');
        island.setAttribute('aria-expanded', expanded);
    });

    document.addEventListener('click', (e) => {
        if (!island.contains(e.target) && island.classList.contains('expanded')) {
            island.classList.remove('expanded');
            island.setAttribute('aria-expanded', 'false');
        }
    });
}

function initFloatingReminder() {
    const box = document.getElementById('floatingReminder');
    const btn = document.getElementById('frMinimizeBtn');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMin = box.classList.toggle('minimized');
        btn.innerHTML = isMin ? '<i class="ri-add-line"></i>' : '<i class="ri-subtract-line"></i>';
    });
}

// =========================================================
// REAL-TIME CLOCK, GREETING & MAIN LOOP
// =========================================================
function runTick() {
    updateDateClockGreeting();
    updateTimerEngine();
    updatePrayerEngine();
    evaluateTaskReminders();
    syncDashboardAndWidgets();
}

function updateDateClockGreeting() {
    const now = new Date();
    const h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const clockStr = `${String(h).padStart(2, '0')}:${m}:${s}`;

    let greeting = 'Selamat Malam';
    if (h >= 4 && h < 11) greeting = 'Selamat Pagi';
    else if (h >= 11 && h < 15) greeting = 'Selamat Siang';
    else if (h >= 15 && h < 18) greeting = 'Selamat Sore';

    const userName = state.cfg.userName || 'Pelajar Desktop';
    document.getElementById('dashGreetingText').textContent = `${greeting}, ${userName}!`;
    document.getElementById('dashMainClock').textContent = clockStr;
    document.getElementById('diClock').textContent = clockStr;

    const fullDate = now.toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    document.getElementById('dashDateText').textContent = fullDate;
    document.getElementById('diExpDate').textContent = fullDate;
}

// =========================================================
// TASKS MANAGEMENT & DEADLINE COLOR SYSTEM
// =========================================================
function initTasksUI() {
    const overlay = document.getElementById('taskModalOverlay');
    const form = document.getElementById('taskFormElement');

    document.getElementById('openTaskModalBtn').addEventListener('click', () => openTaskEditor());
    document.getElementById('closeTaskModalBtn').addEventListener('click', closeTaskEditor);
    document.getElementById('cancelTaskModalBtn').addEventListener('click', closeTaskEditor);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeTaskEditor();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveTaskFromModal();
    });

    document.querySelectorAll('[data-task-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-task-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.taskFilter = btn.dataset.taskFilter;
            renderTaskCards();
        });
    });

    document.getElementById('taskSearchField').addEventListener('input', (e) => {
        state.searchTerm = e.target.value.trim().toLowerCase();
        renderTaskCards();
    });

    renderTaskCards();
}

function openTaskEditor(existingTask = null) {
    const overlay = document.getElementById('taskModalOverlay');
    document.getElementById('taskFormElement').reset();

    if (existingTask) {
        document.getElementById('taskModalHeading').textContent = 'Edit Tugas Sekolah';
        document.getElementById('taskEditId').value = existingTask.id;
        document.getElementById('taskNameField').value = existingTask.title;
        document.getElementById('taskSubjectField').value = existingTask.subject;
        document.getElementById('taskPriorityField').value = existingTask.priority;
        document.getElementById('taskDeadlineField').value = existingTask.deadline;
        document.getElementById('taskNotesField').value = existingTask.notes || '';
    } else {
        document.getElementById('taskModalHeading').textContent = 'Tambah Tugas Sekolah';
        document.getElementById('taskEditId').value = '';
        const soon = new Date(Date.now() + 3 * 3600 * 1000);
        soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset());
        document.getElementById('taskDeadlineField').value = soon.toISOString().slice(0, 16);
    }

    overlay.classList.remove('hidden');
}

function closeTaskEditor() {
    document.getElementById('taskModalOverlay').classList.add('hidden');
}

function saveTaskFromModal() {
    const id = document.getElementById('taskEditId').value;
    const title = document.getElementById('taskNameField').value.trim();
    const subject = document.getElementById('taskSubjectField').value.trim();
    const priority = document.getElementById('taskPriorityField').value;
    const deadline = document.getElementById('taskDeadlineField').value;
    const notes = document.getElementById('taskNotesField').value.trim();

    if (!title || !subject || !deadline) return;

    if (id) {
        const index = state.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            state.tasks[index] = { ...state.tasks[index], title, subject, priority, deadline, notes };
            emitToast('Tugas berhasil diperbarui.');
        }
    } else {
        state.tasks.unshift({
            id: 't_' + Date.now(),
            title,
            subject,
            priority,
            deadline,
            notes,
            completed: false
        });
        emitToast('Tugas baru ditambahkan ke daftar.');
        setMascotExpression('excited', 'Tugas baru masuk! Ayo kerjakan bertahap 💪');
    }

    persistTasks();
    renderTaskCards();
    syncDashboardAndWidgets();
    closeTaskEditor();
}

window.toggleTaskDone = function(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    persistTasks();
    renderTaskCards();
    syncDashboardAndWidgets();

    if (task.completed) {
        notifyDesktop('Tugas Selesai! 🎉', `Mantap! Tugas "${task.title}" (${task.subject}) sudah selesai.`);
        setMascotExpression('happy', `Hebat! Tugas ${task.subject} selesai! 🎉`);
    } else {
        setMascotExpression('idle', 'Tugas dikembalikan ke daftar aktif.');
    }
};

window.editTaskItem = function(id) {
    const task = state.tasks.find(t => t.id === id);
    if (task) openTaskEditor(task);
};

window.removeTaskItem = function(id) {
    if (!confirm('Hapus tugas ini?')) return;
    state.tasks = state.tasks.filter(t => t.id !== id);
    persistTasks();
    renderTaskCards();
    syncDashboardAndWidgets();
    emitToast('Tugas dihapus.');
};

function getDeadlineMeta(task) {
    if (task.completed) {
        return { code: 'completed', cls: 'st-completed', text: 'Selesai' };
    }
    const diff = new Date(task.deadline).getTime() - Date.now();
    if (diff < 0) {
        return { code: 'overdue', cls: 'st-overdue', text: 'Terlewat Deadline!' };
    }
    if (diff <= 24 * 3600 * 1000) {
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        return {
            code: 'near',
            cls: 'st-near',
            text: hrs > 0 ? `Sisa ${hrs}j ${mins}m` : `Sisa ${mins} menit!`
        };
    }
    return { code: 'normal', cls: 'st-normal', text: 'Terjadwal' };
}

function renderTaskCards() {
    const grid = document.getElementById('tasksGridContainer');
    let list = [...state.tasks];

    if (state.taskFilter === 'pending') list = list.filter(t => !t.completed);
    else if (state.taskFilter === 'completed') list = list.filter(t => t.completed);
    else if (state.taskFilter === 'near') list = list.filter(t => !t.completed && getDeadlineMeta(t).code === 'near');
    else if (state.taskFilter === 'overdue') list = list.filter(t => !t.completed && getDeadlineMeta(t).code === 'overdue');

    if (state.searchTerm) {
        list = list.filter(t =>
            t.title.toLowerCase().includes(state.searchTerm) ||
            t.subject.toLowerCase().includes(state.searchTerm)
        );
    }

    list.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    if (list.length === 0) {
        grid.innerHTML = `
            <div class="glass-panel" style="grid-column: 1 / -1; padding: 36px; text-align: center;">
                <i class="ri-folder-open-line" style="font-size: 2.4rem; color: var(--aqua-deep);"></i>
                <h3 style="margin-top: 8px;">Tidak ada tugas pada kategori ini</h3>
                <p style="color: var(--ink-slate); font-size: 0.9rem; margin-top: 4px;">Klik "Tambah Tugas Baru" untuk mulai menjadwalkan tugas sekolah.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = list.map(t => {
        const meta = getDeadlineMeta(t);
        const dueFormatted = new Date(t.deadline).toLocaleString('id-ID', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        return `
            <article class="task-card-desktop ${meta.cls}">
                <div>
                    <div class="task-card-top">
                        <span class="mapel-pill">${escapeText(t.subject)}</span>
                        <span class="prio-pill prio-${t.priority}">${t.priority}</span>
                    </div>
                    <h3 class="task-card-title">${escapeText(t.title)}</h3>
                    ${t.notes ? `<p class="task-card-notes">${escapeText(t.notes)}</p>` : ''}
                </div>

                <div>
                    <div class="task-card-meta">
                        <span><i class="ri-calendar-schedule-line"></i> Deadline: <strong>${dueFormatted}</strong></span>
                        <span class="deadline-status-txt"><i class="ri-time-line"></i> ${meta.text}</span>
                    </div>
                    <div class="task-card-foot" style="margin-top: 12px;">
                        <button class="btn-done-toggle" onclick="toggleTaskDone('${t.id}')">
                            <i class="${t.completed ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}"></i>
                            ${t.completed ? 'Selesai' : 'Tandai Selesai'}
                        </button>
                        <button class="icon-action-btn" title="Edit" onclick="editTaskItem('${t.id}')"><i class="ri-edit-2-line"></i></button>
                        <button class="icon-action-btn" title="Hapus" onclick="removeTaskItem('${t.id}')"><i class="ri-delete-bin-line"></i></button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function evaluateTaskReminders() {
    if (!state.cfg.notifTask) return;
    const now = Date.now();
    const leadMs = (state.cfg.leadMinutes || 30) * 60 * 1000;

    state.tasks.forEach(task => {
        if (task.completed) return;
        const dueMs = new Date(task.deadline).getTime();
        const delta = dueMs - now;

        const preKey = `pre_${task.id}_${state.cfg.leadMinutes}`;
        if (delta > 0 && delta <= leadMs && !state.sentAlerts[preKey]) {
            const mins = Math.max(1, Math.ceil(delta / 60000));
            notifyDesktop(
                'Pengingat Deadline Tugas ⏰',
                `Tugas ${task.subject} ("${task.title}") tinggal ${mins} menit lagi!`
            );
            state.sentAlerts[preKey] = true;
            persistAlerts();
        }

        const lateKey = `late_${task.id}`;
        if (delta <= 0 && delta > -60000 && !state.sentAlerts[lateKey]) {
            notifyDesktop(
                'Deadline Tugas Tiba! 🚨',
                `Batas waktu tugas "${task.title}" (${task.subject}) telah tiba.`
            );
            setMascotExpression('sad', `Deadline ${task.subject} sudah lewat 😢`);
            state.sentAlerts[lateKey] = true;
            persistAlerts();
        }
    });
}

// =========================================================
// PRAYER SCHEDULE (ALADHAN API + GPS / MANUAL CITY)
// =========================================================
function initPrayerUI() {
    const sel = document.getElementById('citySelector');
    sel.value = state.cfg.cityMode || 'auto';

    sel.addEventListener('change', () => {
        state.cfg.cityMode = sel.value;
        persistCfg();
        loadPrayerLocation();
    });

    document.getElementById('refreshLocationBtn').addEventListener('click', () => {
        loadPrayerLocation(true);
    });

    loadPrayerLocation();
}

function loadPrayerLocation(notifyUser = false) {
    if (state.cfg.cityMode && state.cfg.cityMode !== 'auto') {
        const [latStr, lonStr, label] = state.cfg.cityMode.split(',');
        state.coords = { lat: parseFloat(latStr), lon: parseFloat(lonStr) };
        state.locationName = label;
        fetchPrayerFromApi(state.coords.lat, state.coords.lon, label);
        return;
    }

    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                state.coords = { lat: latitude, lon: longitude };
                state.locationName = 'Lokasi GPS';
                fetchPrayerFromApi(latitude, longitude, 'Lokasi GPS');
            },
            () => {
                state.coords = { lat: -6.2088, lon: 106.8456 };
                state.locationName = 'Jakarta (Default)';
                fetchPrayerFromApi(-6.2088, 106.8456, 'Jakarta (Default)');
                if (notifyUser) emitToast('Lokasi GPS tidak aktif. Menampilkan jadwal Jakarta.');
            },
            { timeout: 8000 }
        );
    } else {
        fetchPrayerFromApi(-6.2088, 106.8456, 'Jakarta');
    }
}

async function fetchPrayerFromApi(lat, lon, label) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `${today}_${lat.toFixed(2)}_${lon.toFixed(2)}`;

    try {
        const cached = JSON.parse(localStorage.getItem(STORAGE.PRAYER) || '{}');
        if (cached.cacheKey === cacheKey && cached.timings) {
            state.prayerTimings = cached.timings;
            state.hijriDate = cached.hijri;
            state.locationName = label;
            renderPrayerViews();
            return;
        }
    } catch (_) {}

    try {
        // Method 20 = Kementerian Agama Republik Indonesia
        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=20`);
        const json = await res.json();
        if (json.code === 200 && json.data) {
            const t = json.data.timings;
            const timings = {
                Subuh: t.Fajr.split(' ')[0],
                Dzuhur: t.Dhuhr.split(' ')[0],
                Ashar: t.Asr.split(' ')[0],
                Maghrib: t.Maghrib.split(' ')[0],
                Isya: t.Isha.split(' ')[0]
            };
            const hijri = `${json.data.date.hijri.day} ${json.data.date.hijri.month.en} ${json.data.date.hijri.year} H`;

            state.prayerTimings = timings;
            state.hijriDate = hijri;
            state.locationName = label;

            localStorage.setItem(STORAGE.PRAYER, JSON.stringify({ cacheKey, timings, hijri }));
            renderPrayerViews();
        }
    } catch (err) {
        console.error('Error Aladhan API:', err);
        document.getElementById('prayerBannerTitle').textContent = 'Gagal memuat jadwal sholat';
    }
}

function getNextPrayer() {
    if (!state.prayerTimings) return null;
    const now = new Date();
    const seq = ['Subuh', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya'];

    for (const name of seq) {
        const [hh, mm] = state.prayerTimings[name].split(':').map(Number);
        const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
        if (dt > now) {
            return { name, time: state.prayerTimings[name], target: dt };
        }
    }

    const [sh, sm] = state.prayerTimings.Subuh.split(':').map(Number);
    return {
        name: 'Subuh',
        time: state.prayerTimings.Subuh,
        target: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, sh, sm, 0)
    };
}

function renderPrayerViews() {
    if (!state.prayerTimings) return;
    const next = getNextPrayer();
    const icons = {
        Subuh: 'ri-sunrise-line',
        Dzuhur: 'ri-sun-fill',
        Ashar: 'ri-sun-cloudy-line',
        Maghrib: 'ri-sunset-fill',
        Isya: 'ri-moon-clear-fill'
    };

    document.getElementById('sidebarLocationText').textContent = state.locationName;
    document.getElementById('dashLocationChip').innerHTML = `<i class="ri-map-pin-2-fill"></i> ${state.locationName}`;
    document.getElementById('prayerHijriLabel').textContent = `${state.hijriDate} • ${state.locationName}`;
    document.getElementById('prayerSourceLabel').textContent =
        `Koordinat ${state.coords.lat.toFixed(3)}, ${state.coords.lon.toFixed(3)} • Aladhan API (Kemenag RI)`;

    document.getElementById('dashPrayerMiniGrid').innerHTML = Object.entries(state.prayerTimings).map(([name, time]) => `
        <div class="dash-prayer-cell ${next && next.name === name ? 'is-next' : ''}">
            <span>${name}</span>
            <strong class="mono">${time}</strong>
        </div>
    `).join('');

    document.getElementById('prayerFiveCards').innerHTML = Object.entries(state.prayerTimings).map(([name, time]) => {
        const isNext = next && next.name === name;
        return `
            <div class="glass-panel prayer-slot-card ${isNext ? 'next-slot' : ''}">
                <div class="prayer-slot-icon"><i class="${icons[name]}"></i></div>
                <h4>${name}</h4>
                <div class="prayer-slot-time mono">${time}</div>
                ${isNext ? '<span class="next-slot-badge">Berikutnya</span>' : ''}
            </div>
        `;
    }).join('');
}

function updatePrayerEngine() {
    if (!state.prayerTimings) return;
    const now = new Date();
    const next = getNextPrayer();
    if (!next) return;

    const diffMs = Math.max(0, next.target - now);
    const hrs = String(Math.floor(diffMs / 3600000)).padStart(2, '0');
    const mins = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
    const secs = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');
    const cd = `${hrs}:${mins}:${secs}`;

    document.getElementById('prayerBannerTitle').textContent = `${next.name} — ${next.time}`;
    document.getElementById('prayerMainCountdown').textContent = cd;
    document.getElementById('dashHeroNextPrayer').textContent = `${next.name} (${cd})`;

    document.getElementById('diNextPrayer').textContent = `${next.name} -${hrs}:${mins}`;
    document.getElementById('diExpPrayerName').textContent = `${next.name} (${next.time})`;
    document.getElementById('diExpPrayerCountdown').textContent = cd;

    document.getElementById('frNextPrayer').textContent = `${next.name} ${next.time} (dalam ${cd})`;

    // Cek masuk waktu sholat
    const dateKey = now.toISOString().slice(0, 10);
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    Object.entries(state.prayerTimings).forEach(([pName, pTime]) => {
        const key = `prayer_${dateKey}_${pName}`;
        if (hhmm === pTime && !state.sentAlerts[key]) {
            state.sentAlerts[key] = true;
            persistAlerts();
            renderPrayerViews();
            if (state.cfg.notifPrayer) {
                notifyDesktop(
                    `Waktu Sholat ${pName} 🕌`,
                    `Telah masuk waktu sholat ${pName} (${pTime}) untuk ${state.locationName}.`
                );
            }
        }
    });
}

// =========================================================
// TIMER, STOPWATCH & POMODORO FOCUS MODE
// =========================================================
function initTimerUI() {
    document.getElementById('focusSessionCount').textContent = state.pomoCount;
    document.getElementById('kpiPomodoro').textContent = state.pomoCount;

    document.querySelectorAll('.mode-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchTimerMode(btn.dataset.mode);
        });
    });

    document.getElementById('setCustomDurationBtn').addEventListener('click', () => {
        const mins = parseInt(document.getElementById('customMinutesField').value, 10) || 25;
        timer.totalSec = Math.max(1, Math.min(240, mins)) * 60;
        resetTimerEngine();
    });

    document.getElementById('focusStartBtn').addEventListener('click', startTimerEngine);
    document.getElementById('focusPauseBtn').addEventListener('click', pauseTimerEngine);
    document.getElementById('focusResumeBtn').addEventListener('click', startTimerEngine);
    document.getElementById('focusResetBtn').addEventListener('click', resetTimerEngine);

    document.getElementById('dashQuickStartBtn').addEventListener('click', startTimerEngine);
    document.getElementById('dashQuickPauseBtn').addEventListener('click', pauseTimerEngine);
    document.getElementById('dashQuickResetBtn').addEventListener('click', resetTimerEngine);

    updateTimerVisuals();
}

function switchTimerMode(mode) {
    timer.mode = mode;
    timer.status = 'idle';
    document.getElementById('customDurationBar').classList.toggle('hidden', mode !== 'custom');

    const titles = {
        pomodoro: 'POMODORO FOKUS',
        shortBreak: 'ISTIRAHAT SINGKAT',
        longBreak: 'ISTIRAHAT PANJANG',
        custom: 'TIMER CUSTOM',
        stopwatch: 'STOPWATCH'
    };
    document.getElementById('focusModeTitle').textContent = titles[mode];
    document.getElementById('diExpTimerMode').textContent = titles[mode];

    if (mode === 'pomodoro') timer.totalSec = 25 * 60;
    else if (mode === 'shortBreak') timer.totalSec = 5 * 60;
    else if (mode === 'longBreak') timer.totalSec = 15 * 60;
    else if (mode === 'custom') {
        const mins = parseInt(document.getElementById('customMinutesField').value, 10) || 40;
        timer.totalSec = mins * 60;
    } else if (mode === 'stopwatch') {
        timer.totalSec = 0;
        timer.elapsedSec = 0;
    }

    timer.remainSec = timer.totalSec;
    syncTimerButtons();
    updateTimerVisuals();
}

function startTimerEngine() {
    if (timer.status === 'running') return;
    timer.status = 'running';

    if (timer.mode === 'stopwatch') {
        timer.startedAt = Date.now() - (timer.elapsedSec * 1000);
    } else {
        timer.endAt = Date.now() + (timer.remainSec * 1000);
    }

    document.getElementById('focusStateLabel').textContent = 'Sedang berjalan...';
    syncTimerButtons();

    if (timer.mode === 'shortBreak' || timer.mode === 'longBreak') {
        setMascotExpression('sleepy', 'Saatnya istirahat sejenak, mata boleh rileks 😴');
    } else {
        setMascotExpression('excited', 'Fokus menyala! Aku menemani sesi belajarmu 🔥');
    }
}

function pauseTimerEngine() {
    if (timer.status !== 'running') return;
    timer.status = 'paused';
    document.getElementById('focusStateLabel').textContent = 'Dijeda';
    syncTimerButtons();
    setMascotExpression('idle', 'Timer dijeda. Lanjutkan kapan saja!');
}

function resetTimerEngine() {
    timer.status = 'idle';
    timer.remainSec = timer.totalSec;
    timer.elapsedSec = 0;
    timer.endAt = null;
    timer.startedAt = null;
    document.getElementById('focusStateLabel').textContent = 'Siap dimulai';
    syncTimerButtons();
    updateTimerVisuals();
}

function updateTimerEngine() {
    if (timer.status !== 'running') return;

    if (timer.mode === 'stopwatch') {
        timer.elapsedSec = Math.floor((Date.now() - timer.startedAt) / 1000);
        updateTimerVisuals();
        return;
    }

    const left = Math.ceil((timer.endAt - Date.now()) / 1000);
    if (left <= 0) {
        timer.remainSec = 0;
        timer.status = 'idle';
        syncTimerButtons();
        updateTimerVisuals();
        onTimerFinished();
    } else {
        timer.remainSec = left;
        updateTimerVisuals();
    }
}

function onTimerFinished() {
    document.getElementById('focusStateLabel').textContent = 'Selesai!';

    if (timer.mode === 'pomodoro') {
        state.pomoCount += 1;
        localStorage.setItem(STORAGE.POMO, state.pomoCount);
        document.getElementById('focusSessionCount').textContent = state.pomoCount;
        document.getElementById('kpiPomodoro').textContent = state.pomoCount;

        notifyDesktop('Sesi Fokus Selesai! ☕', 'Waktu fokus selesai, saatnya istirahat sejenak.');
        setMascotExpression('sleepy', 'Sesi fokus selesai! Istirahat dulu yuk 😴');

        const nextMode = state.pomoCount % 4 === 0 ? 'longBreak' : 'shortBreak';
        document.querySelector(`.mode-pill[data-mode="${nextMode}"]`).click();
    } else {
        notifyDesktop('Waktu Istirahat Selesai! 📚', 'Ayo kembali fokus mengerjakan tugas.');
        setMascotExpression('excited', 'Istirahat selesai! Ayo lanjut semangat 🚀');
        document.querySelector('.mode-pill[data-mode="pomodoro"]').click();
    }
}

function updateTimerVisuals() {
    const secs = timer.mode === 'stopwatch' ? timer.elapsedSec : timer.remainSec;
    const formatted = formatClockSec(secs);

    document.getElementById('focusClockDisplay').textContent = formatted;
    document.getElementById('dashQuickTimerDisplay').textContent = formatted;
    document.getElementById('diTimer').textContent = formatted;
    document.getElementById('diExpTimerValue').textContent = formatted;

    const ring = document.getElementById('timerCircleIndicator');
    const circumference = 766.55;
    if (timer.mode === 'stopwatch' || timer.totalSec === 0) {
        ring.style.strokeDashoffset = 0;
    } else {
        const ratio = timer.remainSec / timer.totalSec;
        ring.style.strokeDashoffset = circumference * (1 - ratio);
    }
}

function syncTimerButtons() {
    const running = timer.status === 'running';
    const paused = timer.status === 'paused';

    document.getElementById('focusStartBtn').classList.toggle('hidden', running || paused);
    document.getElementById('focusPauseBtn').classList.toggle('hidden', !running);
    document.getElementById('focusResumeBtn').classList.toggle('hidden', !paused);

    document.getElementById('dashQuickStartBtn').classList.toggle('hidden', running);
    document.getElementById('dashQuickPauseBtn').classList.toggle('hidden', !running);
}

function formatClockSec(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// =========================================================
// DASHBOARD SYNC (KPI, NEAREST TASK, DYNAMIC ISLAND & FLOATING)
// =========================================================
function syncDashboardAndWidgets() {
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.completed).length;
    const pending = total - done;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    document.getElementById('kpiPending').textContent = pending;
    document.getElementById('kpiCompleted').textContent = done;
    document.getElementById('kpiProgressText').textContent = `${pct}%`;
    document.getElementById('kpiProgressBar').style.width = `${pct}%`;
    document.getElementById('sidebarPendingBadge').textContent = pending;

    const activeSorted = state.tasks
        .filter(t => !t.completed)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    const dashList = document.getElementById('dashDeadlineList');
    if (activeSorted.length === 0) {
        dashList.innerHTML = `<p style="color: var(--ink-slate); font-size: 0.88rem; padding: 12px 0;">Tidak ada tugas yang belum selesai. Kerja bagus! ✨</p>`;
    } else {
        dashList.innerHTML = activeSorted.slice(0, 3).map(t => {
            const meta = getDeadlineMeta(t);
            const dueStr = new Date(t.deadline).toLocaleString('id-ID', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });
            return `
                <div class="dash-task-item ${meta.code === 'near' ? 'near' : meta.code === 'overdue' ? 'overdue' : ''}">
                    <div>
                        <span class="mapel-pill">${escapeText(t.subject)}</span>
                        <strong style="display:block; margin-top:4px; font-size:0.94rem;">${escapeText(t.title)}</strong>
                        <small style="color:var(--ink-slate);">Deadline: ${dueStr}</small>
                    </div>
                    <span class="deadline-status-txt" style="font-size:0.78rem; white-space:nowrap;">${meta.text}</span>
                </div>
            `;
        }).join('');
    }

    const dot = document.getElementById('diPulseDot');
    if (activeSorted.length > 0) {
        const topTask = activeSorted[0];
        const topMeta = getDeadlineMeta(topTask);
        document.getElementById('diTaskTicker').textContent = `${topTask.subject}: ${topTask.title}`;
        document.getElementById('diExpTaskTitle').textContent = topTask.title;
        document.getElementById('diExpTaskMeta').textContent = `${topTask.subject} • ${topMeta.text}`;
        document.getElementById('frNearestTask').textContent = `${topTask.title} (${topMeta.text})`;
        dot.classList.toggle('alert', topMeta.code === 'near' || topMeta.code === 'overdue');

        if (topMeta.code === 'overdue' && timer.status !== 'running') {
            setMascotExpression('sad', `Ada tugas "${topTask.title}" yang terlewat deadline 😢`);
        }
    } else {
        document.getElementById('diTaskTicker').textContent = 'Semua tugas selesai';
        document.getElementById('diExpTaskTitle').textContent = 'Tidak ada tugas aktif';
        document.getElementById('diExpTaskMeta').textContent = 'Semua target terkendali';
        document.getElementById('frNearestTask').textContent = 'Tidak ada tugas mendesak';
        dot.classList.remove('alert');
    }
}

// =========================================================
// MASCOT AVATAR + SMOOTH MOUSE EYE TRACKING
// =========================================================
function renderMascot(mascotType = 'bear', mood = 'idle') {
    const container = document.getElementById('mascotSvgContainer');
    const names = {
        bear: 'Beruang Biru',
        cat: 'Kucing Putih',
        bunny: 'Kelinci Kecil',
        hamster: 'Hamster Lucu'
    };
    document.getElementById('mascotNameLabel').textContent = names[mascotType] || 'Beruang Biru';

    const themes = {
        bear: { ear: '#38bdf8', earIn: '#bae6fd', face: '#e0f2fe', snout: '#ffffff', nose: '#0284c7' },
        cat: { ear: '#f8fafc', earIn: '#fbcfe8', face: '#ffffff', snout: '#f1f5f9', nose: '#f472b6' },
        bunny: { ear: '#e0f2fe', earIn: '#bae6fd', face: '#ffffff', snout: '#f0f9ff', nose: '#38bdf8' },
        hamster: { ear: '#fde68a', earIn: '#fbcfe8', face: '#fef3c7', snout: '#ffffff', nose: '#f59e0b' }
    };
    const pal = themes[mascotType] || themes.bear;

    let ears = `
        <circle cx="30" cy="34" r="15" fill="${pal.ear}" stroke="#0c2340" stroke-width="2.5"/>
        <circle cx="30" cy="34" r="8" fill="${pal.earIn}"/>
        <circle cx="90" cy="34" r="15" fill="${pal.ear}" stroke="#0c2340" stroke-width="2.5"/>
        <circle cx="90" cy="34" r="8" fill="${pal.earIn}"/>
    `;
    if (mascotType === 'bunny') {
        ears = `
            <ellipse cx="42" cy="23" rx="10" ry="23" fill="${pal.ear}" stroke="#0c2340" stroke-width="2.5"/>
            <ellipse cx="42" cy="23" rx="4.5" ry="15" fill="${pal.earIn}"/>
            <ellipse cx="78" cy="23" rx="10" ry="23" fill="${pal.ear}" stroke="#0c2340" stroke-width="2.5"/>
            <ellipse cx="78" cy="23" rx="4.5" ry="15" fill="${pal.earIn}"/>
        `;
    } else if (mascotType === 'cat') {
        ears = `
            <polygon points="24,48 32,16 54,36" fill="${pal.ear}" stroke="#0c2340" stroke-width="2.5" stroke-linejoin="round"/>
            <polygon points="96,48 88,16 66,36" fill="${pal.ear}" stroke="#0c2340" stroke-width="2.5" stroke-linejoin="round"/>
        `;
    }

    let mouth = `<path d="M 52 78 Q 60 85 68 78" fill="none" stroke="#0c2340" stroke-width="2.8" stroke-linecap="round"/>`;
    let extras = '';
    if (mood === 'happy' || mood === 'excited') {
        mouth = `<path d="M 48 76 Q 60 92 72 76 Z" fill="#fb7185" stroke="#0c2340" stroke-width="2.5"/>`;
        extras = `<text x="90" y="28" font-size="16">✨</text>`;
    } else if (mood === 'sad') {
        mouth = `<path d="M 50 84 Q 60 75 70 84" fill="none" stroke="#0c2340" stroke-width="2.8" stroke-linecap="round"/>`;
        extras = `<circle cx="35" cy="70" r="3" fill="#38bdf8"/>`;
    } else if (mood === 'sleepy') {
        mouth = `<circle cx="60" cy="80" r="5" fill="#0c2340"/>`;
        extras = `<text x="86" y="26" font-size="13" fill="#0284c7" font-weight="bold">Zzz</text>`;
    }

    container.innerHTML = `
        <svg viewBox="0 0 120 120" width="100%" height="100%" aria-label="Maskot Interaktif">
            ${ears}
            <circle cx="60" cy="66" r="42" fill="${pal.face}" stroke="#0c2340" stroke-width="2.8"/>
            <ellipse cx="34" cy="72" rx="7" ry="4.5" fill="#fda4af" opacity="0.72"/>
            <ellipse cx="86" cy="72" rx="7" ry="4.5" fill="#fda4af" opacity="0.72"/>
            <ellipse cx="60" cy="76" rx="18" ry="14" fill="${pal.snout}"/>
            <g>
                <circle cx="44" cy="58" r="8.5" fill="#ffffff" stroke="#0c2340" stroke-width="2"/>
                <circle id="eyePupilL" cx="44" cy="58" r="4.5" fill="#0c2340"/>
                <circle id="eyeGlintL" cx="45.5" cy="56.5" r="1.5" fill="#ffffff"/>
                <rect class="eyelid-anim" x="34" y="48" width="20" height="20" rx="8" fill="${pal.face}"/>
            </g>
            <g>
                <circle cx="76" cy="58" r="8.5" fill="#ffffff" stroke="#0c2340" stroke-width="2"/>
                <circle id="eyePupilR" cx="76" cy="58" r="4.5" fill="#0c2340"/>
                <circle id="eyeGlintR" cx="77.5" cy="56.5" r="1.5" fill="#ffffff"/>
                <rect class="eyelid-anim" x="66" y="48" width="20" height="20" rx="8" fill="${pal.face}"/>
            </g>
            <ellipse cx="60" cy="70" rx="5.5" ry="4" fill="${pal.nose}"/>
            ${mouth}
            ${extras}
        </svg>
    `;

    document.getElementById('mascotCorner').onclick = () => {
        const lines = [
            'Klik-klik! Aku siap menemani belajar di desktop kamu ✨',
            'Jangan lupa cek jadwal sholat & deadline tugas hari ini!',
            'Coba gunakan Pomodoro 25 menit supaya makin fokus 💡',
            'Kamu hebat sudah mengatur waktu dengan rapi 🌟'
        ];
        const pick = lines[Math.floor(Math.random() * lines.length)];
        setMascotExpression('happy', pick);
        setTimeout(() => setMascotExpression('idle'), 3200);
    };
}

function setMascotExpression(mood, bubbleText = null) {
    const labels = {
        idle: 'Santai',
        happy: 'Senang',
        excited: 'Semangat',
        sleepy: 'Mengantuk',
        sad: 'Sedih'
    };
    renderMascot(state.cfg.mascot, mood);
    document.getElementById('mascotSvgContainer').classList.toggle('bounce-mood', mood === 'happy' || mood === 'excited');
    document.getElementById('mascotMoodLabel').textContent = labels[mood] || 'Santai';
    if (bubbleText) {
        document.getElementById('mascotBubble').textContent = bubbleText;
    }
}

function initCursorEyeTracking() {
    let targetX = 0;
    let targetY = 0;
    let currX = 0;
    let currY = 0;

    window.addEventListener('mousemove', (e) => {
        const frame = document.getElementById('mascotFrame');
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
        const maxR = 3.2;
        targetX = Math.cos(angle) * maxR;
        targetY = Math.sin(angle) * maxR;
    });

    function animatePupils() {
        currX += (targetX - currX) * 0.16;
        currY += (targetY - currY) * 0.16;

        const pL = document.getElementById('eyePupilL');
        const pR = document.getElementById('eyePupilR');
        const gL = document.getElementById('eyeGlintL');
        const gR = document.getElementById('eyeGlintR');

        if (pL && pR) {
            pL.setAttribute('cx', 44 + currX);
            pL.setAttribute('cy', 58 + currY);
            pR.setAttribute('cx', 76 + currX);
            pR.setAttribute('cy', 58 + currY);
        }
        if (gL && gR) {
            gL.setAttribute('cx', 45.5 + currX);
            gL.setAttribute('cy', 56.5 + currY);
            gR.setAttribute('cx', 77.5 + currX);
            gR.setAttribute('cy', 56.5 + currY);
        }
        requestAnimationFrame(animatePupils);
    }
    requestAnimationFrame(animatePupils);
}

// =========================================================
// DESKTOP WEB NOTIFICATIONS & AUDIO CHIME
// =========================================================
function refreshNotifPermissionBadge() {
    const txt = document.getElementById('cfgPermText');
    const sideBadge = document.getElementById('sidebarNotifBadge');

    if (!('Notification' in window)) {
        txt.textContent = 'Browser tidak mendukung Web Notifications API.';
        sideBadge.textContent = 'Tidak Didukung';
        return;
    }

    if (Notification.permission === 'granted') {
        txt.textContent = 'Status: Diizinkan — Notifikasi desktop aktif.';
        sideBadge.textContent = 'Aktif';
    } else if (Notification.permission === 'denied') {
        txt.textContent = 'Status: Diblokir — Aktifkan izin notifikasi di pengaturan browser.';
        sideBadge.textContent = 'Diblokir';
    } else {
        txt.textContent = 'Status: Belum diminta — Klik tombol untuk mengaktifkan izin.';
        sideBadge.textContent = 'Belum Aktif';
    }
}

function notifyDesktop(title, message) {
    emitToast(`${title} — ${message}`);
    if (state.cfg.sound) playSoftChime();

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, { body: message });
        } catch (err) {
            console.warn('Notifikasi desktop gagal:', err);
        }
    }
}

function playSoftChime() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextClass();
        const freqs = [587.33, 783.99, 987.77]; // D5, G5, B5
        freqs.forEach((f, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, ctx.currentTime + idx * 0.13);
            gain.gain.setValueAtTime(0.11, ctx.currentTime + idx * 0.13);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.13 + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.13);
            osc.stop(ctx.currentTime + idx * 0.13 + 0.45);
        });
    } catch (_) {}
}

function emitToast(msg) {
    const stack = document.getElementById('toastStack');
    const card = document.createElement('div');
    card.className = 'toast-card';
    card.innerHTML = `<i class="ri-notification-badge-fill" style="color:#38bdf8; font-size:1.2rem;"></i><span>${escapeText(msg)}</span>`;
    stack.appendChild(card);

    setTimeout(() => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(8px)';
        setTimeout(() => card.remove(), 250);
    }, 4500);
}

// =========================================================
// SETTINGS UI
// =========================================================
function initSettingsUI() {
    document.getElementById('cfgUserName').value = state.cfg.userName;
    document.getElementById('cfgNotifTask').checked = state.cfg.notifTask;
    document.getElementById('cfgLeadMinutes').value = String(state.cfg.leadMinutes);
    document.getElementById('cfgNotifPrayer').checked = state.cfg.notifPrayer;
    document.getElementById('cfgSound').checked = state.cfg.sound;

    document.querySelectorAll('.mascot-opt').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mascot === state.cfg.mascot);
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mascot-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.cfg.mascot = btn.dataset.mascot;
            renderMascot(state.cfg.mascot, 'happy');
        });
    });

    document.querySelectorAll('.theme-opt').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeChoice === state.cfg.theme);
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.cfg.theme = btn.dataset.themeChoice;
            applyTheme(state.cfg.theme);
        });
    });

    document.getElementById('requestDesktopNotifBtn').addEventListener('click', async () => {
        if (!('Notification' in window)) return;
        const perm = await Notification.requestPermission();
        refreshNotifPermissionBadge();
        if (perm === 'granted') {
            notifyDesktop('Notifikasi Desktop Aktif!', 'Pengingat tugas dan jadwal sholat siap muncul di desktop.');
        }
    });

    document.getElementById('testDesktopNotifBtn').addEventListener('click', () => {
        notifyDesktop('Tes Notifikasi AQUA REMIND', 'Notifikasi desktop dan suara pengingat berjalan normal.');
    });

    document.getElementById('saveAllSettingsBtn').addEventListener('click', () => {
        state.cfg.userName = document.getElementById('cfgUserName').value.trim() || 'Pelajar Desktop';
        state.cfg.notifTask = document.getElementById('cfgNotifTask').checked;
        state.cfg.leadMinutes = parseInt(document.getElementById('cfgLeadMinutes').value, 10) || 30;
        state.cfg.notifPrayer = document.getElementById('cfgNotifPrayer').checked;
        state.cfg.sound = document.getElementById('cfgSound').checked;

        persistCfg();
        updateDateClockGreeting();
        emitToast('Semua pengaturan berhasil disimpan ke LocalStorage.');
    });

    document.getElementById('wipeAllDataBtn').addEventListener('click', () => {
        if (!confirm('Hapus seluruh tugas, pengaturan, dan riwayat sesi di browser ini?')) return;
        Object.values(STORAGE).forEach(key => localStorage.removeItem(key));
        location.reload();
    });
}

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
}

// =========================================================
// PWA SERVICE WORKER & DESKTOP INSTALL
// =========================================================
function initPWA() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js').catch(() => {});
        });
    }

    const installBtn = document.getElementById('installPwaBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredPrompt = e;
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        if (!state.deferredPrompt) return;
        state.deferredPrompt.prompt();
        const choice = await state.deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
            installBtn.classList.add('hidden');
        }
        state.deferredPrompt = null;
    });
}

function escapeText(str) {
    const el = document.createElement('div');
    el.textContent = str;
    return el.innerHTML;
}
