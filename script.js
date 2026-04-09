// Google Apps Script Web App URL
// セットアップ後にここにGASのデプロイURLを貼り付けてください
const GAS_URL = "https://script.google.com/macros/s/AKfycbz99H7Gl19QvjcWVoP8VvYaIi-j_4S9TlpUeR2g9IQ-egLXy-nlE6s9thpLDAnehVxU/exec";

const STORAGE_KEY = 'dailyDebugData';

let calendarViewDate = new Date();
let lastKnownData = [];

/** @type {Record<string, { min: boolean, bonus: boolean }>} */
const marks = {
    it: { min: false, bonus: false },
    en: { min: false, bonus: false },
    training: { min: false, bonus: false }
};

window.addEventListener('DOMContentLoaded', async () => {
    syncCircleUI();
    await loadDataFromSpreadsheet();
});

function toggleMenu() {
    document.getElementById('side-menu').classList.toggle('active');
}

function showPage(page) {
    document.getElementById('page-top').style.display = page === 'top' ? 'block' : 'none';
    document.getElementById('page-history').style.display = page === 'history' ? 'block' : 'none';
    toggleMenu();
}

/** @param {'it'|'en'|'training'} cat @param {'min'|'bonus'} kind */
function toggleMark(cat, kind) {
    marks[cat][kind] = !marks[cat][kind];
    syncCircleUI();
}

function syncCircleUI() {
    const cats = /** @type {const} */ (['it', 'en', 'training']);
    const kinds = /** @type {const} */ (['min', 'bonus']);
    for (const cat of cats) {
        for (const kind of kinds) {
            const id = `circle_${cat}_${kind}`;
            const el = document.getElementById(id);
            if (!el) continue;
            const on = marks[cat][kind];
            el.classList.toggle('is-on', on);
            el.setAttribute('aria-pressed', String(on));
        }
    }
}

function anyMarkSet() {
    return Object.values(marks).some((m) => m.min || m.bonus);
}

function resetMarks() {
    marks.it.min = marks.it.bonus = false;
    marks.en.min = marks.en.bonus = false;
    marks.training.min = marks.training.bonus = false;
}

function resetFormState() {
    document.getElementById('backlog_it').value = '';
    document.getElementById('backlog_en').value = '';
    document.getElementById('backlog_training').value = '';
    resetMarks();
    syncCircleUI();
}

async function loadDataFromSpreadsheet() {
    try {
        if (!GAS_URL || GAS_URL === 'YOUR_GAS_WEB_APP_URL_HERE') {
            console.log('GAS URL not configured, using local storage only');
            loadDataFromLocalStorage();
            return;
        }

        const response = await fetch(GAS_URL);
        const result = await response.json();

        if (result.success && result.data) {
            const data = normalizeDataArray(result.data);
            saveLocalData(data);
            lastKnownData = data;
            updateUIAndCalendar(data);
        } else {
            throw new Error(result.error || 'データの取得に失敗しました');
        }
    } catch (error) {
        console.error('Spreadsheet load error:', error);
        loadDataFromLocalStorage();
    }
}

function loadDataFromLocalStorage() {
    const data = normalizeDataArray(getLocalData());
    lastKnownData = data;
    updateUIAndCalendar(data);
}

function normalizeDataArray(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeEntry).filter(Boolean);
}

function normalizeEntry(item) {
    if (!item || item.date == null) return null;

    const legacyMin = truthyFlag(item.minimum);
    const legacyBonus = truthyFlag(item.bonus);

    const min_it = item.min_it !== undefined ? truthyFlag(item.min_it) : legacyMin;
    const bonus_it = item.bonus_it !== undefined ? truthyFlag(item.bonus_it) : legacyBonus;
    const min_en = item.min_en !== undefined ? truthyFlag(item.min_en) : legacyMin;
    const bonus_en = item.bonus_en !== undefined ? truthyFlag(item.bonus_en) : legacyBonus;
    const min_training =
        item.min_training !== undefined ? truthyFlag(item.min_training) : legacyMin;
    const bonus_training =
        item.bonus_training !== undefined ? truthyFlag(item.bonus_training) : legacyBonus;

    const dateCanon = normalizeDateKey(item.date);

    return {
        date: dateCanon || (item.date != null ? String(item.date).trim() : ''),
        backlog_it: item.backlog_it ?? item.note ?? '',
        backlog_en: item.backlog_en ?? '',
        backlog_training: item.backlog_training ?? '',
        min_it,
        bonus_it,
        min_en,
        bonus_en,
        min_training,
        bonus_training,
        timestamp: item.timestamp ?? ''
    };
}

function truthyFlag(v) {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
        const t = v.toUpperCase();
        return t === 'TRUE' || t === '1' || t === 'はい';
    }
    return false;
}

function updateUIAndCalendar(data) {
    renderCalendar(data);
    renderHistoryList(data);
}

function shiftCalendarMonth(delta) {
    const d = new Date(calendarViewDate);
    d.setMonth(d.getMonth() + delta);
    calendarViewDate = d;
    renderCalendar(lastKnownData.length ? lastKnownData : getLocalData());
}

