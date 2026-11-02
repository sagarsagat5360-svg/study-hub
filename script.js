'use strict';
/* =====================================================================
   STUDY HUB - script.js
   1. Settings and helpers      5. Quiz
   2. Dashboard / subjects      6. Flashcards
   3. Gemini API (fetch)        7. History
   4. Rendering the results     8. Settings, theme, start-up
   ===================================================================== */

/* ---------- 1. Settings and helpers ---------- */
// If Google retires this model, change the name here (see ai.google.dev/gemini-api/docs/models).
const MODEL = 'gemini-3.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_CHARS = 12000;
const KEY_NAME = 'studyhub_api_key';
const QUOTES = [
  'The expert in anything was once a beginner.',
  'Small daily improvements lead to big results.',
  'Study while others are sleeping; work while others are loafing.',
  'It always seems impossible until it is done.',
  'Learning never exhausts the mind.',
  'Well begun is half done.'
];

const $ = (id) => document.getElementById(id);

// Escape text before putting it into innerHTML so notes/AI text can never inject HTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// localStorage only stores text, so we convert with JSON.stringify / JSON.parse.
function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { toast('Could not save: browser storage is full or blocked.', true); }
}

function toast(message, isError = false) {
  const t = $('toast');
  t.textContent = message;
  t.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

// App data lives in one object so it is easy to save.
const defaultState = {
  today: [], week: [], tasks: [], quizScores: [],
  subjects: ['Java Programming', 'DBMS', 'Web Technology', 'Data Structures and Algorithms'].map((name, i) => ({ id: i + 1, name }))
};
let state = { ...defaultState, ...load('studyhub_state', {}) };
let sets = load('studyhub_sets', []);   // saved AI generations (history)
let current = null;                     // the study set being shown
let quizAnswers = [];                   // chosen option per question

const persist = () => save('studyhub_state', state);
const saveSets = () => save('studyhub_sets', sets);

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
  document.querySelectorAll('nav [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'history') renderHistory();
  if (name === 'subjects') renderSubjects();
  if (name === 'dashboard') renderDashboard();
  window.scrollTo(0, 0);
}

/* ---------- 2. Dashboard and subjects ---------- */
function dueLabel(due) {
  if (!due) return 'no date';
  const today = new Date().setHours(0, 0, 0, 0);
  const days = Math.round((new Date(due + 'T00:00') - today) / 864e5);
  return days < 0 ? `${-days} day(s) overdue` : days === 0 ? 'due today' : `${days} day(s) left`;
}

// Draws one list (daily goals, weekly goals or assignments) from state.
function renderList(key, ulId) {
  const items = key === 'tasks' ? [...state.tasks].sort((a, b) => (a.due || '9').localeCompare(b.due || '9')) : state[key];
  $(ulId).innerHTML = items.length ? items.map((i) => `
    <li class="${i.done ? 'done' : ''}">
      <label><input type="checkbox" style="width:auto" data-list="${key}" data-id="${i.id}" ${i.done ? 'checked' : ''}><span>${esc(i.text)}</span></label>
      ${key === 'tasks' ? `<small class="due">${esc(i.subject)}, ${dueLabel(i.due)}</small>` : ''}
      <button class="x" data-del="${key}" data-id="${i.id}" aria-label="Delete">×</button>
    </li>`).join('') : '<li class="empty">Nothing here yet. Add one above.</li>';
}

function renderDashboard() {
  const d = new Date();
  $('dDay').textContent = String(d.getDate()).padStart(2, '0');
  $('dMon').textContent = String(d.getMonth() + 1).padStart(2, '0');
  $('dFull').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('quote').textContent = QUOTES[d.getDate() % QUOTES.length];
  renderList('today', 'todayList'); renderList('week', 'weekList'); renderList('tasks', 'taskList');

  const goals = [...state.today, ...state.week];
  const done = goals.filter((g) => g.done).length;
  const pct = goals.length ? Math.round((done / goals.length) * 100) : 0;
  $('progressBar').style.width = pct + '%';
  $('progressText').textContent = `${done} of ${goals.length} goals done (${pct}%)`;

  const scores = state.quizScores;
  const avg = scores.length ? Math.round(scores.reduce((s, q) => s + q.score, 0) / scores.length / 5 * 100) : 0;
  $('quizAvg').textContent = scores.length ? `Average quiz score: ${avg}% over ${scores.length} quiz(zes)` : 'No quizzes taken yet.';
  $('scoreList').innerHTML = scores.slice(-5).reverse().map((q) => `<li>${esc(q.topic)}: ${q.score}/5</li>`).join('');
  $('pendingCount').textContent = state.tasks.filter((t) => !t.done).length;
  $('subjectChips').innerHTML = state.subjects.map((s) => `<span class="chip">${esc(s.name)}</span>`).join('');
}

function fillSubjectSelects() {
  ['subject', 'taskSubject'].forEach((id) => {
    const sel = $(id), old = sel.value;
    sel.innerHTML = state.subjects.map((s) => `<option>${esc(s.name)}</option>`).join('');
    if ([...sel.options].some((o) => o.value === old)) sel.value = old;
  });
}

function renderSubjects() {
  $('subjectGrid').innerHTML = state.subjects.map((s) => {
    const n = sets.filter((h) => h.subject === s.name).length;
    return `<article class="card subj"><div class="arch">📖</div><h3>${esc(s.name)}</h3>
      <p class="muted">${n} study set${n === 1 ? '' : 's'} generated</p>
      <button class="btn small" data-study="${esc(s.name)}">Study this</button>
      <button class="x" data-delsub="${s.id}" aria-label="Delete subject ${esc(s.name)}">×</button></article>`;
  }).join('') || '<p class="muted">No subjects yet. Add one above.</p>';
  fillSubjectSelects();
}

/* ---------- 3. Gemini API ---------- */
// Builds the instruction we send. Asking for JSON-only output makes the reply easy to parse.
function buildPrompt({ notes, topic, subject, style, difficulty }) {
  const styles = {
    eli10: 'Explain like I am 10: simple words, short sentences, everyday examples.',
    exam: 'Exam-focused: key definitions, formulas, likely exam questions and points to memorise.',
    detailed: 'Detailed: thorough explanation with context and examples.'
  };
  return `You are a study assistant for a B.Tech Computer Science student.
Subject: ${subject}
Topic: ${topic || '(infer it from the notes)'}
Explanation style: ${styles[style]}
Quiz difficulty: ${difficulty}
Notes:
"""
${notes || '(none - use your own knowledge of the topic)'}
"""
Reply with ONLY valid JSON, no markdown fences, in exactly this shape:
{"summary":"text using '## ' headings, '- ' bullets and **bold** for key concepts",
"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":"A","explanation":"..."}],
"flashcards":[{"front":"...","back":"..."}]}
Rules: exactly 5 questions, each with exactly 4 options; correctAnswer is the letter A, B, C or D; 6 to 8 flashcards.`;
}

// Sends the POST request. async/await pauses here until Google answers.
async function callGemini(prompt, apiKey) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
      })
    });
  } catch {
    // fetch() only rejects when the request never reached the server.
    throw new Error('Network error: check your internet connection and try again.');
  }

  if (!response.ok) { // 4xx / 5xx status codes
    const messages = {
      400: 'Request rejected (400). Your API key may be invalid, or the notes are too long.',
      401: 'Unauthorised (401). Your API key is wrong. Check it in Settings.',
      403: 'Access denied (403). The key is not allowed to use this model or region.',
      404: `Model not found (404). Change MODEL at the top of script.js (currently "${MODEL}").`,
      429: 'Rate limit reached (429). The free tier allows limited requests. Wait a minute and retry.'
    };
    throw new Error(messages[response.status] || (response.status >= 500
      ? `Gemini server error (${response.status}). Try again in a moment.` : `Unexpected error (${response.status}).`));
  }

  const data = await response.json();
  // The answer text lives at candidates[0].content.parts[].text
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error(data?.promptFeedback?.blockReason ? 'The AI blocked this request. Try different notes.' : 'The AI sent an empty reply. Try again.');
  return text;
}

