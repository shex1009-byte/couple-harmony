// --- Cloud Sync (Supabase) Setup ---
let supabase = null;
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
            supabase = supabase.createClient(url, key);
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
    if (!supabase) return;
    const { data, error } = await supabase.from('harmony_data').select('*');
    if (error) return updateSyncStatus('error');

    data.forEach(item => {
        if (item.key === 'events') events = item.content;
        if (item.key === 'finance') financeData = item.content;
        if (item.key === 'stocks') stocks = item.content;
        if (item.key === 'todos') todos = item.content;
        if (item.key === 'memo') document.getElementById('dashboard-memo').value = item.content;
    });

    refreshAllUI();
}

async function pushCloudData(key, content) {
    if (!supabase) return;
    await supabase.from('harmony_data').upsert({ key, content, updated_at: new Date() });
}

function setupRealtimeSubscriptions() {
    supabase.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'harmony_data' }, (payload) => {
            pullCloudData(); // Refresh on any change
        })
        .subscribe();
}

function refreshAllUI() {
    if (document.getElementById('calendar').classList.contains('active')) renderCalendar();
    if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
    initFinance();
    initTodo();
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

function saveEvents() {
    localStorage.setItem('couple_harmony_events', JSON.stringify(events));
    pushCloudData('events', events);
}

// --- Tab Switching Logic ---
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
    });
});

// --- Modal Logic ---
const modal = document.getElementById('event-modal');
const closeBtn = document.querySelector('.close-button');
const eventForm = document.getElementById('event-form');
const deleteBtn = document.getElementById('delete-event');

closeBtn.onclick = () => modal.classList.remove('active');
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

eventForm.onsubmit = (e) => {
    e.preventDefault();
    const id = document.getElementById('event-id').value;
    const date = document.getElementById('event-date').value;
    const title = document.getElementById('event-title').value;
    const time = document.getElementById('event-time').value;
    const person = document.getElementById('event-person').value;
    const memo = document.getElementById('event-memo').value;

    if (id) {
        // Edit
        const index = events.findIndex(ev => ev.id == id);
        events[index] = { ...events[index], title, time, person, memo };
    } else {
        // Add
        events.push({ id: Date.now(), date, title, time, person, memo });
    }

    saveEvents();
    modal.classList.remove('active');
    renderCalendar();
    renderDashboard();
};

deleteBtn.onclick = () => {
    const id = document.getElementById('event-id').value;
    events = events.filter(ev => ev.id != id);
    saveEvents();
    modal.classList.remove('active');
    renderCalendar();
    renderDashboard();
};

// --- Dashboard Logic ---
function renderDashboard() {
    const list = document.getElementById('today-schedule');
    if (!list) return;
    list.innerHTML = '';

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayEvents = events.filter(e => e.date === todayStr);

    if (todayEvents.length === 0) {
        list.innerHTML = '<p style="color:var(--text-secondary); padding: 10px;">今日の予定はありません</p>';
    }

    todayEvents.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00')).forEach(ev => {
        const item = document.createElement('div');
        item.className = `schedule-item ${ev.person}`;
        const memoHtml = ev.memo ? `<div class="item-memo">${linkify(ev.memo)}</div>` : '';
        item.innerHTML = `
            <span class="time">${ev.time || '--:--'}</span>
            <div class="event-details">
                <span class="event-title">${ev.title}</span>
                ${memoHtml}
            </div>
        `;
        item.onclick = (e) => {
            if (e.target.tagName !== 'A') openModal(ev.date, ev.id);
        };
        list.appendChild(item);
    });
}

function linkify(text) {
    if (!text) return '';
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank" onclick="event.stopPropagation()">$1</a>');
}

// --- Calendar Logic ---
let currentMonth = new Date(2026, 1, 1); // 2026 Feb