function dateKeyFromParts(y, m1, d) {
    return `${y}/${m1}/${d}`;
}

/** 今日（端末のローカル日付）をカレンダーと同じキー形式に */
function getTodayDateKey() {
    const n = new Date();
    return dateKeyFromParts(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function normalizeDateKey(dateVal) {
    if (dateVal == null || dateVal === '') return '';
    if (dateVal instanceof Date) {
        return dateKeyFromParts(
            dateVal.getFullYear(),
            dateVal.getMonth() + 1,
            dateVal.getDate()
        );
    }
    const s = String(dateVal).trim();

    // 日時付き ISO（…T…Z 等）は必ずローカル暦日に変換（履歴の UTC 文字列ずれ対策）
    const isFullIsoDatetime =
        /[Tt]\d/.test(s) ||
        /Z$/i.test(s.trim()) ||
        /[+-]\d{2}:?\d{2}$/.test(s);
    if (/^\d{4}-\d{2}-\d{2}/.test(s) && isFullIsoDatetime) {
        const dt = new Date(s);
        if (!Number.isNaN(dt.getTime())) {
            return dateKeyFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
        }
    }

    // 時刻なし YYYY-MM-DD のみ（全体が日付だけ）はその数値を暦日として採用
    if (/^(\d{4})-(\d{2})-(\d{2})$/.test(s)) {
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return dateKeyFromParts(
            parseInt(m[1], 10),
            parseInt(m[2], 10),
            parseInt(m[3], 10)
        );
    }

    const parts = s.split(/[\/\-\.]/).map((x) => parseInt(x, 10));
    if (parts.length >= 3 && !parts.some((n) => Number.isNaN(n))) {
        return dateKeyFromParts(parts[0], parts[1], parts[2]);
    }
    return s;
}

/** 履歴・表示用（正規化済み yyyy/m/d） */
function formatHistoryDate(dateVal) {
    const k = normalizeDateKey(dateVal);
    return k || String(dateVal ?? '');
}

/** タイムスタンプ行（ISO もローカルで表示） */
function formatHistoryTimestamp(ts) {
    if (ts == null || ts === '') return '';
    const s = String(ts).trim();
    if (/[Tt]\d/.test(s) || /Z$/i.test(s)) {
        const dt = new Date(s);
        if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleString('ja-JP', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
    }
    return s;
}

/** @returns {{ min: Record<string, Set<string>>, bonus: Record<string, Set<string>> }} */
function buildCategoryMarkSets(data) {
    const min = { it: new Set(), en: new Set(), training: new Set() };
    const bonus = { it: new Set(), en: new Set(), training: new Set() };
    data.forEach((item) => {
        const key = normalizeDateKey(item.date);
        if (!key) return;
        if (item.min_it) min.it.add(key);
        if (item.bonus_it) bonus.it.add(key);
        if (item.min_en) min.en.add(key);
        if (item.bonus_en) bonus.en.add(key);
        if (item.min_training) min.training.add(key);
        if (item.bonus_training) bonus.training.add(key);
    });
    return { min, bonus };
}

function appendCalMarksForDay(parts, key, setsMin, setsBonus, cat, dotClass, tMin, tBon) {
    const hasMin = setsMin[cat].has(key);
    const hasBon = setsBonus[cat].has(key);
    if (hasMin) {
        parts.push(`<span class="cal-mark cal-dot-${dotClass}" title="${tMin}">●</span>`);
    } else if (hasBon) {
        parts.push(
            `<span class="cal-mark cal-mark-bonus cal-dot-${dotClass}" title="${tBon}">○</span>`
        );
    }
}

function renderCalendar(data) {
    const list = Array.isArray(data) ? data : [];
    const { min: setsMin, bonus: setsBonus } = buildCategoryMarkSets(list);
    const y = calendarViewDate.getFullYear();
    const m = calendarViewDate.getMonth();

    document.getElementById('calendarMonthLabel').textContent = `${y}年 ${m + 1}月`;

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < startPad; i++) {
        const el = document.createElement('div');
        el.className = 'cal-cell cal-pad';
        grid.appendChild(el);
    }

    const todayKey = getTodayDateKey();

    for (let d = 1; d <= daysInMonth; d++) {
        const el = document.createElement('div');
        const key = dateKeyFromParts(y, m + 1, d);
        el.className = 'cal-cell cal-day';

        const parts = [];
        appendCalMarksForDay(
            parts,
            key,
            setsMin,
            setsBonus,
            'it',
            'it',
            'IT 最低限',
            'IT ボーナス'
        );
        appendCalMarksForDay(
            parts,
            key,
            setsMin,
            setsBonus,
            'en',
            'en',
            '英語 最低限',
            '英語 ボーナス'
        );
        appendCalMarksForDay(
            parts,
            key,
            setsMin,
            setsBonus,
            'training',
            'training',
            '筋トレ 最低限',
            '筋トレ ボーナス'
        );

        const marksHtml =
            parts.length > 0 ? `<span class="cal-marks-row">${parts.join('')}</span>` : '';
        el.innerHTML = `<span class="cal-day-num">${d}</span>${marksHtml}`;

        if (parts.length) el.classList.add('cal-day-has-marks');
        if (key === todayKey) el.classList.add('cal-day-today');
        grid.appendChild(el);
    }
}

function getLocalData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Failed to parse local data:', e);
        return [];
    }
}

