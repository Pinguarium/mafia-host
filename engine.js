/* Mafia Host v4: platform-independent game rules. Offline, zero dependencies. */
(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  root.MafiaEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ROLES = {
    mafia: { label:'마피아', team:'mafia', desc:'매일 밤 공격 대상을 고른다 (총을 쏘는 역할)' },
    madam: { label:'마담', team:'mafia', desc:'매일 밤 대상 능력 봉인. 마피아를 지목하면 접선' },
    hitman: { label:'청부업자', team:'mafia', desc:'마피아의 총에 지목되어 접선한 다음 밤부터 직업 추측' },
    doctor: { label:'의사', team:'citizen', desc:'매일 밤 한 명을 마피아의 공격에서 치료' },
    detective: { label:'경찰', team:'citizen', desc:'매일 밤 한 명이 마피아 팀인지 조사' },
    soldier: { label:'군인', team:'citizen', desc:'마피아의 공격을 1회 자동 방어' },
    politician: { label:'정치가', team:'citizen', desc:'투표 2표, 투표 처형 면역' },
    lover: { label:'연인', team:'citizen', desc:'반드시 두 명. 마피아가 한 명을 공격하면 다른 연인이 대신 사망' },
    reporter: { label:'기자', team:'citizen', desc:'둘째 밤부터 게임당 1회 취재 대상의 직업을 익명 공개' },
    terrorist: { label:'테러리스트', team:'citizen', desc:'밤 자폭 대상 지정 / 낮 투표 처형 시 적 팀과 동반 사망' },
    thug: { label:'건달', team:'citizen', desc:'밤에 한 명을 협박해 다음 낮 투표권을 박탈' },
    priest: { label:'성직자', team:'citizen', desc:'과거에 사망한 사람 한 명을 게임당 1회 부활' },
    nurse: { label:'간호사', team:'citizen', desc:'의사 탐색·접선 후 의사 사망 시 다음 밤부터 치료 계승' },
    officer: { label:'공무원', team:'citizen', desc:'매일 밤 직업 조사. 마피아 팀이면 정보 없음' },
    medium: { label:'영매', team:'citizen', desc:'둘째 밤부터 게임당 1회 죽은 사람의 정확한 직업 확인 (비공개)' },
    citizen: { label:'시민', team:'citizen', desc:'고유 밤 능력 없음' }
  };
  const CONFIG_ROLES = Object.keys(ROLES).filter(k => k !== 'citizen');
  function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }
  function team(role) { return ROLES[role]?.team || 'citizen'; }
  // By preference fill every citizen slot with a distinct special role. With 18-24
  // players, some ordinary citizens are inevitable without duplicate powers.
  function preset(n) {
    if (!Number.isInteger(n) || n < 4 || n > 24) throw new Error('참가자는 4~24명이어야 합니다.');
    const c = Object.fromEntries(CONFIG_ROLES.map(k => [k, 0]));
    const mafiaCount = n <= 6 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : n <= 20 ? 4 : 5;
    c.madam = n >= 9 ? 1 : 0;
    c.hitman = n >= 13 ? 1 : 0;
    c.mafia = mafiaCount - c.madam - c.hitman;
    // Preference order: recommended unique powers, reserving the lover pair at 15+.
    const soloRoles = [
      ['doctor',4], ['detective',5], ['soldier',6], ['thug',7],
      ['politician',8], ['terrorist',9], ['medium',10], ['nurse',11],
      ['officer',12], ['reporter',13], ['priest',14]
    ];
    let slots = n - mafiaCount;
    // Reserve both lovers at 15+ before filling individual slots (avoids a
    // lone ordinary citizen in a 15-player game when two lover slots fit).
    if (n >= 15 && slots >= 2) { c.lover=2; slots-=2; }
    for (const [role] of soloRoles) {
      if (slots === 0) break;
      c[role]=1; slots--;
    }
    // Never strand exactly one ordinary citizen: for 18 players, swap out one
    // unique power so the two ordinary citizens can play the same bluff game.
    if (slots === 1 && c.priest) { c.priest=0; slots++; }
    validateConfig(n,c);
    return c;
  }
  function validateConfig(n, counts) {
    if (!Number.isInteger(n) || n < 4 || n > 24) throw new Error('참가자는 4~24명이어야 합니다.');
    for (const role of CONFIG_ROLES) {
      const value = counts[role] || 0;
      if (!Number.isInteger(value) || value < 0 || (role !== 'mafia' && role !== 'lover' && value > 1)) {
        throw new Error(`${ROLES[role].label} 인원을 확인하세요.`);
      }
    }
    if (![0,2].includes(counts.lover || 0)) throw new Error('연인은 0명 또는 2명이어야 합니다.');
    if ((counts.mafia || 0) < 1) throw new Error('총을 쏘는 마피아가 최소 1명 필요합니다.');
    const total = CONFIG_ROLES.reduce((s,r) => s+(counts[r]||0),0);
    if (total > n) throw new Error('배정한 직업 수가 전체 참가자 수보다 많습니다.');
    const mafiaCount = ['mafia','madam','hitman'].reduce((s,r)=>s+(counts[r]||0),0);
    if (mafiaCount >= n-mafiaCount) throw new Error('마피아 팀이 시민 팀보다 적도록 조정하세요.');
    return n-total;
  }
  function createGame(names, counts, random=Math.random) {
    if (names.length < 4 || names.length > 24) throw new Error('4~24명의 참가자를 입력하세요.');
    const clean = names.map(n => String(n).trim());
    if (clean.some(n=>!n || n.length>30)) throw new Error('이름은 1~30자로 입력하세요.');
    if (new Set(clean).size !== clean.length) throw new Error('참가자 이름이 중복됩니다.');
    const plain = validateConfig(clean.length,counts);
    const roles = CONFIG_ROLES.flatMap(r=>Array(counts[r]||0).fill(r)).concat(Array(plain).fill('citizen'));
    for (let i=roles.length-1; i>0; i--) {
      const j = Math.floor(random() * (i+1));
      [roles[i],roles[j]] = [roles[j],roles[i]];
    }
    return { version:4, round:1, phase:'night', winner:null,
      players:clean.map((name,id)=>({ id, name, role:roles[id], alive:true, soldierShieldUsed:false })),
      contact:{madam:false, hitman:false, nurse:false}, used:{priest:false,reporter:false,medium:false},
      blockedVoter:null, logs:[{round:0,phase:'setup',private:`참가자 ${clean.length}명 / 마피아 팀 ${clean.filter((_,i)=>team(roles[i])==='mafia').length}명으로 시작`,public:[]}],
      announcements:[], announcementEvents:[], settings:{counts:deepCopy(counts)} };
  }
  function byId(g,id) {
    if (id === undefined || id === null || id === '') return null;
    return g.players.find(p=>p.id === Number(id)) || null;
  }
  const living = g => g.players.filter(p=>p.alive);
  const active = (g,role) => living(g).find(p=>p.role===role) || null;
  const isAliveTarget = (g,id) => { const p=byId(g,id); return p?.alive ? p : null; };
  function checkWin(g) {
    const alive = living(g);
    const mafia = alive.filter(p=>team(p.role)==='mafia').length;
    if (mafia === 0) return '시민 팀 승리';
    if (mafia >= alive.length-mafia) return '마피아 팀 승리';
    return null;
  }
  function record(g,phase,priv,pub,publicEvents=[]) {
    const publicMessages = Array.from(new Set(pub));
    const uniqueEvents = publicEvents.filter((e,i,arr)=>
      arr.findIndex(x=>JSON.stringify(x)===JSON.stringify(e))===i);
    g.logs.push({round:g.round,phase,private:priv.join('\n'),public:publicMessages,publicEvents:uniqueEvents});
    g.announcements=publicMessages;
    g.announcementEvents=uniqueEvents;
    const winner=checkWin(g);
    if (winner) {
      g.winner=winner;g.phase='ended';
      g.announcements.push(`게임 종료: ${winner}`);
      g.announcementEvents.push({type:'win',winner});
      g.logs.push({round:g.round,phase:'ended',private:winner,public:[`게임 종료: ${winner}`],publicEvents:[{type:'win',winner}]});
    }
    return g;
  }
  function canNurseHeal(g) {
    return !!(active(g,'nurse') && g.contact.nurse && !active(g,'doctor'));
  }
  function resolveNight(input, choices={}) {
    if (input.phase !== 'night') throw new Error('현재 밤 단계가 아닙니다.');
    const g=deepCopy(input), priv=[],pub=[], events=[], dead=[];
    const isOn = (r)=>active(g,r);
    // Use night-start survivor state for simultaneous actions, even if a target
    // dies later in this same night's resolution.
    const pick=(key)=>{const original=isAliveTarget(input,choices[key]);return original ? byId(g,original.id) : null;};
    const targetedByMadam=pick('madamTarget');
    let sealedId=null;
    if (isOn('madam') && targetedByMadam && targetedByMadam.id!==isOn('madam').id) {
      if (targetedByMadam.role==='mafia') {
        if (!g.contact.madam) priv.push(`마담 ↔ 마피아 접선 성공: ${targetedByMadam.name}`);
        g.contact.madam=true;
      } else {
        sealedId=targetedByMadam.id;
        priv.push(`마담: ${targetedByMadam.name}의 밤 고유능력 봉인`);
      }
    }
    const enabled = r => { const p=isOn(r); return !!(p && p.id!==sealedId); };
    const killed=(p,reason)=>{
      if (!p || !p.alive) return false;
      p.alive=false; p.deathReason=reason; p.diedRound=g.round;
      dead.push(p.name);
      priv.push(`${p.name} 사망 (${ROLES[p.role].label} / ${reason})`);
      return true;
    };
    const shooter = isAliveTarget(g,choices.mafiaShooter);
    const shooterValid=shooter?.role==='mafia' && shooter.id!==sealedId;
    // One normal mafia shooter per night, even if several are alive.
    const target = shooterValid ? pick('mafiaTarget') : null;
    if (target && team(target.role)==='mafia') {
      if ((target.role==='madam' || target.role==='hitman') && !g.contact[target.role]) {
        g.contact[target.role]=true;
        priv.push(`마피아 ${shooter.name} ↔ ${ROLES[target.role].label} ${target.name} 접선 성공 (공격 소모)`);
      } else priv.push('마피아 팀원을 선택하여 공격은 발생하지 않았습니다.');
    }
    const mafiaAttack = target && team(target.role)!=='mafia' ? target : null;
    // Doctor and nurse can establish contact in either direction.
    const doctorTarget = enabled('doctor') ? pick('doctorTarget') : null;
    const nurseWasHealer = canNurseHeal(g); // Capture night-start condition before any deaths.
    const nurseProbe = enabled('nurse') && !nurseWasHealer ? pick('nurseProbe') : null;
    const nurseHealTarget=enabled('nurse') && nurseWasHealer ? pick('nurseHeal') : null;
    if (isOn('nurse') && isOn('doctor') && (
      (nurseProbe?.role==='doctor') || (doctorTarget?.role==='nurse')
    )) {
      if (!g.contact.nurse) priv.push('의사 ↔ 간호사 접선 성공: 서로 정체 확인');
      g.contact.nurse=true;
    }
    if (nurseProbe && !g.contact.nurse) priv.push(`간호사 처방: ${nurseProbe.name} ${nurseProbe.role==='doctor'?'의사 발견':'의사 아님'}`);
    const protectedId=(doctorTarget || nurseHealTarget)?.id;
    if (doctorTarget) priv.push(`의사 치료: ${doctorTarget.name}`);
    if (nurseHealTarget) priv.push(`간호사 계승 치료: ${nurseHealTarget.name}`);
    const thugTarget=enabled('thug') ? pick('thugTarget') : null;
    g.blockedVoter=thugTarget?.id ?? null;
    if (thugTarget) priv.push(`건달 협박: ${thugTarget.name} (다음 낮 투표 불가)`);
    const marked=enabled('terrorist') ? pick('terroristTarget') : null;
    if (marked) priv.push(`테러리스트 밤 자폭 대상: ${marked.name}`);
    // Hitman must have been in contact before THIS night. Correct guesses bypass healing and shield.
    if (enabled('hitman') && input.contact.hitman) {
      const suspect=pick('hitmanTarget'), guess=choices.hitmanGuess;
      if (suspect && ROLES[guess]) {
        if (suspect.role===guess && team(suspect.role)!=='mafia') {
          killed(suspect,'청부업자 직업 추측 성공');
        } else priv.push(`청부업자 추측 실패: ${suspect.name} / 추측 ${ROLES[guess].label}`);
      }
    }
    // Mafia attack, once per night.
    if (mafiaAttack) {
      if (!mafiaAttack.alive) priv.push(`마피아 공격 무효: ${mafiaAttack.name}은 이미 사망`);
      else if (mafiaAttack.id===protectedId) priv.push(`의료진 방어 성공: ${mafiaAttack.name}`);
      else if (mafiaAttack.role==='soldier' && !mafiaAttack.soldierShieldUsed && mafiaAttack.id!==sealedId) {
        mafiaAttack.soldierShieldUsed=true;
        priv.push(`군인 방탄 1회 소모: ${mafiaAttack.name}`);
        pub.push('군인이 마피아의 공격을 막아냈습니다. 군인의 이름은 공개하지 않습니다.');
        events.push({type:'soldierBlock'});
      } else if (mafiaAttack.role==='terrorist' && marked?.id===shooter.id && enabled('terrorist')) {
        killed(mafiaAttack,'테러리스트 자폭');
        killed(shooter,'테러리스트 자폭에 휘말린 마피아');
        pub.push(`테러리스트 ${mafiaAttack.name}와 ${shooter.name}이(가) 자폭으로 함께 사망했습니다.`);
        events.push({type:'terrorNight',terrorist:mafiaAttack.name,mafia:shooter.name});
      } else if (mafiaAttack.role==='lover') {
        const other=g.players.find(p=>p.role==='lover' && p.alive && p.id!==mafiaAttack.id);
        if (other) {
          killed(other,`${mafiaAttack.name} 대신 희생한 연인`);
          pub.push(`${mafiaAttack.name}와 ${other.name}은(는) 연인입니다. ${mafiaAttack.name} 대신 ${other.name}이(가) 희생했습니다.`);
          events.push({type:'loverSacrifice',attacked:mafiaAttack.name,sacrificed:other.name});
        } else killed(mafiaAttack,'마피아 공격 (연인 동료 없음)');
      } else killed(mafiaAttack,'마피아 공격');
    } else if (!target) priv.push('이번 밤 마피아 공격 없음');
    // Priest can resurrect only a person who was dead before this night began.
    if (enabled('priest') && !g.used.priest) {
      const originalDead=input.players.filter(p=>!p.alive).map(p=>p.id);
      const rez=byId(g,choices.priestTarget);
      if (rez && !rez.alive && originalDead.includes(rez.id)) {
        rez.alive=true; delete rez.deathReason;
        g.used.priest=true;
        priv.push(`성직자 부활: ${rez.name} (${ROLES[rez.role].label}), 능력 1회 소모`);
        pub.push(`${rez.name}이(가) 부활했습니다.`);
        events.push({type:'revive',name:rez.name});
      }
    }
    // Detective/officer results are for the host and the actor only.
    if (enabled('detective')) {
      const t=pick('detectiveTarget');
      if (t) priv.push(`경찰 조사 ${t.name}: ${team(t.role)==='mafia'?'마피아 팀':'마피아 팀 아님'}`);
    }
    if (enabled('officer')) {
      const t=pick('officerTarget');
      if (t) priv.push(`공무원 조사 ${t.name}: ${team(t.role)==='mafia'?'정보 없음':ROLES[t.role].label}`);
    }
    if (enabled('reporter') && g.round>=2 && !g.used.reporter) {
      const t=pick('reporterTarget');
      if (t) {
        priv.push(`기자 취재: ${t.name} / ${ROLES[t.role].label} (1회 소모)`);
        pub.push(`익명 취재 결과: ${t.name}의 직업은 ${ROLES[t.role].label}입니다.`);
        events.push({type:'report',name:t.name,role:t.role});
        g.used.reporter=true;
      }
    }
    // Medium can inspect one previously dead player's actual role, once from night 2.
    // Does not reveal the identity of the medium to the public.
    if (enabled('medium') && g.round>=2 && !g.used.medium) {
      const target=byId(g,choices.mediumTarget);
      const alreadyDead=input.players.some(p=>p.id===target?.id && !p.alive);
      if (target && alreadyDead) {
        g.used.medium=true;
        priv.push(`영매 사망자 확인: ${target.name} / ${ROLES[target.role].label} (1회 소모 · 비공개)`);
      }
    }
    // If other non-publicized night deaths occurred, announce names, not roles.
    for (const name of dead) {
      if (!pub.some(line=>line.includes(name))) {
        pub.unshift(`${name}이(가) 밤에 사망했습니다.`);
        events.unshift({type:'nightDeath',name});
      }
    }
    if (dead.length===0) {
      pub.unshift('지난밤 사망자는 없습니다.');
      events.unshift({type:'noNightDeaths'});
    }
    g.phase='day';
    return record(g,'night',priv,pub,events);
  }
  function voteSummary(g,votes={}) {
    const tally={yes:0,no:0,abstain:0,blocked:[]};
    for (const p of living(g)) {
      if (p.id===g.blockedVoter) { tally.blocked.push(p.name); continue; }
      const value=votes[p.id] || 'abstain';
      const weight=p.role==='politician' ? 2 : 1;
      if (value==='yes') tally.yes += weight;
      else if (value==='no') tally.no += weight;
      else tally.abstain += weight;
    }
    return tally;
  }
  function resolveDay(input, choices={}) {
    if (input.phase!=='day') throw new Error('현재 낮 단계가 아닙니다.');
    const g=deepCopy(input), priv=[],pub=[],events=[];
    const candidate=isAliveTarget(g,choices.candidate);
    if (!candidate) priv.push('오늘 투표 처형 대상 없음');
    else {
      const s=voteSummary(g,choices.votes || {});
      priv.push(`투표 대상 ${candidate.name}: 찬성 ${s.yes}표, 반대 ${s.no}표, 기권 ${s.abstain}표`);
      if (s.blocked.length) priv.push(`협박으로 투표권 상실: ${s.blocked.join(', ')}`);
      if (s.yes>s.no) {
        if (candidate.role==='politician') {
          priv.push('정치가는 투표 처형 면역');
          pub.push(`${candidate.name}은(는) 정치인(정치가)입니다. 처세 능력으로 투표 처형을 면했습니다.`);
          events.push({type:'politicianAvoid',name:candidate.name});
        } else {
          candidate.alive=false;
          candidate.deathReason='낮 투표 처형';candidate.diedRound=g.round;
          priv.push(`${candidate.name} 처형 (${ROLES[candidate.role].label})`);
          pub.push(`${candidate.name}이(가) 투표로 처형되었습니다.`);
          events.push({type:'dayDeath',name:candidate.name});
          if (candidate.role==='terrorist') {
            const blast=isAliveTarget(g,choices.terrorDayTarget);
            if (blast) {
              if (team(blast.role)==='mafia') {
                blast.alive=false; blast.deathReason='테러리스트 산화';blast.diedRound=g.round;
                priv.push(`테러리스트 산화 성공: ${blast.name} (${ROLES[blast.role].label})`);
                pub.pop(); // Specific paired-death speech replaces the generic execution speech.
                events.pop();
                pub.push(`테러리스트 ${candidate.name}와 ${blast.name}이(가) 산화로 함께 사망했습니다.`);
                events.push({type:'terrorDay',terrorist:candidate.name,mafia:blast.name});
              } else priv.push(`산화 실패: ${blast.name}은 시민 팀이므로 테러리스트만 사망`);
            }
          }
        }
      } else { priv.push('찬성이 반대를 초과하지 않아 처형 없음'); pub.push('투표 결과 처형된 사람은 없습니다.'); events.push({type:'noExecution'}); }
    }
    g.blockedVoter=null;
    g.phase='night';
    const next=record(g,'day',priv,pub,events);
    if (next.phase!=='ended') next.round += 1;
    return next;
  }
  // Night actions are simultaneous. Private feedback is calculated from the
  // resolved preview, not guessed during a participant's first turn.
  function feedbackFor(input, choices, resolved, playerId) {
    const actor=byId(input,playerId);
    if(!actor?.alive) return '이번 차례에는 전달할 결과가 없습니다.';
    const targetOf = key => isAliveTarget(input,choices[key]);
    const madam=active(input,'madam');
    const blocked=madam && targetOf('madamTarget') && targetOf('madamTarget').id!==madam.id
      && targetOf('madamTarget').role!=='mafia' ? targetOf('madamTarget').id : null;
    if(actor.id===blocked) {
      const joined=[];
      if(actor.role==='hitman'&&resolved.contact.hitman&&!input.contact.hitman)
        joined.push('일반 마피아와 접선에 성공했습니다.');
      if(['doctor','nurse'].includes(actor.role)&&resolved.contact.nurse&&!input.contact.nurse)
        joined.push('의사와 간호사가 접선에 성공했습니다.');
      return joined.join(' ')+' 이번 밤 고유 능력이 봉인되어 조사·행동 결과가 없습니다.';
    }
    const targetName=(key)=>targetOf(key)?.name||'미선택';
    switch(actor.role) {
      case 'mafia': {
        const contactNames=[];
        if(resolved.contact.madam&&!input.contact.madam)contactNames.push(`마담 ${active(input,'madam')?.name||''}`);
        if(resolved.contact.hitman&&!input.contact.hitman)contactNames.push(`청부업자 ${active(input,'hitman')?.name||''}`);
        return contactNames.length?`이번 밤 접선 확인: ${contactNames.join(', ')}. 공동 공격은 그룹 차례에 처리되었습니다.`
          :'공동 공격 선택은 마피아 그룹 차례에 처리되었습니다.';
      }
      case 'madam': {
        const t=targetOf('madamTarget');
        if(resolved.contact.madam&&!input.contact.madam)
          return `일반 마피아와 접선에 성공했습니다.${t&&t.role!=='mafia'?` ${t.name}님의 밤 고유 능력도 봉인했습니다.`:''}`;
        if(!t||t.id===actor.id)return '이번 밤 봉인 대상을 지정하지 않았습니다.';
        return t.role==='mafia'?'일반 마피아와 접선에 성공했습니다.':`${t.name}님의 이번 밤 고유 능력을 봉인했습니다.`;
      }
      case 'hitman': {
        if(!input.contact.hitman) return resolved.contact.hitman
          ? '일반 마피아와 접선에 성공했습니다. 직업 추측은 다음 밤부터 사용할 수 있습니다.'
          : '아직 접선 전이므로 직업을 추측할 수 없습니다.';
        const t=targetOf('hitmanTarget'),guess=choices.hitmanGuess;
        if(!t||!ROLES[guess])return '오늘은 직업을 추측하지 않았습니다.';
        return t.role===guess && team(t.role)!=='mafia'
          ? `${t.name}님의 직업 추측 성공: ${ROLES[t.role].label}. 처형이 적용됩니다.`
          : `${t.name}님의 직업 추측에 실패했습니다.`;
      }
      case 'doctor': return resolved.contact.nurse&&!input.contact.nurse
        ? `간호사와 접선에 성공했습니다. 치료 대상: ${targetName('doctorTarget')}`
        : `치료 대상: ${targetName('doctorTarget')} (공격이 있었는지는 별도로 알려주지 않습니다.)`;
      case 'nurse': {
        if(resolved.contact.nurse&&!input.contact.nurse) return '의사와 접선에 성공했습니다. 서로의 직업을 확인합니다.';
        if(canNurseHeal(input))return `계승 치료 대상: ${targetName('nurseHeal')}`;
        const t=targetOf('nurseProbe');
        return t ? `${t.name}님은 ${t.role==='doctor'?'의사입니다. 접선 성공':'의사가 아닙니다.'}` : '이번 밤 처방 대상 없음';
      }
      case 'detective': {
        const t=targetOf('detectiveTarget');
        return t ? `${t.name}님은 ${team(t.role)==='mafia'?'마피아 팀입니다.':'마피아 팀이 아닙니다.'}`:'조사 대상 없음';
      }
      case 'officer': {
        const t=targetOf('officerTarget');
        return t ? `${t.name}님 조사 결과: ${team(t.role)==='mafia'?'정보 없음':ROLES[t.role].label}`:'조사 대상 없음';
      }
      case 'reporter': return input.round<2?'기자는 두 번째 밤부터 능력을 사용할 수 있습니다.'
        : input.used.reporter?'이미 1회 사용한 능력입니다.'
        : targetOf('reporterTarget')?`${targetName('reporterTarget')}님 취재 접수. 다음 아침 전체 공개되며 기자 신원은 비공개입니다.`:'이번 밤 취재 사용 안 함';
      case 'medium': {
        if(input.round<2)return '영매는 두 번째 밤부터 능력을 사용할 수 있습니다.';
        if(input.used.medium)return '이미 1회 사용한 능력입니다.';
        const t=byId(input,choices.mediumTarget);
        return t&&!t.alive?`${t.name}님의 직업은 ${ROLES[t.role].label}입니다. (영매만 확인)`:'확인할 사망자 없음';
      }
      case 'priest': return input.used.priest?'이미 부활 능력을 사용했습니다.'
        : resolved.used.priest?`${byId(input,choices.priestTarget)?.name||''}님 부활이 적용되었습니다.`:'이번 밤 부활 사용 안 함';
      case 'thug': return `협박 대상: ${targetName('thugTarget')}`;
      case 'terrorist': return `자폭 대상으로 지정한 사람: ${targetName('terroristTarget')}`;
      case 'soldier': return '불굴은 자동 처리됩니다. 발동했다면 다음 아침 이름 없이 발표됩니다.';
      case 'politician': return '정치인의 처세·2표 능력은 낮 투표에서 자동 적용됩니다.';
      case 'lover': return '연인의 대리 희생 능력은 자동 처리됩니다.';
      default: return '오늘 밤 전달할 비공개 조사 결과는 없습니다.';
    }
  }
  return {ROLES,CONFIG_ROLES,preset,validateConfig,createGame,byId,living,active,team,checkWin,canNurseHeal,resolveNight,feedbackFor,voteSummary,resolveDay,deepCopy};
});
