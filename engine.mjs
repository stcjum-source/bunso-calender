import {HOLIDAYS} from './holidays.js';
export const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const date=s=>new Date(s+'T12:00:00');
export const today=()=>key(new Date());
export const month=s=>s.slice(0,7);
export const uid=()=>crypto.randomUUID();
export function holiday(s,custom={}) {return Object.hasOwn(custom,s)?custom[s]:(HOLIDAYS[s]||'');}
export function off(s,custom={}) {return [0,6].includes(date(s).getDay())||!!holiday(s,custom);}
export function previous(s,custom) {let d=date(s); while(off(key(d),custom))d.setDate(d.getDate()-1);return key(d);}
function biweeklyAnchor(r){const wd=+r.weekday;let d=date(r.from||today());const add=((wd-d.getDay())+7)%7;d.setDate(d.getDate()+add);return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());}
export function scheduled(r,ym){
 const [y,m]=ym.split('-').map(Number);const last=new Date(y,m,0).getDate();
 const at=n=>`${ym}-${String(n==='last'?last:Math.min(last,+n)).padStart(2,'0')}`;
 let out;
 if(r.repeat==='once')out=month(r.once)===ym?[r.once]:[];
 else if(r.repeat==='quarterly')out=[1,4,7,10].includes(m)?[at(r.start)]:[];
 else if(r.repeat==='yearly')out=m===+r.annualMonth?[at(r.start)]:[];
 else if(r.repeat==='nth')out=r.nths.map(n=>1+(+r.weekday-new Date(y,m-1,1).getDay()+7)%7+(n-1)*7).filter(n=>n<=last).map(at);
 else if(r.repeat==='weekly'){out=[];const first=1+(+r.weekday-new Date(y,m-1,1).getDay()+7)%7;for(let d=first;d<=last;d+=7)out.push(at(d));}
 else if(r.repeat==='biweekly'){out=[];const anchor=biweeklyAnchor(r);const first=1+(+r.weekday-new Date(y,m-1,1).getDay()+7)%7;for(let d=first;d<=last;d+=7){const wk=Math.round((Date.UTC(y,m-1,d)-anchor)/604800000);if(wk>=0&&wk%2===0)out.push(at(d));}}
 else out=[at(r.start)];
 if(r.until)out=out.filter(o=>o<=r.until);
 return out;
}
export function occurrences(r,ym,custom={}){return scheduled(r,ym).map(original=>{let scheduled=original;const excluded=r.holiday==='skip'&&off(original,custom);let due=r.hasDue?(r.deadline==='same'?original:`${ym}-${String(r.deadline==='last'?new Date(+ym.slice(0,4),+ym.slice(5),0).getDate():Math.min(+r.deadline,new Date(+ym.slice(0,4),+ym.slice(5),0).getDate())).padStart(2,'0')}`):null;
if(r.holiday==='previous'){if(!due||due===original)scheduled=previous(original,custom);if(due)due=previous(due,custom);if(due&&scheduled>due)scheduled=due;}
return {id:r.id+':'+original,ruleId:r.id,title:r.title,original,scheduled,due,miss:r.miss,excluded,note:r.note||'',done:null,deleted:false};});}
export const plannedDate=o=>o.movedTo||o.scheduled;
export function status(o,now=today()){if(o.done)return 'done';if(o.excluded)return 'excluded';if(o.miss==='close'&&plannedDate(o)<now)return 'missed';if(o.due&&o.due<now)return 'late';return 'open';}
export function displayDate(o,now=today()){if(o.done)return o.done;let s=status(o,now);if(s==='excluded'||s==='missed')return plannedDate(o);return plannedDate(o)<now?now:plannedDate(o);}
export function defaults(now=today()) {const make=(title,start,extras={})=>({id:uid(),title,start:String(start),repeat:'monthly',hasDue:false,deadline:'same',holiday:'previous',miss:'carry',note:'',active:true,from:month(now)+'-01',...extras});return [make('운영자재 청구',20,{hasDue:true,deadline:'last',note:'기안문서 작성'}),make('휴가계획 조사',20,{note:'휴가계획표 인쇄 후 조사'}),make('작업계획표','last'),make('정전 일정','last',{note:'전자게시판 → 월별 정전(급전)계획 확인'}),make('근태기록부',1,{hasDue:true,deadline:'7',note:'근태관리 기록부 송부'}),make('교통비',1,{hasDue:true,deadline:'7',note:'교통비 송부'}),make('ERP 기술적 완료',1),make('운영비 집행',1,{hasDue:true,deadline:'10'}),make('운영비 서류',1,{hasDue:true,deadline:'15',note:'담당자에게 사용내역 및 물품검사조서 송부'}),make('PC 보안점검',1,{repeat:'nth',nths:[3],weekday:3,holiday:'keep',miss:'close'}),make('연산 청소',1,{repeat:'nth',nths:[1,3],weekday:1,holiday:'skip',miss:'close'}),make('미남 청소',1,{repeat:'nth',nths:[2,4],weekday:3,holiday:'skip',miss:'close'}),make('분소비',20),make('분기점검 보고',1,{repeat:'quarterly',hasDue:true,deadline:'7'}),make('연간점검 보고',1),make('4년점검 보고',1)];}
export function sync(state,now=today()){let changed=false;for(const r of state.rules){if(!r.active)continue;let m=r.from.slice(0,7);const end=month(now);while(m<=end){for(const o of occurrences(r,m,state.holidays)){if(o.original>=r.from&&!state.items[o.id]){state.items[o.id]=o;changed=true;}}let d=date(m+'-01');d.setMonth(d.getMonth()+1);m=month(key(d));}}return changed;}
export function projected(state,ym,now=today()){let out=Object.values(state.items);if(ym>=month(now)){for(const r of state.rules.filter(r=>r.active))for(const o of occurrences(r,ym,state.holidays))if(o.original>=r.from&&!state.items[o.id])out.push(o); // next-month dates shifted backward into this month
}let next=date(ym+'-01');next.setMonth(next.getMonth()+1);const nextYM=month(key(next));if(nextYM>month(now))for(const r of state.rules.filter(r=>r.active))for(const o of occurrences(r,nextYM,state.holidays))if(o.original>=r.from&&month(plannedDate(o))===ym&&!state.items[o.id])out.push(o);
return out.filter(o=>!o.deleted&&month(displayDate(o,now))===ym).sort((a,b)=>a.scheduled.localeCompare(b.scheduled)||a.title.localeCompare(b.title));}
export const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(date(s))&&key(date(s))===s;
export function calendarEntries(state,ym,now=today()){
 const records=new Map(projected(state,ym,now).map(o=>[o.id,o]));
 for(const o of Object.values(state.items))if(!o.deleted&&(o.done||o.movedTo)&&(month(plannedDate(o))===ym||month(o.scheduled)===ym))records.set(o.id,o);
 const entries=[];
 for(const o of records.values()){
  const actual=o.done||o.movedTo||displayDate(o,now);
  if(month(actual)===ym)entries.push({item:o,date:actual,reference:false});

 }
 return entries.sort((a,b)=>a.date.localeCompare(b.date)||a.item.scheduled.localeCompare(b.item.scheduled)||a.item.title.localeCompare(b.item.title));
}
export function setCompletion(o,completedOn,now=today()){
 if(!validDate(completedOn)||completedOn>now)throw new Error('완료일은 오늘 또는 이전 날짜로 선택해 주세요.');
 o.done=completedOn;
 return o;
}
export function moveOccurrence(o,target){
 if(!validDate(target))throw new Error('올바른 날짜를 선택해 주세요.');
 if(o.done)throw new Error('완료한 업무는 완료일 변경을 사용해 주세요.');
 o.movedTo=target;o.excluded=false;
 return o;
}
export function validState(s){const ds=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(date(v))&&key(date(v))===v;const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);if(!obj(s)||s.version!==1||!Array.isArray(s.rules)||s.rules.length>2000||!obj(s.items)||!obj(s.holidays)||!ds(s.created))return false;let ids=new Set();for(const r of s.rules){if(!obj(r)||typeof r.id!=='string'||ids.has(r.id)||typeof r.title!=='string'||!r.title.trim()||!ds(r.from)||!['monthly','quarterly','yearly','nth','weekly','biweekly','once'].includes(r.repeat)||!['carry','close'].includes(r.miss)||!['previous','keep','skip'].includes(r.holiday)||typeof r.active!=='boolean'||typeof r.hasDue!=='boolean'||typeof r.note!=='string')return false;ids.add(r.id);if(r.start!=='last'&&!(+r.start>=1&&+r.start<=31))return false;if(!['last','same'].includes(r.deadline)&&!(+r.deadline>=1&&+r.deadline<=31))return false;if(r.repeat==='once'&&!ds(r.once))return false;if(r.repeat==='yearly'&&!(+r.annualMonth>=1&&+r.annualMonth<=12))return false;if(r.repeat==='nth'&&(!Array.isArray(r.nths)||!r.nths.length||!r.nths.every(n=>Number.isInteger(n)&&n>=1&&n<=5)||!(r.weekday>=0&&r.weekday<=6)))return false;if((r.repeat==='weekly'||r.repeat==='biweekly')&&!(r.weekday>=0&&r.weekday<=6))return false;if(r.until!==undefined&&r.until!==null&&r.until!==''&&!ds(r.until))return false;}
for(const [k,o]of Object.entries(s.items)){if(!obj(o)||o.id!==k||!ids.has(o.ruleId)||typeof o.title!=='string'||!ds(o.original)||!ds(o.scheduled)||(o.due!==null&&!ds(o.due))||(o.done!==null&&!ds(o.done))||!['carry','close'].includes(o.miss)||typeof o.excluded!=='boolean'||typeof o.deleted!=='boolean'||typeof o.note!=='string'||(o.movedTo!==undefined&&!ds(o.movedTo)))return false;}return Object.entries(s.holidays).every(([d,n])=>ds(d)&&typeof n==='string'&&n.length<=100);}
