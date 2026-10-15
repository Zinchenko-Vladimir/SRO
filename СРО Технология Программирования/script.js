"use strict";
const Status = Object.freeze({ OK: "норма", LOW: "ниже нормы", HIGH: "выше нормы" });

const NORMS = {
  "молоко": [
    { indicator: "температура", unit: "°C", min: 2, max: 6 },
    { indicator: "pH", unit: "", min: 6.5, max: 6.8 },
    { indicator: "жирность", unit: "%", min: 2.5, max: 3.5 },
    { indicator: "кислотность", unit: "°T", min: 16, max: 21 }
  ],
  "мясо": [
    { indicator: "температура", unit: "°C", min: -2, max: 4 },
    { indicator: "влажность", unit: "%", min: 60, max: 75 },
    { indicator: "pH", unit: "", min: 5.5, max: 6.2 }
  ],
  "хлеб": [
    { indicator: "влажность", unit: "%", min: 40, max: 47 },
    { indicator: "кислотность", unit: "°T", min: 1, max: 3 },
    { indicator: "пористость", unit: "%", min: 65, max: 80 }
  ]
};

class ValidationError extends Error {}

function parseValue(text) {
  const t = String(text).trim().replace(",", ".");
  if (t === "") throw new ValidationError("Введите значение.");
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) throw new ValidationError("«" + text.trim() + "» — не число. Используйте цифры, например 4,5.");
  return parseFloat(t);
}

function validateBatch(batch) {
  const b = String(batch).trim().toUpperCase();
  if (b.length < 3 || b.length > 20) throw new ValidationError("Номер партии должен содержать от 3 до 20 символов.");
  if (!/^[A-ZА-ЯЁ0-9-]+$/.test(b)) throw new ValidationError("В номере партии допустимы только буквы, цифры и дефис.");
  return b;
}

function findNorm(product, indicator) {
  const p = String(product).trim().toLowerCase();
  const i = String(indicator).trim().toLowerCase();
  if (!(p in NORMS)) throw new ValidationError("Неизвестный продукт: " + p + ".");
  const n = NORMS[p].find(x => x.indicator.toLowerCase() === i);
  if (!n) throw new ValidationError("Для продукта «" + p + "» нет показателя «" + i + "».");
  return n;
}

function checkValue(value, norm) {
  if (value < norm.min) return "LOW";
  if (value > norm.max) return "HIGH";
  return "OK";
}

class QualityLog {
  constructor(items) { this.items = items || []; }
  add(batch, product, indicator, rawValue) {
    const b = validateBatch(batch);
    const norm = findNorm(product, indicator);
    const value = parseValue(rawValue);
    const m = {
      batch: b, product: product.trim().toLowerCase(), indicator: norm.indicator,
      value: value, status: checkValue(value, norm),
      time: new Date().toLocaleString("ru-RU")
    };
    this.items.push(m);
    return m;
  }
  deviations() { return this.items.filter(m => m.status !== "OK"); }
  byBatch(batch) {
    const b = String(batch).trim().toUpperCase();
    return this.items.filter(m => m.batch.includes(b));
  }
  stats() {
    const total = this.items.length, bad = this.deviations().length;
    return { total, bad, share: total ? Math.round(1000 * bad / total) / 10 : 0 };
  }
  toCSV() {
    const rows = [["партия", "продукт", "показатель", "значение", "статус", "время"]];
    for (const m of this.items) rows.push([m.batch, m.product, m.indicator, m.value, Status[m.status], m.time]);
    return "\uFEFF" + rows.map(r => r.join(";")).join("\r\n");
  }
}

const STORE_KEY = "food-quality-log-v1";
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(log.items)); } catch (e) { /* хранилище недоступно */ }
}
const log = new QualityLog(load());
let currentTab = "log";
let searchText = "";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function fillProducts() {
  $("product").innerHTML = Object.keys(NORMS).map(p => `<option value="${p}">${p}</option>`).join("");
  fillIndicators();
}
function fillIndicators() {
  const list = NORMS[$("product").value];
  $("indicator").innerHTML = list.map(n => `<option value="${esc(n.indicator)}">${esc(n.indicator)}</option>`).join("");
  showNormHint();
}
function showNormHint() {
  const n = findNorm($("product").value, $("indicator").value);
  $("normHint").textContent = "Допустимо: " + n.min + " … " + n.max + (n.unit ? " " + n.unit : "");
}
function showMsg(text, kind) {
  const el = $("msg");
  el.textContent = text;
  el.className = "msg show " + kind;
}

