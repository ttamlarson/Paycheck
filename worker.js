// Paycheck backend: Cloudflare Worker. Holds Plaid + Anthropic secrets so the web app never does.
const J=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json',...h}});
const plaid=(env,path,body)=>fetch('https://'+(env.PLAID_ENV||'sandbox')+'.plaid.com'+path,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({client_id:env.PLAID_CLIENT_ID,secret:env.PLAID_SECRET,...body})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error_message||'Plaid error');return d});
const LINK=`<!doctype html><meta name=viewport content="width=device-width"><title>Link bank</title><body style="font:16px system-ui;padding:24px">
<h2>Link your bank</h2><button id=b style="font:inherit;padding:12px 18px">Connect bank</button><p id=m></p>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script><script>
const k=new URLSearchParams(location.search).get('key'),H={'content-type':'application/json',authorization:'Bearer '+k};
b.onclick=async()=>{const t=await(await fetch('/link-token',{method:'POST',headers:H})).json();
Plaid.create({token:t.link_token,onSuccess:async pt=>{const r=await fetch('/exchange',{method:'POST',headers:H,body:JSON.stringify({public_token:pt})});
m.textContent=r.ok?'Linked. You can close this page.':'Failed: '+await r.text()}}).open()}
<\/script>`;
export default{async fetch(req,env){
  const u=new URL(req.url),cors={'access-control-allow-origin':env.ALLOWED_ORIGIN||'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  try{
    if(u.pathname==='/link'&&u.searchParams.get('key')===env.APP_TOKEN)return new Response(LINK,{headers:{'content-type':'text/html'}});
    if(!env.APP_TOKEN||req.headers.get('authorization')!=='Bearer '+env.APP_TOKEN)return J({error:'unauthorised'},401,cors);
    if(u.pathname==='/link-token'&&req.method==='POST'){
      const d=await plaid(env,'/link/token/create',{client_name:'Paycheck',language:'en',country_codes:(env.PLAID_COUNTRIES||'US').split(','),user:{client_user_id:'me'},products:['transactions']});
      return J({link_token:d.link_token},200,cors)}
    if(u.pathname==='/exchange'&&req.method==='POST'){
      const{public_token}=await req.json(),d=await plaid(env,'/item/public_token/exchange',{public_token});
      const items=JSON.parse(await env.STORE.get('items')||'[]');items.push(d.access_token);await env.STORE.put('items',JSON.stringify(items));
      return J({ok:true},200,cors)}
    if(u.pathname==='/transactions'){
      const since=/^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get('since')||'')?u.searchParams.get('since'):new Date(Date.now()-60*864e5).toISOString().slice(0,10);
      const items=JSON.parse(await env.STORE.get('items')||'[]'),out=[];
      for(const access_token of items){
        const d=await plaid(env,'/transactions/get',{access_token,start_date:since,end_date:new Date().toISOString().slice(0,10),options:{count:500}});
        d.transactions.filter(t=>!t.pending).forEach(t=>out.push({id:t.transaction_id,date:t.date,amt:Math.abs(t.amount),type:t.amount>0?'out':'in',name:t.merchant_name||t.name}))}
      return J({transactions:out},200,cors)}
    if(u.pathname==='/chat'&&req.method==='POST'){
      const{question,summary}=await req.json();
      if(typeof question!=='string'||!question||question.length>500||typeof summary!=='object')return J({error:'bad request'},400,cors);
      const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
        body:JSON.stringify({model:env.CLAUDE_MODEL||'claude-sonnet-5-5',max_tokens:600,
          system:'You are a practical, concise budgeting assistant inside a pay-period budgeting app. Use only the JSON budget summary provided. Show simple arithmetic, keep answers under 150 words, and say when data is missing. You are not a licensed financial adviser.',
          messages:[{role:'user',content:'Budget summary:\n'+JSON.stringify(summary)+'\n\nQuestion: '+question}]})});
      const d=await r.json();if(!r.ok)throw new Error(d.error&&d.error.message||'AI error');
      return J({answer:d.content.filter(c=>c.type==='text').map(c=>c.text).join('\n')},200,cors)}
    return J({error:'not found'},404,cors);
  }catch(e){return J({error:String(e.message||e)},500,cors)}}};