// Finds the index (0-3) of the right option, from a letter ("B") or the option's own text.
function correctIndex(q) {
  const ans = String(q.correctAnswer || '').trim();
  if (/^[A-D]\b/i.test(ans) && ans.length <= 3) return 'ABCD'.indexOf(ans[0].toUpperCase());
  return q.options.findIndex((o) => String(o).trim().toLowerCase() === ans.toLowerCase());
}

// Parses and VALIDATES the reply. Throws a friendly error instead of crashing.
function parseStudyJson(text) {
  let data;
  try { data = JSON.parse(text.replace(/^\s*```(?:json)?|```\s*$/g, '').trim()); }
  catch { throw new Error('The AI reply was not valid JSON. Click Regenerate to try again.'); }

  const bad = (what) => new Error(`The AI reply was incomplete (${what}). Click Regenerate to try again.`);
  if (typeof data.summary !== 'string' || !data.summary.trim()) throw bad('no summary');
  if (!Array.isArray(data.questions) || data.questions.length < 5) throw bad('fewer than 5 questions');
  if (!Array.isArray(data.flashcards) || !data.flashcards.length) throw bad('no flashcards');

  const questions = data.questions.slice(0, 5).map((q) => {
    if (!q || typeof q.question !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) throw bad('a question has no 4 options');
    const correct = correctIndex(q);
    if (correct < 0) throw bad('a question has no valid correct answer');
    return { question: q.question, options: q.options.map(String), correct, explanation: String(q.explanation || '') };
  });
  const flashcards = data.flashcards.filter((c) => c && c.front && c.back).map((c) => ({ front: String(c.front), back: String(c.back) }));
  if (!flashcards.length) throw bad('flashcards are malformed');
  return { summary: data.summary, questions, flashcards };
}