function gauge(m) {
  const n = findNorm(m.product, m.indicator);
  const span = n.max - n.min, lo = n.min - span / 2, hi = n.max + span / 2;
  const pos = Math.min(100, Math.max(0, (m.value - lo) / (hi - lo) * 100));
  return `<div class="gauge" role="img" aria-label="Положение значения относительно нормы"><div class="zone"></div><div class="mark ${m.status}" style="left:${pos}%"></div></div>`;
}
function badge(status) { return `<span class="badge ${status}">${Status[status]}</span>`; }

function renderStats() {
  const s = log.stats();
  $("stats").innerHTML =
    `<div class="stat"><b>${s.total}</b><span>измерений</span></div>` +
    `<div class="stat"><b>${s.bad}</b><span>отклонений</span></div>` +
    `<div class="stat"><b>${s.share}%</b><span>доля отклонений</span></div>`;
}

function rowsHtml(items) {
  return items.slice().reverse().map(m => {
    const n = findNorm(m.product, m.indicator);
    return `<tr><td>${esc(m.batch)}</td><td>${esc(m.product)}</td><td>${esc(m.indicator)}</td>` +
      `<td>${m.value} ${esc(n.unit)}</td><td>${gauge(m)}</td><td>${badge(m.status)}</td><td>${esc(m.time)}</td></tr>`;
  }).join("");
}
const HEAD = "<thead><tr><th>Партия</th><th>Продукт</th><th>Показатель</th><th>Значение</th><th>Положение</th><th>Статус</th><th>Время</th></tr></thead>";

function renderView() {
  const v = $("view");
  if (currentTab === "log") {
    const items = searchText ? log.byBatch(searchText) : log.items;
    let html = `<div class="search"><label class="sr" for="q">Поиск по партии</label>` +
      `<input id="q" placeholder="Поиск по номеру партии" value="${esc(searchText)}"></div>`;
    if (!items.length) {
      html += `<div class="empty">${log.items.length ? "Партия не найдена. Проверьте номер." : "Журнал пуст. Введите первое измерение слева."}</div>`;
    } else {
      html += `<div class="scroll"><table>${HEAD}<tbody>${rowsHtml(items)}</tbody></table></div>`;
    }
    html += `<div class="row"><button class="btn ghost" id="csv">Скачать CSV</button>` +
      `<button class="btn ghost" id="demo">Добавить пример данных</button>` +
      `<button class="btn ghost" id="clear">Очистить журнал</button></div>`;
    v.innerHTML = html;
    const q = $("q");
    q.addEventListener("input", () => { searchText = q.value; const pos = q.selectionStart; renderView(); const q2 = $("q"); q2.focus(); q2.setSelectionRange(pos, pos); });
    $("csv").onclick = downloadCSV;
    $("demo").onclick = addDemo;
    $("clear").onclick = clearLog;
  } else if (currentTab === "report") {
    const dev = log.deviations();
    const s = log.stats();
    let html = `<h2>Отчёт об отклонениях</h2><p>Измерений: ${s.total}, отклонений: ${s.bad} (${s.share}%).</p>`;
    html += dev.length
      ? `<div class="scroll"><table>${HEAD}<tbody>${rowsHtml(dev)}</tbody></table></div>`
      : `<div class="empty">Отклонений нет.</div>`;
    v.innerHTML = html;
  } else if (currentTab === "norms") {
    let html = `<h2>Допустимые диапазоны</h2><p class="hint">Значения условные, для учебной демонстрации.</p>`;
    for (const p of Object.keys(NORMS)) {
      html += `<h3>${esc(p)}</h3><div class="scroll"><table><thead><tr><th>Показатель</th><th>От</th><th>До</th><th>Единица</th></tr></thead><tbody>` +
        NORMS[p].map(n => `<tr><td>${esc(n.indicator)}</td><td>${n.min}</td><td>${n.max}</td><td>${esc(n.unit || "—")}</td></tr>`).join("") +
        `</tbody></table></div>`;
    }
    v.innerHTML = html;
  } else {
    v.innerHTML = `<h2>Тестовые сценарии</h2><p class="hint">Запускаются в браузере на отдельном журнале, ваши данные не меняются.</p>` +
      `<div class="row" style="margin:0 0 12px"><button class="btn" id="runTests">Запустить тесты</button></div><div id="testOut"></div>`;
    $("runTests").onclick = runTests;
  }
  renderStats();
}

