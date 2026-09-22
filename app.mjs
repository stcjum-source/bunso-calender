import {key,date,today,month,uid,holiday,defaults,sync,projected,status,displayDate,occurrences,validState,plannedDate,calendarEntries,setCompletion,moveOccurrence} from './engine.mjs';
const $=s=>document.querySelector(s), el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const CFG=window.BUNSO_CONFIG||{};
const isDesktop=!!window.desktop;
const cloudEnabled=!isDesktop&&!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&window.supabase);
const sb=cloudEnabled?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}}):null;
let authUser=null,lastSyncJson=null;
const local={getItem:k=>{try{return localStorage.getItem(k)}catch{return null}},setItem:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
const storage={getItem:k=>isDesktop?window.desktop.readState():local.getItem(k),setItem:(k,v)=>isDesktop?window.desktop.writeState(v):local.setItem(k,v)};
const STORAGE='bunso-calendar-v1';let state,view=month(today()),editId=null,selected=null,readFailure=false;
function freshState(){return {version:1,created:today(),rules:defaults(),items:{},holidays:{}};}
state=freshState();
function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function save(){if(readFailure){$('#notice').textContent='저장 자료를 읽지 못했습니다. 기존 자료 보호를 위해 저장을 중지했습니다. 관리에서 백업을 불러오세요.';return false;}const json=JSON.stringify(state);if(cloudEnabled){local.setItem(STORAGE,json);if(authUser&&json!==lastSyncJson)queueCloudSave(json);return true;}try{storage.setItem(STORAGE,json);$('#saved').textContent=isDesktop?'이 PC에 저장됨':'이 기기에 저장됨';return true;}catch{$('#notice').textContent='저장하지 못했습니다. 관리 → 백업 저장으로 자료를 보관하세요.';return false;}}
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
 if(month(o.original)!==month(at))b.append(el('span','prior',`${+o.original.slice(5,7)}월`));
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
 try{const value=structuredClone(state.items[o.id]||o);const wasDone=!!value.done;if(wasDone)setCompletion(value,target);else moveOccurrence(value,target);state.items[value.id]=value;pickedItem=null;view=month(target);render();
 document.querySelectorAll('#calendar .task').forEach(r=>{if(r.dataset.itemId===value.id)r.classList.add('placed');});
 toast(wasDone?`${shortDate(target)}로 완료일을 변경했습니다.`:`${shortDate(target)}로 이동했습니다. 미완료 상태와 기존 마감일은 유지됩니다.`);
 }catch(e){toast(e.message);}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){pickedItem=null;updatePick();}});
