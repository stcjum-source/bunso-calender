import {key,date,today,month,uid,holiday,defaults,sync,projected,status,displayDate,occurrences,validState,plannedDate,calendarEntries,setCompletion,moveOccurrence} from './engine.mjs?v=0.5.2';
const $=s=>document.querySelector(s), el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const CFG=window.BUNSO_CONFIG||{};
const isDesktop=!!window.desktop;
const cloudEnabled=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&window.supabase);
if(cloudEnabled)try{document.body.classList.add('cloud');}catch(e){}
const sb=cloudEnabled?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}}):null;
let authUser=null,lastSyncJson=null,cloudReady=false; // cloudReady: 클라우드 자료를 다 받기 전엔 절대 저장 안 함
const local={getItem:k=>{try{return localStorage.getItem(k)}catch{return null}},setItem:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
const storage={getItem:k=>isDesktop?window.desktop.readState():local.getItem(k),setItem:(k,v)=>isDesktop?window.desktop.writeState(v):local.setItem(k,v)};
const STORAGE='bunso-calendar-v1';let state,view=month(today()),editId=null,selected=null,readFailure=false;
function freshState(){return {version:1,created:today(),rules:defaults(),items:{},holidays:{}};}
state=freshState();
function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function save(){if(readFailure){$('#notice').textContent='저장 자료를 읽지 못했습니다. 기존 자료 보호를 위해 저장을 중지했습니다. 관리에서 백업을 불러오세요.';return false;}const json=JSON.stringify(state);if(cloudEnabled){if(!cloudReady)return true;local.setItem(STORAGE,json);if(authUser&&canon(state)!==lastSyncJson)queueCloudSave(json);return true;}try{storage.setItem(STORAGE,json);$('#saved').textContent=isDesktop?'이 PC에 저장됨':'이 기기에 저장됨';return true;}catch{$('#notice').textContent='저장하지 못했습니다. 관리 → 백업 저장으로 자료를 보관하세요.';return false;}}
function confirmAction(text){$('#confirmText').textContent=text;$('#confirm').showModal();return new Promise(resolve=>$('#confirm').addEventListener('close',()=>resolve($('#confirm').returnValue==='yes'),{once:true}));}
function allVisible(){return projected(state,view);}
let draggedItem=null,moveItem=null,pickedItem=null;
function shiftLabel(day){const [y,m,d]=day.split('-').map(Number);const offset=Math.round((Date.UTC(y,m-1,d)-Date.UTC(2026,8,18))/86400000);return ['A/B','D/A','C/D','B/C'][((offset%4)+4)%4];}
const shortDate=s=>`${+s.slice(5,7)}/${+s.slice(8)}`;
const compactCalendar=()=>innerWidth<=820||innerHeight<=560;
let openDay=null;
const dayPopup=el('section','day-popup');dayPopup.hidden=true;dayPopup.setAttribute('aria-label','선택한 날짜 업무');document.body.append(dayPopup);
function closeDay(){openDay=null;dayPopup.hidden=true;}
function showDayTasks(k){
 openDay=k;dayPopup.replaceChildren();const header=el('div','popup-head');header.append(el('strong','',`${shortDate(k)} ${shiftLabel(k)}`));const close=el('button','','×');close.ariaLabel='날짜 목록 닫기';close.onclick=closeDay;header.append(close);dayPopup.append(header);
 const list=el('div','popup-list');const entries=calendarEntries(state,month(k)).filter(e=>e.date===k);for(const e of entries)list.append(taskRow(e.item,{at:k}));if(!entries.length)list.append(el('p','','등록된 업무가 없습니다.'));dayPopup.append(list);
 const add=el('button','','＋ 업무 추가');add.onclick=()=>{closeDay();openEditor(null,k);};dayPopup.append(add);dayPopup.hidden=false;
 const cell=document.querySelector(`[data-date="${k}"]`),rect=cell?.getBoundingClientRect();const w=Math.min(320,innerWidth-16);dayPopup.style.width=w+'px';dayPopup.style.left=Math.max(8,Math.min(innerWidth-w-8,rect?.left||8))+'px';dayPopup.style.top=Math.max(8,Math.min(innerHeight-dayPopup.offsetHeight-8,(rect?.bottom||30)))+'px';
}
document.addEventListener('pointerdown',e=>{if(!dayPopup.hidden&&!dayPopup.contains(e.target)&&!e.target.closest('.cell'))closeDay();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDay();});
window.addEventListener('resize',closeDay);
function taskRow(o,{reference=false,day=false,at=displayDate(o)}={}){
 const st=status(o),row=el('div','task '+st+(reference?' reference':''));row.dataset.itemId=o.id;row.dataset.reference=String(reference);
 if(['excluded','missed'].includes(st))row.append(el('span','dash','—'));
 else{const cb=el('input');cb.type='checkbox';cb.checked=!!o.done;cb.ariaLabel=o.title+' 완료';cb.onclick=e=>e.stopPropagation();cb.onchange=()=>toggle(o);row.append(cb);}
 const b=el('button');
 if(month(o.original)!==month(at)){const lb=`${+o.original.slice(5,7)}월`;if(!o.title.trim().startsWith(lb))b.append(el('span','prior',lb));}
 b.append(el('span','tasktitle',o.title));
 if(o.note){const nm=el('span','notemark','✎');nm.title='메모 있음';b.append(nm);}
 if(reference)b.append(el('small','completion-label',shortDate(o.done)+' 완료'));
 else if(o.done&&o.scheduled!==o.done)b.append(el('small','completion-label','예정 '+shortDate(o.scheduled)));
 else if(st==='late'&&day)b.append(el('small','','지연'));
 else if(st==='missed'||st==='excluded')b.append(el('small','',st==='missed'?'미실시':'휴일 제외'));
 b.title=`${o.title}\n원래 예정 ${o.scheduled}${o.movedTo?' · 변경 예정 '+o.movedTo:''}${o.done?' · 실제 완료 '+o.done:''}${o.due?' · 마감 '+o.due:''}`;
 b.onclick=e=>{e.stopPropagation();if(performance.now()<ignoreClickUntil)return;if(!day&&pickedItem&&pickedItem.id!==o.id){quickMove(pickedItem,at);return;}if(day)openDetail(o);else{if(pickedItem?.id===o.id){pickedItem=null;updatePick();}else lift(o,row,e);}};row.append(b);
 if(!day){const more=el('button','task-more','⋯');more.title='업무 상세';more.onclick=e=>{e.stopPropagation();openDetail(o);};row.append(more);}
 if(!day){b.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();if(pickedItem){quickMove(pickedItem,at);ignoreClickUntil=performance.now()+400;return;}lift(o,row,e);};b.ondragstart=e=>e.preventDefault();}

 return row;
}
const floatingTask=el('div','floating-task');floatingTask.hidden=true;document.body.append(floatingTask);
let pointerStart=null,ignoreClickUntil=0,lastFloat=null,settleTimer,grabOffset={x:0,y:0};
function lift(o,row,e){
 const rect=row.getBoundingClientRect();const appearance=getComputedStyle(row);
 grabOffset={x:e.clientX-rect.left,y:e.clientY-rect.top};
 floatingTask.style.width=rect.width+'px';floatingTask.style.minHeight=rect.height+'px';floatingTask.style.fontSize=appearance.fontSize;
 floatingTask.style.padding=appearance.padding;floatingTask.style.gap=appearance.gap;
 closeDay();pickedItem=o;pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};updatePick();positionFloat(e.clientX,e.clientY);
 ignoreClickUntil=performance.now()+400;
}
function positionFloat(x,y){
 floatingTask.style.left=(x-grabOffset.x)+'px';floatingTask.style.top=(y-grabOffset.y)+'px';
 document.querySelectorAll('.drop-target').forEach(c=>c.classList.remove('drop-target'));
 document.elementFromPoint?.(x,y)?.closest('.cell')?.classList.add('drop-target');
}
document.addEventListener('pointermove',e=>{if(pickedItem)positionFloat(e.clientX,e.clientY);});
document.addEventListener('pointerup',e=>{if(!pointerStart)return;const start=pointerStart;pointerStart=null;ignoreClickUntil=performance.now()+400;if(!pickedItem)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5){const cell=document.elementFromPoint?.(e.clientX,e.clientY)?.closest('.cell');if(cell)quickMove(pickedItem,cell.dataset.date);else{pickedItem=null;updatePick();}}});
document.addEventListener('pointercancel',()=>{pointerStart=null;pickedItem=null;updatePick();});
function updatePick(){
 document.body.classList.toggle('picking',!!pickedItem);
 document.querySelectorAll('#calendar .task,#dayList .task').forEach(r=>{const held=r.dataset.itemId===pickedItem?.id;r.classList.toggle('picked',held);if(held)r.style.setProperty('display','none','important');else r.style.removeProperty('display');});
 floatingTask.hidden=!pickedItem;if(!pickedItem){document.querySelectorAll('.drop-target').forEach(c=>c.classList.remove('drop-target'));lastFloat=null;}
 if(pickedItem){const mark=el('span','held-check',pickedItem.done?'✓':'');mark.setAttribute('aria-hidden','true');floatingTask.replaceChildren(mark,el('strong','',pickedItem.title));}
 $('.drag-hint').textContent=pickedItem?'옮길 날짜 선택 · 완료 상태 유지 · Esc 취소':'날짜 이동은 완료 체크와 별개입니다';
}
function quickMove(o,target){
 try{const value=structuredClone(state.items[o.id]||o);const wasDone=!!value.done;if(wasDone)setCompletion(value,target);else moveOccurrence(value,target);value.updated=Date.now();state.items[value.id]=value;pickedItem=null;view=month(target);render();
 document.querySelectorAll('#calendar .task').forEach(r=>{if(r.dataset.itemId===value.id)r.classList.add('placed');});
 toast(wasDone?`${shortDate(target)}로 완료일을 변경했습니다.`:`${shortDate(target)}로 이동했습니다. 미완료 상태와 기존 마감일은 유지됩니다.`);
 }catch(e){toast(e.message);}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){pickedItem=null;updatePick();}});
