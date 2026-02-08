// --- Cloud Sync (Supabase) Setup ---
let client = null; // Rename from 'supabase' to avoid shadowing global object
const cloudStatusEl = document.getElementById('cloud-status');

function updateSyncStatus(status) {
    if (!cloudStatusEl) return;
    if (status === 'online') {
        cloudStatusEl.className = 'cloud-status online';
        cloudStatusEl.innerHTML = '<i data-lucide="cloud"></i><span>クラウド同期中</span>';
    } else if (status === 'error') {
        cloudStatusEl.className = 'cloud-status error';
        cloudStatusEl.innerHTML = '<i data-lucide="cloud-off"></i><span>エラー</span>';
    } else {
        cloudStatusEl.className = 'cloud-status';
        cloudStatusEl.innerHTML = '<i data-lucide="cloud-off"></i><span>オフライン</span>';
    }
    lucide.createIcons();
}

async function initSupabase() {
    const url = localStorage.getItem('harmony_supabase_url');
    const key = localStorage.getItem('harmony_supabase_key');
    if (url && key) {
        try {
            // Use the global 'supabase' object provided by the CDN
            client = supabase.createClient(url, key);
            updateSyncStatus('online');
            await pullCloudData();
            setupRealtimeSubscriptions();
        } catch (e) {
            console.error(e);
            updateSyncStatus('error');
        }
    }
}

async function pullCloudData() {
    if (!client) return;
    const { data, error } = await client.from('harmony_data').select('*');
    if (error) return updateSyncStatus('error');

    data.forEach(item => {
        if (item.key === 'events') events = item.content;
        if (item.key === 'todos') todos = item.content;
        if (item.key === 'wishlist') wishlist = item.content;
        if (item.key === 'weeklyTasks') weeklyTasks = item.content;
        const memoArea = document.getElementById('dashboard-memo');
        if (item.key === 'memo' && memoArea) memoArea.value = item.content;
    });

    refreshAllUI();
}

async function pushCloudData(key, content) {
    if (!client) return;
    try {
        await client.from('harmony_data').upsert({ key, content, updated_at: new Date() });
    } catch (e) {
        console.error("Cloud push failed", e);
    }
}

function setupRealtimeSubscriptions() {
    client.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'harmony_data' }, (payload) => {
            pullCloudData();
        })
        .subscribe();
}

function refreshAllUI() {
    renderDashboard();
    renderCalendar();
    renderWishlist();
    renderWeeklyTasks();
    ['husband', 'wife', 'shared'].forEach(renderTodos);
}

// Settings Modal UI
window.openSettings = () => {
    document.getElementById('supabase-url').value = localStorage.getItem('harmony_supabase_url') || '';
    document.getElementById('supabase-key').value = localStorage.getItem('harmony_supabase_key') || '';
    document.getElementById('settings-modal').classList.add('active');
};
window.closeSettings = () => document.getElementById('settings-modal').classList.remove('active');

document.getElementById('settings-form').onsubmit = async (e) => {
    e.preventDefault();
    const url = document.getElementById('supabase-url').value.trim();
    const key = document.getElementById('supabase-key').value.trim();
    localStorage.setItem('harmony_supabase_url', url);
    localStorage.setItem('harmony_supabase_key', key);
    closeSettings();
    await initSupabase();
};

// --- Data Management ---
let events = JSON.parse(localStorage.getItem('couple_harmony_events')) || [
    { id: 1, date: '2026-01-30', title: '会議 (夫)', time: '10:00', person: 'husband' },
    { id: 2, date: '2026-01-30', title: '二人で夕食', time: '19:00', person: 'shared' }
];
let todos = JSON.parse(localStorage.getItem('harmony_todos')) || {
    husband: [{ text: 'ゴミ出し', done: false }, { text: 'クリーニング出し', done: false }],
    wife: [{ text: '週末の予約', done: true }, { text: '植物の水やり', done: false }],
    shared: [{ text: '旅行の持ち物リスト作成', done: false }, { text: 'ふるさと納税の検討', done: false }]
};
let wishlist = JSON.parse(localStorage.getItem('harmony_wishlist')) || [];
let weeklyTasks = JSON.parse(localStorage.getItem('harmony_weekly_tasks')) || [];
let memo = localStorage.getItem('harmony_memo') || "";

// --- Tab Switching Logic ---
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('active');
    } else {
        sidebar.classList.toggle('collapsed');
    }
};

const navLinks = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        link.classList.add('active');
        const tabId = link.getAttribute('data-tab');
        const content = document.getElementById(tabId);
        if (content) content.classList.add('active');

        pageTitle.textContent = link.querySelector('span').textContent;

        if (tabId === 'calendar') renderCalendar();
        if (tabId === 'dashboard') renderDashboard();
        if (tabId === 'wishlist') renderWishlist();

        // Close sidebar on mobile after selection
        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar').classList.remove('active');
        }
    });
});

