const Q = window.AMOC_QUESTIONS || [];
const LS = 'amoc-diagnostic-v2';
const LAST_REPORT = 'amoc-diagnostic-last-full-report';

const home = document.querySelector('#home');
const quiz = document.querySelector('#quiz');
const result = document.querySelector('#result');

function freshState(mode = 'full') {
  return {
    order: [],
    i: 0,
    answers: {},
    hints: {},
    flags: {},
    mode,
    seed: Math.floor(Math.random() * 0x7fffffff)
  };
}

let S;
try {
  S = JSON.parse(localStorage.getItem(LS) || 'null') || freshState();
} catch {
  S = freshState();
}
S.answers ||= {};
S.hints ||= {};
S.flags ||= {};
S.order ||= [];
S.i ||= 0;
S.mode ||= 'full';
S.seed ||= Math.floor(Math.random() * 0x7fffffff);

const esc = s => String(s).replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[m]));

function save() {
  localStorage.setItem(LS, JSON.stringify(S));
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function syncQuestionPool() {
  if (S.mode !== 'full' || !S.order.length) return;
  const valid = new Set(Q.map(q => q.id));
  S.order = S.order.filter(id => valid.has(id));
  const present = new Set(S.order);
  const missing = shuffle(Q.map(q => q.id).filter(id => !present.has(id)));
  if (missing.length) {
    S.order.push(...missing);
    save();
  }
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function prng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function optionOrder(q) {
  const a = q.opts.map((_, i) => i);
  const rnd = prng(hash32(`${S.seed}:${q.id}`));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentSet() {
  return S.order.map(id => Q.find(q => q.id === id)).filter(Boolean);
}

function answeredItems() {
  return Object.entries(S.answers)
    .map(([id, a]) => ({ q: Q.find(x => x.id === Number(id)), ...a }))
    .filter(x => x.q);
}

function homeView() {
  home.classList.remove('hidden');
  quiz.classList.add('hidden');
  result.classList.add('hidden');

  const done = Object.keys(S.answers).length;
  const p1 = Q.filter(x => x.part === 'Teil 1').length;
  const p2 = Q.filter(x => x.part === 'Teil 2').length;
  const canResume = S.order.length && S.i < S.order.length;

  home.innerHTML = `
    <div class="hero">
      <span class="topic">AMOC SS26</span>
      <h2>Gesamtdiagnose</h2>
      <p class="muted">Der Test mischt Grundlagen, Symmetrie, Bindung, Komplexchemie, Ligandenfeld, Reaktivität, Magnetismus/Farbe und die Stoffchemie. Das Thema einer Frage wird erst nach der Antwort eingeblendet.</p>
    </div>
    <div class="grid">
      <div class="stat"><strong>${Q.length}</strong>Fragen im Pool</div>
      <div class="stat"><strong>${done}</strong>beantwortet</div>
      <div class="stat"><strong>${p1}</strong>Teil 1</div>
      <div class="stat"><strong>${p2}</strong>Teil 2</div>
    </div>
    <p class="small muted">Fragen und Antwortoptionen werden gemischt. Hinweise und „unsicher“-Markierungen werden separat erfasst. Ein richtiges Ergebnis ohne Hinweis ist diagnostisch stärker als ein assistiertes richtiges Ergebnis.</p>
    <div class="actions">
      <button class="primary" id="start">${canResume ? 'Fortsetzen' : 'Gesamtdiagnose starten'}</button>
      ${done ? '<button class="secondary" id="showres">Zwischenauswertung</button>' : ''}
    </div>`;

  document.querySelector('#start').onclick = startFull;
  if (done) document.querySelector('#showres').onclick = results;
}

function startFull() {
  if (!S.order.length || S.i >= S.order.length || S.mode !== 'full') {
    S = freshState('full');
    S.order = shuffle(Q.map(x => x.id));
    save();
  }
  renderQ();
}

function renderQ() {
  home.classList.add('hidden');
  result.classList.add('hidden');
  quiz.classList.remove('hidden');

  const arr = currentSet();
  if (S.i >= arr.length) return results();

  const q = arr[S.i];
  const prev = S.answers[q.id];
  const perm = optionOrder(q);
  const pct = arr.length ? Math.round((S.i / arr.length) * 100) : 0;
  const correctSoFar = Object.values(S.answers).filter(a => a.ok).length;
  const hintUsed = !!(prev?.hint || S.hints[q.id]);
  const flagged = !!S.flags[q.id];

  quiz.innerHTML = `
    <div class="meta">
      <span>Frage ${S.i + 1} / ${arr.length}</span>
      <span>${correctSoFar} richtig${prev ? ' · beantwortet' : ''}</span>
    </div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="question">${esc(q.q)}</div>
    <div class="answers">
      ${perm.map((origIndex, displayIndex) => {
        const o = q.opts[origIndex];
        const cls = prev
          ? (origIndex === q.a ? 'correct' : (origIndex === prev.sel ? 'wrong' : ''))
          : '';
        return `<button class="answer ${cls}" data-k="${origIndex}" ${prev ? 'disabled' : ''}>
          ${String.fromCharCode(65 + displayIndex)}. ${esc(o.t)}
          ${prev ? `<span class="explain">${esc(o.e)}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div id="hintbox">${hintUsed ? `<div class="hint"><strong>Hinweis:</strong> ${esc(q.hint)}</div>` : ''}</div>
    <div class="actions">
      ${!prev ? '<button class="secondary" id="hint">Hinweis</button>' : ''}
      ${!prev ? `<button class="secondary" id="flag">${flagged ? 'Unsicher ✓' : 'Unsicher markieren'}</button>` : ''}
      ${prev ? '<button class="primary" id="next">Weiter</button>' : ''}
      <button class="ghost" id="quit">Zur Übersicht</button>
    </div>
    ${prev ? `<p class="small muted">Thema nach Beantwortung: <span class="topic">${esc(q.part)} · ${esc(q.topic)}</span>${prev.hint ? ' · Hinweis benutzt' : ''}${S.flags[q.id] ? ' · als unsicher markiert' : ''}</p>` : ''}`;

  if (!prev) {
    document.querySelectorAll('.answer').forEach(b => {
      b.onclick = () => answer(q, Number(b.dataset.k));
    });
    document.querySelector('#hint').onclick = () => {
      S.hints[q.id] = true;
      save();
      document.querySelector('#hintbox').innerHTML = `<div class="hint"><strong>Hinweis:</strong> ${esc(q.hint)}</div>`;
    };
    document.querySelector('#flag').onclick = e => {
      S.flags[q.id] = !S.flags[q.id];
      save();
      e.currentTarget.textContent = S.flags[q.id] ? 'Unsicher ✓' : 'Unsicher markieren';
    };
  } else {
    document.querySelector('#next').onclick = () => {
      S.i++;
      save();
      renderQ();
    };
  }
  document.querySelector('#quit').onclick = homeView;
}

function answer(q, originalIndex) {
  S.answers[q.id] = {
    sel: originalIndex,
    ok: originalIndex === q.a,
    hint: !!S.hints[q.id],
    unsure: !!S.flags[q.id]
  };
  delete S.hints[q.id];
  save();
  renderQ();
}

function stats() {
  const ans = answeredItems();
  const group = {};
  for (const x of ans) {
    const key = `${x.q.part}||${x.q.topic}`;
    group[key] ||= { n: 0, c: 0, h: 0, u: 0, part: x.q.part, topic: x.q.topic };
    group[key].n++;
    group[key].c += x.ok ? 1 : 0;
    group[key].h += x.hint ? 1 : 0;
    group[key].u += x.unsure ? 1 : 0;
  }
  return { ans, group };
}

function results() {
  home.classList.add('hidden');
  quiz.classList.add('hidden');
  result.classList.remove('hidden');

  const { ans, group } = stats();
  const correct = ans.filter(x => x.ok).length;
  const hints = ans.filter(x => x.hint).length;
  const unsure = ans.filter(x => x.unsure).length;
  const pct = ans.length ? Math.round((correct / ans.length) * 100) : 0;
  const wrong = ans.filter(x => !x.ok);

  const rows = Object.values(group)
    .sort((a, b) => (a.c / a.n) - (b.c / b.n))
    .map(g => {
      const p = Math.round((g.c / g.n) * 100);
      return `<tr>
        <td>${esc(g.topic)}<div class="small muted">${esc(g.part)}</div></td>
        <td>${g.c}/${g.n}</td>
        <td><div class="bar"><span style="width:${p}%"></span></div>${p}%</td>
        <td>${g.h}</td>
        <td>${g.u}</td>
      </tr>`;
    }).join('');

  const report = reportText(ans, group);
  if (S.mode === 'full' && ans.length) localStorage.setItem(LAST_REPORT, report);

  result.innerHTML = `
    <h2>Diagnose</h2>
    <div class="grid">
      <div class="stat"><strong>${correct}/${ans.length}</strong>richtig</div>
      <div class="stat"><strong>${pct}%</strong>Trefferquote</div>
      <div class="stat"><strong>${hints}</strong>Hinweise</div>
      <div class="stat"><strong>${unsure}</strong>unsicher</div>
    </div>
    <p class="small muted">Die Prozentwerte sind eine Lernstandsdiagnose, keine offizielle TUM-Notenskala. Themen mit mehreren beantworteten Fragen und ohne Hinweis sind aussagekräftiger als einzelne Treffer.</p>
    <table class="result-table">
      <thead><tr><th>Thema</th><th>Richtig</th><th>Quote</th><th>Hinweise</th><th>Unsicher</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="actions">
      <button class="primary" id="resume">${S.i < S.order.length ? 'Test fortsetzen' : 'Zur Übersicht'}</button>
      ${wrong.length ? '<button class="secondary" id="retry">Nur Fehler wiederholen</button>' : ''}
      <button class="secondary" id="copy">Ergebnisbericht kopieren</button>
    </div>
    <h3>Bericht für ChatGPT</h3>
    <textarea class="report" id="report" readonly>${esc(report)}</textarea>`;

  document.querySelector('#resume').onclick = () => S.i < S.order.length ? renderQ() : homeView();
  if (wrong.length) {
    document.querySelector('#retry').onclick = () => {
      if (S.mode === 'full') localStorage.setItem(LAST_REPORT, report);
      const ids = wrong.map(x => x.q.id);
      S = freshState('wrong');
      S.order = shuffle(ids);
      save();
      renderQ();
    };
  }
  document.querySelector('#copy').onclick = async e => {
    const text = document.querySelector('#report').value;
    try {
      await navigator.clipboard.writeText(text);
      e.currentTarget.textContent = 'Kopiert ✓';
    } catch {
      document.querySelector('#report').focus();
      document.querySelector('#report').select();
      e.currentTarget.textContent = 'Text markiert';
    }
  };
}

function reportText(ans, group) {
  const correct = ans.filter(x => x.ok).length;
  const pct = ans.length ? Math.round((correct / ans.length) * 100) : 0;
  let s = `AMOC DIAGNOSE – ERGEBNISBLATT\n`;
  s += `Modus: ${S.mode === 'full' ? 'Gesamtdiagnose' : 'Fehlerwiederholung'}\n`;
  s += `Gesamt: ${correct}/${ans.length} richtig (${pct}%) | Hinweise: ${ans.filter(x => x.hint).length} | Unsicher: ${ans.filter(x => x.unsure).length}\n\nTHEMEN:\n`;

  for (const g of Object.values(group).sort((a, b) => (a.c / a.n) - (b.c / b.n))) {
    s += `- ${g.part} / ${g.topic}: ${g.c}/${g.n} richtig, Hinweise ${g.h}, unsicher ${g.u}\n`;
  }

  s += '\nFALSCHE ANTWORTEN:\n';
  for (const x of ans.filter(x => !x.ok)) {
    s += `\n[${x.q.part} | ${x.q.topic}] ${x.q.q}\n`;
    s += `Meine Antwort: ${x.q.opts[x.sel].t}\n`;
    s += `Richtig: ${x.q.opts[x.q.a].t}\n`;
    s += `Hinweis benutzt: ${x.hint ? 'ja' : 'nein'} | Unsicher: ${x.unsure ? 'ja' : 'nein'}\n`;
  }

  const assistedCorrect = ans.filter(x => x.ok && (x.hint || x.unsure));
  if (assistedCorrect.length) {
    s += '\nRICHTIG, ABER MIT HINWEIS/UNSICHERHEIT:\n';
    for (const x of assistedCorrect) {
      s += `- [${x.q.part} | ${x.q.topic}] ${x.q.q} (Hinweis: ${x.hint ? 'ja' : 'nein'}, unsicher: ${x.unsure ? 'ja' : 'nein'})\n`;
    }
  }

  s += '\nBitte analysiere besonders meine falschen Antworten sowie richtige Antworten mit Hinweis/Unsicherheit. Erkläre jeweils das Denkproblem und gib mir danach gezielte Wiederholungsfragen zu meinen Schwachstellen.';
  return s;
}

document.querySelector('#reset').onclick = () => {
  if (confirm('Gesamten gespeicherten AMOC-Fortschritt löschen?')) {
    localStorage.removeItem(LS);
    S = freshState();
    homeView();
  }
};

if (!Q.length) {
  home.classList.remove('hidden');
  home.innerHTML = '<h2>Fragenpool konnte nicht geladen werden.</h2><p>Bitte Seite neu laden. Falls der Fehler bleibt, prüfe die Datendateien.</p>';
} else {
  syncQuestionPool();
  homeView();
}