function render(){
 if(cloudEnabled&&!authUser){$('#calendar').replaceChildren();$('#dayList').replaceChildren();showLogin();return;}  // 로그인 안 된 상태로 멈춰 있지 않게
 if(cloudEnabled&&!cloudReady){$('#calendar').replaceChildren();$('#dayList').replaceChildren(el('div','emptyday','클라우드 자료를 불러오는 중입니다…'));return;}
 sync(state);save();const [y,m]=view.split('-').map(Number);$('#monthTitle').textContent=`${y}년 ${m}월`;
 const cal=$('#calendar');cal.replaceChildren();const first=new Date(y,m-1,1),start=new Date(y,m-1,1-first.getDay());
 const count=Math.ceil((first.getDay()+new Date(y,m,0).getDate())/7)*7,entries=calendarEntries(state,view);cal.style.setProperty('--week-rows',String(count/7));
 for(let n=0;n<count;n++){
  const d=new Date(start);d.setDate(start.getDate()+n);const k=key(d),outside=month(k)!==view,hol=holiday(k,state.holidays);
  const cell=el('div','cell'+(outside?' outside':'')+(k===today()?' istoday':'')+(d.getDay()===0?' sun':'')+(d.getDay()===6?' sat':'')+(hol?' holiday':''));cell.dataset.date=k;
  cell.ondragover=e=>{if(draggedItem){e.preventDefault();e.dataTransfer.dropEffect='move';cell.classList.add('drop-target');}};
  cell.ondragleave=e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('drop-target');};
  cell.ondrop=e=>{e.preventDefault();cell.classList.remove('drop-target');if(draggedItem)quickMove(draggedItem,k);};
  cell.onclick=e=>{if(performance.now()<ignoreClickUntil)return;if(pickedItem&&!e.target.closest('input,.task')){quickMove(pickedItem,k);return;}if(compactCalendar()&&!e.target.closest('.dayadd'))showDayTasks(k);};
  const head=el('div','dayhead');head.append(el('span','daynum',String(d.getDate())));head.append(el('span','shift-label',shiftLabel(k)));
  if(hol){const h=el('span','holidayname',hol);h.title=hol;head.append(h);}
  const plus=el('button','dayadd','+');plus.ariaLabel=k+' 업무 추가';plus.onclick=e=>{e.stopPropagation();if(pickedItem)quickMove(pickedItem,k);else openEditor(null,k);};head.append(plus);cell.append(head);
  if(!outside){const daily=entries.filter(e=>e.date===k);for(const e of daily)cell.append(taskRow(e.item,{reference:e.reference,at:k}));
 const summary=el('button','day-summary');summary.ariaLabel=k+' 업무 목록';summary.append(el('strong','',daily.length?`업무 ${daily.length}건`:'업무 없음'));
 const counts={open:0,late:0,done:0,missed:0,excluded:0};for(const e of daily)counts[status(e.item)]++;
 const lines=el('span','summary-counts');for(const [st,label]of [['open','미완료'],['late','지연'],['done','완료'],['missed','미실시'],['excluded','제외']])if(counts[st])lines.append(el('span',st,`${label} ${counts[st]}`));summary.append(lines);cell.append(summary);}
 cal.append(cell);
 }
 if(openDay)showDayTasks(openDay);renderDay();updatePick();const pending=Object.values(state.items).some(o=>!o.deleted&&!o.done&&!['excluded','missed'].includes(status(o))&&plannedDate(o)<=today());
 $('#dot').classList.toggle('pending',pending);
 const nowT=today(),openItems=Object.values(state.items).filter(o=>!o.deleted&&!o.done&&!['excluded','missed'].includes(status(o,nowT)));
 const overdue=openItems.filter(o=>o.due&&o.due<nowT).length,nextDue=openItems.filter(o=>o.due&&o.due>=nowT).sort((a,b)=>a.due.localeCompare(b.due))[0],pendingCount=openItems.filter(o=>plannedDate(o)<=nowT).length;
 $('#expand').title=(pending?`미처리 ${pendingCount}건`:'처리할 업무 없음')+(overdue?` · 마감 경과 ${overdue}건`:'')+(nextDue?` · 다음 마감 ${shortDate(nextDue.due)} ${nextDue.title}`:'')+' · 클릭하면 오늘 업무';
 if(+view.slice(0,4)>2035||+view.slice(0,4)<2025)$('#notice').textContent='이 연도의 공휴일은 관리에서 직접 등록해 주세요.';
 else if(!readFailure&&$('#notice').textContent.includes('이 연도의'))$('#notice').textContent='';
}
const nextMonthStart=ym=>{const d=date(ym+'-01');d.setMonth(d.getMonth()+1);return key(d);};
function regen(drop){const now=Date.now(),gone={};for(const [id,o] of Object.entries(state.items))if(drop(o)){gone[id]=o;delete state.items[id];}sync(state);for(const [id,o] of Object.entries(gone)){if(state.items[id])state.items[id].updated=now;else if(o.updated)state.items[id]={...o,deleted:true,updated:now,auto:true};}}
function notReady(){if(cloudEnabled&&!cloudReady){toast('클라우드 자료를 불러온 뒤에 저장할 수 있습니다. 잠시 후 다시 시도해 주세요.');return true;}return false;}
async function deleteRule(r){
 if(notReady())return;
 if(!await confirmAction(`'${r.title}' 업무를 삭제할까요?\n지난 완료 기록은 남고, 앞으로의 일정과 아직 안 한 회차는 사라집니다.`))return;
 const now=Date.now();r.deleted=true;r.active=false;r.updated=now;   // 삭제 표시(다른 기기에서 되살아나지 않게)
 for(const [id,o] of Object.entries(state.items))if(o.ruleId===r.id&&!o.done&&!o.deleted&&!['missed','excluded'].includes(status(o)))state.items[id]={...o,deleted:true,updated:now};
 render();renderRules();toast('업무를 삭제했습니다. 지난 완료 기록은 남아 있습니다.');}