function render(){
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
function keep(o){if(!state.items[o.id])state.items[o.id]=structuredClone(o);return state.items[o.id];}
function toggle(o){const v=keep(o);if(v.done)v.done=null;else setCompletion(v,today());render();toast(v.done?`${shortDate(v.done)} 완료로 기록했습니다.`:'완료 표시를 취소했습니다.');}
function changeMonth(n){closeDay();let d=date(view+'-01');d.setMonth(d.getMonth()+n);view=month(key(d));render();}
$('#prev').onclick=()=>changeMonth(-1);$('#next').onclick=()=>changeMonth(1);$('#today').onclick=()=>{view=month(today());render();};$('#collapse').onclick=()=>setMode('icon');$('#expand').onclick=()=>setMode('day');
let drag=null;$('#drag').onpointerdown=e=>{if(window.desktop)return;const r=$('#widget').getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};e.target.setPointerCapture(e.pointerId);};$('#drag').onpointermove=e=>{if(!drag)return;const w=$('#widget');w.style.left=Math.max(0,Math.min(innerWidth-w.offsetWidth,e.clientX-drag.x))+'px';w.style.top=Math.max(0,Math.min(innerHeight-w.offsetHeight,e.clientY-drag.y))+'px';w.style.right='auto';};$('#drag').onpointerup=()=>drag=null;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
const form=$('#ruleForm'),f=n=>form.elements.namedItem(n);for(let i=1;i<=31;i++){f('start').add(new Option(i+'일',String(i)));f('deadline').add(new Option(i+'일',String(i)));}f('start').add(new Option('말일','last'));f('deadline').add(new Option('말일','last'));f('deadline').add(new Option('실시 당일','same'));for(let i=1;i<=12;i++)f('annualMonth').add(new Option(i+'월',String(i)));
function formVisibility(){const repeat=f('repeat').value;$('#nthFields').hidden=!['nth','weekly'].includes(repeat);$('#ordinalField').hidden=repeat!=='nth';$('#annualField').hidden=repeat!=='yearly';$('#onceField').hidden=repeat!=='once';$('#startField').hidden=['nth','weekly','once'].includes(repeat);f('deadline').hidden=f('hasDue').value!=='yes';f('once').required=repeat==='once';}
f('repeat').onchange=formVisibility;form.querySelectorAll('[name=hasDue]').forEach(x=>x.onchange=formVisibility);
function openEditor(id=null,onDate=null){editId=id;const r=id?state.rules.find(r=>r.id===id):{title:'',repeat:onDate?'once':'monthly',start:'1',hasDue:false,deadline:'same',miss:'carry',holiday:'previous',note:'',nths:[1],weekday:1,annualMonth:1,once:onDate||today()};form.reset();for(const n of ['title','repeat','start','deadline','miss','holiday','note','weekday','annualMonth','once'])if(r[n]!==undefined)f(n).value=r[n];f('hasDue').value=r.hasDue?'yes':'no';f('nthChoice').value=(r.nths||[1]).join(',');$('#editorTitle').textContent=id?'업무 수정':'업무 추가';$('#editHint').textContent=id?'이번 달 미완료와 이후 일정에 적용합니다. 완료·미실시·지난달 기록은 유지합니다.':'새 업무는 오늘부터 시작합니다. 날짜를 눌러 추가한 일회성 업무는 선택한 날짜에 기록합니다.';formVisibility();$('#editor').showModal();}
$('#add').onclick=()=>openEditor();$('#manageAdd').onclick=()=>openEditor();
form.onsubmit=e=>{e.preventDefault();const r={id:editId||uid(),title:f('title').value.trim(),repeat:f('repeat').value,start:f('start').value,hasDue:f('hasDue').value==='yes',deadline:f('deadline').value,miss:f('miss').value,holiday:f('holiday').value,note:f('note').value.trim(),nths:f('nthChoice').value.split(',').map(Number),weekday:+f('weekday').value,annualMonth:+f('annualMonth').value,once:f('once').value,active:true,from:today()};if(!r.title)return;if(r.repeat==='once'){r.from=r.once;if(r.hasDue&&r.deadline!=='same'&&r.deadline!=='last'&&+r.deadline<+r.once.slice(8)){toast('마감일은 시작일 이후로 정해 주세요.');return;}}if(['monthly','quarterly','yearly'].includes(r.repeat)&&r.hasDue&&r.deadline!=='same'&&r.deadline!=='last'&&(r.start==='last'||+r.deadline<+r.start)){toast('마감일은 시작일 이후로 정해 주세요.');return;}
if(editId){const old=state.rules.find(x=>x.id===editId);r.from=old.from;r.active=old.active;state.rules=state.rules.map(x=>x.id===editId?r:x);for(const [id,o]of Object.entries(state.items)){if(o.ruleId===editId&&month(o.original)>=month(today())&&!o.done&&!o.movedTo&&!['missed','excluded'].includes(status(o))&&!o.deleted)delete state.items[id];}}
else state.rules.push(r);sync(state);if(r.repeat==='once'&&!state.items[r.id+':'+r.once])for(const o of occurrences(r,month(r.once),state.holidays))state.items[o.id]=o;$('#editor').close();render();renderRules();toast('업무를 저장했습니다.');};
const repeatNames={monthly:'매월',quarterly:'분기',yearly:'매년',nth:'매월 특정 요일',weekly:'매주 특정 요일',once:'일회성'};
function ruleSummary(r){let when=r.repeat==='once'?r.once:r.repeat==='nth'?r.nths.join('·')+'번째 '+'일월화수목금토'[r.weekday]+'요일':r.repeat==='weekly'?'매주 '+'일월화수목금토'[r.weekday]+'요일':(r.repeat==='yearly'?r.annualMonth+'월 ':'')+(r.start==='last'?'말일':r.start+'일');return `${repeatNames[r.repeat]} · ${when} · ${r.hasDue?'마감 '+(r.deadline==='last'?'말일':r.deadline==='same'?'당일':r.deadline+'일'):'마감 없음'}`;}
function renderRules(){const list=$('#rules');list.replaceChildren();for(const r of state.rules){const row=el('div','rule'+(!r.active?' inactive':''));const info=el('div','ruleinfo');info.append(el('strong','',r.title),el('p','',ruleSummary(r)));row.append(info);let b=el('button','','수정');b.onclick=()=>openEditor(r.id);row.append(b);b=el('button','',r.active?'중지':'다시 사용');b.onclick=async()=>{if(r.active&&!await confirmAction('앞으로 반복되는 일정을 중지할까요?\n이미 지난 업무와 완료 기록은 남습니다.'))return;r.active=!r.active;if(!r.active){for(const [id,o]of Object.entries(state.items))if(o.ruleId===r.id&&plannedDate(o)>today()&&!o.done&&!o.movedTo)delete state.items[id];}else{for(const o of occurrences(r,month(today()),state.holidays))if(o.scheduled>=today()&&!state.items[o.id])state.items[o.id]=o;}render();renderRules();};row.append(b);list.append(row);}renderHolidayList();}
$('#manage').onclick=()=>{renderRules();$('#management').showModal();};
$('#summary').onclick=$('#daySummary').onclick=()=>{renderSummary();$('#summaryDialog').showModal();};
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
function openDetail(o){o=state.items[o.id]||o;selected=o;$('#detailTitle').textContent=o.title;const box=$('#detailBody');box.replaceChildren();const st=status(o);const labels={open:'미완료',late:'미완료 · 마감 경과',done:'완료',missed:'미실시',excluded:'휴일 제외'};for(const [a,b]of [['원래 예정일',o.scheduled],...(o.movedTo?[['변경한 예정일',o.movedTo]]:[]),['마감일',o.due||'없음'],['상태',labels[st]],...(o.done?[['완료일',o.done]]:[])]){const row=el('div','detailrow');row.append(el('span','',a),el('span','',b));box.append(row);}const label=el('label','','메모');const area=el('textarea');area.rows=3;area.maxLength=2000;area.value=o.note;area.placeholder='업무 메모';area.onchange=()=>{keep(o).note=area.value;save();};label.append(area);box.append(label);$('#toggleItem').textContent=o.done?'완료 취소':'오늘 완료';$('#toggleItem').hidden=st==='excluded';$('#detail').showModal();}
$('#moveItem').onclick=()=>{const o=selected;$('#detail').close();openMove(o,o.done||plannedDate(o));};
$('#toggleItem').onclick=()=>{toggle(selected);$('#detail').close();};$('#editRule').onclick=()=>{const id=selected.ruleId;$('#detail').close();openEditor(id);};$('#removeItem').onclick=async()=>{if(await confirmAction('이번 회차의 업무를 삭제할까요? 다음 반복 일정은 유지됩니다.')){keep(selected).deleted=true;$('#detail').close();render();}};
async function download(){if(window.desktop){try{if(await window.desktop.backup(JSON.stringify(state,null,2)))toast('백업 파일을 저장했습니다.');}catch{toast('백업 저장에 실패했습니다. 저장 위치를 확인해 주세요.');}return;}const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=el('a');a.href=URL.createObjectURL(blob);a.download='분소업무_백업_'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('백업 파일을 저장했습니다.');}
$('#backup').onclick=download;$('#restore').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>15000000)throw Error();const s=JSON.parse(await file.text());if(!validState(s))throw Error();if(!await confirmAction('백업 자료로 현재 일정을 교체할까요?\n현재 자료가 필요하면 먼저 백업 저장을 해 주세요.'))return;state=s;readFailure=false;$('#notice').textContent='';render();renderRules();toast('백업을 불러왔습니다.');}catch{toast('올바른 분소 업무 백업 파일이 아닙니다. 현재 자료는 유지됩니다.');}finally{e.target.value='';}};
function renderHolidayList(){const box=$('#holidayList');box.replaceChildren();for(const [d,n]of Object.entries(state.holidays).sort()){const row=el('div','holidayrow',d+' · '+(n||'평일로 변경'));const b=el('button','','설정 해제');b.onclick=()=>{delete state.holidays[d];refreshHolidays();};row.append(b);box.append(row);}}
function refreshHolidays(){for(const [id,o]of Object.entries(state.items))if(!o.done&&!o.deleted&&!o.movedTo&&o.scheduled>=today())delete state.items[id];render();renderRules();toast('휴일 설정을 반영했습니다.');}
$('#holidaySave').onclick=()=>{let d=$('#holidayDate').value,n=$('#holidayName').value.trim();if(!d||!n){toast('날짜와 휴일 이름을 입력해 주세요.');return;}state.holidays[d]=n;refreshHolidays();};$('#holidayWorking').onclick=()=>{const d=$('#holidayDate').value;if(!d){toast('날짜를 선택해 주세요.');return;}state.holidays[d]='';refreshHolidays();};
window.addEventListener('storage',e=>{if(e.key===STORAGE&&e.newValue){try{const s=JSON.parse(e.newValue);if(validState(s)){state=s;render();}}catch{}}});let lastDay=today();setInterval(()=>{if(lastDay!==today()){lastDay=today();render();}},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastDay=today();render();}});

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
 try{const value=structuredClone(state.items[moveItem.id]||moveItem);if(action==='complete')setCompletion(value,target);else moveOccurrence(value,target);state.items[value.id]=value;view=month(action==='complete'?target:displayDate(value));$('#moveDialog').close();render();toast(action==='complete'?`${shortDate(target)} 완료로 기록했습니다.`:'이번 회차의 예정일을 변경했습니다.');}
 catch(error){toast(error.message);}
};
function setMode(mode,notify=true){if(!['icon','day','month'].includes(mode))return;pickedItem=null;updatePick();closeDay();document.body.dataset.mode=mode;$('#app').hidden=false;$('#widget').hidden=false;if(mode==='day')render();if(mode==='month'){view=month(today());render();}if(notify)window.desktop?.setMode(mode);}
$('#showMonth').onclick=()=>setMode('month');$('#showDay').onclick=()=>setMode('day');$('#dayAdd').onclick=()=>openEditor(null,today());$('#dayManage').onclick=()=>{renderRules();$('#management').showModal();};$('#quit').onclick=()=>window.desktop?.quit();$('#pin').onclick=()=>window.desktop?.togglePin();
window.desktop?.onMode(m=>setMode(m,false));window.desktop?.onPin(v=>{$('#pin').classList.toggle('pinned',v);$('#pin').title=v?'항상 위 켜짐':'항상 위 꺼짐';});
let panelOpen=false;new MutationObserver(()=>{const open=!!document.querySelector('dialog[open]');if(open!==panelOpen){panelOpen=open;window.desktop?.panel(open);}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});

