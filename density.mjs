export function metricsFor(width,height,mode='day'){
 if(mode==='month')return {'task-font':12,'task-row':32,'task-pad':5,'task-gap':5,'check-size':13,'date-font':19,'bar-height':34,'bar-pad':10,'day-pad':10,'bottom-pad':8,'ui-font':12,'month-font':12,'month-check':13,'month-cell':90,'month-pad':4,'month-date':22};
 const factor=Math.max(.5,Math.min(1.15,width/(mode==='month'?900:460),height/(mode==='month'?700:540)));
 const px=(base,min,max)=>Math.max(min,Math.min(max,Math.round(base*factor)));
 return {'task-font':px(16,10,18),'task-row':px(58,26,64),'task-pad':px(16,5,18),'task-gap':px(13,4,15),'check-size':px(19,11,21),'date-font':px(23,13,26),'bar-height':px(46,26,50),'bar-pad':px(12,5,14),'day-pad':px(18,6,20),'bottom-pad':px(13,4,15),'ui-font':px(14,10,16),'month-font':px(14,9,16),'month-check':px(15,10,17),'month-cell':px(116,68,150),'month-pad':px(6,2,7),'month-date':px(25,16,29)};
}
if(typeof window!=='undefined'){
 const apply=()=>{for(const [name,value]of Object.entries(metricsFor(window.innerWidth,window.innerHeight,document.body.dataset.mode)))document.documentElement.style.setProperty('--'+name,value+'px');};
 apply();new MutationObserver(apply).observe(document.body,{attributes:true,attributeFilter:['data-mode']});let pending=false;window.addEventListener('resize',()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;apply();});}});
}