function saveLocalData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function markSummaryHtml(item) {
    const fmt = (min, bon, label) =>
        `${label} ${min ? '●低' : '低—'} / ${bon ? '●ボ' : 'ボ—'}`;
    return [
        fmt(item.min_it, item.bonus_it, 'IT'),
        fmt(item.min_en, item.bonus_en, '英語'),
        fmt(item.min_training, item.bonus_training, '筋トレ')
    ].join(' · ');
}

function renderHistoryList(data) {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (!data.length) {
        historyList.innerHTML = '<div class="glass-card">データがありません。最初のログを記録してください！</div>';
        return;
    }

    [...data].reverse().forEach((item) => {
        const card = document.createElement('div');
        card.className = 'glass-card history-card';
        card.innerHTML = `
            <div class="history-date"><span class="history-day">${escapeHtml(formatHistoryDate(item.date))}</span>${item.timestamp ? `<div class="history-ts">${escapeHtml(formatHistoryTimestamp(item.timestamp))}</div>` : ''}<div class="history-marks">${escapeHtml(markSummaryHtml(item))}</div></div>
            <div class="history-field"><span class="hf-label">IT</span> ${escapeHtml(item.backlog_it || '—')}</div>
            <div class="history-field"><span class="hf-label">英語</span> ${escapeHtml(item.backlog_en || '—')}</div>
            <div class="history-field"><span class="hf-label">筋トレ</span> ${escapeHtml(item.backlog_training || '—')}</div>
        `;
        historyList.appendChild(card);
    });
}

function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

async function saveLog() {
    const backlog_it = document.getElementById('backlog_it').value.trim();
    const backlog_en = document.getElementById('backlog_en').value.trim();
    const backlog_training = document.getElementById('backlog_training').value.trim();
    const btn = document.getElementById('saveBtn');

    const hasText = !!(backlog_it || backlog_en || backlog_training);
    if (!hasText && !anyMarkSet()) {
        alert('バックログのいずれかを入力するか、各カテゴリの「最低限」「ボーナス」のいずれかに丸を付けてください。');
        return;
    }

    const date = new Date().toLocaleDateString('ja-JP');
    btn.disabled = true;
    btn.innerText = 'SAVING...';

    const newEntry = {
        date,
        backlog_it,
        backlog_en,
        backlog_training,
        min_it: marks.it.min,
        bonus_it: marks.it.bonus,
        min_en: marks.en.min,
        bonus_en: marks.en.bonus,
        min_training: marks.training.min,
        bonus_training: marks.training.bonus,
        timestamp: new Date().toLocaleString('ja-JP')
    };

    try {
        if (GAS_URL && GAS_URL !== 'YOUR_GAS_WEB_APP_URL_HERE') {
            try {
                await saveToSpreadsheet(newEntry);
                await loadDataFromSpreadsheet();
                alert('✅ 保存完了！スプレッドシートに同期しました。');
            } catch (gasError) {
                console.error('Spreadsheet save error:', gasError);
                const data = normalizeDataArray(getLocalData());
                data.push(newEntry);
                saveLocalData(data);
                lastKnownData = data;
                updateUIAndCalendar(data);
                alert(
                    '⚠️ スプレッドシートへの保存に失敗しました。\nローカルには保存されています。\n\nエラー: ' +
                        gasError.message
                );
            }
        } else {
            const data = normalizeDataArray(getLocalData());
            data.push(newEntry);
            saveLocalData(data);
            lastKnownData = data;
            updateUIAndCalendar(data);
            alert('✅ ローカルに保存しました！\n（スプレッドシート連携をセットアップすると自動同期されます）');
        }

        resetFormState();
    } catch (e) {
        console.error('Error:', e);
        alert('❌ エラーが発生しました: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'SEND TO CLOUD';
    }
}

async function saveToSpreadsheet(entry) {
    // GAS ウェブアプリ: application/json だと CORS プリフライト(OPTIONS)で失敗することがあるため text/plain で送る
    const body = JSON.stringify({
        date: entry.date,
        backlog_it: entry.backlog_it,
        backlog_en: entry.backlog_en,
        backlog_training: entry.backlog_training,
        min_it: entry.min_it,
        bonus_it: entry.bonus_it,
        min_en: entry.min_en,
        bonus_en: entry.bonus_en,
        min_training: entry.min_training,
        bonus_training: entry.bonus_training
    });

    const response = await fetch(GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body
    });

    const text = await response.text();
    let result;
    try {
        result = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(
            response.ok
                ? `応答の形式が不正です: ${text.slice(0, 120)}`
                : `HTTP ${response.status}: ${text.slice(0, 200)}`
        );
    }

    if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!result.success) throw new Error(result.error || 'データの保存に失敗しました');
    return result;
}
