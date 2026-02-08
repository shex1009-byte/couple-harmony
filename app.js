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


function saveEvents() {
    localStorage.setItem('couple_harmony_events', JSON.stringify(events));
    pushCloudData('events', events);
}

function saveAllData() {
    localStorage.setItem('couple_harmony_events', JSON.stringify(events));
    localStorage.setItem('harmony_todos', JSON.stringify(todos));
    localStorage.setItem('harmony_wishlist', JSON.stringify(wishlist));
    localStorage.setItem('harmony_weekly_tasks', JSON.stringify(weeklyTasks));
    const memoValue = document.getElementById('dashboard-memo')?.value || "";
    localStorage.setItem('harmony_memo', memoValue);

    pushCloudData('events', events);
    pushCloudData('todos', todos);
    pushCloudData('wishlist', wishlist);
    pushCloudData('weeklyTasks', weeklyTasks);
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

// --- Finance Logic (Enhanced) ---
// --- Todo Logic ---
const renderTodos = (p) => {
    const list = document.getElementById(`todo-${p}`);
    if (!list) return;
    list.innerHTML = '';
    todos[p].forEach((todo, i) => {
        const li = document.createElement('li');
        if (todo.done) li.classList.add('completed');
        li.innerHTML = `
            <div class="todo-left">
                <input type="checkbox" ${todo.done ? 'checked' : ''} onchange="toggleTodo('${p}', ${i})">
                <input type="text" class="todo-text-input" value="${todo.text}" oninput="updateTodoText('${p}', ${i}, this.value)">
            </div>
            <button class="btn-icon delete" onclick="deleteTodo('${p}', ${i})"><i data-lucide="x"></i></button>
        `;
        list.appendChild(li);
    });
    lucide.createIcons();
};

window.addTodo = (p) => {
    todos[p].push({ text: '', done: false });
    saveAllData();
    renderTodos(p);
};

window.deleteTodo = (p, i) => {
    todos[p].splice(i, 1);
    saveAllData();
    renderTodos(p);
};

window.toggleTodo = (p, i) => {
    todos[p][i].done = !todos[p][i].done;
    saveAllData();
    renderTodos(p);
};

window.updateTodoText = (p, i, val) => {
    todos[p][i].text = val;
    saveAllData();
};

// --- Wishlist Logic ---
const renderWishlist = () => {
    const list = document.getElementById('wish-list-container');
    if (!list) return;
    list.innerHTML = '';
    wishlist.forEach((item, i) => {
        const li = document.createElement('li');
        const urlDisplay = item.url ? `<a href="${item.url}" target="_blank" class="wish-link"><i data-lucide="external-link"></i>URL</a>` : '';
        li.innerHTML = `
            <div class="todo-left">
                <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleWish('${i}')">
                <input type="text" class="todo-text-input" value="${item.text}" oninput="updateWishText('${i}', this.value)" placeholder="やりたいこと...">
                <input type="text" class="todo-url-input" value="${item.url || ''}" oninput="updateWishUrl('${i}', this.value)" placeholder="URL (http...)">
            </div>
            <div class="todo-right">
                ${urlDisplay}
                <button class="btn-icon delete" onclick="deleteWish('${i}')"><i data-lucide="x"></i></button>
            </div>
        `;
        list.appendChild(li);
    });
    lucide.createIcons();
};

window.addWishItem = () => { wishlist.push({ text: '', url: '', done: false }); saveWishlist(); renderWishlist(); };
window.deleteWish = (i) => { wishlist.splice(i, 1); saveWishlist(); renderWishlist(); };
window.toggleWish = (i) => { wishlist[i].done = !wishlist[i].done; saveWishlist(); renderWishlist(); };
window.updateWishText = (i, val) => { wishlist[i].text = val; saveWishlist(); };
window.updateWishUrl = (i, val) => { wishlist[i].url = val; saveWishlist(); renderWishlist(); };

// --- Weekly Tasks Logic ---
const renderWeeklyTasks = () => {
    const container = document.getElementById('weekly-tasks-container');
    if (!container) return;
    container.innerHTML = '';
    const days = ['日', '月', '火', '水', '木', '金', '土'];

    weeklyTasks.forEach((task, i) => {
        const card = document.createElement('div');
        card.className = 'card glass weekly-task-card';
        card.innerHTML = `
            <div class="weekly-row">
                <input type="text" value="${task.title}" oninput="updateWeeklyTaskField(${i}, 'title', this.value)" placeholder="集荷項目 (例: クリーニング)">
                <button class="btn-icon delete" onclick="deleteWeeklyTask(${i})"><i data-lucide="trash-2"></i></button>
            </div>
            <div class="weekly-row settings">
                <select onchange="updateWeeklyTaskField(${i}, 'day', this.value)">
                    ${days.map((d, index) => `<option value="${index}" ${task.day == index ? 'selected' : ''}>${d}曜日に実施</option>`).join('')}
                </select>
                <label class="switch-label">
                    <input type="checkbox" ${task.notify ? 'checked' : ''} onchange="updateWeeklyTaskField(${i}, 'notify', this.checked)">
                    <span>通知有効</span>
                </label>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
};

window.addWeeklyTask = () => { weeklyTasks.push({ title: '', day: 1, notify: true }); saveWeeklyTasks(); renderWeeklyTasks(); };
window.deleteWeeklyTask = (i) => { weeklyTasks.splice(i, 1); saveWeeklyTasks(); renderWeeklyTasks(); };
window.updateWeeklyTaskField = (i, field, val) => { weeklyTasks[i][field] = val; saveWeeklyTasks(); };

// Initial Call
function updateTodayDisplay() {
    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }).format(new Date());
}
updateTodayDisplay();

renderDashboard();
renderCalendar();
renderWishlist();
renderWeeklyTasks();
renderTodos('husband');
renderTodos('wife');
renderTodos('shared');
initSupabase();
lucide.createIcons();