function keep(o){if(!state.items[o.id])state.items[o.id]=structuredClone(o);return state.items[o.id];}
function toggle(o){const v=keep(o);if(v.done)v.done=null;else setCompletion(v,today());v.updated=Date.now();render();toast(v.done?`${shortDate(v.done)} 완료로 기록했습니다.`:'완료 표시를 취소했습니다.');}
function changeMonth(n){closeDay();let d=date(view+'-01');d.setMonth(d.getMonth()+n);view=month(key(d));render();}
$('#prev').onclick=()=>changeMonth(-1);$('#next').onclick=()=>changeMonth(1);$('#today').onclick=()=>{view=month(today());render();};$('#collapse').onclick=()=>setMode('icon');$('#expand').onclick=()=>setMode('day');
let drag=null;$('#drag').onpointerdown=e=>{if(window.desktop)return;const r=$('#widget').getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};e.target.setPointerCapture(e.pointerId);};$('#drag').onpointermove=e=>{if(!drag)return;const w=$('#widget');w.style.left=Math.max(0,Math.min(innerWidth-w.offsetWidth,e.clientX-drag.x))+'px';w.style.top=Math.max(0,Math.min(innerHeight-w.offsetHeight,e.clientY-drag.y))+'px';w.style.right='auto';};$('#drag').onpointerup=()=>drag=null;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
const form=$('#ruleForm'),f=n=>form.elements.namedItem(n);for(let i=1;i<=31;i++){f('start').add(new Option(i+'일',String(i)));f('deadline').add(new Option(i+'일',String(i)));}f('start').add(new Option('말일','last'));f('deadline').add(new Option('말일','last'));f('deadline').add(new Option('실시 당일','same'));for(let i=1;i<=12;i++)f('annualMonth').add(new Option(i+'월',String(i)));
function formVisibility(){const repeat=f('repeat').value,hide=(sel,v)=>{const e=$(sel);if(e)e.hidden=v;};hide('#nthFields',!['nth','weekly','biweekly'].includes(repeat));hide('#ordinalField',repeat!=='nth');hide('#annualField',repeat!=='yearly');hide('#quarterField',repeat!=='quarterly');hide('#onceField',repeat!=='once');hide('#untilField',repeat==='once');hide('#startField',['nth','weekly','biweekly','once'].includes(repeat));f('deadline').hidden=f('hasDue').value!=='yes';f('once').required=repeat==='once';}
f('repeat').onchange=formVisibility;form.querySelectorAll('[name=hasDue]').forEach(x=>x.onchange=formVisibility);
function openEditor(id=null,onDate=null){if(id&&state.rules.find(x=>x.id===id)?.deleted){toast('삭제된 업무라 수정할 수 없습니다.');return;}editId=id;const r=id?state.rules.find(r=>r.id===id):{title:'',repeat:onDate?'once':'monthly',start:'1',hasDue:false,deadline:'same',miss:'carry',holiday:'previous',note:'',nths:[1],weekday:1,annualMonth:1,qStart:1,once:onDate||today(),until:''};form.reset();for(const n of ['title','repeat','start','deadline','miss','holiday','note','weekday','annualMonth','qStart','once','until'])if(f(n)&&r[n]!==undefined&&r[n]!==null)f(n).value=r[n];f('hasDue').value=r.hasDue?'yes':'no';f('nthChoice').value=(r.nths||[1]).join(',');$('#editorTitle').textContent=id?'업무 수정':'업무 추가';$('#editHint').textContent=id?'이번 달 미완료와 이후 일정에 적용합니다. 완료·미실시·지난달 기록은 유지합니다.':'새 업무는 오늘부터 시작합니다. 날짜를 눌러 추가한 일회성 업무는 선택한 날짜에 기록합니다.';formVisibility();$('#editor').showModal();}
$('#add').onclick=()=>openEditor();$('#manageAdd').onclick=()=>openEditor();
form.onsubmit=e=>{e.preventDefault();if(notReady())return;const r={id:editId||uid(),title:f('title').value.trim(),repeat:f('repeat').value,start:f('start').value,hasDue:f('hasDue').value==='yes',deadline:f('deadline').value,miss:f('miss').value,holiday:f('holiday').value,note:f('note').value.trim(),nths:f('nthChoice').value.split(',').map(Number),weekday:+f('weekday').value,annualMonth:+f('annualMonth').value,qStart:+(f('qStart')?.value)||1,once:f('once').value,until:f('until')?.value||null,active:true,from:today(),updated:Date.now()};if(!r.title)return;if(r.until&&r.repeat!=='once'&&r.until<r.from){toast('반복 종료일은 오늘 이후로 정해 주세요.');return;}if(r.repeat==='once'){r.from=r.once;if(r.hasDue&&r.deadline!=='same'&&r.deadline!=='last'&&+r.deadline<+r.once.slice(8)){toast('마감일은 시작일 이후로 정해 주세요.');return;}}if(['monthly','quarterly','yearly'].includes(r.repeat)&&r.hasDue&&r.deadline!=='same'&&r.deadline!=='last'&&(r.start==='last'||+r.deadline<+r.start)){toast('마감일은 시작일 이후로 정해 주세요.');return;}
if(editId){const old=state.rules.find(x=>x.id===editId);r.from=old.from;r.active=old.active;if(r.repeat!=='once'){const cm=month(today()),monthlyType=['monthly','quarterly','yearly'].includes(r.repeat);const handled=Object.values(state.items).some(o=>o.ruleId===editId&&!o.deleted&&(o.done||o.movedTo)&&month(o.original)===cm);r.since=monthlyType?(handled?nextMonthStart(cm):cm+'-01'):today();}state.rules=state.rules.map(x=>x.id===editId?r:x);regen(o=>o.ruleId===editId&&!o.done&&!o.movedTo&&!o.deleted&&!['missed','excluded'].includes(status(o))&&(r.repeat==='once'?month(o.original)>=month(today()):o.original>=r.since));}
else state.rules.push(r);sync(state);if(r.repeat==='once'&&!state.items[r.id+':'+r.once])for(const o of occurrences(r,month(r.once),state.holidays))state.items[o.id]=o;$('#editor').close();render();renderRules();toast('업무를 저장했습니다.');};
const repeatNames={monthly:'매월',quarterly:'분기(3개월마다)',yearly:'매년',nth:'매월 특정 요일',weekly:'매주 특정 요일',biweekly:'격주 특정 요일',once:'일회성'};
function ruleSummary(r){let when=r.repeat==='once'?r.once:r.repeat==='nth'?r.nths.join('·')+'번째 '+'일월화수목금토'[r.weekday]+'요일':(r.repeat==='weekly'||r.repeat==='biweekly')?(r.repeat==='biweekly'?'격주 ':'매주 ')+'일월화수목금토'[r.weekday]+'요일':r.repeat==='quarterly'?(q=>[q,q+3,q+6,q+9].join('·')+'월 ')(+(r.qStart||1))+(r.start==='last'?'말일':r.start+'일'):(r.repeat==='yearly'?r.annualMonth+'월 ':'')+(r.start==='last'?'말일':r.start+'일');const base=`${repeatNames[r.repeat]} · ${when} · ${r.hasDue?'마감 '+(r.deadline==='last'?'말일':r.deadline==='same'?'당일':r.deadline+'일'):'마감 없음'}`;return r.until?base+` · ~${shortDate(r.until)}까지`:base;}
function renderRules(){const list=$('#rules');list.replaceChildren();for(const r of state.rules){if(r.deleted)continue;const row=el('div','rule'+(!r.active?' inactive':''));const info=el('div','ruleinfo');info.append(el('strong','',r.title),el('p','',ruleSummary(r)));row.append(info);let b=el('button','','수정');b.onclick=()=>openEditor(r.id);row.append(b);b=el('button','',r.active?'중지':'다시 사용');b.onclick=async()=>{if(notReady())return;if(r.active&&!await confirmAction('앞으로 반복되는 일정을 중지할까요?\n이미 지난 업무와 완료 기록은 남습니다.'))return;r.active=!r.active;r.updated=Date.now();if(!r.active){regen(o=>o.ruleId===r.id&&plannedDate(o)>today()&&!o.done&&!o.movedTo&&!o.deleted);}else{r.since=today();const now=Date.now();const tomb=Object.entries(state.items).filter(([,o])=>o.ruleId===r.id&&o.deleted&&o.auto&&o.scheduled>=today()).map(([id])=>id);for(const id of tomb)delete state.items[id];sync(state);for(const id of tomb)if(state.items[id])state.items[id].updated=now;}render();renderRules();};row.append(b);b=el('button','danger','삭제');b.onclick=()=>deleteRule(r);row.append(b);list.append(row);}renderHolidayList();}
$('#manage').onclick=()=>{renderRules();$('#management').showModal();};
$('#summary').onclick=()=>{renderSummary();$('#summaryDialog').showModal();};
$('#daySummary').onclick=()=>{view=month(today());render();renderSummary();$('#summaryDialog').showModal();};
function renderSummary(){
 const now=today(),groups={open:[],late:[],missed:[],done:[],excluded:[]};
 for(const {item} of calendarEntries(state,view,now)){const st=status(item,now);(groups[st]||(groups[st]=[])).push(item);}
 const [y,m]=view.split('-').map(Number);$('#summaryTitle').textContent=`${y}년 ${m}월 업무 현황`;
 $('#summaryStat').textContent=`완료 ${groups.done.length} · 예정 ${groups.open.length} · 미완수 ${groups.late.length+groups.missed.length}`;
 const box=$('#summaryBody');box.replaceChildren();
 const dateOf={open:o=>o.scheduled,late:o=>o.due||plannedDate(o),missed:o=>plannedDate(o),done:o=>o.done,excluded:o=>plannedDate(o)};
 const sections=[['예정','open'],['미완수 · 마감 경과','late'],['미실시','missed'],['완료','done'],['휴일 제외','excluded']];
 let total=0;
 for(const [label,cls] of sections){const items=groups[cls];if(!items||!items.length)continue;total+=items.length;
  const sec=el('section','sumsec '+cls);sec.append(el('h3','sumh',`${label} (${items.length})`));
  items.sort((a,b)=>String(dateOf[cls](a)||'').localeCompare(String(dateOf[cls](b)||'')));
  for(const o of items){const row=el('div','sumrow');row.append(el('span','sumdate',shortDate(dateOf[cls](o)||o.scheduled)));row.append(el('span','sumtitle',o.title));
   if(o.note){const n=el('span','sumnote','✎');n.title='메모 있음';row.append(n);}
   row.title='클릭하면 상세·메모 보기';row.onclick=()=>{$('#summaryDialog').close();openDetail(o);};sec.append(row);}
  box.append(sec);}
 if(!total)box.append(el('div','emptyday','이 달에 표시할 업무가 없습니다.'));
}
function openDetail(o){o=state.items[o.id]||o;selected=o;$('#detailTitle').textContent=o.title;const box=$('#detailBody');box.replaceChildren();const st=status(o);const labels={open:'미완료',late:'미완료 · 마감 경과',done:'완료',missed:'미실시',excluded:'휴일 제외'};for(const [a,b]of [['원래 예정일',o.scheduled],...(o.movedTo?[['변경한 예정일',o.movedTo]]:[]),['마감일',o.due||'없음'],['상태',labels[st]],...(o.done?[['완료일',o.done]]:[])]){const row=el('div','detailrow');row.append(el('span','',a),el('span','',b));box.append(row);}const label=el('label','','메모');const area=el('textarea');area.rows=3;area.maxLength=2000;area.value=o.note;area.placeholder='업무 메모';area.onchange=()=>{const v=keep(o);v.note=area.value;v.updated=Date.now();save();};label.append(area);box.append(label);$('#editRule').hidden=!!state.rules.find(x=>x.id===o.ruleId)?.deleted;$('#toggleItem').textContent=o.done?'완료 취소':'오늘 완료';$('#toggleItem').hidden=st==='excluded';$('#detail').showModal();}
$('#moveItem').onclick=()=>{const o=selected;$('#detail').close();openMove(o,o.done||plannedDate(o));};
$('#toggleItem').onclick=()=>{toggle(selected);$('#detail').close();};$('#editRule').onclick=()=>{const id=selected.ruleId;$('#detail').close();openEditor(id);};$('#removeItem').onclick=async()=>{if(await confirmAction('이번 회차의 업무를 삭제할까요? 다음 반복 일정은 유지됩니다.')){{const v=keep(selected);v.deleted=true;v.updated=Date.now();}$('#detail').close();render();}};
async function download(){if(window.desktop){try{if(await window.desktop.backup(JSON.stringify(state,null,2)))toast('백업 파일을 저장했습니다.');}catch{toast('백업 저장에 실패했습니다. 저장 위치를 확인해 주세요.');}return;}const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=el('a');a.href=URL.createObjectURL(blob);a.download='분소업무_백업_'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('백업 파일을 저장했습니다.');}
$('#backup').onclick=download;$('#restore').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>15000000)throw Error();const s=JSON.parse(await file.text());if(!validState(s))throw Error();if(!await confirmAction('백업 자료로 현재 일정을 교체할까요?\n현재 자료가 필요하면 먼저 백업 저장을 해 주세요.'))return;state={...s,epoch:uid()};readFailure=false;if(cloudEnabled&&authUser){cloudReady=true;forceNext=true;}$('#notice').textContent='';render();renderRules();toast('백업을 불러왔습니다. 모든 기기에 이 자료로 교체됩니다.');}catch{toast('올바른 분소 업무 백업 파일이 아닙니다. 현재 자료는 유지됩니다.');}finally{e.target.value='';}};
function renderHolidayList(){const box=$('#holidayList');box.replaceChildren();for(const [d,n]of Object.entries(state.holidays).sort()){const row=el('div','holidayrow',d+' · '+(n||'평일로 변경'));const b=el('button','','설정 해제');b.onclick=()=>{if(notReady())return;delete state.holidays[d];stampHoliday(d);refreshHolidays();};row.append(b);box.append(row);}}
function stampHoliday(d){(state.holidayStamp||(state.holidayStamp={}))[d]=Date.now();}
function refreshHolidays(){regen(o=>!o.done&&!o.deleted&&!o.movedTo&&o.scheduled>=today());render();renderRules();toast('휴일 설정을 반영했습니다.');}
$('#holidaySave').onclick=()=>{if(notReady())return;let d=$('#holidayDate').value,n=$('#holidayName').value.trim();if(!d||!n){toast('날짜와 휴일 이름을 입력해 주세요.');return;}state.holidays[d]=n;stampHoliday(d);refreshHolidays();};$('#holidayWorking').onclick=()=>{if(notReady())return;const d=$('#holidayDate').value;if(!d){toast('날짜를 선택해 주세요.');return;}state.holidays[d]='';stampHoliday(d);refreshHolidays();};
window.addEventListener('storage',e=>{if(cloudEnabled)return;if(e.key===STORAGE&&e.newValue){try{const s=JSON.parse(e.newValue);if(validState(s)){state=s;render();}}catch{}}});let lastDay=today();function rollDay(){const prev=lastDay,now=today();if(prev!==now){if(view===month(prev))view=month(now);lastDay=now;}render();}setInterval(()=>{if(lastDay!==today())rollDay();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)rollDay();});