// --- Modal Logic ---
const modal = document.getElementById('event-modal');
const closeBtn = document.querySelector('.close-button');
const eventForm = document.getElementById('event-form');
const deleteBtn = document.getElementById('delete-event');

if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
window.onclick = (event) => { if (event == modal) modal.classList.remove('active'); };

function openModal(date, eventId = null) {
    document.getElementById('event-date').value = date;
    document.getElementById('event-id').value = eventId || '';

    if (eventId) {
        const ev = events.find(e => e.id == eventId);
        document.getElementById('event-title').value = ev.title;
        document.getElementById('event-time').value = ev.time || '';
        document.getElementById('event-person').value = ev.person;
        document.getElementById('event-memo').value = ev.memo || '';
        document.getElementById('modal-title').textContent = '予定を編集';
        deleteBtn.style.display = 'block';
    } else {
        eventForm.reset();
        document.getElementById('event-date').value = date;
        document.getElementById('event-memo').value = '';
        document.getElementById('modal-title').textContent = '予定を登録';
        deleteBtn.style.display = 'none';
    }
    modal.classList.add('active');
}

if (eventForm) {
    eventForm.onsubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('event-id').value;
        const date = document.getElementById('event-date').value;
        const title = document.getElementById('event-title').value;
        const time = document.getElementById('event-time').value;
        const person = document.getElementById('event-person').value;
        const memo = document.getElementById('event-memo').value;

        if (id) {
            const index = events.findIndex(ev => ev.id == id);
            events[index] = { ...events[index], title, time, person, memo };
        } else {
            events.push({ id: Date.now(), date, title, time, person, memo });
        }

        saveEvents();
        modal.classList.remove('active');
        renderCalendar();
        renderDashboard();
    };
}

if (deleteBtn) {
    deleteBtn.onclick = () => {
        const id = document.getElementById('event-id').value;
        events = events.filter(ev => ev.id != id);
        saveEvents();
        modal.classList.remove('active');
        renderCalendar();
        renderDashboard();
    };
}


const saveEvents = () => {
    localStorage.setItem('couple_harmony_events', JSON.stringify(events));
    pushCloudData('events', events);
};

const saveWishlist = () => {
    localStorage.setItem('harmony_wishlist', JSON.stringify(wishlist));
    pushCloudData('wishlist', wishlist);
};

const saveWeeklyTasks = () => {
    localStorage.setItem('harmony_weekly_tasks', JSON.stringify(weeklyTasks));
    pushCloudData('weeklyTasks', weeklyTasks);
};

function saveAllData() {
    saveEvents();
    localStorage.setItem('harmony_todos', JSON.stringify(todos));
    saveWishlist();
    saveWeeklyTasks();
    const memoValue = document.getElementById('dashboard-memo')?.value || "";
    localStorage.setItem('harmony_memo', memoValue);

    pushCloudData('todos', todos);
    pushCloudData('memo', memoValue);
}

// Quick Memo Sync
const memoArea = document.getElementById('dashboard-memo');
if (memoArea) {
    memoArea.value = memo; // Initialize memo area with loaded data
    memoArea.addEventListener('blur', () => {
        pushCloudData('memo', memoArea.value);
    });
}

// --- Dashboard & Calendar Logic (Integrated with Weekly Tasks) ---
function renderDashboard() {
    const renderList = (id, dateOffset) => {
        const list = document.getElementById(id);
        if (!list) return;
        list.innerHTML = '';

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dateOffset);
        const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        const dayOfWeek = targetDate.getDay();

        // Combined Events and Weekly Tasks
        const dayEvents = events.filter(e => e.date === dateStr).map(e => ({ ...e, type: 'event' }));
        const recurring = weeklyTasks.filter(t => t.day == dayOfWeek).map(t => ({
            id: 'weekly-' + t.day, title: '【毎週】' + t.title, time: '00:00', person: 'shared', type: 'weekly'
        }));

        const combined = [...dayEvents, ...recurring];

        if (combined.length === 0) {
            list.innerHTML = `<p style="color:var(--text-secondary); padding: 10px;">${dateOffset === 0 ? '今日' : '明日'}の予定はありません</p>`;
            return;
        }

        combined.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00')).forEach(ev => {
            const item = document.createElement('div');
            item.className = `schedule-item ${ev.person}`;
            const memoHtml = ev.memo ? `<div class="item-memo">${linkify(ev.memo)}</div>` : '';
            item.innerHTML = `
                <span class="time">${ev.time !== '00:00' ? ev.time : '--:--'}</span>
                <div class="event-details">
                    <span class="event-title">${ev.title}</span>
                    ${memoHtml}
                </div>
            `;
            if (ev.type === 'event') {
                item.onclick = (e) => { if (e.target.tagName !== 'A') openModal(ev.date, ev.id); };
            }
            list.appendChild(item);
        });
    };

    renderList('today-schedule', 0);
    renderList('tomorrow-schedule', 1);
}

