/* MAFIA HOST v4 — editable deployment configuration
   To enable REAL host login: fill in the Supabase Project URL and PUBLISHABLE / anon key.
   Never put a service_role / secret key in a public GitHub repository.
*/
const AUTH_CONFIG = {
  url: 'https://pinguarium.github.io/mafia-host/', // example: 'https://your-project.supabase.co'
  publishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3Z2hicWp4amVidHJxdWVyam1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NDI2NDAsImV4cCI6MjExMDIxODY0MH0.8KQLq1gdr4m7TYV8gfHGTdFLWl-8rP1IH4qcZzEqgCQ', // Supabase publishable key (or legacy anon key), NOT service_role!
  allowSignup: false // Only enable during initial account creation, then disable at Supabase too
};

(() => {
  'use strict';
  const E = window.MafiaEngine;
  const $ = id => document.getElementById(id);
  const KEY = 'mafia-host-v4-state';
  let storageKey = KEY + '-demo'; // Authenticated accounts are stored separately on each device.
  const MAX_UNDO = 40;
  let client=null, loggedIn=false, demoMode=false, selectedCount=8;
  let game=null, history=[], previousGame=null, timer={duration:300,remaining:300,until:null};
  let rolesVisible=false;
  let scriptStep=0,scriptStepKey='';
  let nightFlow=null; // v4: saved action draft, two full shoulder-tap passes, stage checklist
  const counts = {};

  // Language text and silent two-pass shoulder-tap sequence live in scripts.js.
  const S = window.MafiaScripts;
  if (!S) throw new Error('scripts.js를 먼저 불러와야 합니다.');
  function upgradeGame(g) {
    if (!g || !Array.isArray(g.players) || ![2,3,4].includes(g.version)) return null;
    g.used ||= {};
    g.used.priest = !!g.used.priest;
    // When upgrading a game already in progress, preserve single-use reporter history.
    g.used.reporter = !!g.used.reporter || (g.logs||[]).some(l=>/기자 취재:/.test(l.private||''));
    g.used.medium = !!g.used.medium;
    g.announcementEvents ||= [];
    g.version=4;
    return g;
  }

  function readLocal() {
    game=null;history=[];previousGame=null;nightFlow=null;rolesVisible=false;resetTimerTo(5);
    try {
      let raw=localStorage.getItem(storageKey);
      if(!raw){
        for(const oldKey of ['mafia-host-v3-state','mafia-host-v2-state']) {
          raw=localStorage.getItem(storageKey.replace(KEY,oldKey));
          if(raw)break;
        }
      }
      const data=JSON.parse(raw||'null');
      game=upgradeGame(data?.game);
      if(Array.isArray(data?.history))history=data.history.slice(-MAX_UNDO)
        .map(item=>({...item,game:upgradeGame(item.game)})).filter(x=>x.game);
      previousGame=upgradeGame(data?.previousGame);
      nightFlow=data?.nightFlow||null;
      if(data?.timer)timer=data.timer;
      if(typeof data?.rolesVisible==='boolean')rolesVisible=data.rolesVisible;
      if(raw&&!localStorage.getItem(storageKey))saveLocal();
    } catch(err){console.error('저장된 게임을 읽지 못함',err);}
  }
  function saveLocal() {
    try {localStorage.setItem(storageKey,JSON.stringify({game,history,previousGame,timer,rolesVisible,nightFlow}));}
    catch(err){alert('브라우저 저장에 실패했습니다. 용량/시크릿 모드를 확인하세요.');}
  }
  function ensureNightFlow() {
    if(!game||game.phase!=='night')return;
    const signature=E.living(game).map(p=>p.id).join(',');
    if(!nightFlow||nightFlow.round!==game.round||nightFlow.signature!==signature){
      nightFlow={round:game.round,signature,pass:'choices',step:0,
        actionCompleted:[],resultCompleted:[],draft:{}};
    }
    nightFlow.actionCompleted||=[];nightFlow.resultCompleted||=[];nightFlow.draft||={};
    if(!['choices','feedback'].includes(nightFlow.pass))nightFlow.pass='choices';
  }
  function freshTimer() { return {duration:Number($('discussionMinutes')?.value||5)*60||300,remaining:Number($('discussionMinutes')?.value||5)*60||300,until:null}; }
  function resetTimerTo(minutes=5) {const seconds=Number(minutes)*60;timer={duration:seconds,remaining:seconds,until:null};}
  function commit(next) {
    history.push({game:E.deepCopy(game),timer:E.deepCopy(timer),nightFlow:E.deepCopy(nightFlow)});
    if(history.length>MAX_UNDO) history.shift();
    game=next;nightFlow=null;
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
      game=newGame;history=[];previousGame=null;nightFlow=null;resetTimerTo(5);saveLocal();render();
    }catch(err){$('setupError').hidden=false;$('setupError').textContent=err.message;}
  }
  function selectField(id,label,items,note,includeNone=true){
    const wrap=document.createElement('div');wrap.className='field';
    const lab=document.createElement('label');lab.htmlFor=id;lab.textContent=label;wrap.append(lab);
    const sel=document.createElement('select');sel.id=id;
    if(includeNone)sel.add(new Option('선택 안 함',''));
    for(const item of items)sel.add(new Option(item.name,String(item.id)));
    wrap.append(sel);
    if(note){const hint=document.createElement('div');hint.className='field-note';hint.textContent=note;wrap.append(hint);}
    return wrap;
  }
  function renderChoice(id,label,items,note='',includeNone=true){
    const dest=$('nightFields'),wrap=selectField(id,label,items,note,includeNone);
    dest.append(wrap);
    const sel=wrap.querySelector('select');
    const saved=nightFlow.draft[id];
    if(saved!==undefined&&[...sel.options].some(x=>x.value===String(saved)))sel.value=String(saved);
    else {sel.value=sel.options[0]?.value||'';nightFlow.draft[id]=sel.value;}
    sel.addEventListener('change',()=>{
      nightFlow.draft[id]=sel.value;
      nightFlow.actionCompleted=nightFlow.actionCompleted.filter(x=>x!==currentNightStep().id);
      nightFlow.resultCompleted=[];
      saveLocal();renderScript();showNight();
    });
    return sel;
  }
  function addNote(text,cls='muted'){
    const p=document.createElement('p');p.className=cls;p.textContent=text;$('nightFields').append(p);
  }
  function currentNightStep(){return S.nightSteps(game,nightFlow.pass)[nightFlow.step];}
  function showNight(){
    ensureNightFlow();
    const step=currentNightStep(),dest=$('nightFields');dest.replaceChildren();
    $('nightStageTitle').textContent=nightFlow.pass==='choices'?'① 행동 입력 차례':'② 비공개 결과 전달 차례';
    $('nightStageSub').textContent=nightFlow.pass==='choices'
      ? '전체 생존자를 자리 순서대로 한 번씩 깨웁니다. 모든 사람에게 비슷한 시간을 사용하세요.'
      : '같은 사람들을 같은 순서로 다시 확인합니다. 조사 결과가 없는 사람도 건너뛰지 마세요.';
    if(step.kind==='group'){
      const shooters=E.living(game).filter(p=>p.role==='mafia');
      const title=document.createElement('h3');title.textContent='일반 마피아 전원이 동시에 눈을 뜹니다 (사회자 전용)';dest.append(title);
      addNote('접선 전후와 관계없이 마담·청부업자는 이 그룹 차례에 참여하지 않습니다. 총을 쏘는 일반 마피아만 공동으로 공격을 결정합니다.');
      if(shooters.length){
        renderChoice('mafiaShooter','총격을 실행하는 마피아 (자폭 판정용)',shooters,'마피아끼리 조용히 합의해 한 명을 선택합니다.',false);
        renderChoice('mafiaTarget','공동 공격 대상',E.living(game),'마담/청부업자를 지목하면 접선. 선택 안 하면 공격하지 않습니다.');
      } else addNote('생존 일반 마피아가 없습니다. 이 단계에서도 전체 순서는 유지합니다.');
    } else if(step.kind==='person'){
      const actor=E.byId(game,step.playerId);
      const h=document.createElement('h3');h.textContent=`${actor.name} · ${E.ROLES[actor.role].label} (사회자만 확인)`;dest.append(h);
      if(nightFlow.pass==='feedback'){
        const preview=E.resolveNight(game,nightFlow.draft);
        const info=document.createElement('div');info.className='private-result';
        const head=document.createElement('b');head.textContent='본인에게만 조용히 알려줄 결과';
        const msg=document.createElement('p');msg.textContent=E.feedbackFor(game,nightFlow.draft,preview,actor.id);
        info.append(head,msg);dest.append(info);
        addNote('다른 참가자가 화면을 볼 수 없도록 주의하세요. 다른 사람의 결과도 유출하면 안 됩니다. 결과가 없는 사람도 같은 시간 동안 눈을 뜨게 하세요.');
      } else {
        const alive=E.living(game),dead=game.players.filter(p=>!p.alive);
        switch(actor.role){
          case 'mafia':addNote('공동 공격은 앞의 그룹 단계에서 이미 입력했습니다. 개별 차례도 생략하지 않습니다.');break;
          case 'madam':renderChoice('madamTarget','봉인 또는 접선할 사람',alive.filter(p=>p.id!==actor.id),'자신 선택 불가 · 일반 마피아를 지목하면 접선 (매일 밤).');break;
          case 'hitman':
            if(game.contact.hitman){
              renderChoice('hitmanTarget','직업을 추측할 대상',alive,'접선한 다음 밤부터 매일 사용 가능');
              const roles=Object.entries(E.ROLES).map(([id,role])=>({id,name:role.label}));
              renderChoice('hitmanGuess','추측한 직업',roles,'맞히면 즉시 처형 (치료·방탄 무시)');
            }else addNote('아직 마피아와 접선하지 않았으므로 추측할 수 없습니다. 오늘 접선하더라도 다음 밤부터 가능.');
            break;
          case 'doctor':renderChoice('doctorTarget','치료할 대상',alive,'간호사를 치료 대상으로 지목하면 상호 접선');break;
          case 'nurse':
            if(E.canNurseHeal(game))renderChoice('nurseHeal','계승 치료할 대상',alive,'접선 후 의사 사망 시 다음 밤부터 치료 계승');
            else if(E.active(game,'doctor'))renderChoice('nurseProbe','의사 탐색 대상',alive,'의사를 직접 지목하거나 의사가 간호사를 치료 대상으로 고르면 접선');
            else addNote('의사가 없고 접선 후 치료를 계승한 상태도 아닙니다. 행동 없음.');
            break;
          case 'detective':renderChoice('detectiveTarget','경찰 조사 대상',alive,'마피아 팀 여부 · 결과는 2차 전달 차례에서 알려줍니다.');break;
          case 'officer':renderChoice('officerTarget','공무원 직업 조사 대상',alive,'마피아 팀이면 정보 없음 · 결과는 2차 전달 차례에서 알려줍니다.');break;
          case 'reporter':
            if(game.round>=2&&!game.used.reporter)renderChoice('reporterTarget','익명 취재 대상 (1회)',alive,'둘째 밤부터 게임당 1회 · 아침 전체 공개');
            else addNote(game.used.reporter?'기자는 이미 취재 능력을 사용했습니다. 행동 없음.':'기자는 첫째 밤에는 능력을 사용하지 못합니다.');
            break;
          case 'medium':
            if(game.round>=2&&!game.used.medium)renderChoice('mediumTarget','직업을 확인할 기존 사망자 (1회)',dead,'둘째 밤부터 게임당 1회 · 결과는 2차 전달 차례에 비공개 확인');
            else addNote(game.used.medium?'영매 능력은 이미 사용했습니다.':'영매는 둘째 밤부터 능력을 사용할 수 있습니다.');
            break;
          case 'priest':
            if(!game.used.priest)renderChoice('priestTarget','부활시킬 기존 사망자 (1회)',dead,'게임당 1회 · 오늘 밤 처음 사망한 사람은 선택 불가');
            else addNote('부활 능력을 이미 사용했습니다. 행동 없음.');
            break;
          case 'thug':renderChoice('thugTarget','건달 협박 대상',alive,'다음 낮 투표권 상실');break;
          case 'terrorist':renderChoice('terroristTarget','밤 자폭 대상',alive,'자신을 공격하는 일반 마피아가 이 사람일 때 동반 사망');break;
          case 'soldier':addNote('군인의 방탄은 자동 적용됩니다. 매일 같은 순서로 확인하세요.');break;
          case 'politician':addNote('정치인의 2표·처형 면역은 낮에 적용됩니다. 밤에는 행동 없음.');break;
          case 'lover':addNote('연인의 대리 희생은 자동 적용됩니다. 밤에는 행동 없음.');break;
          default:addNote('이번 밤에 따로 입력할 고유 능력은 없습니다. 다른 참가자와 동일한 시간 동안 차례를 진행하세요.');
        }
      }
    } else if(step.kind==='intro')addNote(step.privateNote);
    else if(step.kind==='end'){
      addNote(step.privateNote);
      if(nightFlow.pass==='choices'){
        const picked=Object.entries(nightFlow.draft).filter(([k,v])=>v!=='' && k!=='mafiaShooter');
        const summary=document.createElement('p');summary.textContent=`현재 입력된 선택 ${picked.length}개 · 다음 버튼을 누르면 결과 전달 단계로 넘어갑니다.`;dest.append(summary);
      }
    }
    const stages=S.nightSteps(game,nightFlow.pass);
    const completed=nightFlow.pass==='choices'?nightFlow.actionCompleted:nightFlow.resultCompleted;
    const final=step.kind==='end'&&nightFlow.pass==='feedback';
    $('nightResolveBtn').disabled=!final||!stages.slice(0,-1).every(s=>completed.includes(s.id));
    $('nightResolveBtn').hidden=nightFlow.pass!=='feedback';
  }
  function resolveNight(){
    ensureNightFlow();
    const steps=S.nightSteps(game,'feedback');
    if(nightFlow.pass!=='feedback'||nightFlow.step!==steps.length-1||
        !steps.slice(0,-1).every(s=>nightFlow.resultCompleted.includes(s.id))){
      alert('행동 입력과 비공개 결과 전달의 모든 참가자 차례를 마쳐주세요.');return;
    }
    if(!confirm('밤 행동을 확정하고 공개 발표문으로 넘어갈까요? 밤 확정은 진행 취소로 복구할 수 있습니다.'))return;
    try{commit(E.resolveNight(game,nightFlow.draft));}
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
    const last=history.pop();game=last.game;timer=last.timer;nightFlow=last.nightFlow||null;saveLocal();render();
  }
  function resetGame(){
    if(!confirm('현재 게임을 종료하고 새 게임 설정 화면으로 돌아갈까요?\n설정 화면의 “이전 게임 복원”으로 한 번 복구할 수 있습니다.'))return;
    previousGame=E.deepCopy(game);game=null;history=[];nightFlow=null;resetTimerTo(5);saveLocal();render();
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
    const isNight=game.phase==='night';
    if(isNight)ensureNightFlow();
    const items=isNight?S.nightSteps(game,nightFlow.pass):game.phase==='day'?S.DAY:S.ENDED;
    if(!isNight){
      const stepKey=`${game.phase}:${game.round}`;
      if(stepKey!==scriptStepKey){scriptStep=0;scriptStepKey=stepKey;}
      scriptStep=Math.max(0,Math.min(scriptStep,items.length-1));
    }
    const idx=isNight?nightFlow.step:scriptStep;
    const step=items[idx];
    const prefix=isNight?(nightFlow.pass==='choices'?'1차 선택':'2차 결과'):'진행 대본';
    $('scriptProgress').textContent=`${prefix} · ${idx+1}/${items.length}`;
    $('scriptPrev').disabled=(!isNight&&idx===0)||(isNight&&idx===0&&nightFlow.pass==='choices');
    $('scriptNext').disabled=idx===items.length-1&&(!isNight||nightFlow.pass==='feedback');
    $('scriptNext').textContent=isNight&&idx===items.length-1&&nightFlow.pass==='choices'?'결과 전달 시작 →':isNight?'이 차례 완료 · 다음 →':'다음 →';
    $('scriptPrivacyHint').hidden=!isNight;
    const wrap=document.createElement('div');wrap.className='script-item script-active';
    const head=document.createElement('div');head.className='script-head';
    head.textContent=`${idx+1}/${items.length} · ${step.label}`;
    const tip=document.createElement('p');tip.className='hint-tip';tip.textContent=step.privateNote||'아래 문구를 필요에 따라 읽으세요.';
    const cap=document.createElement('div');cap.className='muted micro';cap.textContent='사회자 대본 · 한국어 / 日本語 (ふりがな)';
    const ko=document.createElement('div');ko.className='script-ko';ko.textContent=step.ko;
    const ja=document.createElement('div');ja.className='script-ja';ja.lang='ja';ja.innerHTML=step.ja;
    wrap.append(head,tip,cap,ko,ja);field.append(wrap);
    if(isNight){
      const tally=document.createElement('div');tally.className='flow-count';
      const completed=nightFlow.pass==='choices'?nightFlow.actionCompleted:nightFlow.resultCompleted;
      tally.textContent=`완료 ${completed.length}/${items.length-1}단계 · 진행 중 ${step.label}`;
      field.append(tally);
      const note=document.createElement('p');note.className='muted micro';
      note.textContent='※ 위 단계 이름과 직업은 사회자만 확인합니다. 참가자에게는 직업·이름·번호를 큰 소리로 부르지 마세요.';
      field.append(note);
    }
  }
  function advanceScript(delta){
    if(!game)return;
    if(game.phase!=='night'){
      const total=(game.phase==='day'?S.DAY:S.ENDED).length;
      scriptStep=Math.max(0,Math.min(total-1,scriptStep+delta));
      renderScript();return;
    }
    ensureNightFlow();
    const steps=S.nightSteps(game,nightFlow.pass);
    if(delta<0){
      if(nightFlow.step>0)nightFlow.step-=1;
      else if(nightFlow.pass==='feedback'){
        nightFlow.pass='choices';nightFlow.step=S.nightSteps(game,'choices').length-1;
        nightFlow.resultCompleted=[];
      }
    }else if(delta>0){
      if(nightFlow.step<steps.length-1){
        const key=steps[nightFlow.step].id;
        const arr=nightFlow.pass==='choices'?nightFlow.actionCompleted:nightFlow.resultCompleted;
        if(!arr.includes(key))arr.push(key);
        nightFlow.step+=1;
      }else if(nightFlow.pass==='choices'){
        const missing=steps.slice(0,-1).filter(s=>!nightFlow.actionCompleted.includes(s.id));
        if(missing.length)return alert('아직 확인하지 않은 차례가 있습니다. 이전 버튼으로 돌아가 확인해 주세요.');
        nightFlow.pass='feedback';nightFlow.step=0;nightFlow.resultCompleted=[];
      }
    }
    saveLocal();renderScript();showNight();
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
    if(game.phase==='night')$('statusText').textContent='마피아 공동 지목 → 생존자 전원 선택 → 생존자 전원 비공개 결과 전달 → 아침 발표';
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
    $('screenCoverBtn').onclick=()=>{$('privacyCover').hidden=false;};
    $('screenRevealBtn').onclick=()=>{$('privacyCover').hidden=true;};
    $('resetBtn').onclick=resetGame;
    $('restoreBtn').onclick=()=>{if(previousGame){game=previousGame;previousGame=null;history=[];nightFlow=null;saveLocal();render();}};
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
    $('demoBtn').onclick=()=>{if(!isLocalDemoAllowed())return;demoMode=true;loggedIn=true;showAuthenticated('로컬 테스트 · 인증 없음');};
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
  function isLocalDemoAllowed(){return location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);}
  function showLoggedOut(msg='이메일과 비밀번호를 입력하세요.'){
    $('loginView').hidden=false;$('workspace').hidden=true;
    $('authForm').hidden=!client;$('demoForm').hidden=!!client||!isLocalDemoAllowed();
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
    if(!configured){
      showLoggedOut(isLocalDemoAllowed()?'로컬 개발 중에는 테스트 모드를 사용할 수 있습니다.':'배포 환경에서 사회자 로그인을 사용하려면 Supabase URL과 공개 키를 설정해야 합니다. 설정 전에는 앱에 입장할 수 없습니다.');return;
    }
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