function renderDay(){
 const now=today(),d=date(now);$('#dayDate').textContent=`${d.getMonth()+1}월 ${d.getDate()}일`;$('#dayWeekday').textContent='일월화수목금토'[d.getDay()]+'요일';
 const list=$('#dayList');list.replaceChildren();
 const tasks=projected(state,month(now),now).filter(o=>displayDate(o,now)===now).sort((a,b)=>Number(!!a.done)-Number(!!b.done)||a.scheduled.localeCompare(b.scheduled));
 if(!tasks.length){list.append(el('div','emptyday','오늘 표시할 업무가 없습니다.'));return;}
 for(const o of tasks)list.append(taskRow(o,{day:true,at:now}));
}
function openMove(o,target){
 moveItem=state.items[o.id]||o;$('#moveTitle').textContent=moveItem.title;$('#targetDate').value=target;
 const form=$('#moveForm');form.elements.namedItem('action').value=moveItem.done?'complete':'move';
 $('#moveOnly').disabled=!!moveItem.done;$('#completeChoiceText').textContent=moveItem.done?'완료일 변경':'선택한 날짜에 완료';
 $('#moveHint').textContent=moveItem.done?'원래 예정일은 보존하고 실제 완료일을 변경합니다.':'이번 회차만 변경합니다. 다음 반복 일정과 기존 마감일은 유지됩니다. 과거 날짜의 미완료 이월 업무는 오늘 목록에 표시됩니다.';
 $('#moveDialog').showModal();
}
$('#moveForm').onsubmit=e=>{
 e.preventDefault();const target=$('#targetDate').value,action=$('#moveForm').elements.namedItem('action').value;
 try{const value=structuredClone(state.items[moveItem.id]||moveItem);if(action==='complete')setCompletion(value,target);else moveOccurrence(value,target);value.updated=Date.now();state.items[value.id]=value;view=month(action==='complete'?target:displayDate(value));$('#moveDialog').close();render();toast(action==='complete'?`${shortDate(target)} 완료로 기록했습니다.`:'이번 회차의 예정일을 변경했습니다.');}
 catch(error){toast(error.message);}
};
function setMode(mode,notify=true){if(!['icon','day','month'].includes(mode))return;pickedItem=null;updatePick();closeDay();document.body.dataset.mode=mode;$('#app').hidden=false;$('#widget').hidden=false;if(mode==='day')render();if(mode==='month'){view=month(today());render();}if(notify)window.desktop?.setMode(mode);}
$('#showMonth').onclick=()=>setMode('month');$('#showDay').onclick=()=>setMode('day');$('#dayAdd').onclick=()=>openEditor(null,today());$('#dayManage').onclick=()=>{renderRules();$('#management').showModal();};$('#quit').onclick=()=>window.desktop?.quit();$('#pin').onclick=()=>window.desktop?.togglePin();
window.desktop?.onMode(m=>setMode(m,false));window.desktop?.onPin(v=>{$('#pin').classList.toggle('pinned',v);$('#pin').title=v?'항상 위 켜짐':'항상 위 꺼짐';});
let panelOpen=false;new MutationObserver(()=>{const open=!!document.querySelector('dialog[open]');if(open!==panelOpen){panelOpen=open;window.desktop?.panel(open);}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});

