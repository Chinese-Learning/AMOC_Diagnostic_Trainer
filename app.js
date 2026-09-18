let ACTIVE_TYPE = null;
let Q = [];
let LS = '';
let LAST_REPORT = '';
let S = null;

const chooser = document.querySelector('#chooser');
const home = document.querySelector('#home');
const quiz = document.querySelector('#quiz');
const result = document.querySelector('#result');
const resetBtn = document.querySelector('#reset');

function freshState(mode='full'){
  return {order:[],i:0,frontier:0,answers:{},hints:{},flags:{},revealed:{},mode,seed:Math.floor(Math.random()*0x7fffffff)};
}

function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function hash32(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}

function prng(seed){
  let t=seed>>>0;
  return ()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296};
}

function optionOrder(q){
  const a=q.opts.map((_,i)=>i),rnd=prng(hash32(`${S.seed}:${q.id}`));
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}

function storageKey(type){return type===1?'amoc-type1-v1':type===2?'amoc-type2-v1':'amoc-type3-v1'}
function migrateLegacyType1(){
  if(localStorage.getItem('amoc-type1-v1')) return;
  const legacy=localStorage.getItem('amoc-diagnostic-v2');
  if(legacy) localStorage.setItem('amoc-type1-v1',legacy);
}
function reportKey(type){return type===1?'amoc-type1-last-report':type===2?'amoc-type2-last-report':'amoc-type3-last-report'}

function loadType(type){
  ACTIVE_TYPE=type;
  Q=(type===1?window.AMOC_TYPE1:type===2?window.AMOC_TYPE2:window.AMOC_TYPE3)||[];
  LS=storageKey(type);
  LAST_REPORT=reportKey(type);
  try{S=JSON.parse(localStorage.getItem(LS)||'null')||freshState()}catch{S=freshState()}
  S.answers||={};S.hints||={};S.flags||={};S.revealed||={};S.order||=[];S.i=Number.isInteger(S.i)?S.i:0;S.mode||='full';S.seed||=Math.floor(Math.random()*0x7fffffff);
  if(!Number.isInteger(S.frontier)){
    const currentId=S.order[S.i];
    S.frontier=Math.min(S.order.length,S.i+(currentId&&S.answers[currentId]?1:0));
  }
  S.frontier=Math.max(0,Math.min(S.frontier,S.order.length));
  S.i=Math.max(0,Math.min(S.i,Math.max(0,S.order.length-1)));
  chooser.classList.add('hidden');
  resetBtn.classList.remove('hidden');
  syncQuestionPool();
  homeView();
}

function save(){localStorage.setItem(LS,JSON.stringify(S))}

function syncQuestionPool(){
  if(S.mode!=='full'||!S.order.length)return;
  const valid=new Set(Q.map(q=>q.id));
  S.order=S.order.filter(id=>valid.has(id));
  const present=new Set(S.order);
  const missing=shuffle(Q.map(q=>q.id).filter(id=>!present.has(id)));
  if(missing.length){S.order.push(...missing);save()}
}

function currentSet(){return S.order.map(id=>Q.find(q=>q.id===id)).filter(Boolean)}

function markFrontierAfterAnswer(){
  S.frontier=Math.max(S.frontier,S.i+1);
}

function goBackInSession(){
  if(S.i<=0)return;
  S.i--;save();renderQ();
}

function goForwardInSession(){
  if(S.i>=S.frontier)return;
  S.i++;save();
  if(S.i>=S.order.length)return results();
  renderQ();
}

function jumpToCurrentQuestion(){
  if(S.frontier>=S.order.length)return results();
  S.i=S.frontier;save();renderQ();
}

function sessionNavHtml(){
  const back=S.i>0?'<button class="ghost" id="navprev">← Zurück</button>':'';
  const forward=S.i<S.frontier?'<button class="primary" id="navnext">Weiter →</button>':'';
  const current=(S.i+1<S.frontier && S.frontier<S.order.length)?'<button class="secondary" id="navcurrent">Zur aktuellen Aufgabe</button>':'';
  return back+forward+current;
}

function wireSessionNav(){
  const prev=document.querySelector('#navprev');
  const next=document.querySelector('#navnext');
  const current=document.querySelector('#navcurrent');
  if(prev)prev.onclick=goBackInSession;
  if(next)next.onclick=goForwardInSession;
  if(current)current.onclick=jumpToCurrentQuestion;
}