function linkify(text) {
    if (!text) return '';
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank" onclick="event.stopPropagation()">$1</a>');
}

let currentMonth = new Date();
function getHolidayName(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const holidays = { '1/1': '元日', '2/11': '建国記念の日', '2/23': '天皇誕生日', '4/29': '昭和の日', '5/3': '憲法記念日', '5/4': 'みどりの日', '5/5': 'こどもの日', '7/20': '海の日', '8/11': '山の日', '9/23': '秋分の日', '11/3': '文化の日', '11/23': '勤労感謝の日' };
    return holidays[`${m}/${d}`] || null;
}

const prevBtn = document.getElementById('prev-month');
const nextBtn = document.getElementById('next-month');
if (prevBtn) prevBtn.onclick = () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); };
if (nextBtn) nextBtn.onclick = () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); };

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('month-display');
    if (!grid) return;
    grid.innerHTML = '';
    const isMobile = window.innerWidth <= 768;
    display.textContent = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const lastDate = new Date(year, month + 1, 0).getDate();

    if (!isMobile) {
        grid.style.display = 'grid';
        const daysHead = ['日', '月', '火', '水', '木', '金', '土'];
        daysHead.forEach((day, i) => {
            const h = document.createElement('div');
            h.className = 'calendar-day-header';
            if (i === 0) h.classList.add('sunday');
            if (i === 6) h.classList.add('saturday');
            h.textContent = day;
            grid.appendChild(h);
        });
        const firstDay = new Date(year, month, 1).getDay();
        for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

        for (let d = 1; d <= lastDate; d++) {
            const date = new Date(year, month, d);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            const dayOfWeek = date.getDay();
            const holiday = getHolidayName(date);
            if (dayOfWeek === 0) dayDiv.classList.add('sunday');
            if (dayOfWeek === 6) dayDiv.classList.add('saturday');
            if (holiday) dayDiv.classList.add('holiday');
            const today = new Date();
            if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) dayDiv.classList.add('today');
            dayDiv.innerHTML = `<span class="day-number">${d}${holiday ? `<span class="holiday-name">${holiday}</span>` : ''}</span><div class="day-events"></div>`;
            renderDayEvents(dayDiv.querySelector('.day-events'), dateStr, dayOfWeek);
            dayDiv.onclick = () => openModal(dateStr);
            grid.appendChild(dayDiv);
        }
    } else {
        grid.style.display = 'flex';
        grid.className = 'mobile-agenda';
        for (let d = 1; d <= lastDate; d++) {
            const date = new Date(year, month, d);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayOfWeekIdx = date.getDay();
            const dayOfWeekName = ['日', '月', '火', '水', '木', '金', '土'][dayOfWeekIdx];
            const holiday = getHolidayName(date);
            const dayCard = document.createElement('div');
            dayCard.className = 'agenda-day-card';
            if (dayOfWeekIdx === 0) dayCard.classList.add('sunday');
            if (dayOfWeekIdx === 6) dayCard.classList.add('saturday');
            if (holiday) dayCard.classList.add('holiday');
            dayCard.innerHTML = `<div class="agenda-date"><span class="num">${d}</span><span class="dow">${dayOfWeekName}</span>${holiday ? `<span class="holiday-label">${holiday}</span>` : ''}</div><div class="agenda-events"></div>`;
            renderDayEvents(dayCard.querySelector('.agenda-events'), dateStr, dayOfWeekIdx);
            dayCard.onclick = () => openModal(dateStr);
            grid.appendChild(dayCard);
        }
    }
}

function renderDayEvents(container, dateStr, dayOfWeek) {
    const dayEvents = events.filter(e => e.date === dateStr).map(e => ({ ...e, type: 'event' }));
    const recurring = weeklyTasks.filter(t => t.day == dayOfWeek).map(t => ({
        id: 'weekly-' + t.day, title: '🛒 ' + t.title, time: '', person: 'shared', type: 'weekly'
    }));
    const combined = [...dayEvents, ...recurring];

    combined.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')).forEach(ev => {
        const evEl = document.createElement('div');
        evEl.className = `event-tiny ${ev.person} ${ev.type === 'weekly' ? 'weekly-badge' : ''}`;
        const timeDisplay = ev.time ? `<span class="tiny-time">${ev.time}</span> ` : '';
        evEl.innerHTML = `${timeDisplay}${ev.title}`;
        if (ev.type === 'event') {
            evEl.onclick = (e) => { e.stopPropagation(); openModal(dateStr, ev.id); };
        }
        container.appendChild(evEl);
    });
}

