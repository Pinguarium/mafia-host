/* v3: Fixed, information-leak-resistant night call order and bilingual public speech. */
(function (root, factory) {
  const scripts=factory();
  if (typeof module==='object' && module.exports) module.exports=scripts;
  root.MafiaScripts=scripts;
})(typeof globalThis!=='undefined'?globalThis:this, function () {
  'use strict';
  const R = (word,reading) => `<ruby>${word}<rt>${reading}</rt></ruby>`;
  const J = {
    night:R('夜','よる'), morning:R('朝','あさ'), eye:R('目','め'), open:R('開','あ'),
    close:R('閉','と'), choice:R('選','えら'), one:R('一人','ひとり'),
    person:R('人','ひと'), target:R('相手','あいて'), end:R('終','お'),
    ready:R('準備','じゅんび'), role:R('役職','やくしょく'),
    dead:R('死亡','しぼう'), player:R('参加者','さんかしゃ'),
    attack:R('攻撃','こうげき'), mafia:R('マフィア','マフィア'),
    protect:R('守','まも'), report:R('報道','ほうどう')
  };
  const roles = [
    ['mafia','마피아','マフィア','공격할 사람을 한 명 선택해 주세요.',`${J.attack}する${J.target}を${J.one}${J.choice}んでください。`],
    ['madam','마담','マダム','봉인하거나 접선할 사람을 선택해 주세요.',`${J.target}を${J.choice}んでください。${R('封印','ふういん')}か${R('接触','せっしょく')}を${R('行','おこな')}います。`],
    ['hitman','청부업자',`${R('殺','ころ')}し${R('屋','や')}`,'조건에 맞으면 직업을 추측할 사람을 선택해 주세요.',`${R('条件','じょうけん')}を${R('満','み')}たした${R('場合','ばあい')}、${J.role}を${R('推理','すいり')}する${J.target}を${J.choice}んでください。`],
    ['doctor','의사',`${R('医者','いしゃ')}`,'치료할 사람을 선택해 주세요.',`${R('治療','ちりょう')}する${J.target}を${J.choice}んでください。`],
    ['nurse','간호사',`${R('看護師','かんごし')}`,'의사를 탐색하거나 조건에 맞으면 치료할 사람을 선택해 주세요.',`${R('医者','いしゃ')}を${R('探','さが')}すか、${R('条件','じょうけん')}を${R('満','み')}たしていれば${R('治療','ちりょう')}する${J.target}を${J.choice}んでください。`],
    ['detective','경찰',`${R('警察','けいさつ')}`,'조사할 사람을 선택해 주세요.',`${R('調査','ちょうさ')}する${J.target}を${J.choice}んでください。`],
    ['soldier','군인',`${R('軍人','ぐんじん')}`,'고유 능력은 자동으로 처리됩니다. 확인 후 대기해 주세요.',`${R('能力','のうりょく')}は${R('自動','じどう')}で${R('処理','しょり')}されます。そのままお${R('待','ま')}ちください。`],
    ['politician','정치인(정치가)',`${R('政治家','せいじか')}`,'낮에 적용되는 능력입니다. 확인 후 대기해 주세요.',`${R('昼','ひる')}に${R('適用','てきよう')}される${R('能力','のうりょく')}です。そのままお${R('待','ま')}ちください。`],
    ['lover','연인',`${R('恋人','こいびと')}`,'능력은 자동으로 처리됩니다. 확인 후 대기해 주세요.',`${R('能力','のうりょく')}は${R('自動','じどう')}で${R('処理','しょり')}されます。そのままお${R('待','ま')}ちください。`],
    ['reporter','기자',`${R('記者','きしゃ')}`,'사용 조건이 되면 취재할 사람을 선택해 주세요.',`${R('使用条件','しようじょうけん')}を${R('満','み')}たしていれば、${R('取材','しゅざい')}する${J.target}を${J.choice}んでください。`],
    ['terrorist','테러리스트','テロリスト','자폭 대상으로 지정할 사람을 선택해 주세요.',`${R('自爆','じばく')}の${R('対象','たいしょう')}を${J.choice}んでください。`],
    ['thug','건달',`${R('不良','ふりょう')}`,'협박할 사람을 선택해 주세요.',`${R('脅','おど')}す${J.target}を${J.choice}んでください。`],
    ['priest','성직자',`${R('聖職者','せいしょくしゃ')}`,'사용 조건이 되면 부활할 사망자를 선택해 주세요.',`${R('使用条件','しようじょうけん')}を${R('満','み')}たしていれば、${R('復活','ふっかつ')}させる${R('死者','ししゃ')}を${J.choice}んでください。`],
    ['officer','공무원',`${R('公務員','こうむいん')}`,'직업을 확인할 사람을 선택해 주세요.',`${J.role}を${R('調','しら')}べる${J.target}を${J.choice}んでください。`],
    ['medium','영매',`${R('霊媒師','れいばいし')}`,'사용 조건이 되면 직업을 확인할 사망자를 선택해 주세요.',`${R('使用条件','しようじょうけん')}を${R('満','み')}たしていれば、${J.role}を${R('確認','かくにん')}する${R('死者','ししゃ')}を${J.choice}んでください。`],
    ['citizen','시민',`${R('市民','しみん')}`,'별도의 밤 행동은 없습니다. 확인 후 대기해 주세요.',`${J.night}の${R('行動','こうどう')}はありません。そのままお${R('待','ま')}ちください。`]
  ];
  // This is global and NEVER filtered by players, living status, round or used abilities.
  const NIGHT_ORDER=Object.freeze(roles.map(r=>r[0]));
  const NIGHT=Object.freeze([
    Object.freeze({label:'밤 시작',role:null,ko:'모두 눈을 감아 주세요. 이제 밤이 시작됩니다.',ja:`みなさん、${J.eye}を${J.close}じてください。${J.night}が${R('始','はじ')}まります。`}),
    ...roles.map(([role,label,jname,ko,jprompt])=>Object.freeze({
      role,label,ko:`${label}은(는) 눈을 뜨세요. ${ko} 행동을 마쳤다면 눈을 감아 주세요.`,
      ja:`${jname}の${J.eye}を${J.open}けてください。${jprompt}${R('行動','こうどう')}が${J.end}わったら${J.eye}を${J.close}じてください。`
    })),
    Object.freeze({label:'밤 종료',role:null,ko:'모두 눈을 감은 상태를 유지해 주세요. 아침 발표를 준비하겠습니다.',ja:`${J.eye}を${J.close}じたままお${R('待','ま')}ちください。${J.morning}の${R('発表','はっぴょう')}を${J.ready}します。`})
  ]);
  const DAY=Object.freeze([
    {label:'아침 시작',ko:'아침이 밝았습니다. 지난밤 결과를 발표하겠습니다.',ja:`${J.morning}になりました。${R('昨夜','さくや')}の${R('結果','けっか')}を${R('発表','はっぴょう')}します。`},
    {label:'토론',ko:'이제 토론을 시작합니다. 필요할 때만 토론 타이머를 사용합니다.',ja:`これから${R('議論','ぎろん')}を${R('始','はじ')}めます。${R('必要','ひつよう')}な${R('時','とき')}だけタイマーを${R('使','つか')}います。`},
    {label:'최후 변론',ko:'투표 후보자는 최후의 변론을 해 주세요.',ja:`${R('投票','とうひょう')}の${R('候補者','こうほしゃ')}は${R('最後','さいご')}の${R('弁明','べんめい')}をしてください。`},
    {label:'찬반 투표',ko:'찬성, 반대, 기권을 확인하겠습니다.',ja:`${R('賛成','さんせい')}、${R('反対','はんたい')}、${R('棄権','きけん')}を${R('確認','かくにん')}します。`},
    {label:'낮 종료',ko:'낮이 끝났습니다. 모두 눈을 감아 주세요.',ja:`${R('昼','ひる')}が${J.end}わりました。${J.eye}を${J.close}じてください。`}
  ]);
  const ENDED=Object.freeze([{label:'종료',ko:'게임이 종료되었습니다. 승리 팀을 발표하겠습니다.',ja:`ゲームが${R('終了','しゅうりょう')}しました。${R('勝利','しょうり')}チームを${R('発表','はっぴょう')}します。`}]);
  function escape(s) {return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const roleJa={
    mafia:'マフィア',madam:'マダム',hitman:roles[2][2],doctor:roles[3][2],detective:roles[5][2],
    soldier:roles[6][2],politician:roles[7][2],lover:roles[8][2],reporter:roles[9][2],
    terrorist:'テロリスト',thug:roles[11][2],priest:roles[12][2],nurse:roles[4][2],
    officer:roles[13][2],medium:roles[14][2],citizen:roles[15][2]
  };
  const roleKo={mafia:'마피아',madam:'마담',hitman:'청부업자',doctor:'의사',detective:'경찰',soldier:'군인',politician:'정치인',lover:'연인',reporter:'기자',terrorist:'테러리스트',thug:'건달',priest:'성직자',nurse:'간호사',officer:'공무원',medium:'영매',citizen:'시민'};
  function formatEvent(ev) {
    const a=escape(ev?.name), t=escape(ev?.attacked), s=escape(ev?.sacrificed);
    const m=escape(ev?.mafia), terror=escape(ev?.terrorist);
    switch(ev?.type){
      case 'noNightDeaths':return {ko:'지난밤 사망자는 없습니다.',ja:`${R('昨夜','さくや')}の${R('死亡者','しぼうしゃ')}はいませんでした。`};
      case 'nightDeath':return {ko:`${ev.name} 님이 지난밤 사망했습니다.`,ja:`${a}さんが${R('昨夜','さくや')}${R('死亡','しぼう')}しました。`};
      case 'dayDeath':return {ko:`${ev.name} 님이 투표로 처형되었습니다.`,ja:`${a}さんが${R('投票','とうひょう')}で${R('処刑','しょけい')}されました。`};
      case 'noExecution':return {ko:'투표 결과 처형된 사람은 없습니다.',ja:`${R('投票','とうひょう')}の${R('結果','けっか')}、${R('処刑','しょけい')}された${J.person}はいません。`};
      case 'loverSacrifice':return {ko:`${ev.attacked} 님과 ${ev.sacrificed} 님은 연인입니다. ${ev.attacked} 님 대신 ${ev.sacrificed} 님이 희생했습니다.`,ja:`${t}さんと${s}さんは${R('恋人','こいびと')}です。${t}さんの${R('身代','みが')}わりに${s}さんが${R('犠牲','ぎせい')}になりました。`};
      case 'soldierBlock':return {ko:'군인의 불굴 능력이 발동해 마피아의 공격을 막았습니다. 군인이 누구인지는 공개하지 않습니다.',ja:`${R('軍人','ぐんじん')}の${R('不屈','ふくつ')}が${R('発動','はつどう')}し、マフィアの${J.attack}を${R('防','ふせ')}ぎました。${R('軍人','ぐんじん')}が${R('誰','だれ')}なのかは${R('公開','こうかい')}しません。`};
      case 'politicianAvoid':return {ko:`${ev.name} 님은 정치인(정치가)입니다. 처세 능력이 발동해 투표 처형을 면했습니다.`,ja:`${a}さんの${J.role}は${R('政治家','せいじか')}です。${R('処世','しょせい')}の${R('能力','のうりょく')}で${R('投票処刑','とうひょうしょけい')}を${R('免','まぬが')}れました。`};
      case 'terrorNight':return {ko:`테러리스트 ${ev.terrorist} 님의 자폭이 성공해 ${ev.mafia} 님과 함께 사망했습니다. 테러리스트의 정체가 공개됩니다.`,ja:`テロリストの${terror}さんが${R('自爆','じばく')}に${R('成功','せいこう')}し、${m}さんとともに${R('死亡','しぼう')}しました。テロリストの${R('正体','しょうたい')}が${R('公開','こうかい')}されます。`};
      case 'terrorDay':return {ko:`테러리스트 ${ev.terrorist} 님의 산화가 성공해 ${ev.mafia} 님과 함께 사망했습니다. 테러리스트의 정체가 공개됩니다.`,ja:`テロリストの${terror}さんが${R('道連','みちづ')}れに${R('成功','せいこう')}し、${m}さんとともに${R('死亡','しぼう')}しました。テロリストの${R('正体','しょうたい')}が${R('公開','こうかい')}されます。`};
      case 'report':return {ko:`익명 기자의 취재 결과입니다. ${ev.name} 님의 직업은 ${roleKo[ev.role]||'알 수 없음'}입니다. 기자의 신원은 공개하지 않습니다.`,ja:`${R('匿名','とくめい')}の${R('記者','きしゃ')}による${R('取材結果','しゅざいけっか')}です。${a}さんの${J.role}は${roleJa[ev.role]||'不明'}です。${R('記者','きしゃ')}の${R('正体','しょうたい')}は${R('公開','こうかい')}しません。`};
      case 'revive':return {ko:`${ev.name} 님이 부활했습니다.`,ja:`${a}さんが${R('復活','ふっかつ')}しました。`};
      case 'win':return ev.winner==='마피아 팀 승리'
          ? {ko:'게임 종료. 마피아 팀이 승리했습니다.',ja:`ゲーム${R('終了','しゅうりょう')}。マフィア${R('陣営','じんえい')}の${R('勝利','しょうり')}です。`}
          : {ko:'게임 종료. 시민 팀이 승리했습니다.',ja:`ゲーム${R('終了','しゅうりょう')}。${R('市民','しみん')}${R('陣営','じんえい')}の${R('勝利','しょうり')}です。`};
      default:return {ko:'(알 수 없는 발표)',ja:'（不明な発表）'};
    }
  }
  function plainJapanese(html){return html.replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g,'$1($2)').replace(/<[^>]*>/g,'');}
  return {NIGHT,NIGHT_ORDER,DAY,ENDED,formatEvent,plainJapanese,escape};
});