function answeredItems(){
  return Object.entries(S.answers).map(([id,a])=>({q:Q.find(x=>x.id===Number(id)),...a})).filter(x=>x.q);
}

function chooserView(){
  ACTIVE_TYPE=null;Q=[];S=null;
  chooser.classList.remove('hidden');
  home.classList.add('hidden');quiz.classList.add('hidden');result.classList.add('hidden');
  resetBtn.classList.add('hidden');
  const t1=(window.AMOC_TYPE1||[]).length,t2=(window.AMOC_TYPE2||[]).length,t3=(window.AMOC_TYPE3||[]).length;
  chooser.innerHTML=`
    <div class="hero"><span class="topic">AMOC SS26 · AC2 Antestat</span><h2>Welchen Fragenkatalog möchtest du?</h2>
    <p class="muted">Die drei Pools sind getrennt. Fortschritt und Ergebnisse werden unabhängig voneinander gespeichert.</p></div>
    <div class="type-grid">
      <button class="type-card" id="type1">
        <span class="type-label">Fragentyp 1</span>
        <strong>Gesamtdiagnose</strong>
        <span>${t1} Fragen · dein bisheriger 117er-Pool · breit gemischt</span>
      </button>
      <button class="type-card" id="type2">
        <span class="type-label">Fragentyp 2</span>
        <strong>Folien-Detailtrainer</strong>
        <span>${t2} Fragen · gezielt, auswendiglernlastig, Verfahren, Reaktionen, Spezialdetails</span>
      </button>
      <button class="type-card" id="type3">
        <span class="type-label">Fragentyp 3</span>
        <strong>Antestat-Fokustrainer</strong>
        <span>${t3} Aufgaben · deine Problemfragen plus alle Reaktionsgleichungen aus dem 207er-Katalog</span>
      </button>
    </div>`;
  document.querySelector('#type1').onclick=()=>loadType(1);
  document.querySelector('#type2').onclick=()=>loadType(2);
  document.querySelector('#type3').onclick=()=>loadType(3);
}

function homeView(){
  chooser.classList.add('hidden');home.classList.remove('hidden');quiz.classList.add('hidden');result.classList.add('hidden');
  const done=Object.keys(S.answers).length;
  if(ACTIVE_TYPE===3){
    const reactions=Q.filter(q=>q.tags?.includes('Reaktionsgleichung')).length;
    const marked=Q.filter(q=>q.priority>=2).length;
    const memorize=Q.filter(q=>q.tags?.includes('Auswendig lernen')).length;
    const canResume=S.order.length&&S.frontier<S.order.length;
    home.innerHTML=`
      <div class="hero"><span class="topic">Fragentyp 3 · 207er Antestat</span><h2>Antestat-Fokustrainer</h2>
      <p class="muted">Originalformat aus dem 207er-Katalog: Multiple-Choice-Aufgaben bleiben Multiple Choice; offene Reaktionsgleichungen beantwortest du frei und deckst danach die Original-Lösung auf.</p></div>
      <div class="grid">
        <div class="stat"><strong>${Q.length}</strong>Aufgaben gesamt</div>
        <div class="stat"><strong>${reactions}</strong>Reaktionsgleichungen</div>
        <div class="stat"><strong>${marked}</strong>von dir markiert</div>
        <div class="stat"><strong>${memorize}</strong>Auswendig lernen</div>
      </div>
      <div class="actions">
        ${canResume?'<button class="primary" id="resume3">Letzte Runde fortsetzen</button>':''}
        <button class="secondary" id="mixed3">Neue gemischte Runde</button>
        <button class="secondary" id="marked3">Nur deine markierten Aufgaben</button>
        <button class="secondary" id="reaction3">Nur Reaktionsgleichungen</button>
        ${done?'<button class="ghost" id="showres">Zwischenauswertung</button>':''}
        <button class="ghost" id="backtypes">Fragentyp wechseln</button>
      </div>`;
    if(canResume)document.querySelector('#resume3').onclick=jumpToCurrentQuestion;
    document.querySelector('#mixed3').onclick=()=>startType3('mixed');
    document.querySelector('#marked3').onclick=()=>startType3('marked');
    document.querySelector('#reaction3').onclick=()=>startType3('reactions');
    if(done)document.querySelector('#showres').onclick=results;
    document.querySelector('#backtypes').onclick=chooserView;
    return;
  }
  const p1=Q.filter(x=>x.part==='Teil 1').length,p2=Q.filter(x=>x.part==='Teil 2').length;
  const canResume=S.order.length&&S.frontier<S.order.length;
  const title=ACTIVE_TYPE===1?'Gesamtdiagnose':'Folien-Detailtrainer';
  const description=ACTIVE_TYPE===1
    ?'Der ursprüngliche 117er-Test bleibt unverändert und mischt Grundlagen, Komplexchemie und Stoffchemie.'
    :'Dieser Pool fragt gezielt kleine Folienfakten, Verfahren, Reaktionsgleichungen, MO/LGO, Strukturdetails und Auswendiglernstoff ab.';
  home.innerHTML=`
    <div class="hero"><span class="topic">Fragentyp ${ACTIVE_TYPE}</span><h2>${title}</h2><p class="muted">${description}</p></div>
    <div class="grid">
      <div class="stat"><strong>${Q.length}</strong>Fragen im Pool</div>
      <div class="stat"><strong>${done}</strong>beantwortet</div>
      <div class="stat"><strong>${p1}</strong>Teil 1</div>
      <div class="stat"><strong>${p2}</strong>Teil 2</div>
    </div>
    <div class="actions">
      <button class="primary" id="start">${canResume?'Fortsetzen':'Starten'}</button>
      ${done?'<button class="secondary" id="showres">Zwischenauswertung</button>':''}
      <button class="ghost" id="backtypes">Fragentyp wechseln</button>
    </div>`;
  document.querySelector('#start').onclick=startFull;
  if(done)document.querySelector('#showres').onclick=results;
  document.querySelector('#backtypes').onclick=chooserView;
}