function setTab(name) {
  currentTab = name;
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  renderView();
}

function addMeasurement() {
  try {
    const m = log.add($("batch").value, $("product").value, $("indicator").value, $("value").value);
    save();
    const n = findNorm(m.product, m.indicator);
    showMsg(m.indicator + " = " + m.value + " " + n.unit + " — " + Status[m.status] + ".", m.status === "OK" ? "good" : "warn");
    $("value").value = "";
    $("value").focus();
    if (currentTab !== "log" && currentTab !== "report") currentTab = "log";
    setTab(currentTab);
  } catch (e) {
    if (e instanceof ValidationError) showMsg(e.message, "err"); else throw e;
  }
}

function downloadCSV() {
  if (!log.items.length) { showMsg("Журнал пуст — нечего скачивать.", "err"); return; }
  const blob = new Blob([log.toCSV()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "report.csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function addDemo() {
  const demo = [
    ["M-2026-01", "молоко", "температура", "4,2"], ["M-2026-01", "молоко", "pH", "6,6"],
    ["M-2026-02", "молоко", "жирность", "4,1"], ["M-2026-02", "молоко", "температура", "8"],
    ["R-2026-07", "мясо", "температура", "-5"], ["R-2026-07", "мясо", "влажность", "68"],
    ["B-2026-11", "хлеб", "влажность", "43"], ["B-2026-11", "хлеб", "кислотность", "4,5"]
  ];
  demo.forEach(d => log.add(...d));
  save(); renderView();
}
function clearLog() {
  if (!log.items.length) return;
  if (confirm("Удалить все измерения из журнала?")) { log.items = []; save(); renderView(); }
}

function runTests() {
  const throwsVE = fn => { try { fn(); } catch (e) { return e instanceof ValidationError; } return false; };
  const fresh = () => new QualityLog([]);
  const tests = [
    ["Значение в диапазоне → норма", () => fresh().add("A-001", "молоко", "температура", "4").status === "OK"],
    ["Значение выше диапазона → выше нормы", () => fresh().add("A-001", "молоко", "температура", "9").status === "HIGH"],
    ["Значение ниже диапазона → ниже нормы", () => fresh().add("A-001", "мясо", "температура", "-10").status === "LOW"],
    ["Граница диапазона считается нормой", () => checkValue(6, findNorm("молоко", "температура")) === "OK"],
    ["Запятая как десятичный разделитель", () => parseValue("6,6") === 6.6],
    ["Нечисловой ввод отклоняется", () => throwsVE(() => parseValue("abc"))],
    ["Пустое значение отклоняется", () => throwsVE(() => parseValue("  "))],
    ["Некорректный номер партии отклоняется", () => throwsVE(() => validateBatch("A!"))],
    ["Неизвестный продукт отклоняется", () => throwsVE(() => fresh().add("A-001", "сыр", "pH", "5"))],
    ["Неподходящий показатель отклоняется", () => throwsVE(() => fresh().add("A-001", "хлеб", "температура", "5"))],
    ["Статистика отклонений", () => { const l = fresh(); l.add("A-001", "молоко", "температура", "4"); l.add("A-001", "молоко", "pH", "7.2"); return l.deviations().length === 1 && l.stats().share === 50; }],
    ["Поиск партии без учёта регистра", () => { const l = fresh(); l.add("a-001", "хлеб", "влажность", "43"); l.add("B-002", "хлеб", "влажность", "50"); return l.byBatch("A-001").length === 1; }],
    ["CSV содержит заголовок и строки", () => { const l = fresh(); l.add("A-001", "хлеб", "влажность", "43"); return l.toCSV().split("\r\n").length === 2; }]
  ];
  let passed = 0;
  const html = tests.map(([name, fn]) => {
    let ok = false;
    try { ok = fn() === true; } catch (e) { ok = false; }
    if (ok) passed++;
    return `<div class="test"><span class="${ok ? "p" : "f"}">${ok ? "✓" : "✗"}</span><span>${esc(name)}</span></div>`;
  }).join("");
  $("testOut").innerHTML = `<p><b>Пройдено ${passed} из ${tests.length}</b></p>` + html;
}

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));
$("product").addEventListener("change", fillIndicators);
$("indicator").addEventListener("change", showNormHint);
$("add").addEventListener("click", addMeasurement);
["batch", "value"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") addMeasurement(); }));
fillProducts();
renderView();