document.getElementById('prev-month').onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
};
document.getElementById('next-month').onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
};

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('month-display');
    if (!grid) return;
    grid.innerHTML = '';

    display.textContent = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;

    const days = ['日', '月', '火', '水', '木', '金', '土'];
    days.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        grid.appendChild(header);
    });

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    // Fill Empty slots
    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(document.createElement('div'));
    }

    // Fill Days
    for (let d = 1; d <= lastDate; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';

        const today = new Date();
        if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
            dayDiv.classList.add('today');
        }

        dayDiv.innerHTML = `<span class="day-number">${d}</span><div class="day-events"></div>`;

        const dayEvents = events.filter(e => e.date === dateStr);
        const eventsContainer = dayDiv.querySelector('.day-events');

        dayEvents.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00')).forEach(ev => {
            const evEl = document.createElement('div');
            evEl.className = `event-tiny ${ev.person}`;
            evEl.draggable = true;
            const timeDisplay = ev.time ? `<span class="tiny-time">${ev.time}</span> ` : '';
            evEl.innerHTML = `${timeDisplay}${ev.title}`;

            evEl.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', ev.id);
                evEl.style.opacity = '0.5';
            };
            evEl.ondragend = () => {
                evEl.style.opacity = '1';
            };

            evEl.onclick = (e) => {
                e.stopPropagation();
                openModal(dateStr, ev.id);
            };
            eventsContainer.appendChild(evEl);
        });

        dayDiv.ondragover = (e) => {
            e.preventDefault();
            dayDiv.style.background = 'rgba(255, 255, 255, 0.1)';
        };
        dayDiv.ondragleave = () => {
            dayDiv.style.background = '';
        };
        dayDiv.ondrop = (e) => {
            e.preventDefault();
            dayDiv.style.background = '';
            const eventId = e.dataTransfer.getData('text/plain');
            const eventIndex = events.findIndex(ev => ev.id == eventId);
            if (eventIndex !== -1) {
                events[eventIndex].date = dateStr;
                saveEvents();
                renderCalendar();
                renderDashboard();
            }
        };

        dayDiv.onclick = () => openModal(dateStr);
        grid.appendChild(dayDiv);
    }
}

// --- Data Management (Extras) ---
let financeData = JSON.parse(localStorage.getItem('harmony_finance')) || {
    h: { income: 325000, savings: [{ p: '積立NISA', v: 100000 }, { p: '現金貯金', v: 20000 }, { p: '児童手当', v: 15000 }], fixed: [{ p: 'スマホ代', v: 5500 }, { p: '家賃', v: 141390 }], other: [{ p: 'コンタクト', v: 2000 }, { p: 'タイムズカー', v: 980 }] },
    w: { income: 230000, savings: [{ p: '積立NISA', v: 50000 }, { p: '帰省貯金', v: 20000 }, { p: '現金貯金', v: 30000 }], fixed: [{ p: '電気・ガス代', v: 17000 }, { p: '水道代', v: 2500 }, { p: 'Wifi & スマホ代', v: 12000 }, { p: '各種保険', v: 4700 }], other: [{ p: 'コンタクト', v: 2000 }, { p: '美容室', v: 8000 }] }
};
let stocks = JSON.parse(localStorage.getItem('harmony_stocks')) || [
    { name: 'S&P500', ticker: 'VOO', price: 82500, qty: 12, prev: 72000 },
    { name: 'Apple', ticker: 'AAPL', price: 28400, qty: 15, prev: 25400 }
];
let todos = JSON.parse(localStorage.getItem('harmony_todos')) || {
    husband: [{ text: 'ゴミ出し', done: false }, { text: 'クリーニング出し', done: false }],
    wife: [{ text: '週末の予約', done: true }, { text: '植物の水やり', done: false }],
    shared: [{ text: '旅行の持ち物リスト作成', done: false }, { text: 'ふるさと納税の検討', done: false }]
};