function startType3(mode){
  const pool=mode==='reactions'?Q.filter(q=>q.tags?.includes('Reaktionsgleichung'))
    :mode==='marked'?Q.filter(q=>q.priority>=2)
    :Q;
  S=freshState(mode);
  S.order=shuffle(pool.map(q=>q.id));
  save();
  renderQ();
}

function startFull(){
  if(!Q.length){alert('Für diesen Fragentyp sind noch keine Fragen hinterlegt.');return}
  if(!S.order.length||S.frontier>=S.order.length||S.mode!=='full'){
    S=freshState('full');S.order=shuffle(Q.map(x=>x.id));save();
  }else{
    S.i=S.frontier;save();
  }
  renderQ();
}

function renderQ(){
  if(ACTIVE_TYPE===3)return renderRecallQ();
  home.classList.add('hidden');result.classList.add('hidden');quiz.classList.remove('hidden');
  const arr=currentSet();if(S.i>=arr.length)return results();
  const q=arr[S.i],prev=S.answers[q.id],perm=optionOrder(q),pct=arr.length?Math.round(S.i/arr.length*100):0;
  const correctSoFar=Object.values(S.answers).filter(a=>a.ok).length;
  const hintUsed=!!(prev?.hint||S.hints[q.id]),flagged=!!S.flags[q.id];
  quiz.innerHTML=`
    <div class="meta"><span>Fragentyp ${ACTIVE_TYPE} · Frage ${S.i+1} / ${arr.length}</span><span>${correctSoFar} richtig${prev?' · beantwortet':''}</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="question">${esc(q.q)}</div>
    <div class="answers">${perm.map((origIndex,displayIndex)=>{
      const o=q.opts[origIndex];
      const cls=prev?(origIndex===q.a?'correct':(origIndex===prev.sel?'wrong':'')):'';
      return `<button class="answer ${cls}" data-k="${origIndex}" ${prev?'disabled':''}>${String.fromCharCode(65+displayIndex)}. ${esc(o.t)}${prev?`<span class="explain">${esc(o.e)}</span>`:''}</button>`;
    }).join('')}</div>
    <div id="hintbox">${hintUsed?`<div class="hint"><strong>Hinweis:</strong> ${esc(q.hint)}</div>`:''}</div>
    <div class="actions">
      ${sessionNavHtml()}
      ${!prev?'<button class="secondary" id="hint">Hinweis</button>':''}
      ${!prev?`<button class="secondary" id="flag">${flagged?'Unsicher ✓':'Unsicher markieren'}</button>`:''}
      <button class="ghost" id="quit">Zur Übersicht</button>
    </div>
    ${prev?`<p class="small muted">Thema nach Beantwortung: <span class="topic">${esc(q.part)} · ${esc(q.topic)}</span>${prev.hint?' · Hinweis benutzt':''}${S.flags[q.id]?' · als unsicher markiert':''}</p>`:''}`;
  if(!prev){
    document.querySelectorAll('.answer').forEach(b=>b.onclick=()=>answer(q,Number(b.dataset.k)));
    document.querySelector('#hint').onclick=()=>{S.hints[q.id]=true;save();document.querySelector('#hintbox').innerHTML=`<div class="hint"><strong>Hinweis:</strong> ${esc(q.hint)}</div>`};
    document.querySelector('#flag').onclick=e=>{S.flags[q.id]=!S.flags[q.id];save();e.currentTarget.textContent=S.flags[q.id]?'Unsicher ✓':'Unsicher markieren'};
  } 
  wireSessionNav();
  document.querySelector('#quit').onclick=homeView;
}