function showError(message) { const e = $('aiError'); e.textContent = message; e.hidden = !message; }

function setLoading(on) {
  $('genBtn').disabled = on; $('regenBtn').disabled = on;     // stops double clicks
  $('genBtn').textContent = on ? 'Generating...' : 'Generate study material';
  $('spinner').hidden = !on;
}

// The main flow: check input -> build prompt -> call API -> validate -> save -> show.
async function generate() {
  if ($('genBtn').disabled) return;
  const apiKey = localStorage.getItem(KEY_NAME);
  const notes = $('notes').value.trim(), topic = $('topic').value.trim();
  showError('');
  if (!apiKey) return showError('No API key found. Open Settings and paste your Gemini API key.');
  if (!notes && !topic) return showError('Please paste some notes or enter a topic first.');
  if (notes.length > MAX_CHARS) return showError(`Notes are too long (${notes.length} characters). Keep them under ${MAX_CHARS}.`);

  setLoading(true);
  try {
    const subject = $('subject').value, style = $('style').value, difficulty = $('difficulty').value;
    const reply = await callGemini(buildPrompt({ notes, topic, subject, style, difficulty }), apiKey);
    const result = parseStudyJson(reply);
    current = { id: Date.now(), topic: topic || notes.slice(0, 40) + '...', subject, style, difficulty, date: new Date().toISOString(), known: {}, ...result };
    sets.unshift(current);
    sets = sets.slice(0, 30);            // keep history small
    saveSets();
    showResult(current);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);                   // always re-enable the button
  }
}

