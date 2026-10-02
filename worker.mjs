export const day = (offset=0) => new Date(Date.now()+25200000+offset*86400000).toISOString().slice(0,10);
const enc=new TextEncoder();
const BOT_USERNAME='SmartLoanCambodiabot';
const staffConfigured=env=>/^-\d+$/.test(env.STAFF_CHAT_ID||'');
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
async function mac(key,value){const k=await crypto.subtle.importKey('raw',typeof key==='string'?enc.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',k,enc.encode(value));}
function equal(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function authenticate(raw,token){
 if(typeof raw!=='string'||raw.length>12000)throw Error('auth');
 const p=new URLSearchParams(raw);if([...p.keys()].length!==new Set(p.keys()).size)throw Error('auth');
 const hash=p.get('hash');p.delete('hash');p.sort();
 const expected=hex(await mac(await mac('WebAppData',token),[...p].map(([k,v])=>`${k}=${v}`).join('\n')));
 if(!equal(hash,expected))throw Error('auth');
 const age=Date.now()/1000-Number(p.get('auth_date'));
 if(!p.get('auth_date')||!Number.isFinite(age)||age>7200||age< -60)throw Error('auth');
 const user=JSON.parse(p.get('user')||'null');if(!Number.isSafeInteger(user?.id)||user.id<=0)throw Error('auth');return user;
}
export function validate(d){
 const limits={name:80,phone:30,location:100,purpose:120,duration:50,note:500};
 for(const [k,n] of Object.entries(limits)){if(typeof d[k]!=='string'||d[k].length>n|| (k!=='note'&&!d[k].trim())||(k==='note'?/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/:/[\u0000-\u001f]/).test(d[k]))throw Error('fields');d[k]=d[k].trim();}
 if(!/^[+\d ()-]{7,30}$/.test(d.phone)||d.phone.replace(/\D/g,'').length<7||!['employee','business'].includes(d.customerType)||!['km','zh','en'].includes(d.language)||d.consent!==true)throw Error('fields');
 for(const k of ['amount','income']){if(typeof d[k]!=='string'||!/^\d{1,9}(\.\d{1,2})?$/.test(d[k])||Number(d[k])< (k==='amount'?1:0))throw Error('fields');}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.appointmentDate)||!Number.isFinite(Date.parse(d.appointmentDate))||new Date(d.appointmentDate).toISOString().slice(0,10)!==d.appointmentDate||d.appointmentDate<day(1)||d.appointmentDate>day(90)||!['09:00–12:00','12:00–15:00','15:00–18:00'].includes(d.appointmentTime))throw Error('fields');
 return d;
}
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
function json(d,status=200){return new Response(JSON.stringify(d),{status,headers:{...headers,'content-type':'application/json'}});}
function html(s){return new Response(s,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'"}});}
async function telegram(env,method,body){const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const d=await r.json();if(!r.ok||!d.ok)throw Error('telegram');return d.result;}
async function body(request){const s=await request.text();if(enc.encode(s).length>20000)throw Error('size');return JSON.parse(s);}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='GET'&&path==='/')return html(HTML);
 if(request.method==='GET'&&path==='/setup')return html(SETUP);
 if(request.method==='GET'&&path==='/health'){
  if(!env.TELEGRAM_BOT_TOKEN||!staffConfigured(env))return json({ok:false,stage:'configuration',tokenConfigured:!!env.TELEGRAM_BOT_TOKEN,staffChatConfigured:staffConfigured(env)});
  try{
   const me=await telegram(env,'getMe',{});
   const chat=await telegram(env,'getChat',{chat_id:env.STAFF_CHAT_ID});
   const member=await telegram(env,'getChatMember',{chat_id:env.STAFF_CHAT_ID,user_id:me.id});
   return json({ok:true,bot:'@'+me.username,chatType:chat.type,chatTitle:chat.title||'',memberStatus:member.status,canSend:member.status!=='left'&&member.status!=='kicked'&&!(member.status==='restricted'&&(!member.is_member||!member.can_send_messages))});
  }catch{return json({ok:false,stage:'telegram_connection'});}
 }
 if(request.method!=='POST'||!['/submit','/setup','/telegram'].includes(path))return json({ok:false},404);
 if(!env.TELEGRAM_BOT_TOKEN)return json({ok:false,error:'not_configured'},503);
 if(path!=='/telegram'&&request.headers.get('origin')!==url.origin)return json({ok:false,error:'origin'},403);
 try{
 if(path==='/setup'){
  if(!equal(request.headers.get('authorization'),`Bearer ${env.TELEGRAM_BOT_TOKEN}`))return json({ok:false,error:'unauthorized'},401);
  const me=await telegram(env,'getMe',{});
  if(me.username?.toLowerCase()!==BOT_USERNAME.toLowerCase())return json({ok:false,error:'wrong_bot'},400);
  if(env.STAFF_CHAT_ID&&!staffConfigured(env))return json({ok:false,error:'chat_id'},400);
  if(staffConfigured(env)){
   const chat=await telegram(env,'getChat',{chat_id:env.STAFF_CHAT_ID});
   if(!['group','supergroup'].includes(chat.type))return json({ok:false,error:'chat_id'},400);
   const member=await telegram(env,'getChatMember',{chat_id:env.STAFF_CHAT_ID,user_id:me.id});
   if(['left','kicked'].includes(member.status)||(member.status==='restricted'&&(!member.is_member||!member.can_send_messages))||(member.status==='member'&&chat.permissions?.can_send_messages===false))return json({ok:false,error:'chat_permission'},400);
  }
  await telegram(env,'setWebhook',{url:url.origin+'/telegram',secret_token:hex(await mac(env.TELEGRAM_BOT_TOKEN,'webhook')),allowed_updates:['message']});
  if(!staffConfigured(env))return json({ok:true,pending:true});
  await telegram(env,'setChatMenuButton',{menu_button:{type:'web_app',text:'Apply / 预约',web_app:{url:url.origin}}});
  return json({ok:true,link:`https://t.me/${me.username}?start=apply`});
 }
 if(path==='/telegram'){
  if(!equal(request.headers.get('x-telegram-bot-api-secret-token'),hex(await mac(env.TELEGRAM_BOT_TOKEN,'webhook'))))return json({ok:false},401);
  const u=await body(request),m=u.message;
  if(['group','supergroup'].includes(m?.chat?.type)&&new RegExp('^/chatid(?:@'+BOT_USERNAME+')?(?:\\s|$)','i').test(m.text||''))await telegram(env,'sendMessage',{chat_id:m.chat.id,text:'STAFF_CHAT_ID: '+m.chat.id+'\n请仅将此数字填入 Cloudflare 的 STAFF_CHAT_ID。不要在群内发送 Token。'});
  if(m?.chat?.type==='private'&&/^\/start(?:\s|$)/.test(m.text||''))await telegram(env,'sendMessage',{chat_id:m.chat.id,text:'SAMBOR FINANCE\nសូមចុចប៊ូតុងខាងក្រោមដើម្បីណាត់ជួប។\nPlease open the form to request an appointment.\n点击下方填写资料及预约。',reply_markup:{inline_keyboard:[[{text:'📝 Apply / 预约 / ណាត់ជួប',web_app:{url:url.origin}}]]}});
  return json({ok:true});
 }
 if(!staffConfigured(env))return json({ok:false,error:'not_configured'},503);
 const d=await body(request);
 try{validate(d);}catch{return json({ok:false,error:'fields'},400);}
 const fields=['name','phone','location','customerType','amount','purpose','income','duration','appointmentDate','appointmentTime','note','language'];
 const ref='SF-'+hex(await mac(env.TELEGRAM_BOT_TOKEN,JSON.stringify(fields.map(k=>d[k])))).slice(0,12).toUpperCase();
 const text=['📋 预约申请 / APPOINTMENT '+ref,`姓名 / Name: ${d.name}`,`电话 / Phone: ${d.phone}`,`地区 / Area: ${d.location}`,`类型 / Type: ${d.customerType}`,`需要金额 / Amount USD: ${d.amount}`,`用途 / Purpose: ${d.purpose}`,`${d.customerType==='employee'?'工资 / Salary':'营业额 / Turnover'} USD/month: ${d.income}`,`年资 / Duration: ${d.duration}`,`预约 / Requested: ${d.appointmentDate} ${d.appointmentTime} (Cambodia UTC+7)`,`备注 / Note: ${d.note||'-'}`,`语言 / Language: ${d.language}`,'来源 / Source: Web application','已同意资料用于咨询及联系 / Contact consent received','待工作人员联系确认；不是贷款批准。','相同编号请作为同一申请处理 / Same reference = same request.'].join('\n');
 await telegram(env,'sendMessage',{chat_id:env.STAFF_CHAT_ID,text,protect_content:true});
 return json({ok:true,ref});
 }catch{return json({ok:false,error:'delivery_failed'},502);}
}};
const SETUP=`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接 SmartLoan Bot</title><style>body{font:17px system-ui;max-width:560px;margin:30px auto;padding:20px;line-height:1.6}input,button{box-sizing:border-box;width:100%;padding:14px;margin:12px 0}#result{white-space:pre-wrap}</style><h1>连接 SmartLoan Bot</h1><p>指定机器人：@SmartLoanCambodiabot<br>工作人员群组：SAMBOR FINANCE</p><ol><li>在 Worker 设置中保存 TELEGRAM_BOT_TOKEN（Secret）。</li><li>还没有群组 ID？先点击下方“连接”，再在工作人员群发送 <b>/chatid@SmartLoanCambodiabot</b>。</li><li>把机器人回复的数字保存为 STAFF_CHAT_ID（Secret），部署生效后，返回这里再次连接。</li></ol><p>连接会替换此 Bot 原有 webhook 和默认菜单。仅在自己的正式 Worker 地址操作，旧 Bot 程序应停止。</p><form><label for="token">Bot Token（与 Secret 相同）</label><input id="token" type="password" autocomplete="off" required><button>连接 / 完成配置</button></form><p id="result" role="status"></p><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const i=document.querySelector('input'),b=document.querySelector('button'),out=document.getElementById('result');b.disabled=true;out.textContent='连接中…';try{const token=i.value.trim();i.value='';const r=await fetch('/setup',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const d=await r.json();const errors={wrong_bot:'Token 不属于 @SmartLoanCambodiabot。',chat_id:'STAFF_CHAT_ID 必须是工作人员群组的负数 ID。',chat_permission:'机器人不在该群组内，或没有发言权限。',unauthorized:'输入的 Token 与 Cloudflare Secret 不一致。',not_configured:'请先保存 TELEGRAM_BOT_TOKEN Secret 并部署。'};out.textContent=d.ok?(d.pending?'第一步完成，尚未启用申请收件。请在 SAMBOR FINANCE 群发送 /chatid@SmartLoanCambodiabot；保存回复的 STAFF_CHAT_ID 后，再次连接。':'配置成功。广告入口：'+d.link+'。请使用虚构资料提交并确认群组收件后，才投放广告。'):(errors[d.error]||'连接未完成，请检查 Token、群组 ID 和权限后重试。')}catch{out.textContent='未能确认连接结果，请检查网络后重试。'}finally{i.value='';b.disabled=false}};</script></html>`;