// ===== 클라우드(Supabase) 로그인 · 동기화 =====
// 원칙1) 클라우드를 확실히 읽기 전에는 절대 저장하지 않는다(cloudReady).
// 원칙2) 클라우드를 못 읽으면(네트워크·형식 오류) "자료 없음"으로 보지 않고, 저장을 멈춘 채 다시 시도한다.
// 원칙3) 기기 간 차이는 항목마다 "마지막으로 손댄 시각(updated)"이 늦은 쪽이 이긴다.
// 원칙4) 백업 불러오기는 epoch를 새로 붙여 모든 기기에서 "통째 교체"로 처리한다.
// ===== 여러 기기 병합 =====
function canon(x){return JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((a,q)=>(a[q]=v[q],a),{}):v);}
const isTouched=o=>!!(o.updated||o.done||o.movedTo||o.deleted); // 자동 생성된 그대로가 아닌 항목 (메모는 업무 설정에서 자동 복사되므로 제외)
function pickItem(x,y){
 const tx=x.updated||0,ty=y.updated||0;
 if(tx||ty)return tx>=ty?x:y;                                 // 손댄 시각이 있으면 나중 것
 if(x.deleted||y.deleted)return x.deleted?x:y;                // (시각 없는 옛 자료) 삭제 보존
 if(x.done&&!y.done)return x; if(y.done&&!x.done)return y;    // 완료 보존
 if(x.done&&y.done)return x.done>=y.done?x:y;
 if(x.movedTo&&!y.movedTo)return x; if(y.movedTo&&!x.movedTo)return y;
 return (x.note||'').length>=(y.note||'').length?x:y;
}
// p=기준 자료 전체 + o=상대 자료 중 "손댄 항목"만 합침 (자동 생성 항목은 각 기기가 규칙으로 다시 만듦)
function mergeItems(p={},o={}){const out={};for(const id in p)out[id]=o[id]?pickItem(p[id],o[id]):p[id];for(const id in o)if(!(id in out)&&isTouched(o[id]))out[id]=o[id];return out;}
function mergeRules(p=[],o=[]){const om=new Map(o.map(r=>[r.id,r])),seen=new Set(),out=[];for(const r of p){const q=om.get(r.id);out.push(q&&(q.updated||0)>(r.updated||0)?q:r);seen.add(r.id);}for(const r of o)if(!seen.has(r.id))out.push(r);return out;}
function mergeHolidays(p,o){const ph=p.holidays||{},oh=o.holidays||{},ps=p.holidayStamp||{},os=o.holidayStamp||{},out={},st={};
 for(const k of new Set([...Object.keys(ph),...Object.keys(oh),...Object.keys(ps),...Object.keys(os)])){const tp=ps[k]||0,to=os[k]||0;const src=(tp||to)?(tp>=to?ph:oh):((k in ph)?ph:oh);if(k in src)out[k]=src[k];const t=Math.max(tp,to);if(t)st[k]=t;}
 return {holidays:out,holidayStamp:st};}