/* ---------- 4. Rendering results ---------- */
// Tiny markdown converter: ## headings, - bullets, **bold**. Text is escaped first.
function mdToHtml(md) {
  let html = '', inList = false;
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>');
  md.split('\n').forEach((raw) => {
    const line = raw.trim(), bullet = /^[-*]\s+/.test(line);
    if (inList && !bullet) { html += '</ul>'; inList = false; }
    if (/^#{1,6}\s/.test(line)) html += `<h4>${inline(line.replace(/^#+\s*/, ''))}</h4>`;
    else if (bullet) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`; }
    else if (line) html += `<p>${inline(line)}</p>`;
  });
  return html + (inList ? '</ul>' : '');
}

function showResult(set) {
  current = set;
  $('results').hidden = false;
  $('resTitle').textContent = `${set.topic} (${set.subject})`;
  $('summaryBox').innerHTML = mdToHtml(set.summary);
  renderQuiz(); renderFlashcards(); switchTab('summary');
}

function switchTab(name) {
  ['summary', 'quiz', 'cards'].forEach((t) => { $('tab-' + t).hidden = t !== name; });
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
}

async function copySummary() {
  try { await navigator.clipboard.writeText(current.summary); toast('Summary copied.'); }
  catch { toast('Copy failed. Select the text and press Ctrl+C.', true); }
}

function downloadSummary() {
  const blob = new Blob([`${current.topic}\n${current.subject}\n\n${current.summary}`], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = current.topic.replace(/[^\w]+/g, '-').slice(0, 40) + '-summary.txt';
  link.click();
  URL.revokeObjectURL(link.href);
}

function toggleSpeech() {
  if (!('speechSynthesis' in window)) return toast('Speech is not supported in this browser.', true);
  if (speechSynthesis.speaking) return speechSynthesis.cancel();
  const plain = current.summary.replace(/[#*_`]/g, '').replace(/^\s*-\s+/gm, '');
  speechSynthesis.speak(new SpeechSynthesisUtterance(plain));
}

/* ---------- 5. Quiz ---------- */
function renderQuiz() {
  quizAnswers = [];
  $('quizBox').innerHTML = current.questions.map((q, qi) => `
    <fieldset class="q" data-q="${qi}"><legend>${qi + 1}. ${esc(q.question)}</legend>
      ${q.options.map((o, oi) => `<button type="button" class="opt" data-q="${qi}" data-o="${oi}">${'ABCD'[oi]}. ${esc(o)}</button>`).join('')}
      <p class="why" hidden></p></fieldset>`).join('')
    + '<p id="quizScore" class="score" hidden></p><button class="btn" id="quizRestart" hidden>Restart quiz</button>';
}

function answerQuestion(qi, oi) {
  if (quizAnswers[qi] !== undefined) return;               // already answered
  quizAnswers[qi] = oi;
  const q = current.questions[qi], box = document.querySelector(`.q[data-q="${qi}"]`);
  box.querySelectorAll('.opt').forEach((b, i) => {
    b.disabled = true;
    if (i === q.correct) b.classList.add('right'); else if (i === oi) b.classList.add('wrong');
  });
  const why = box.querySelector('.why');
  why.hidden = false;
  why.textContent = (oi === q.correct ? 'Correct. ' : 'Not quite. ') + q.explanation;
  if (quizAnswers.filter((a) => a !== undefined).length === 5) finishQuiz();
}

function finishQuiz() {
  const score = current.questions.filter((q, i) => quizAnswers[i] === q.correct).length;
  const pct = Math.round((score / 5) * 100);
  $('quizScore').hidden = false;
  $('quizScore').textContent = `Final score: ${score} / 5 (${pct}%)`;
  $('quizRestart').hidden = false;
  state.quizScores.push({ topic: current.topic, score, date: new Date().toISOString() });
  persist(); renderDashboard();
}

/* ---------- 6. Flashcards ---------- */
function renderFlashcards() {
  $('cards').innerHTML = current.flashcards.map((c, i) => `
    <div class="fc-wrap">
      <div class="flashcard" tabindex="0" role="button" aria-label="Flashcard ${i + 1}. Press to flip">
        <div class="face front">${esc(c.front)}</div><div class="face back">${esc(c.back)}</div></div>
      <div class="row"><button class="btn small ghost" data-know="1" data-i="${i}">Known</button>
      <button class="btn small ghost" data-know="0" data-i="${i}">Not known</button></div>
    </div>`).join('');
  current.flashcards.forEach((_, i) => paintKnown(i));
  updateKnownCount();
}
function paintKnown(i) {
  document.querySelectorAll(`[data-know][data-i="${i}"]`).forEach((b) => b.classList.toggle('on', current.known[i] === (b.dataset.know === '1')));
}
function updateKnownCount() {
  const n = Object.values(current.known).filter(Boolean).length;
  $('knownCount').textContent = `${n} of ${current.flashcards.length} flashcards learned`;
}
function setKnown(i, value) { current.known[i] = value; paintKnown(i); updateKnownCount(); saveSets(); }

/* ---------- 7. History ---------- */
function renderHistory() {
  const term = $('historySearch').value.toLowerCase();
  const list = sets.filter((h) => `${h.topic} ${h.subject}`.toLowerCase().includes(term));
  $('historyList').innerHTML = list.length ? list.map((h) => `
    <li><button class="btn ghost" style="flex:1;text-align:left" data-open="${h.id}"><b>${esc(h.topic)}</b><br>
      <small>${esc(h.subject)}, ${new Date(h.date).toLocaleString()}</small></button>
      <button class="x" data-delset="${h.id}" aria-label="Delete this item">×</button></li>`).join('')
    : `<li class="empty">${sets.length ? 'No matches.' : 'No study sets yet. Generate one and it will appear here.'}</li>`;
}

/* ---------- 8. Events, settings, theme, start-up ---------- */
// Event delegation: one listener handles buttons that are created dynamically.
document.addEventListener('click', (e) => {
  const on = (sel) => e.target.closest(sel);
  let el;
  if ((el = on('[data-view]'))) return showView(el.dataset.view);
  if (on('[data-theme-toggle]')) return toggleTheme();
  if ((el = on('[data-tab]'))) return switchTab(el.dataset.tab);
  if ((el = on('[data-del]'))) { state[el.dataset.del] = state[el.dataset.del].filter((i) => String(i.id) !== el.dataset.id); persist(); return renderDashboard(); }
  if ((el = on('[data-delsub]'))) { state.subjects = state.subjects.filter((s) => String(s.id) !== el.dataset.delsub); persist(); return renderSubjects(); }
  if ((el = on('[data-study]'))) { $('subject').value = el.dataset.study; return showView('assistant'); }
  if ((el = on('.opt'))) return answerQuestion(+el.dataset.q, +el.dataset.o);
  if (on('#quizRestart')) return renderQuiz();
  if ((el = on('.flashcard'))) return el.classList.toggle('flipped');
  if ((el = on('[data-know]'))) return setKnown(+el.dataset.i, el.dataset.know === '1');
  if ((el = on('[data-open]'))) { showView('assistant'); return showResult(sets.find((h) => String(h.id) === el.dataset.open)); }
  if ((el = on('[data-delset]'))) { sets = sets.filter((h) => String(h.id) !== el.dataset.delset); saveSets(); return renderHistory(); }
});

document.addEventListener('change', (e) => {
  const box = e.target.closest('[data-list]');
  if (!box) return;
  state[box.dataset.list].find((i) => String(i.id) === box.dataset.id).done = box.checked;
  persist(); renderDashboard();
});

document.addEventListener('keydown', (e) => {   // flip cards with keyboard
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('flashcard')) { e.preventDefault(); e.target.classList.toggle('flipped'); }
});