const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAMBOR FINANCE</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#17202a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
.wrap{max-width:560px;margin:auto;padding:18px}.card{background:#fff;border-radius:18px;padding:22px;box-shadow:0 5px 22px #00000012}
h1{font-size:24px;margin:0 0 5px}p{color:#66717c;line-height:1.45}.langs,.types{display:grid;gap:8px;margin:16px 0}.langs{grid-template-columns:repeat(3,1fr)}.types{grid-template-columns:1fr 1fr}
button{border:1px solid #d7dde3;background:#fff;border-radius:11px;padding:12px;font-weight:650}.active{border-color:#1677ff;background:#eef6ff}
label{display:block;font-size:14px;font-weight:650;margin:14px 0 6px}input,select,textarea{width:100%;padding:13px;border:1px solid #d7dde3;border-radius:10px;background:#fff;font-size:16px}
.submit{width:100%;margin-top:20px;border:0;background:#1677ff;color:#fff;padding:15px;font-size:17px}.small{font-size:12px}.hidden{display:none}.success{text-align:center;padding:36px 8px}
</style>
</head>
<body><div class="wrap"><div class="card">
<div id="formBox"><h1>SAMBOR FINANCE</h1><p id="intro"></p>
<div class="langs"><button id="kmBtn" type="button">ខ្មែរ</button><button id="enBtn" type="button">English</button><button id="zhBtn" type="button">中文</button></div>
<form id="loanForm">
<label data-k="name"></label><input name="name" required maxlength="80">
<label data-k="phone"></label><input name="phone" type="tel" required maxlength="30">
<label data-k="location"></label><input name="location" required maxlength="100">
<label data-k="type"></label><div class="types"><button id="empBtn" type="button"></button><button id="bizBtn" type="button"></button></div>
<input id="customerType" name="customerType" type="hidden">
<label data-k="amount"></label><input name="amount" type="number" min="1" max="999999999" step="0.01" required>
<label data-k="purpose"></label><input name="purpose" required maxlength="120">
<label id="incomeLabel"></label><input name="income" type="number" min="0" max="999999999" step="0.01" required>
<label id="durationLabel"></label><input name="duration" required maxlength="50">
<label data-k="date"></label><input name="appointmentDate" type="date" required>
<label data-k="time"></label><select name="appointmentTime" required><option value="">—</option><option>09:00–12:00</option><option>12:00–15:00</option><option>15:00–18:00</option></select>
<label data-k="note"></label><textarea name="note" rows="3" maxlength="500"></textarea>
<p class="small" data-k="notice"></p><label style="display:flex;gap:10px"><input style="width:20px" id="consent" type="checkbox" required><span id="consentText"></span></label><p id="errorBox" role="alert"></p><button id="submitBtn" class="submit" type="submit"></button>
</form></div>
<div id="successBox" class="success hidden"><h1>✓</h1><h2 id="successTitle"></h2><p id="successText"></p></div>
</div></div>
<script>
const T={
en:{intro:"Loan consultation & appointment",name:"Full name",phone:"Phone number",location:"Location",type:"Employment type",emp:"Employee / Salaried",biz:"Business / Self-employed",amount:"Requested amount (USD)",purpose:"Purpose of funds",salary:"Monthly salary (USD)",turnover:"Approx. monthly business turnover (USD)",work:"How long have you worked there?",operate:"How long has the business operated?",date:"Preferred appointment date",time:"Preferred appointment time",note:"Additional note (optional)",notice:"This form is for consultation and appointment only. Loan terms remain subject to formal assessment.",submit:"Submit appointment request",ok:"Submitted",oktext:"Our staff will contact you to confirm the appointment."},
zh:{intro:"贷款咨询与预约",name:"姓名",phone:"电话号码",location:"居住地区",type:"工作类型",emp:"上班族 / 受薪人士",biz:"生意 / 自雇人士",amount:"需要金额（美元）",purpose:"资金用途",salary:"每月工资（美元）",turnover:"每月营业额约（美元）",work:"工作多久？",operate:"生意经营多久？",date:"希望预约日期",time:"希望预约时间",note:"其他备注（可选）",notice:"提交此表仅代表贷款咨询及预约；实际贷款条件仍须经过正式审核。",submit:"提交预约",ok:"提交成功",oktext:"工作人员将联系您确认预约时间。"},
km:{intro:"ការប្រឹក្សា និងការណាត់ជួបឥណទាន",name:"ឈ្មោះពេញ",phone:"លេខទូរស័ព្ទ",location:"ទីតាំងស្នាក់នៅ",type:"ប្រភេទការងារ",emp:"បុគ្គលិក / អ្នកមានប្រាក់ខែ",biz:"ម្ចាស់អាជីវកម្ម / អាជីវកម្មផ្ទាល់ខ្លួន",amount:"ចំនួនទឹកប្រាក់ដែលត្រូវការ (USD)",purpose:"គោលបំណងប្រើប្រាស់ប្រាក់",salary:"ប្រាក់ខែប្រចាំខែ (USD)",turnover:"ចំណូលអាជីវកម្មប្រចាំខែប្រហែល (USD)",work:"ធ្វើការបានរយៈពេលប៉ុន្មាន?",operate:"អាជីវកម្មដំណើរការបានរយៈពេលប៉ុន្មាន?",date:"កាលបរិច្ឆេទចង់ណាត់ជួប",time:"ពេលវេលាចង់ណាត់ជួប",note:"កំណត់សម្គាល់បន្ថែម (មិនចាំបាច់)",notice:"ទម្រង់នេះសម្រាប់ការប្រឹក្សា និងការណាត់ជួបប៉ុណ្ណោះ។ លក្ខខណ្ឌឥណទានត្រូវឆ្លងកាត់ការវាយតម្លៃផ្លូវការ។",submit:"បញ្ជូនសំណើណាត់ជួប",ok:"បានបញ្ជូន",oktext:"បុគ្គលិករបស់យើងនឹងទាក់ទងដើម្បីបញ្ជាក់ពេលណាត់ជួប។"}
};
const EXTRA={en:{consent:"I agree that my details will be sent to company staff via Telegram for consultation and appointment contact.",auth:"Please reopen this form using the button inside the Telegram bot.",error:"Submission not confirmed. Please check your connection and retry. Staff may already have received it; the same request uses the same reference.",fields:"Check your phone, amounts and date (tomorrow to 90 days ahead).",zone:"All appointment times are Cambodia time (UTC+7)."},zh:{consent:"我同意将上述资料通过 Telegram 发送给公司工作人员，用于咨询和预约联系。",auth:"请从 Telegram Bot 内的预约按钮重新打开表格。",error:"未能确认提交，请检查网络后重试。工作人员可能已收到；相同资料使用相同编号。",fields:"请检查电话、金额及日期（明天起90天内）。",zone:"预约时间均为柬埔寨时间（UTC+7）。"},km:{consent:"ខ្ញុំយល់ព្រមឱ្យផ្ញើព័ត៌មានរបស់ខ្ញុំទៅបុគ្គលិកតាម Telegram សម្រាប់ការប្រឹក្សា និងការណាត់ជួប។",auth:"សូមបើកទម្រង់នេះឡើងវិញតាមប៊ូតុងក្នុង Telegram Bot។",error:"មិនអាចបញ្ជាក់ការបញ្ជូនបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត និងព្យាយាមម្ដងទៀត។ សំណើដូចគ្នាមានលេខយោងដូចគ្នា។",fields:"សូមពិនិត្យលេខទូរស័ព្ទ ចំនួនប្រាក់ និងកាលបរិច្ឆេទចាប់ពីថ្ងៃស្អែកក្នុងរយៈពេល ៩០ ថ្ងៃ។",zone:"ពេលវេលាណាត់ជួបគឺជាម៉ោងនៅកម្ពុជា (UTC+7)។"}};
let L="km", TYPE="";
function setLang(x){L=x;document.documentElement.lang=x;consentText.textContent=EXTRA[L].consent;["km","en","zh"].forEach(y=>document.getElementById(y+"Btn").classList.toggle("active",y===x));intro.textContent=T[L].intro+" · "+EXTRA[L].zone;document.querySelectorAll("[data-k]").forEach(e=>e.textContent=T[L][e.dataset.k]);empBtn.textContent=T[L].emp;bizBtn.textContent=T[L].biz;submitBtn.textContent=T[L].submit;renderType()}
function setType(x){TYPE=x;customerType.value=x;empBtn.classList.toggle("active",x==="employee");bizBtn.classList.toggle("active",x==="business");renderType()}
function renderType(){incomeLabel.textContent=TYPE==="business"?T[L].turnover:T[L].salary;durationLabel.textContent=TYPE==="business"?T[L].operate:T[L].work}
kmBtn.onclick=()=>setLang("km");enBtn.onclick=()=>setLang("en");zhBtn.onclick=()=>setLang("zh");empBtn.onclick=()=>setType("employee");bizBtn.onclick=()=>setType("business");
const dateField=document.querySelector('[name=appointmentDate]');
const cambodiaDay=n=>new Date(Date.now()+25200000+n*86400000).toISOString().slice(0,10);
dateField.min=cambodiaDay(1);dateField.max=cambodiaDay(90);
document.querySelectorAll('label[data-k]').forEach(label=>{const input=label.nextElementSibling;if(input&&['INPUT','SELECT','TEXTAREA'].includes(input.tagName)){input.id='field-'+label.dataset.k;label.htmlFor=input.id;}});
loanForm.onsubmit=async e=>{e.preventDefault();if(submitBtn.disabled)return;if(!TYPE){errorBox.textContent=T[L].type;return}submitBtn.disabled=true;submitBtn.textContent='…';errorBox.textContent='';try{const data={...Object.fromEntries(new FormData(loanForm)),language:L,consent:consent.checked};const r=await fetch('/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok||!d.ok){errorBox.textContent=d.error==='auth'?EXTRA[L].auth:d.error==='fields'?EXTRA[L].fields:EXTRA[L].error;return}formBox.classList.add('hidden');successBox.classList.remove('hidden');successTitle.textContent=T[L].ok;successText.textContent=T[L].oktext+' '+d.ref;loanForm.reset();}catch{errorBox.textContent=EXTRA[L].error}finally{submitBtn.disabled=false;submitBtn.textContent=T[L].submit}};
if(window.Telegram&&Telegram.WebApp){Telegram.WebApp.ready();Telegram.WebApp.expand()}setLang("km");
</script></body></html>`;