// 반복 방식별로 "실제로 쓰는 설정"만 비교
function ruleSig(r){const t=String(r.title||'').trim(),n=v=>v==null||v===''?'':String(+v);
 switch(r.repeat){
  case 'monthly':return [t,'monthly',String(r.start)].join('|');
  case 'quarterly':return [t,'quarterly',n(r.qStart||1),String(r.start)].join('|');
  case 'yearly':return [t,'yearly',n(r.annualMonth),String(r.start)].join('|');
  case 'nth':return [t,'nth',(r.nths||[]).map(Number).join(','),n(r.weekday)].join('|');
  case 'weekly':return [t,'weekly',n(r.weekday)].join('|');
  case 'biweekly':return [t,'biweekly',n(r.weekday),r.from||''].join('|');
  case 'once':return [t,'once',r.once||''].join('|');
  default:return [t,r.repeat,r.id].join('|');}}
function betterRule(x,y){const ex=x.once!==undefined,ey=y.once!==undefined;if(ex!==ey)return ex?x:y;if((x.from||'')!==(y.from||''))return (x.from||'')<(y.from||'')?x:y;return (x.note||'').length>=(y.note||'').length?x:y;}
// 중복 정리: "다른 기기의 빈 기본목록 복사본"(사용자가 수정한 적 없는 것)만 합친다. 직접 만들거나 수정한 업무끼리는 절대 합치지 않음.
function dedupeState(s){
 if(!s||!Array.isArray(s.rules))return s;
 const groups=new Map(),keep=new Set(),remap={};for(const r of s.rules){if(r.deleted){keep.add(r.id);continue;}const k=ruleSig(r);groups.has(k)?groups.get(k).push(r):groups.set(k,[r]);}
 for(const g of groups.values()){
  if(g.length<2){keep.add(g[0].id);continue;}
  const mine=g.filter(r=>r.once!==undefined),copies=g.filter(r=>r.once===undefined);
  const target=mine.length?mine.reduce(betterRule):copies.reduce(betterRule);
  for(const r of mine)keep.add(r.id);keep.add(target.id);
  for(const r of copies)if(r.id!==target.id)remap[r.id]=target.id;
 }
 if(!Object.keys(remap).length)return s;
 const rules=s.rules.filter(r=>keep.has(r.id));
 const items={};for(const o of Object.values(s.items||{})){let v=o;if(remap[o.ruleId]){const rid=remap[o.ruleId];v={...o,ruleId:rid,id:rid+':'+o.original};}items[v.id]=items[v.id]?pickItem(items[v.id],v):v;}
 return {...s,rules,items};
}
function mergeState(p,o){if(!p)return dedupeState(o);if(!o)return dedupeState(p);const h=mergeHolidays(p,o);
 const out={version:1,created:p.created||o.created||today(),rules:mergeRules(p.rules,o.rules),items:mergeItems(p.items,o.items),holidays:h.holidays};
 if(Object.keys(h.holidayStamp).length)out.holidayStamp=h.holidayStamp;
 if(p.epoch||o.epoch)out.epoch=p.epoch||o.epoch;
 const mg=[...new Set([...(p.migrations||[]),...(o.migrations||[])])];if(mg.length)out.migrations=mg;
 return dedupeState(out);}