// ===== 클라우드(Supabase) 로그인 · 동기화 =====
let saveTimer=null,pendingJson=null,saving=false;
function queueCloudSave(json){pendingJson=json;$('#saved').textContent='저장 중…';clearTimeout(saveTimer);saveTimer=setTimeout(flushCloud,800);}
async function flushCloud(){
 if(!authUser||saving||pendingJson==null)return;
 const json=pendingJson;pendingJson=null;saving=true;
 try{const {error}=await sb.from('calendar_state').upsert({user_id:authUser.id,data:JSON.parse(json),updated_at:new Date().toISOString()});if(error)throw error;lastSyncJson=json;$('#saved').textContent='클라우드에 저장됨 ✓';}
 catch(e){$('#saved').textContent='⚠ 저장 실패(네트워크) · 이 기기에 임시 보관';}
 finally{saving=false;if(pendingJson!=null)flushCloud();}
}
async function cloudLoad(){
 const {data,error}=await sb.from('calendar_state').select('data').eq('user_id',authUser.id).maybeSingle();
 if(error)throw error;
 if(data&&data.data&&validState(data.data)){state=data.data;lastSyncJson=JSON.stringify(state);local.setItem(STORAGE,lastSyncJson);return;}
 state=freshState();lastSyncJson=JSON.stringify(state);
 await sb.from('calendar_state').upsert({user_id:authUser.id,data:state,updated_at:new Date().toISOString()});
 local.setItem(STORAGE,lastSyncJson);
}
async function refreshFromCloud(){
 if(!authUser||saving||pendingJson!=null)return;
 try{const {data}=await sb.from('calendar_state').select('data').eq('user_id',authUser.id).maybeSingle();
 if(data&&data.data&&validState(data.data)){const json=JSON.stringify(data.data);if(json!==lastSyncJson){state=data.data;lastSyncJson=json;local.setItem(STORAGE,json);render();}}}catch{}
}
function showLogin(){$('#login').hidden=false;document.body.classList.add('locked');setTimeout(()=>$('#loginEmail')?.focus(),50);}
function hideLogin(){$('#login').hidden=true;document.body.classList.remove('locked');}
async function doLogout(){try{await sb.auth.signOut();}catch{}authUser=null;lastSyncJson=null;location.reload();}
async function afterLogin(){
 try{await cloudLoad();}catch(e){const raw=local.getItem(STORAGE);if(raw){try{const s=JSON.parse(raw);if(validState(s)){state=s;lastSyncJson=raw;}}catch{}}$('#saved').textContent='⚠ 클라우드 연결 실패 · 이 기기 자료로 표시';}
 hideLogin();startApp();resetLockTimer();
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
$('#lockBtn')?.addEventListener('click',()=>{if(cloudEnabled&&authUser)doLogout();});
let lockTimer=null;const AUTO=(+CFG.AUTO_LOCK_MINUTES||0);
function resetLockTimer(){if(!cloudEnabled||!AUTO||!authUser)return;clearTimeout(lockTimer);lockTimer=setTimeout(doLogout,AUTO*60000);}
if(cloudEnabled&&AUTO)['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(!document.hidden)resetLockTimer();}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&cloudEnabled&&authUser){resetLockTimer();refreshFromCloud();}});
window.addEventListener('online',()=>{if(cloudEnabled&&authUser){if(pendingJson!=null)flushCloud();else refreshFromCloud();}});
async function boot(){
 if(isDesktop){try{const raw=storage.getItem(STORAGE);if(raw){const s=JSON.parse(raw);if(!validState(s))throw Error('invalid');state=s;}}catch{readFailure=true;}render();return;}
 if(!cloudEnabled){try{const raw=local.getItem(STORAGE);if(raw){const s=JSON.parse(raw);if(!validState(s))throw Error('invalid');state=s;}}catch{readFailure=true;}startApp();return;}
 try{const {data:{session}}=await sb.auth.getSession();if(session){authUser=session.user;await afterLogin();return;}}catch{}
 showLogin();
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