document.addEventListener('submit', (e) => {    // add goals, assignments and subjects
  const form = e.target;
  if (!form.dataset.add && form.id !== 'subjectForm') return;
  e.preventDefault();
  const text = form.elements.text.value.trim();
  if (!text) return toast('Please type something first.', true);
  if (form.id === 'subjectForm') state.subjects.push({ id: Date.now(), name: text });
  else {
    const item = { id: Date.now(), text, done: false };
    if (form.dataset.add === 'tasks') { item.subject = form.elements.subject.value; item.due = form.elements.due.value; }
    state[form.dataset.add].push(item);
  }
  form.reset(); persist();
  form.id === 'subjectForm' ? renderSubjects() : renderDashboard();
});

$('aiForm').addEventListener('submit', (e) => { e.preventDefault(); generate(); });
$('regenBtn').addEventListener('click', generate);
$('copyBtn').addEventListener('click', copySummary);
$('downloadBtn').addEventListener('click', downloadSummary);
$('speakBtn').addEventListener('click', toggleSpeech);
$('historySearch').addEventListener('input', renderHistory);
$('clearHistory').addEventListener('click', () => {
  if (sets.length && confirm('Delete ALL study history?')) { sets = []; saveSets(); renderHistory(); }
});

// Character counter with a warning near the limit
$('notes').addEventListener('input', () => {
  const n = $('notes').value.length;
  $('charCount').textContent = `${n} / ${MAX_CHARS}` + (n > MAX_CHARS ? ' (too long, please shorten)' : n > MAX_CHARS * 0.9 ? ' (almost at the limit)' : '');
});

// Settings: API key and default style
$('saveKey').addEventListener('click', () => {
  const key = $('apiKey').value.trim();
  if (!key) return toast('Paste a key first.', true);
  localStorage.setItem(KEY_NAME, key); toast('API key saved in this browser.');
});
$('removeKey').addEventListener('click', () => { localStorage.removeItem(KEY_NAME); $('apiKey').value = ''; toast('API key removed.'); });
$('showKey').addEventListener('click', () => {
  const input = $('apiKey'), hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password'; $('showKey').textContent = hidden ? 'Hide' : 'Show';
});
$('defaultStyle').innerHTML = $('style').innerHTML;
$('defaultStyle').addEventListener('change', () => { localStorage.setItem('studyhub_style', $('defaultStyle').value); $('style').value = $('defaultStyle').value; });

// Theme: saved preference, else the system setting
function applyTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem('studyhub_theme', theme); }
function toggleTheme() { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }

function init() {
  applyTheme(localStorage.getItem('studyhub_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const style = localStorage.getItem('studyhub_style');
  if (style) { $('style').value = style; $('defaultStyle').value = style; }
  $('apiKey').value = localStorage.getItem(KEY_NAME) || '';
  renderSubjects();
  showView('dashboard');
}
init();