// --- Todo & Wishlist & Weekly Setters ---
const renderTodos = (p) => {
    const list = document.getElementById(`todo-${p}`);
    if (!list) return;
    list.innerHTML = '';
    todos[p].forEach((todo, i) => {
        const li = document.createElement('li');
        if (todo.done) li.classList.add('completed');
        li.innerHTML = `<div class="todo-left"><input type="checkbox" ${todo.done ? 'checked' : ''} onchange="toggleTodo('${p}', ${i})"><input type="text" class="todo-text-input" value="${todo.text}" oninput="updateTodoText('${p}', ${i}, this.value)"></div><button class="btn-icon delete" onclick="deleteTodo('${p}', ${i})"><i data-lucide="x"></i></button>`;
        list.appendChild(li);
    });
    lucide.createIcons();
};

window.addTodo = (p) => { todos[p].push({ text: '', done: false }); saveAllData(); renderTodos(p); };
window.deleteTodo = (p, i) => { todos[p].splice(i, 1); saveAllData(); renderTodos(p); };
window.toggleTodo = (p, i) => { todos[p][i].done = !todos[p][i].done; saveAllData(); renderTodos(p); };
window.updateTodoText = (p, i, val) => { todos[p][i].text = val; saveAllData(); };

const renderWishlist = () => {
    const list = document.getElementById('wish-list-container');
    if (!list) return;
    list.innerHTML = '';
    wishlist.forEach((item, i) => {
        const li = document.createElement('li');
        const urlDisplay = item.url ? `<a href="${item.url}" target="_blank" class="wish-link"><i data-lucide="external-link"></i>URL</a>` : '';
        li.innerHTML = `<div class="todo-left"><input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleWish('${i}')"><input type="text" class="todo-text-input" value="${item.text}" oninput="updateWishText('${i}', this.value)" placeholder="やりたいこと..."><input type="text" class="todo-url-input" value="${item.url || ''}" oninput="updateWishUrl('${i}', this.value)" placeholder="URL (http...)"></div><div class="todo-right">${urlDisplay}<button class="btn-icon delete" onclick="deleteWish('${i}')"><i data-lucide="x"></i></button></div>`;
        list.appendChild(li);
    });
    lucide.createIcons();
};
window.addWishItem = () => { wishlist.push({ text: '', url: '', done: false }); saveWishlist(); renderWishlist(); };
window.deleteWish = (i) => { wishlist.splice(i, 1); saveWishlist(); renderWishlist(); };
window.toggleWish = (i) => { wishlist[i].done = !wishlist[i].done; saveWishlist(); renderWishlist(); };
window.updateWishText = (i, val) => { wishlist[i].text = val; saveWishlist(); };
window.updateWishUrl = (i, val) => { wishlist[i].url = val; saveWishlist(); renderWishlist(); };

const renderWeeklyTasks = () => {
    const container = document.getElementById('weekly-tasks-container');
    if (!container) return;
    container.innerHTML = '';
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    weeklyTasks.forEach((task, i) => {
        const card = document.createElement('div');
        card.className = 'card glass weekly-task-card';
        card.innerHTML = `<div class="weekly-row"><input type="text" value="${task.title}" oninput="updateWeeklyTaskField(${i}, 'title', this.value)" placeholder="集荷項目 (例: クリーニング)"><button class="btn-icon delete" onclick="deleteWeeklyTask(${i})"><i data-lucide="trash-2"></i></button></div><div class="weekly-row settings"><select onchange="updateWeeklyTaskField(${i}, 'day', this.value)">${days.map((d, index) => `<option value="${index}" ${task.day == index ? 'selected' : ''}>${d}曜日に実施</option>`).join('')}</select><label class="switch-label"><input type="checkbox" ${task.notify ? 'checked' : ''} onchange="updateWeeklyTaskField(${i}, 'notify', this.checked)"><span>通知有効</span></label></div>`;
        container.appendChild(card);
    });
    lucide.createIcons();
};
window.addWeeklyTask = () => { weeklyTasks.push({ title: '', day: 1, notify: true }); saveWeeklyTasks(); renderWeeklyTasks(); refreshAllUI(); };
window.deleteWeeklyTask = (i) => { weeklyTasks.splice(i, 1); saveWeeklyTasks(); renderWeeklyTasks(); refreshAllUI(); };
window.updateWeeklyTaskField = (i, field, val) => { weeklyTasks[i][field] = val; saveWeeklyTasks(); refreshAllUI(); };

function updateTodayDisplay() {
    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
}
updateTodayDisplay();
refreshAllUI();
initSupabase();
lucide.createIcons();