function renderRecallQ(){
  home.classList.add('hidden');result.classList.add('hidden');quiz.classList.remove('hidden');
  const arr=currentSet();if(S.i>=arr.length)return results();
  const q=arr[S.i],prevRecall=S.answers[q.id],revealed=!!S.revealed[q.id]||!!prevRecall,pct=arr.length?Math.round(S.i/arr.length*100):0;
  const correctSoFar=Object.values(S.answers).filter(a=>a.grade==='correct').length;
  const tags=(q.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('');

  if(q.kind==='mc'||q.kind==='tf'){
    const prev=S.answers[q.id];
    quiz.innerHTML=`
      <div class="meta"><span>Fragentyp 3 · Katalog-Aufgabe ${q.sourceNo} · ${S.i+1} / ${arr.length}</span><span>${correctSoFar} richtig</span></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="tagrow">${tags}</div>
      <div class="question recall-text">${esc(q.q)}</div>
      <div class="answers">${(q.options||[]).map((opt,i)=>{
        const cls=prev?(i===q.correct?'correct':(i===prev.sel?'wrong':'')):'';
        return `<button class="answer ${cls}" data-k="${i}" ${prev?'disabled':''}>${q.kind==='tf'?'':String.fromCharCode(65+i)+'. '}${esc(opt)}</button>`;
      }).join('')}</div>
      ${prev?`<div class="solution"><strong>Original-Lösung:</strong> ${esc(q.answer)}${q.note?`<div class="source-note">${esc(q.note)}</div>`:''}</div>`:''}
      <div class="actions">
        ${sessionNavHtml()}
        <button class="ghost" id="quit">Zur Übersicht</button>
      </div>`;
    if(!prev){
      document.querySelectorAll('.answer').forEach(b=>b.onclick=()=>{
        const sel=Number(b.dataset.k),ok=sel===q.correct;
        S.answers[q.id]={sel,grade:ok?'correct':'wrong',ok,unsure:false};
        markFrontierAfterAnswer();
        save();renderRecallQ();
      });
    } 
    wireSessionNav();
    document.querySelector('#quit').onclick=homeView;
    return;
  }

  quiz.innerHTML=`
    <div class="meta"><span>Fragentyp 3 · Katalog-Aufgabe ${q.sourceNo} · ${S.i+1} / ${arr.length}</span><span>${correctSoFar} sicher richtig</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="tagrow">${tags}</div>
    <div class="question recall-text">${esc(q.q)}</div>
    ${revealed?`<div class="solution"><strong>Lösung aus dem 207er-Katalog:</strong><div class="recall-text">${esc(q.answer)}</div>${prevRecall?`<div class="source-note">Deine Bewertung: ${prevRecall.grade==='correct'?'Richtig':prevRecall.grade==='wrong'?'Falsch':'Unsicher'}</div>`:''}${q.note?`<div class="source-note">${esc(q.note)}</div>`:''}</div>`:''}
    <div class="actions">
      ${sessionNavHtml()}
      ${!revealed && !S.answers[q.id]?'<button class="primary" id="reveal">Lösung anzeigen</button>':''}
      ${revealed && !S.answers[q.id]?'<button class="grade good" id="gradegood">Richtig</button><button class="grade bad" id="gradebad">Falsch</button><button class="grade unsure" id="gradeunsure">Unsicher</button>':''}
      <button class="ghost" id="quit">Zur Übersicht</button>
    </div>`;
  if(!revealed && !prevRecall){
    document.querySelector('#reveal').onclick=()=>{S.revealed[q.id]=true;save();renderRecallQ()};
  }else if(revealed && !prevRecall){
    document.querySelector('#gradegood').onclick=()=>gradeRecall(q,'correct');
    document.querySelector('#gradebad').onclick=()=>gradeRecall(q,'wrong');
    document.querySelector('#gradeunsure').onclick=()=>gradeRecall(q,'unsure');
  }
  wireSessionNav();
  document.querySelector('#quit').onclick=homeView;
}

function gradeRecall(q,grade){
  S.answers[q.id]={grade,ok:grade==='correct',unsure:grade==='unsure'};
  delete S.revealed[q.id];
  markFrontierAfterAnswer();
  if(S.i===S.frontier-1 && S.frontier<S.order.length)S.i=S.frontier;
  save();renderRecallQ();
}

function answer(q,originalIndex){
  S.answers[q.id]={sel:originalIndex,ok:originalIndex===q.a,hint:!!S.hints[q.id],unsure:!!S.flags[q.id]};
  delete S.hints[q.id];
  markFrontierAfterAnswer();
  save();renderQ();
}

function stats(){
  const ans=answeredItems(),group={};
  for(const x of ans){
    const key=`${x.q.part}||${x.q.topic}`;
    group[key]||={n:0,c:0,h:0,u:0,part:x.q.part,topic:x.q.topic};
    group[key].n++;group[key].c+=x.ok?1:0;group[key].h+=x.hint?1:0;group[key].u+=x.unsure?1:0;
  }
  return{ans,group};
}

function results(){
  if(ACTIVE_TYPE===3)return resultsRecall();
  home.classList.add('hidden');quiz.classList.add('hidden');result.classList.remove('hidden');
  const{ans,group}=stats(),correct=ans.filter(x=>x.ok).length,hints=ans.filter(x=>x.hint).length,unsure=ans.filter(x=>x.unsure).length;
  const pct=ans.length?Math.round(correct/ans.length*100):0,wrong=ans.filter(x=>!x.ok);
  const rows=Object.values(group).sort((a,b)=>a.c/a.n-b.c/b.n).map(g=>{const p=Math.round(g.c/g.n*100);return`<tr><td>${esc(g.topic)}<div class="small muted">${esc(g.part)}</div></td><td>${g.c}/${g.n}</td><td><div class="bar"><span style="width:${p}%"></span></div>${p}%</td><td>${g.h}</td><td>${g.u}</td></tr>`}).join('');
  const report=reportText(ans,group);if(S.mode==='full'&&ans.length)localStorage.setItem(LAST_REPORT,report);
  result.innerHTML=`
    <h2>Auswertung · Fragentyp ${ACTIVE_TYPE}</h2>
    <div class="grid"><div class="stat"><strong>${correct}/${ans.length}</strong>richtig</div><div class="stat"><strong>${pct}%</strong>Trefferquote</div><div class="stat"><strong>${hints}</strong>Hinweise</div><div class="stat"><strong>${unsure}</strong>unsicher</div></div>
    <table class="result-table"><thead><tr><th>Thema</th><th>Richtig</th><th>Quote</th><th>Hinweise</th><th>Unsicher</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="actions"><button class="primary" id="resume">${S.frontier<S.order.length?'Test fortsetzen':'Zur Übersicht'}</button>${wrong.length?'<button class="secondary" id="retry">Nur Fehler wiederholen</button>':''}<button class="secondary" id="copy">Ergebnisbericht kopieren</button><button class="ghost" id="backtypes">Fragentyp wechseln</button></div>
    <h3>Bericht für ChatGPT</h3><textarea class="report" id="report" readonly>${esc(report)}</textarea>`;
  document.querySelector('#resume').onclick=()=>S.frontier<S.order.length?jumpToCurrentQuestion():homeView();
  if(wrong.length)document.querySelector('#retry').onclick=()=>{const ids=wrong.map(x=>x.q.id);S=freshState('wrong');S.order=shuffle(ids);save();renderQ()};
  document.querySelector('#copy').onclick=async e=>{const text=document.querySelector('#report').value;try{await navigator.clipboard.writeText(text);e.currentTarget.textContent='Kopiert ✓'}catch{document.querySelector('#report').focus();document.querySelector('#report').select();e.currentTarget.textContent='Text markiert'}};
  document.querySelector('#backtypes').onclick=chooserView;
}

function resultsRecall(){
  home.classList.add('hidden');quiz.classList.add('hidden');result.classList.remove('hidden');
  const ans=answeredItems();
  const correct=ans.filter(x=>x.grade==='correct').length;
  const wrong=ans.filter(x=>x.grade==='wrong');
  const unsure=ans.filter(x=>x.grade==='unsure');
  const pct=ans.length?Math.round(correct/ans.length*100):0;
  const report=reportRecall(ans);
  if(ans.length)localStorage.setItem(LAST_REPORT,report);
  result.innerHTML=`
    <h2>Auswertung · Antestat-Fokustrainer</h2>
    <div class="grid">
      <div class="stat"><strong>${correct}/${ans.length}</strong>sicher richtig</div>
      <div class="stat"><strong>${pct}%</strong>sicher beherrscht</div>
      <div class="stat"><strong>${wrong.length}</strong>falsch</div>
      <div class="stat"><strong>${unsure.length}</strong>unsicher</div>
    </div>
    <div class="actions">
      <button class="primary" id="resume">${S.frontier<S.order.length?'Runde fortsetzen':'Zur Übersicht'}</button>
      ${wrong.length+unsure.length?'<button class="secondary" id="retry">Falsch + unsicher wiederholen</button>':''}
      <button class="secondary" id="copy">Ergebnisbericht kopieren</button>
      <button class="ghost" id="backtypes">Fragentyp wechseln</button>
    </div>
    <h3>Bericht für ChatGPT</h3><textarea class="report" id="report" readonly>${esc(report)}</textarea>`;
  document.querySelector('#resume').onclick=()=>S.frontier<S.order.length?jumpToCurrentQuestion():homeView();
  if(wrong.length+unsure.length)document.querySelector('#retry').onclick=()=>{
    const ids=[...wrong,...unsure].map(x=>x.q.id);
    S=freshState('wrong');S.order=shuffle(ids);save();renderRecallQ();
  };
  document.querySelector('#copy').onclick=async e=>{
    const text=document.querySelector('#report').value;
    try{await navigator.clipboard.writeText(text);e.currentTarget.textContent='Kopiert ✓'}
    catch{document.querySelector('#report').focus();document.querySelector('#report').select();e.currentTarget.textContent='Text markiert'}
  };
  document.querySelector('#backtypes').onclick=chooserView;
}

function reportRecall(ans){
  const correct=ans.filter(x=>x.grade==='correct').length;
  const wrong=ans.filter(x=>x.grade==='wrong');
  const unsure=ans.filter(x=>x.grade==='unsure');
  let s=`ANTESTAT-FOKUSTRAINER\nGesamt: ${correct}/${ans.length} sicher richtig | falsch: ${wrong.length} | unsicher: ${unsure.length}\n\nZU WIEDERHOLEN:\n`;
  for(const x of [...wrong,...unsure]){
    s+=`\n[Aufgabe ${x.q.sourceNo} | ${(x.q.tags||[]).join(', ')}] ${x.q.q}\nLösung aus dem Katalog: ${x.q.answer}\nEinstufung: ${x.grade==='wrong'?'falsch':'unsicher'}\n`;
  }
  return s;
}

function reportText(ans,group){
  const correct=ans.filter(x=>x.ok).length,pct=ans.length?Math.round(correct/ans.length*100):0;
  let s=`AMOC DIAGNOSE – FRAGENTYP ${ACTIVE_TYPE}\nGesamt: ${correct}/${ans.length} richtig (${pct}%) | Hinweise: ${ans.filter(x=>x.hint).length} | Unsicher: ${ans.filter(x=>x.unsure).length}\n\nTHEMEN:\n`;
  for(const g of Object.values(group).sort((a,b)=>a.c/a.n-b.c/b.n))s+=`- ${g.part} / ${g.topic}: ${g.c}/${g.n} richtig, Hinweise ${g.h}, unsicher ${g.u}\n`;
  s+='\nFALSCHE ANTWORTEN:\n';
  for(const x of ans.filter(x=>!x.ok))s+=`\n[${x.q.part} | ${x.q.topic}] ${x.q.q}\nMeine Antwort: ${x.q.opts[x.sel].t}\nRichtig: ${x.q.opts[x.q.a].t}\nHinweis benutzt: ${x.hint?'ja':'nein'} | Unsicher: ${x.unsure?'ja':'nein'}\n`;
  return s;
}

resetBtn.onclick=()=>{
  if(!ACTIVE_TYPE)return;
  if(confirm(`Gespeicherten Fortschritt für Fragentyp ${ACTIVE_TYPE} löschen?`)){localStorage.removeItem(LS);S=freshState();homeView()}
};

migrateLegacyType1();
chooserView();