function saveAllData() {
    localStorage.setItem('harmony_finance', JSON.stringify(financeData));
    localStorage.setItem('harmony_stocks', JSON.stringify(stocks));
    localStorage.setItem('harmony_todos', JSON.stringify(todos));
    pushCloudData('finance', financeData);
    pushCloudData('stocks', stocks);
    pushCloudData('todos', todos);
}

// Quick Memo Sync
const memoArea = document.getElementById('dashboard-memo');
if (memoArea) {
    memoArea.addEventListener('blur', () => {
        pushCloudData('memo', memoArea.value);
    });
}

// --- Finance Logic (Enhanced) ---
function initFinance() {
    const renderSection = (p, type, listId, valClass) => {
        const list = document.getElementById(listId);
        if (!list) return;
        list.innerHTML = '';
        const dataKey = listId.includes('savings') ? 'savings' : (listId.includes('fixed') ? 'fixed' : 'other');

        financeData[p][dataKey].forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'breakdown-row';
            row.innerHTML = `
                <input type="text" value="${item.p}" oninput="updateFinanceItem('${p}','${dataKey}',${index},'p',this.value)">
                <input type="number" value="${item.v}" class="sub-input ${valClass}" oninput="updateFinanceItem('${p}','${dataKey}',${index},'v',this.value)">
                <button class="btn-icon delete" onclick="removeFinanceItem('${p}','${dataKey}',${index})"><i data-lucide="trash-2"></i></button>
            `;
            list.appendChild(row);
        });
        lucide.createIcons();
    };

    const updateAll = () => {
        ['h', 'w'].forEach(p => {
            document.getElementById(`${p}-income`).value = financeData[p].income;
            renderSection(p, `${p}-savings-list`, `${p}-savings-list`, 'save-val');
            renderSection(p, `${p}-fixed-list`, `${p}-fixed-list`, 'fixed-val');
            renderSection(p, `${p}-other-list`, `${p}-other-list`, 'other-val');
            calculateFinance(p);
        });
        renderStocks();
    };

    window.addSubItem = (p, listId, valClass) => {
        const dataKey = listId.includes('savings') ? 'savings' : (listId.includes('fixed') ? 'fixed' : 'other');
        financeData[p][dataKey].push({ p: '', v: 0 });
        saveAllData();
        updateAll();
    };

    window.removeFinanceItem = (p, dataKey, index) => {
        financeData[p][dataKey].splice(index, 1);
        saveAllData();
        updateAll();
    };

    window.updateFinanceItem = (p, dataKey, index, field, value) => {
        financeData[p][dataKey][index][field] = field === 'v' ? (parseInt(value) || 0) : value;
        saveAllData();
        calculateFinance(p);
    };

    window.calculateFinance = (p) => {
        const income = parseInt(document.getElementById(`${p}-income`).value) || 0;
        financeData[p].income = income;

        const sumKey = (key) => financeData[p][key].reduce((a, b) => a + b.v, 0);
        const fixedT = sumKey('fixed');
        const otherT = sumKey('other');
        const savingsT = sumKey('savings');
        const exp = fixedT + otherT + savingsT;
        const balance = income - exp;

        document.getElementById(`${p}-fixed-total`).textContent = `¥${fixedT.toLocaleString()}`;
        document.getElementById(`${p}-other-total`).textContent = `¥${otherT.toLocaleString()}`;
        document.getElementById(`${p}-savings-total`).textContent = `¥${savingsT.toLocaleString()}`;
        document.getElementById(`${p}-expenditure`).textContent = `¥${exp.toLocaleString()}`;

        const bEl = document.getElementById(`${p}-balance`);
        bEl.textContent = `¥${balance.toLocaleString()}`;
        bEl.className = 'value-display ' + (balance >= 0 ? 'success' : 'warning');
        saveAllData();
    };

    updateAll();
}

