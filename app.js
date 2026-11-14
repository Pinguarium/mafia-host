/* MAFIA HOST v3 — editable deployment configuration
   To enable REAL host login: fill in the Supabase Project URL and PUBLISHABLE / anon key.
   Never put a service_role / secret key in a public GitHub repository.
*/
const AUTH_CONFIG = {
  url: '', // example: 'https://your-project.supabase.co'
  publishableKey: '', // Supabase publishable key (or legacy anon key), NOT service_role!
  allowSignup: false // Only enable during initial account creation, then disable at Supabase too
};

(() => {
  'use strict';
  const E = window.MafiaEngine;
  const $ = id => document.getElementById(id);
  const KEY = 'mafia-host-v3-state';
  let storageKey = KEY + '-demo'; // Authenticated accounts are stored separately on each device.
  const MAX_UNDO = 40;
  let client=null, loggedIn=false, demoMode=false, selectedCount=8;
  let game=null, history=[], previousGame=null, timer={duration:300,remaining:300,until:null};
  let rolesVisible=true;
  let scriptStep=0,scriptStepKey='';
  const counts = {};

  // Language text and the immutable night call sequence live in scripts.js.
  const S = window.MafiaScripts;
  if (!S) throw new Error('scripts.js를 먼저 불러와야 합니다.');
  function upgradeGame(g) {
    if (!g || !Array.isArray(g.players) || ![2,3].includes(g.version)) return null;
    g.used ||= {};
    g.used.priest = !!g.used.priest;
    // When upgrading a game already in progress, preserve single-use reporter history.
    g.used.reporter = !!g.used.reporter || (g.logs||[]).some(l=>/기자 취재:/.test(l.private||''));
    g.used.medium = !!g.used.medium;
    g.announcementEvents ||= [];
    g.version=3;
    return g;
  }

  function readLocal() {
    game=null;history=[];previousGame=null;rolesVisible=true;resetTimerTo(5);
    try {
      let raw=localStorage.getItem(storageKey);
      // One-time migration from v2, without discarding the undo stack.
      if (!raw) raw=localStorage.getItem(storageKey.replace('mafia-host-v3-state','mafia-host-v2-state'));
      const data=JSON.parse(raw||'null');
      game=upgradeGame(data?.game);
      if (Array.isArray(data?.history)) history=data.history.slice(-MAX_UNDO).map(item=>({ ...item,game:upgradeGame(item.game) })).filter(x=>x.game);
      previousGame=upgradeGame(data?.previousGame);
      if (raw && !localStorage.getItem(storageKey)) localStorage.setItem(storageKey,JSON.stringify({game,history,previousGame,timer:data?.timer,rolesVisible:data?.rolesVisible}));
      if (data?.timer) timer=data.timer;
      if (typeof data?.rolesVisible==='boolean') rolesVisible=data.rolesVisible;
    } catch(err) { console.error('저장된 게임을 읽지 못함',err); }
  }
  function saveLocal() {
    try {localStorage.setItem(storageKey,JSON.stringify({game,history,previousGame,timer,rolesVisible}));}
    catch(err) {alert('브라우저 저장에 실패했습니다. 용량/시크릿 모드를 확인하세요.');}
  }
  function freshTimer() { return {duration:Number($('discussionMinutes')?.value||5)*60||300,remaining:Number($('discussionMinutes')?.value||5)*60||300,until:null}; }
  function resetTimerTo(minutes=5) {const seconds=Number(minutes)*60;timer={duration:seconds,remaining:seconds,until:null};}
  function commit(next) {
    history.push({game:E.deepCopy(game),timer:E.deepCopy(timer)});
    if(history.length>MAX_UNDO) history.shift();
    game=next;
    resetTimerTo(5);
    saveLocal();render();
  }
  function renderNames() {
    const old=[...$('nameInputs').querySelectorAll('input')].map(n=>n.value);
    $('nameInputs').replaceChildren();
    for(let i=0;i<selectedCount;i++){
      const box=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input');
      label.htmlFor=`name${i}`;label.textContent=`${i+1}번 참가자`;
      input.id=`name${i}`; input.maxLength=30;input.placeholder=`참가자 ${i+1}`;
      input.value=old[i]||''; box.append(label,input);$('nameInputs').append(box);
    }
    $('countLabel').textContent=`${selectedCount}명`;
  }
  function setCount(n){
    if(n<4||n>24)return;
    selectedCount=n; renderNames();Object.assign(counts,E.preset(n)); renderRoleCounts();
  }
  function renderRoleCounts(){
    $('roleCounts').replaceChildren();
    for(const role of E.CONFIG_ROLES){
      const info=E.ROLES[role],div=document.createElement('div');div.className='role-item';
      const label=document.createElement('label');label.htmlFor=`role_${role}`;
      label.textContent=info.label;
      const hint=document.createElement('div');hint.className='hint';hint.textContent=info.desc;label.append(hint);
      const inp=document.createElement('input');inp.type='number';inp.id=`role_${role}`;
      inp.min=role==='mafia'?'1':'0';inp.max=role==='mafia'?'12':role==='lover'?'2':'1';inp.step=role==='lover'?'2':'1';inp.value=counts[role]||0;
      inp.addEventListener('change',()=>{counts[role]=Number(inp.value);updateRoleSummary();});
      div.append(label,inp);$('roleCounts').append(div);
    }
    updateRoleSummary();
  }
  function updateRoleSummary(){
    try {
      const plain=E.validateConfig(selectedCount,counts);
      const m=counts.mafia+counts.madam+counts.hitman;
      $('roleSummary').classList.remove('bad');
      $('roleSummary').textContent=`구성: 마피아 팀 ${m}명 · 시민 팀 ${selectedCount-m}명 (일반 시민 ${plain}명) · 총 ${selectedCount}명`;
      $('setupError').hidden=true;
    }catch(err){$('roleSummary').classList.add('bad');$('roleSummary').textContent=err.message;}
  }
  function startGame(){
    try{
      const names=[...$('nameInputs').querySelectorAll('input')].map((el,i)=>el.value.trim()||`참가자 ${i+1}`);
      const rand=()=>{
        if(window.crypto?.getRandomValues){const a=new Uint32Array(1);window.crypto.getRandomValues(a);return a[0]/4294967296;}
        return Math.random();
      };
      const newGame=E.createGame(names,counts,rand);
      if(!confirm(`${names.length}명의 직업을 무작위로 배정하고 시작할까요?\n게임 도중 인원 변경은 지원하지 않습니다.`))return;
      game=newGame;history=[];previousGame=null;resetTimerTo(5);saveLocal();render();
    }catch(err){$('setupError').hidden=false;$('setupError').textContent=err.message;}
  }
  function selectField(id,label,items,note,includeNone=true){
    const wrap=document.createElement('div');wrap.className='field';
    const lab=document.createElement('label');lab.htmlFor=id;lab.textContent=label;wrap.append(lab);
    const sel=document.createElement('select');sel.id=id;
    if(includeNone)sel.add(new Option('선택 안 함',''));
    for(const p of items)sel.add(new Option(p.name,String(p.id)));
    wrap.append(sel);
    if(note){const hint=document.createElement('div');hint.className='field-note';hint.textContent=note;wrap.append(hint);}
    return wrap;
  }
  function makeSelect(id,label,list,note='',includeNone=true,container=$('nightFields')) {
    const field=selectField(id,label,list,note,includeNone);container.append(field);return $(id);
  }
  function showNight(){
    const dest=$('nightFields');dest.replaceChildren();const alive=E.living(game),roles=r=>E.active(game,r);
    const shooters=alive.filter(p=>p.role==='mafia');
    if(shooters.length){
      makeSelect('mafiaShooter','공격을 실행하는 마피아',shooters,'테러리스트 자폭 판정에서 공격자 판단에 사용',false);
      makeSelect('mafiaTarget','마피아의 공격 대상',alive,'마담/청부업자를 지목하면 공격하지 않고 접선. 마피아 팀 내 공격은 무효');
    }
    if(roles('madam'))makeSelect('madamTarget','마담: 봉인 또는 마피아 접선 대상',alive.filter(p=>p.id!==roles('madam').id),'마담 자신은 지목 불가. 일반 마피아를 지목하면 접선; 그 외 직업의 밤 능력 봉인');
    if(roles('hitman')){
      if(game.contact.hitman){
        makeSelect('hitmanTarget','청부업자: 처형할 대상',alive,'직업을 정확히 맞히면 즉시 사망 (치료 무시)');
        const box=document.createElement('div');box.className='field';
        const lbl=document.createElement('label');lbl.htmlFor='hitmanGuess';lbl.textContent='청부업자가 추측한 정확한 직업';
        const sel=document.createElement('select');sel.id='hitmanGuess';sel.add(new Option('추측 안 함',''));
        for(const [id,r] of Object.entries(E.ROLES))sel.add(new Option(r.label,id));
        box.append(lbl,sel);dest.append(box);
      } else { const p=document.createElement('p');p.className='muted';p.textContent='청부업자: 아직 마피아에게 총을 맞아 접선하지 않았으므로 직업 추측 불가';dest.append(p); }
    }
    if(roles('doctor'))makeSelect('doctorTarget','의사: 치료할 대상',alive,'의사가 간호사를 치료 대상으로 지목하면 상호 접선');
    if(roles('nurse')){
      if(E.canNurseHeal(game))makeSelect('nurseHeal','간호사: 의사 사망 후 계승 치료 대상',alive,'의사가 사망한 다음 밤부터 사용 가능');
      else if(roles('doctor'))makeSelect('nurseProbe','간호사: 의사 탐색 대상',alive,'직접 의사를 선택하거나 의사가 간호사를 치료하면 접선');
      else {const p=document.createElement('p');p.className='muted';p.textContent='간호사: 의사와 접선하지 않은 채 의사가 사망해 치료 계승 불가';dest.append(p);}
    }
    if(roles('detective'))makeSelect('detectiveTarget','경찰: 조사 대상',alive,'마피아 팀인지 여부만 확인');
    if(roles('officer'))makeSelect('officerTarget','공무원: 직업 조사 대상',alive,'마피아 팀원은 정보 없음, 시민 팀은 정확한 직업 표시');
    if(roles('reporter')){
      if(game.round>=2 && !game.used?.reporter) makeSelect('reporterTarget','기자: 공개 취재 대상 (게임당 1회)',alive,'익명 공개 · 둘째 밤부터 딱 한 번. 사용 후 입력칸만 사라지며 진행 대본은 계속 낭독');
      else {const p=document.createElement('p');p.className='muted';p.textContent=game.used?.reporter?'기자: 1회 사용 완료 (진행 대본은 계속 부르세요)':'기자: 첫째 밤에는 능력 사용 불가 (진행 대본은 동일)';dest.append(p);}
    }
    if(roles('terrorist'))makeSelect('terroristTarget','테러리스트: 밤 자폭 대상',alive,'이 대상인 마피아가 테러리스트를 공격해서 처형하면 함께 사망');
    if(roles('thug'))makeSelect('thugTarget','건달: 다음 낮 투표권을 없앨 사람',alive,'투표 못 함 효과는 다음 낮 한 번만 적용');
    if(roles('priest')&&!game.used?.priest){
      const dead=game.players.filter(p=>!p.alive);
      makeSelect('priestTarget','성직자: 부활시킬 사망자',dead,'이전에 죽은 참가자만 선택 가능 · 게임당 1회');
    }
    if(roles('medium')){
      if(game.round >= 2 && !game.used?.medium){
        const dead=game.players.filter(p=>!p.alive);
        makeSelect('mediumTarget','영매: 직업을 확인할 사망자 (게임당 1회)',dead,'둘째 밤부터 1회 · 조사 내용은 사회자 비공개 기록에만 표시');
      } else {const p=document.createElement('p');p.className='muted';p.textContent=game.used?.medium?'영매: 1회 사용 완료 (진행 대본은 계속 부르세요)':'영매: 첫째 밤에는 능력 사용 불가 (진행 대본은 동일)';dest.append(p);}
    }
  }
  function readNight(){
    const choices={};
    for(const id of ['mafiaShooter','mafiaTarget','madamTarget','hitmanTarget','hitmanGuess','doctorTarget','nurseProbe','nurseHeal','detectiveTarget','officerTarget','reporterTarget','terroristTarget','thugTarget','priestTarget','mediumTarget']){
      if($(id))choices[id]=$(id).value;
    }
    return choices;
  }
  function resolveNight(){
    if(!confirm('밤 행동을 확정하고 낮으로 넘어갈까요? 잘못 입력했다면 진행 취소가 가능합니다.'))return;
    try {commit(E.resolveNight(game,readNight()));}
    catch(err){alert(err.message);}
  }
  function drawDay(){
    const sel=$('candidate');sel.replaceChildren();sel.add(new Option('처형 후보 없음',''));
    for(const p of E.living(game))sel.add(new Option(p.name,String(p.id)));
    sel.onchange=()=>drawVotes();
    drawVotes();
    $('discussionMinutes').value=Math.round(timer.duration/60)||5;
    tickTimer();
  }
  function drawVotes(){
    const candidate=E.byId(game,$('candidate').value),field=$('voteFields');field.replaceChildren();
    const terror=$('terrorField');terror.hidden=!(candidate?.role==='terrorist'&&candidate.alive);
    if(!terror.hidden){const sel=$('terrorDayTarget');sel.replaceChildren();sel.add(new Option('동반 대상 없음',''));
      for(const p of E.living(game).filter(p=>p.id!==candidate.id))sel.add(new Option(p.name,String(p.id)));
    }
    if(!candidate){$('voteTally').textContent='투표 후보가 없습니다.';return;}
    for(const p of E.living(game)){
      const row=document.createElement('div');row.className='vote-item';
      const name=document.createElement('div');name.textContent=p.name;
      if(game.blockedVoter===p.id){const tag=document.createElement('div');tag.className='muted';tag.textContent='건달 협박 · 투표 불가';row.append(name,tag);}
      else {
        if(p.role==='politician'){
          const tag=document.createElement('div');tag.className='muted';tag.textContent='정치가 · 2표';name.append(tag);
        }
        const s=document.createElement('select');s.id=`vote_${p.id}`;
        for(const [v,label] of [['abstain','기권'],['yes','찬성'],['no','반대']])s.add(new Option(label,v));
        s.onchange=refreshVotes;row.append(name,s);
      }
      field.append(row);
    }
    refreshVotes();
  }
  function collectVotes(){const votes={};for(const p of E.living(game)){const s=$(`vote_${p.id}`);if(s)votes[p.id]=s.value;}return votes;}
  function refreshVotes(){
    if(!$('candidate').value)return;
    const t=E.voteSummary(game,collectVotes());
    $('voteTally').textContent=`찬성 ${t.yes}표 · 반대 ${t.no}표 · 기권 ${t.abstain}표`;
  }
  function resolveDay(){
    const candidate=$('candidate').value;
    const votes=collectVotes();
    if(candidate && !confirm('현재 입력된 찬반 투표 결과를 확정할까요?'))return;
    if(!candidate && !confirm('처형 후보 없이 다음 밤으로 넘어갈까요?'))return;
    try{commit(E.resolveDay(game,{candidate,votes,terrorDayTarget:$('terrorDayTarget').value}));}
    catch(err){alert(err.message);}
  }
  function undo(){
    if(!history.length)return;
    if(!confirm('직전 밤/낮 확정을 취소하고 그 이전 상태로 돌아갈까요?'))return;
    const last=history.pop();game=last.game;timer=last.timer;saveLocal();render();
  }
  function resetGame(){
    if(!confirm('현재 게임을 종료하고 새 게임 설정 화면으로 돌아갈까요?\n설정 화면의 “이전 게임 복원”으로 한 번 복구할 수 있습니다.'))return;
    previousGame=E.deepCopy(game);game=null;history=[];resetTimerTo(5);saveLocal();render();
  }
  function phaseName(p){return p==='night'?'밤':p==='day'?'낮':'종료';}
  function makeLogs(){
    $('logEntries').replaceChildren();
    for(const log of [...game.logs].reverse()){
      const wrap=document.createElement('div');wrap.className='log-entry';
      const head=document.createElement('b');head.textContent=`${log.round?`${log.round}일 차 · `:''}${phaseName(log.phase)}`;
      const body=document.createElement('p');body.textContent=log.private;
      wrap.append(head,body);$('logEntries').append(wrap);
    }
  }
  function renderPlayers(){
    $('playerRows').replaceChildren();
    for(const p of game.players){
      const tr=document.createElement('tr');if(!p.alive)tr.className='dead';
      const name=document.createElement('td');name.textContent=p.name;
      const role=document.createElement('td');role.textContent=rolesVisible?E.ROLES[p.role].label:'••••';
      const status=document.createElement('td');
      const hints=[p.alive?'생존':'사망'];
      if(rolesVisible){
        if(p.role==='soldier')hints.push(p.soldierShieldUsed?'방탄 소모':'방탄 보유');
        if(p.role==='priest')hints.push(game.used?.priest?'부활 소모':'부활 가능');
        if(p.role==='reporter')hints.push(game.used?.reporter?'취재 소모':'취재 가능(둘째 밤부터)');
        if(p.role==='medium')hints.push(game.used?.medium?'영매 능력 소모':'확인 가능(둘째 밤부터)');
        if(['madam','hitman'].includes(p.role))hints.push(game.contact[p.role]?'마피아 접선':'미접선');
        if(p.role==='nurse')hints.push(game.contact.nurse?'의사 접선':'미접선');
        if(game.blockedVoter===p.id&&game.phase==='day')hints.push('투표권 없음');
      }
      status.textContent=hints.join(' · ');tr.append(name,role,status);$('playerRows').append(tr);
    }
    $('toggleRoles').textContent=rolesVisible?'직업 가리기':'직업 표시';
  }
  function renderScript(){
    const field=$('scriptList');field.replaceChildren();
    // NEVER branch on role membership, death, round, contact or used skills.
    const items = game.phase==='night'?S.NIGHT:game.phase==='day'?S.DAY:S.ENDED;
    const stepKey=`${game.phase}:${game.round}`;
    if (stepKey!==scriptStepKey) {scriptStep=0;scriptStepKey=stepKey;}
    scriptStep=Math.max(0,Math.min(scriptStep,items.length-1));
    $('scriptProgress').textContent=`${scriptStep+1} / ${items.length} · ${items[scriptStep].label}`;
    $('scriptPrev').disabled=scriptStep===0;
    $('scriptNext').disabled=scriptStep===items.length-1;
    for (const [i, item] of items.entries()) {
      const wrap=document.createElement('div');wrap.className=i===scriptStep?'script-item script-active':'script-item';
      const head=document.createElement('div');head.className='script-head';
      head.textContent=`${i+1}/${items.length} · ${item.label}`;
      const kr=document.createElement('div');kr.className='script-ko';kr.textContent=item.ko;
      const jp=document.createElement('div');jp.className='script-ja';jp.lang='ja';jp.innerHTML=item.ja; // trusted static script
      wrap.append(head,kr,jp);field.append(wrap);
    }
    $('scriptPrivacyHint').hidden=game.phase!=='night';
  }
  function advanceScript(delta) {
    if (!game) return;
    const total=(game.phase==='night'?S.NIGHT:game.phase==='day'?S.DAY:S.ENDED).length;
    scriptStep=Math.max(0,Math.min(total-1,scriptStep+delta));
    renderScript();
    const current=$('scriptList').children[scriptStep];
    current?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  }
  function renderAnnouncements() {
    const field=$('announcements');field.replaceChildren();
    const events=game.announcementEvents||[];
    if (!events.length) {
      // Historical v2 records did not have structured Japanese translations.
      const old=game.announcements||[];
      if (!old.length) {field.textContent='현재 발표할 내용이 없습니다. / 現在、発表はありません。';return;}
      for (const line of old) {
        const section=document.createElement('div');section.className='announcement-item';
        const ko=document.createElement('div');ko.textContent=line;
        const note=document.createElement('div');note.className='muted';note.textContent='※ v2에서 가져온 발표 기록: 일본어 번역 없음';
        section.append(ko,note);field.append(section);
      }
      return;
    }
    for (const event of events) {
      const spoken=S.formatEvent(event);
      const wrap=document.createElement('div');wrap.className='announcement-item';
      const ko=document.createElement('div');ko.className='script-ko';ko.textContent=spoken.ko;
      const ja=document.createElement('div');ja.className='script-ja';ja.lang='ja';ja.innerHTML=spoken.ja; // S.formatEvent escapes participant names
      wrap.append(ko,ja);field.append(wrap);
    }
  }
  function announcementsToCopy() {
    const events=game?.announcementEvents||[];
    if (!events.length) return (game?.announcements||[]).join('\n')||'발표할 내용이 없습니다.';
    return events.map(e=>{
      const v=S.formatEvent(e);
      return `${v.ko}\n${S.plainJapanese(v.ja)}`;
    }).join('\n\n');
  }
  function render(){
    if(!loggedIn){$('workspace').hidden=true;return;}
    $('workspace').hidden=false;
    $('setupView').hidden=!!game; $('gameView').hidden=!game;
    if(!game){$('restoreBtn').hidden=!previousGame;return;}
    $('phaseBadge').textContent=game.phase==='ended'? '게임 종료' : `${game.round}일 차 · ${phaseName(game.phase)} ${game.phase==='night'?'🌙':'☀️'}`;
    $('statusText').textContent=game.phase==='night'?'밤의 각 직업 행동을 확인해 입력하세요.':'낮에 토론과 투표를 진행하세요.';
    if(game.phase==='ended')$('statusText').textContent='승리 조건이 충족되어 게임이 종료되었습니다.';
    const living=E.living(game),mafia=living.filter(p=>E.team(p.role)==='mafia').length;
    $('aliveSummary').textContent=`생존 ${living.length}/${game.players.length}명 · 마피아 팀 ${mafia}명 · 시민 팀 ${living.length-mafia}명`;
    $('undoBtn').disabled=history.length===0;
    $('undoHint').textContent=history.length?`되돌릴 수 있는 확정 기록 ${history.length}개`:'아직 되돌릴 밤/낮 확정 기록이 없습니다.';
    $('nightView').hidden=game.phase!=='night';$('dayView').hidden=game.phase!=='day';$('endView').hidden=game.phase!=='ended';
    $('winnerText').textContent=game.winner||'';
    renderPlayers();renderScript();makeLogs();
    renderAnnouncements();
    if(game.phase==='night')showNight();
    if(game.phase==='day')drawDay();
  }
  function secsRemaining(){return timer.until?Math.max(0,Math.ceil((timer.until-Date.now())/1000)):timer.remaining;}
  function tickTimer(){
    if(!game||game.phase!=='day')return;
    const sec=secsRemaining();
    $('timerClock').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    $('timerClock').classList.toggle('done',sec===0);
    $('timerToggle').textContent=timer.until?'⏸ 일시정지':(sec===0?'▶ 다시 시작':'▶ 시작');
    $('timerStatus').textContent=timer.until?'토론 시간 측정 중':sec===0?'토론 시간이 끝났습니다.':'토론 타이머 대기 / 일시정지';
    if(sec===0 && timer.until){timer.until=null;timer.remaining=0;saveLocal();}
  }
  function toggleTimer(){
    if(!game||game.phase!=='day')return;
    if(timer.until){timer.remaining=secsRemaining();timer.until=null;}
    else {if(timer.remaining<=0)timer.remaining=timer.duration;timer.until=Date.now()+timer.remaining*1000;}
    saveLocal();tickTimer();
  }
  function resetDiscussion(){
    if(!game||game.phase!=='day')return;
    const m=Number($('discussionMinutes').value);
    if(!Number.isInteger(m)||m<1||m>120)return alert('토론 시간은 1~120분으로 설정하세요.');
    resetTimerTo(m);saveLocal();tickTimer();
  }
  function wire(){
    $('minusCount').onclick=()=>setCount(selectedCount-1);
    $('plusCount').onclick=()=>setCount(selectedCount+1);
    $('presetBtn').onclick=()=>{Object.assign(counts,E.preset(selectedCount));renderRoleCounts();};
    $('startBtn').onclick=startGame;
    $('nightResolveBtn').onclick=resolveNight;
    $('dayResolveBtn').onclick=resolveDay;
    $('undoBtn').onclick=undo;
    $('resetBtn').onclick=resetGame;
    $('restoreBtn').onclick=()=>{if(previousGame){game=previousGame;previousGame=null;history=[];saveLocal();render();}};
    $('toggleRoles').onclick=()=>{rolesVisible=!rolesVisible;saveLocal();renderPlayers();};
    $('copyAnnouncements').onclick=async()=>{
      const msg=announcementsToCopy();
      try{await navigator.clipboard.writeText(msg);alert('발표문을 복사했습니다.');}
      catch{window.prompt('복사할 발표문',msg);}
    };
    $('scriptPrev').onclick=()=>advanceScript(-1);
    $('scriptNext').onclick=()=>advanceScript(1);
    $('timerToggle').onclick=toggleTimer;$('timerReset').onclick=resetDiscussion;
    $('discussionMinutes').onchange=()=>{if(!timer.until)resetDiscussion();};
    $('demoBtn').onclick=()=>{demoMode=true;loggedIn=true;showAuthenticated('로컬 테스트 · 인증 없음');};
    $('loginBtn').onclick=()=>handleAuth(false);
    $('signupBtn').onclick=()=>handleAuth(true);
    $('signOutBtn').onclick=async()=>{
      if(client){const {error}=await client.auth.signOut();if(error){alert(`로그아웃 실패: ${error.message}`);return;} loggedIn=false;showLoggedOut('로그아웃되었습니다.');}
      else {loggedIn=false;demoMode=false;showLoggedOut('로컬 테스트 모드를 종료했습니다.');}
    };
  }
  function showAuthenticated(label,userId=null){
    const nextKey = userId ? `${KEY}-user-${userId}` : `${KEY}-demo`;
    if (storageKey !== nextKey || !game) { storageKey=nextKey; readLocal(); }
    $('loginView').hidden=true;$('workspace').hidden=false;
    $('authBadge').textContent=label;
    $('signOutBtn').hidden=false;render();
  }
  function showLoggedOut(msg='이메일과 비밀번호를 입력하세요.'){
    $('loginView').hidden=false;$('workspace').hidden=true;
    $('authForm').hidden=!client;$('demoForm').hidden=!!client;
    $('signupBtn').hidden=!AUTH_CONFIG.allowSignup;
    $('authInfo').textContent=msg;
    $('signOutBtn').hidden=true;$('authBadge').textContent=client?'로그인 필요':'로컬 테스트';
  }
  async function handleAuth(signup){
    if(!client)return;
    const email=$('authEmail').value.trim(),password=$('authPassword').value;
    $('authError').textContent='';
    if(!email || password.length<6){$('authError').textContent='이메일과 6자리 이상 비밀번호를 입력하세요.';return;}
    $('loginBtn').disabled=$('signupBtn').disabled=true;
    try{
      const {data,error}=signup
        ? await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}})
        : await client.auth.signInWithPassword({email,password});
      if(error)throw error;
      if(data?.session){loggedIn=true;showAuthenticated(email,data.user?.id);}
      else $('authError').textContent=signup?'회원가입 요청이 접수되었습니다. 이메일 인증이 필요하다면 메일을 확인한 후 로그인하세요.':'세션을 확인하지 못했습니다.';
    }catch(err){$('authError').textContent=`인증 오류: ${err.message}`;}
    finally{$('loginBtn').disabled=$('signupBtn').disabled=false;}
  }
  function loadSupabase(){return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload=resolve;s.onerror=()=>reject(new Error('Supabase 인증 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
    document.head.appendChild(s);
  });}
  async function initAuth(){
    const partiallyConfigured=!!AUTH_CONFIG.url !== !!AUTH_CONFIG.publishableKey;
    if(partiallyConfigured){ $('authBadge').textContent='인증 설정 오류'; $('authInfo').textContent='Supabase URL과 publishableKey를 둘 다 입력해 주세요.'; return; }
    const configured=AUTH_CONFIG.url && AUTH_CONFIG.publishableKey;
    if(!configured){showLoggedOut('Supabase를 연결하지 않아 로그인 없이 시험할 수 있습니다. 공개 배포 전에는 인증 설정을 권장합니다.');return;}
    try{
      await loadSupabase();
      client=window.supabase.createClient(AUTH_CONFIG.url,AUTH_CONFIG.publishableKey);
      const {data,error}=await client.auth.getUser();
      if(error||!data?.user)showLoggedOut('인증된 사회자 계정으로 로그인하세요.');
      else{loggedIn=true;showAuthenticated(data.user.email||'로그인됨',data.user.id);}
      client.auth.onAuthStateChange((event,session)=>{
        if(event==='SIGNED_OUT'){loggedIn=false;showLoggedOut('로그아웃되었습니다.');}
        if(event==='SIGNED_IN'&&session?.user){loggedIn=true;showAuthenticated(session.user.email||'로그인됨',session.user.id);}
      });
    }catch(err){
      $('loginView').hidden=false;$('authForm').hidden=true;$('demoForm').hidden=true;
      $('authInfo').textContent=`로그인 시스템에 연결할 수 없습니다: ${err.message}`;
      $('authBadge').textContent='인증 연결 오류';
    }
  }
  wire();setCount(8);initAuth();setInterval(tickTimer,300);
})();