async function fetchRemote(){
 const {data,error}=await sb.from('calendar_state').select('data').eq('user_id',authUser.id).abortSignal(AbortSignal.timeout(15000)).maybeSingle();  // 응답 없으면 15초 후 실패 처리 → 재시도
 if(error)throw new Error('network: '+(error.message||''));
 if(!data||data.data==null)return null;               // 진짜로 자료 없음(새 계정)
 if(!validState(data.data))throw new Error('invalid'); // 형식 오류 → 절대 덮어쓰지 않음
 return data.data;
}
async function upsertState(data){const {error}=await sb.from('calendar_state').upsert({user_id:authUser.id,data,updated_at:new Date().toISOString()}).abortSignal(AbortSignal.timeout(15000));if(error)throw new Error('network: '+(error.message||''));}
function adopt(s){state=s;lastSyncJson=canon(s);local.setItem(STORAGE,JSON.stringify(s));}
let saveTimer=null,retryTimer=null,pendingJson=null,saving=false,forceNext=false;
function queueCloudSave(json){pendingJson=json;$('#saved').textContent='저장 중…';clearTimeout(saveTimer);saveTimer=setTimeout(flushCloud,400);}
function scheduleRetry(){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(pendingJson!=null)flushCloud();},5000);}
async function flushCloud(){
 if(!authUser||!cloudReady||saving||pendingJson==null)return;
 const json=pendingJson,forced=forceNext;pendingJson=null;forceNext=false;saving=true;let failed=false;
 try{
  const mine=JSON.parse(json);let merged=mine;
  if(!forced){
   const remote=await fetchRemote();                    // 실패하면 throw → 덮어쓰지 않고 나중에 재시도
   if(remote&&(remote.epoch||'')!==(mine.epoch||'')){adopt(remote);render();$('#saved').textContent='다른 기기에서 백업을 불러와 그 자료로 바뀌었습니다';return;}
   if(remote)merged=mergeState(mine,remote);
  }
  await upsertState(merged);
  state=pendingJson!=null?mergeState(state,merged):merged;  // 저장하는 사이 또 바뀐 내용은 살림
  lastSyncJson=canon(merged);local.setItem(STORAGE,JSON.stringify(state));
  if(canon(state)!==canon(mine))render();
  $('#saved').textContent='클라우드에 저장됨 ✓';
 }catch(e){
  failed=true;if(pendingJson==null){pendingJson=json;if(forced)forceNext=true;}
  $('#saved').textContent=/invalid/.test(e.message)?'⚠ 클라우드 자료 형식 오류 · 저장 보류(관리 → 백업 불러오기로 복구)':'⚠ 저장 실패(네트워크) · 5초 후 다시 시도';scheduleRetry();
 }finally{saving=false;if(!failed&&pendingJson!=null)flushCloud();}
}
function flushNow(){if(pendingJson!=null&&!saving){clearTimeout(saveTimer);flushCloud();}}
async function cloudLoad(){
 const remote=await fetchRemote();                      // 실패하면 throw → 아무것도 저장하지 않음
 let cached=null;const raw=local.getItem(STORAGE);try{if(raw){const c=JSON.parse(raw);if(validState(c))cached=c;}}catch{}
 let s;
 if(remote&&cached&&(cached.epoch||'')===(remote.epoch||''))s=mergeState(remote,cached);  // 클라우드 기준 + 이 기기에서 손댄 것
 else s=dedupeState(remote||cached||freshState());
 adopt(s);cloudReady=true;
 if(!remote||canon(remote)!==lastSyncJson){try{await upsertState(s);}catch{lastSyncJson=remote?canon(remote):null;}}
}
function applyRemote(remote){                            // 다른 기기 변경 반영: 클라우드 기준 + 이 기기에서 손댄 것
 if((remote.epoch||'')!==(state.epoch||'')){adopt(remote);render();return true;}  // 다른 기기에서 백업 불러오기 → 통째로 따름
 const merged=mergeState(remote,state);const c=canon(merged);
 if(c===lastSyncJson)return false;
 state=merged;lastSyncJson=c;local.setItem(STORAGE,JSON.stringify(merged));render();
 if(canon(remote)!==c)queueCloudSave(JSON.stringify(merged));
 return true;
}
async function refreshFromCloud(){
 if(!authUser||!cloudReady||saving||pendingJson!=null)return;
 try{const remote=await fetchRemote();if(remote)applyRemote(remote);}catch{}
}
function showLogin(){$('#login').hidden=false;document.body.classList.add('locked');setTimeout(()=>$('#loginEmail')?.focus(),50);}
function hideLogin(){$('#login').hidden=true;document.body.classList.remove('locked');}
async function doLogout(auto=false){
 const t0=Date.now();                                   // 잠그기 전에 남은 변경부터 저장
 while((saving||pendingJson!=null)&&Date.now()-t0<4000){if(!saving&&pendingJson!=null){clearTimeout(saveTimer);flushCloud();}await new Promise(r=>setTimeout(r,100));}
 const unsynced=saving||pendingJson!=null;
 if(unsynced&&!auto&&!await confirmAction('아직 클라우드에 저장되지 않은 변경이 있습니다(인터넷 연결 확인).\n이 기기에 임시 보관했다가 다음 로그인 때 올립니다. 잠글까요?'))return;
 if(!unsynced)try{localStorage.removeItem(STORAGE);}catch{}   // 공용 PC에 달력 자료를 남기지 않음
 try{await sb.auth.signOut();}catch{}
 authUser=null;lastSyncJson=null;cloudReady=false;
 lockInPlace();   // 새로고침(location.reload)에 의존하지 않음 — 분소PC 프로그램은 새로고침이 차단되어 '불러오는 중'에 멈췄음
}
function lockInPlace(){
 clearTimeout(lockTimer);clearTimeout(loadRetry);clearTimeout(saveTimer);clearTimeout(retryTimer);
 pendingJson=null;forceNext=false;                      // 못 올린 변경은 이 기기 임시 보관본에 남아 다음 로그인 때 합쳐짐
 try{if(realtimeSub)sb.removeChannel(realtimeSub);}catch{}realtimeSub=null;
 document.querySelectorAll('dialog[open]').forEach(d=>{try{d.close();}catch{}});  // 열린 창이 로그인 화면 위에 남지 않게
 state=freshState();                                    // 화면·메모리에서 달력 자료 제거
 $('#calendar').replaceChildren();$('#dayList').replaceChildren();$('#rules')?.replaceChildren();$('#summaryBody')?.replaceChildren();
 $('#notice').textContent='';$('#saved').textContent='';
 $('#loginPw').value='';$('#loginMsg').textContent='';
 if(isDesktop)try{window.desktop.setMode('day');}catch{}
 showLogin();
}
let realtimeSub=null;
function subscribeRealtime(){
 if(!cloudEnabled||!authUser||realtimeSub)return;
 try{realtimeSub=sb.channel('cal-'+authUser.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'calendar_state',filter:'user_id=eq.'+authUser.id},payload=>{
   const d=payload.new&&payload.new.data;
   if(cloudReady&&!saving&&pendingJson==null&&d&&validState(d)&&applyRemote(d))$('#saved').textContent='다른 기기 변경 반영됨 ✓';
  }).subscribe();}catch(e){}
}
let loadRetry=null;
let loading=false;
const timed=(p,ms)=>Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(Error('network: timeout')),ms))]);  // 응답 없는 통신에 묶여 멈추지 않게
async function afterLogin(){
 clearTimeout(loadRetry);if(loading)return;loading=true;
 try{
  try{await timed(cloudLoad(),25000);$('#notice').textContent='';}
  catch(e){if(!cloudReady){                           // (시간 초과 직후 늦게 끝났으면 정상 진행)
   const bad=/invalid/.test(e.message);
   let cached=null;const raw=local.getItem(STORAGE);try{if(raw){const c=JSON.parse(raw);if(validState(c))cached=c;}}catch{}
   if(cached){adopt(cached);cloudReady=true;$('#saved').textContent=bad?'⚠ 클라우드 자료 형식 오류 · 이 기기 자료로 표시':'⚠ 클라우드 연결 실패 · 이 기기 자료로 표시(연결되면 자동 동기화)';}
   else{hideLogin();startApp();$('#notice').textContent=bad?'클라우드 자료를 읽을 수 없습니다(형식 오류). 관리 → 백업 불러오기로 복구하세요.':'클라우드에 연결하지 못했습니다. 5초 후 다시 시도합니다…';
    if(!bad)loadRetry=setTimeout(afterLogin,5000);return;}
  }}
  if(!authUser)return;                                  // 불러오는 사이 잠긴 경우
  hideLogin();startApp();resetLockTimer();subscribeRealtime();
 }finally{loading=false;}
}
function startApp(){if(!isDesktop)document.body.dataset.mode='month';render();}
$('#loginForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const email=$('#loginEmail').value.trim(),pw=$('#loginPw').value,msg=$('#loginMsg'),btn=$('#loginSubmit');
 msg.className='';msg.textContent='로그인 중…';btn.disabled=true;
 try{const {data,error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error;authUser=data.user;$('#loginPw').value='';msg.textContent='';await afterLogin();}
 catch(err){msg.className='';const raw=(err&&err.message)||String(err);let hint=raw;
  if(/invalid login credentials/i.test(raw))hint='이메일/비밀번호가 틀렸거나 그 사용자가 없습니다. (Supabase → Authentication → Users 에서 계정 생성 확인)';
  else if(/email not confirmed/i.test(raw))hint='이메일 인증이 안 된 계정입니다. Supabase → Authentication → Users 에서 그 사용자를 열어 Confirm(확인) 처리하거나, 새로 만들 때 "Auto Confirm User"를 체크하세요.';
  else if(/failed to fetch|networkerror|load failed/i.test(raw))hint='서버에 연결하지 못했습니다. config.js의 SUPABASE_URL 오타이거나 값을 넣고 다시 커밋하지 않았을 수 있습니다. (URL은 https://xxxx.supabase.co 형태)';
  else if(/invalid api key|jwt|apikey/i.test(raw))hint='API 키가 올바르지 않습니다. config.js의 SUPABASE_ANON_KEY를 anon/publishable 키로 다시 확인하세요. (service_role 아님)';
  msg.textContent='로그인 실패: '+hint;}
 finally{btn.disabled=false;}
});
$('#lockBtn')?.addEventListener('click',()=>{if(cloudEnabled&&authUser)doLogout(false);});
let lockTimer=null;const AUTO=(+CFG.AUTO_LOCK_MINUTES||0);
function resetLockTimer(){if(!cloudEnabled||!AUTO||!authUser)return;clearTimeout(lockTimer);lockTimer=setTimeout(()=>doLogout(true),AUTO*60000);}
if(cloudEnabled&&AUTO)['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(!document.hidden)resetLockTimer();}));
document.addEventListener('visibilitychange',()=>{if(!cloudEnabled||!authUser)return;if(document.hidden)flushNow();else{resetLockTimer();refreshFromCloud();}});
window.addEventListener('pagehide',()=>{if(cloudEnabled&&authUser)flushNow();});
window.addEventListener('online',()=>{if(cloudEnabled&&authUser){if(pendingJson!=null)flushCloud();else refreshFromCloud();}});
setInterval(()=>{if(cloudEnabled&&authUser&&cloudReady&&!document.hidden)refreshFromCloud();},60000);
setInterval(()=>{if(cloudEnabled&&authUser&&!cloudReady&&!loading)afterLogin();},20000);  // 안전장치: 불러오기가 끝나지 않은 채 남아 있으면 다시 시도  // 실시간 알림이 안 와도 1분마다 확인
async function boot(){
 if(cloudEnabled){
  let session=null;try{const r=await Promise.race([sb.auth.getSession(),new Promise((_,j)=>setTimeout(()=>j(Error('timeout')),15000))]);session=r.data.session;}catch{}
  if(session){authUser=session.user;await afterLogin();return;}
  if(isDesktop)try{window.desktop.setMode('day');}catch{}
  showLogin();return;
 }
 if(isDesktop){try{const raw=storage.getItem(STORAGE);if(raw){const s=JSON.parse(raw);if(!validState(s))throw Error('invalid');state=s;}}catch{readFailure=true;}render();return;}
 try{const raw=local.getItem(STORAGE);if(raw){const s=JSON.parse(raw);if(!validState(s))throw Error('invalid');state=s;}}catch{readFailure=true;}startApp();
}
boot();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'list_calendar_tasks',title:'달력 업무 조회',description:'현재 표시된 달의 업무와 상태를 조회합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('입력은 빈 객체여야 합니다.');return {month:view,tasks:allVisible().map(o=>({id:o.id,title:o.title,date:displayDate(o),status:status(o)}))};}})).catch(()=>{});}catch{}}

for(const edge of ['n','s','e','w','ne','nw','se','sw']){
 const grip=el('div','resize-edge resize-'+edge);grip.title='마우스로 창 크기 조절';grip.dataset.edge=edge;grip.setAttribute('aria-hidden','true');
 grip.onpointerdown=e=>{if(e.button!==0||!window.desktop)return;e.preventDefault();grip.setPointerCapture(e.pointerId);window.desktop.resizeStart(edge);};
 grip.onpointermove=e=>{if(grip.hasPointerCapture(e.pointerId))window.desktop?.resizeStep();};
 const end=e=>{window.desktop?.resizeEnd();if(grip.hasPointerCapture(e.pointerId))grip.releasePointerCapture(e.pointerId);};
 grip.onpointerup=end;grip.onpointercancel=end;grip.onlostpointercapture=()=>window.desktop?.resizeEnd();document.body.append(grip);
}