// --- Stock Logic ---
const MOCK_PRICES = {
    // US Stocks
    'AAPL': 28400, 'TSLA': 35000, 'NVDA': 11400, 'MSFT': 65000, 'GOOGL': 24000, 'AMZN': 26000, 'META': 72000, 'VOO': 82500, 'VTI': 38000, 'QQQ': 71000,
    // JP Stocks (Codes)
    '7203': 3450, '9984': 8820, '6758': 13500, '8306': 1580, '9432': 185, '6501': 14200, '4063': 6200, '8035': 38500, '4568': 5400,
    // JP Names (Optional support)
    'トヨタ': 3450, 'ソフトバンク': 8820, 'ソニー': 13500, '任天堂': 7900, '三菱UFJ': 1580, 'NTT': 185
};

function renderStocks() {
    const list = document.getElementById('stock-list');
    if (!list) return;
    list.innerHTML = '';

    let totalAssets = 0;

    stocks.forEach((s, i) => {
        const total = s.price * s.qty;
        const profit = total - (s.prev * s.qty);
        const profitClass = profit >= 0 ? 'plus' : 'minus';
        totalAssets += total;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="stock-ticker-input" value="${s.ticker}" placeholder="銘柄コード(AAPL等)" onchange="fetchStock(this.value, ${i})"></td>
            <td class="stock-price-cell">
                <div class="price-wrapper" style="display:flex; align-items:center; gap:8px;">
                    <span class="price-val">¥${s.price.toLocaleString()}</span>
                    <button class="refresh-btn" onclick="fetchStock(null, ${i}, true)">取得</button>
                </div>
            </td>
            <td><input type="number" class="stock-qty-input" value="${s.qty}" oninput="updateStockQty(${i}, this.value)"></td>
            <td class="bold">¥${total.toLocaleString()}</td>
            <td class="${profitClass}">${profit >= 0 ? '+' : ''}¥${profit.toLocaleString()}</td>
            <td><button class="btn-icon delete" onclick="removeStockRow(${i})"><i data-lucide="trash-2"></i></button></td>
        `;
        list.appendChild(tr);
    });

    const totalEl = document.getElementById('total-assets-value');
    if (totalEl) totalEl.textContent = `¥${totalAssets.toLocaleString()}`;

    lucide.createIcons();
}

window.addStockRow = () => {
    stocks.push({ name: '新銘柄', ticker: '', price: 0, qty: 0, prev: 0 });
    saveAllData();
    renderStocks();
};

window.removeStockRow = (i) => {
    stocks.splice(i, 1);
    saveAllData();
    renderStocks();
};

window.updateStockQty = (i, val) => {
    stocks[i].qty = parseInt(val) || 0;
    saveAllData();
    renderStocks();
};

window.fetchStock = async (tickerVal, i, explicit = false) => {
    const input = document.querySelectorAll('.stock-ticker-input')[i];
    const targetTicker = tickerVal || (input ? input.value : '');
    if (!targetTicker && !explicit) return;

    const cleanTicker = targetTicker.toUpperCase().trim();
    let price = MOCK_PRICES[cleanTicker];

    if (!price) {
        if (cleanTicker.length === 0) price = 0;
        else {
            // Consistent pseudo-random price for unknown tickers
            let hash = 0;
            for (let j = 0; j < cleanTicker.length; j++) hash = cleanTicker.charCodeAt(j) + ((hash << 5) - hash);
            price = Math.abs(hash % 50000) + 1000;
        }
    }

    stocks[i].ticker = cleanTicker;
    stocks[i].price = price;
    if (stocks[i].prev === 0 && price > 0) stocks[i].prev = Math.floor(price * (0.8 + Math.random() * 0.4));

    saveAllData();
    renderStocks();
};

// --- Todo Logic ---
function initTodo() {
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

    ['husband', 'wife', 'shared'].forEach(renderTodos);
}

// Initial Call
document.getElementById('current-date').textContent = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
}).format(new Date());

renderDashboard();
initFinance();
initTodo();
initSupabase();
lucide.createIcons();
