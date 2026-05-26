import { useState, useEffect, useRef, useCallback } from "react";

/* ══ ADAPTIVE BRAIN ══════════════════════════════════════ */
class AdaptiveBrain {
  constructor(s) {
    this.weights = s?.weights || {rsi:1,macd:1,bb:1,stoch:1,momentum:1,sma:1,vwap:1,volume:1};
    this.tradeMemory = s?.tradeMemory || [];
    this.winRate = s?.winRate || 0;
    this.totalPnl = s?.totalPnl || 0;
    this.generation = s?.generation || 0;
  }
  learn({indicators,pnlPct}) {
    this.tradeMemory.push({indicators,pnlPct,time:Date.now()});
    this.generation++;
    const bias = pnlPct>0?1:-1;
    for(const[k,v]of Object.entries(indicators)){
      if(v*bias>0) this.weights[k]=Math.min(2.5,this.weights[k]+0.05*Math.abs(pnlPct)/10);
      else         this.weights[k]=Math.max(0.1,this.weights[k]-0.03);
    }
    const wins=this.tradeMemory.filter(t=>t.pnlPct>0).length;
    this.winRate=(wins/this.tradeMemory.length)*100;
    this.totalPnl=this.tradeMemory.reduce((s,t)=>s+(t.pnlPct||0),0);
  }
  serialize(){return{weights:this.weights,tradeMemory:this.tradeMemory.slice(-200),winRate:this.winRate,totalPnl:this.totalPnl,generation:this.generation};}
  top()  {return Object.entries(this.weights).sort((a,b)=>b[1]-a[1])[0];}
  worst(){return Object.entries(this.weights).sort((a,b)=>a[1]-b[1])[0];}
}

/* ══ INDICATORS ══════════════════════════════════════════ */
const ema=(a,p)=>{if(a.length<p)return[];const k=2/(p+1);const r=[a.slice(0,p).reduce((x,y)=>x+y,0)/p];for(let i=p;i<a.length;i++)r.push(a[i]*k+r[r.length-1]*(1-k));return r;};
const sma=(a,p)=>a.length<p?0:a.slice(-p).reduce((x,y)=>x+y,0)/p;
function rsiCalc(a,p=14){if(a.length<p+1)return 50;const d=a.slice(1).map((v,i)=>v-a[i]).slice(-p);const g=d.filter(x=>x>0).reduce((x,y)=>x+y,0)/p||0.001;const l=d.filter(x=>x<0).map(x=>-x).reduce((x,y)=>x+y,0)/p||0.001;return 100-100/(1+g/l);}
function macdCalc(a){if(a.length<26)return{hist:0,line:0,sig:0};const e12=ema(a,12),e26=ema(a,26),len=Math.min(e12.length,e26.length);const ml=Array.from({length:len},(_,i)=>e12[e12.length-len+i]-e26[e26.length-len+i]);const s=ema(ml,9);if(!s.length)return{hist:0,line:0,sig:0};return{hist:ml[ml.length-1]-s[s.length-1],line:ml[ml.length-1],sig:s[s.length-1]};}
function bbCalc(a,p=20){if(a.length<p)return{u:0,m:0,l:0};const r=a.slice(-p),m=r.reduce((x,y)=>x+y,0)/p;const std=Math.sqrt(r.reduce((s,v)=>s+(v-m)**2,0)/p);return{u:m+2*std,m,l:m-2*std};}
const stochCalc=(a,p=14)=>{if(a.length<p)return 50;const r=a.slice(-p),lo=Math.min(...r),hi=Math.max(...r);return hi===lo?50:100*(a[a.length-1]-lo)/(hi-lo);};
const momCalc=(a,p=10)=>a.length<p+1?0:((a[a.length-1]/a[a.length-1-p])-1)*100;

function analyzeWithBrain(prices,brain){
  if(prices.length<30)return{signal:"WAIT",confidence:0,indicators:{},reasons:[],rsi:50,macdHist:0,stoch:50,momentum:0,sma20:0,sma50:0};
  const w=brain.weights,price=prices[prices.length-1];
  const rv=rsiCalc(prices),mc=macdCalc(prices),bv=bbCalc(prices),sv=stochCalc(prices),mv=momCalc(prices);
  const s20=sma(prices,20),s50=sma(prices,Math.min(50,Math.floor(prices.length/2)));
  const vwap=prices.slice(-24).reduce((a,b)=>a+b,0)/Math.min(24,prices.length);
  const votes={},reasons=[];
  if(rv<30){votes.rsi=2;reasons.push(`RSI oversold (${rv.toFixed(0)})`)}else if(rv<42){votes.rsi=1}else if(rv>70){votes.rsi=-2;reasons.push(`RSI overbought (${rv.toFixed(0)})`)}else if(rv>58){votes.rsi=-1}else votes.rsi=0;
  if(mc.hist>0&&mc.line>mc.sig){votes.macd=2;reasons.push("MACD bullish")}else if(mc.hist<0&&mc.line<mc.sig){votes.macd=-2;reasons.push("MACD bearish")}else votes.macd=0;
  if(price<bv.l){votes.bb=2;reasons.push("Below lower BB")}else if(price>bv.u){votes.bb=-2;reasons.push("Above upper BB")}else votes.bb=price>bv.m?1:-1;
  if(sv<20){votes.stoch=1;reasons.push("Stoch oversold")}else if(sv>80){votes.stoch=-1;reasons.push("Stoch overbought")}else votes.stoch=0;
  if(mv>5){votes.momentum=1;reasons.push(`Momentum +${mv.toFixed(1)}%`)}else if(mv<-5){votes.momentum=-1;reasons.push(`Momentum ${mv.toFixed(1)}%`)}else votes.momentum=0;
  votes.sma=s20>s50?1:-1;if(s20>s50)reasons.push("SMA uptrend");
  votes.vwap=price>vwap?1:-1;if(price>vwap)reasons.push("Above VWAP");
  votes.volume=Math.abs(mv)>3?(mv>0?1:-1):0;
  const total=Object.entries(votes).reduce((s,[k,v])=>s+v*(w[k]||1),0);
  const maxP=Object.entries(votes).reduce((s,[k,v])=>s+Math.abs(v)*(w[k]||1),0)||1;
  return{signal:total>=3?"BUY":total<=-3?"SELL":"HOLD",confidence:Math.round(Math.abs(total)/maxP*100),score:total,price,rsi:rv,macdHist:mc.hist,stoch:sv,momentum:mv,sma20:s20,sma50:s50,indicators:votes,reasons:reasons.slice(0,4)};
}

/* ══ MARKET DATA ═════════════════════════════════════════ */
const COIN_IDS={ETH:"ethereum",WBTC:"wrapped-bitcoin",LINK:"chainlink",UNI:"uniswap",AAVE:"aave",MATIC:"matic-network"};
const COINS=Object.keys(COIN_IDS);
async function fetchPrices(syms){
  const ids=syms.map(s=>COIN_IDS[s]).filter(Boolean).join(",");
  try{const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    const d=await r.json(),res={};
    for(const[sym,id]of Object.entries(COIN_IDS))if(syms.includes(sym)&&d[id])res[sym]={price:d[id].usd||0,change24h:d[id].usd_24h_change||0};
    return res;}catch{return{};}
}
async function fetchOHLC(symbol){
  const id=COIN_IDS[symbol];if(!id)return[];
  try{const r=await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=14&interval=hourly`);
    const d=await r.json();return(d.prices||[]).map(p=>p[1]);}catch{return[];}
}

/* ══ WALLET ══════════════════════════════════════════════ */
function generateWallet(){
  const arr=new Uint8Array(32);crypto.getRandomValues(arr);
  const pk=Array.from(arr).map(b=>b.toString(16).padStart(2,"0")).join("");
  const addr="0x"+pk.substring(24);
  const words="abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic afford afraid again agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety apart apology appear apple approve april arch arctic area arena argue arm armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis".split(" ");
  const mnemonic=Array.from({length:12},()=>words[Math.floor(Math.random()*words.length)]).join(" ");
  return{address:addr,privateKey:pk,mnemonic};
}

/* ══ PERSIST ═════════════════════════════════════════════ */
function loadApp(){try{return JSON.parse(localStorage.getItem("aibot_v5")||"null");}catch{return null;}}
function saveApp(d){try{localStorage.setItem("aibot_v5",JSON.stringify(d));}catch{}}

/* ══ COLORS ══════════════════════════════════════════════ */
const C={bg:"#060a14",panel:"#0c1423",border:"#1a2540",accent:"#38bdf8",green:"#34d399",red:"#f87171",yellow:"#fbbf24",dim:"#4b5978",text:"#cbd5e1",purple:"#a78bfa",card:"#111827"};

const fp=p=>p<1?`$${p.toFixed(5)}`:p<100?`$${p.toFixed(3)}`:`$${p.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

/* ══ SMALL COMPONENTS ════════════════════════════════════ */
function SigPill({s}){
  const m={BUY:{bg:"rgba(52,211,153,.18)",c:"#34d399"},SELL:{bg:"rgba(248,113,113,.18)",c:"#f87171"},HOLD:{bg:"rgba(251,191,36,.14)",c:"#fbbf24"},WAIT:{bg:"rgba(75,89,120,.3)",c:"#64748b"}};
  const x=m[s]||m.WAIT;
  return<span style={{background:x.bg,color:x.c,padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{s}</span>;
}

function Pct({v,size=13}){
  return<span style={{color:v>0?C.green:v<0?C.red:C.dim,fontWeight:700,fontSize:size}}>{v>0?"+":""}{v.toFixed(2)}%</span>;
}

function Card({children,style={},accent}){
  return(
    <div style={{background:C.card,borderRadius:16,padding:16,border:`1px solid ${C.border}`,borderTop:accent?`3px solid ${accent}`:"none",...style}}>
      {children}
    </div>
  );
}

function BigBtn({label,color=C.accent,textColor="#060a14",onClick,disabled,sub}){
  return(
    <button onClick={onClick} disabled={disabled} style={{width:"100%",background:disabled?"#1a2540":color,color:disabled?C.dim:textColor,border:"none",borderRadius:14,padding:"17px 20px",fontSize:16,fontWeight:800,letterSpacing:.5,cursor:disabled?"not-allowed":"pointer",marginBottom:sub?4:0,transition:"opacity .2s",opacity:disabled?.6:1}}>
      {label}
    </button>
  );
}

function SubBtn({label,onClick,color=C.accent}){
  return(
    <button onClick={onClick} style={{width:"100%",background:"transparent",color,border:`1.5px solid ${color}`,borderRadius:12,padding:"13px 20px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
      {label}
    </button>
  );
}

function Row({left,right,leftColor,rightColor,border=true}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:border?`1px solid ${C.border}`:"none"}}>
      <span style={{fontSize:14,color:leftColor||C.dim}}>{left}</span>
      <span style={{fontSize:14,fontWeight:700,color:rightColor||C.text}}>{right}</span>
    </div>
  );
}

function StepBar({step}){
  const labels=["Intro","Payout","Risk","Trade"];
  return(
    <div style={{display:"flex",alignItems:"center",padding:"14px 20px",background:C.panel,borderBottom:`1px solid ${C.border}`}}>
      {labels.map((l,i)=>(
        <div key={l} style={{display:"flex",alignItems:"center",flex:1}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:i<step?C.green:i===step?C.accent:"transparent",border:`2px solid ${i<step?C.green:i===step?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:i<step||i===step?"#060a14":C.dim,transition:"all .3s"}}>
              {i<step?"✓":i+1}
            </div>
            <div style={{fontSize:9,letterSpacing:1,color:i<step?C.green:i===step?C.accent:C.dim,marginTop:4,textTransform:"uppercase",fontWeight:600,textAlign:"center"}}>{l}</div>
          </div>
          {i<labels.length-1&&<div style={{flex:1,height:2,background:i<step?C.green:C.border,margin:"0 6px",marginBottom:18,borderRadius:2}}/>}
        </div>
      ))}
    </div>
  );
}

function BottomNav({tab,setTab,autoOn}){
  const tabs=[
    {id:"dashboard",icon:"◈",label:"Home"},
    {id:"scan",     icon:"⟳",label:"Scan"},
    {id:"positions",icon:"◉",label:"Trades"},
    {id:"fund",     icon:"↑",label:"Fund"},
    {id:"brain",    icon:"✦",label:"Brain"},
  ];
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.panel,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom)"}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",padding:"10px 0 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <span style={{fontSize:18,color:tab===t.id?C.accent:C.dim,transition:"color .2s"}}>{t.icon}</span>
          <span style={{fontSize:9,letterSpacing:1,textTransform:"uppercase",color:tab===t.id?C.accent:C.dim,fontWeight:700}}>{t.label}</span>
          {t.id==="scan"&&autoOn&&<div style={{width:6,height:6,borderRadius:"50%",background:C.green,position:"absolute",marginTop:0}}/>}
        </button>
      ))}
    </div>
  );
}

/* ══ MAIN APP ════════════════════════════════════════════ */
export default function App(){
  const saved=loadApp();
  const [step,setStep]           = useState(saved?.step??0);
  const [botWallet,setBotWallet] = useState(saved?.botWallet||null);
  const [payoutAddr,setPayoutAddr]= useState(saved?.payoutAddr||"");
  const [payoutInput,setPayoutInput]= useState(saved?.payoutAddr||"");
  const [addrError,setAddrError] = useState("");
  const [risk,setRisk]           = useState(saved?.risk||{maxPerTrade:20,stopLoss:3,takeProfit:6,maxPositions:3,dailyLossLimit:10,profitSendPct:80});
  const [brain]                  = useState(()=>new AdaptiveBrain(saved?.brain));
  const [prices,setPrices]       = useState({});
  const [positions,setPositions] = useState(saved?.positions||{});
  const [trades,setTrades]       = useState(saved?.trades||[]);
  const [autoOn,setAutoOn]       = useState(false);
  const [autoLog,setAutoLog]     = useState(["Bot ready — start auto-trader to begin."]);
  const [scanData,setScanData]   = useState({});
  const [scanning,setScanning]   = useState(false);
  const [tab,setTab]             = useState("dashboard");
  const [toast,setToast]         = useState(null);
  const [dailyPnl,setDailyPnl]  = useState(0);
  const [showMnemonic,setShowMnemonic]= useState(false);
  const [showCopied,setShowCopied]= useState(false);
  const [confirmModal,setConfirmModal]= useState(null);

  const autoRef=useRef(false);
  const pricesRef=useRef(prices);
  const riskRef=useRef(risk);
  pricesRef.current=prices;
  riskRef.current=risk;

  const persist=useCallback((patch={})=>{
    saveApp({step,botWallet,payoutAddr,risk,brain:brain.serialize(),positions,trades,...patch});
  },[step,botWallet,payoutAddr,risk,brain,positions,trades]);

  const toast_=(msg,type="info")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};
  const alog=msg=>setAutoLog(l=>[`${new Date().toLocaleTimeString()} — ${msg}`,...l.slice(0,49)]);

  useEffect(()=>{
    if(!botWallet){const w=generateWallet();setBotWallet(w);saveApp({step:0,botWallet:w,payoutAddr:"",risk,brain:brain.serialize(),positions:{},trades:[]});}
  },[]);

  useEffect(()=>{
    fetchPrices(COINS).then(p=>{if(Object.keys(p).length)setPrices(p);});
    const t=setInterval(()=>fetchPrices(COINS).then(p=>{if(Object.keys(p).length)setPrices(p);}),30000);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    if(step<3)return;
    for(const[sym,pos]of Object.entries(positions)){
      const price=prices[sym]?.price;if(!price||!pos.entryPrice)continue;
      const pct=((price-pos.entryPrice)/pos.entryPrice)*100;
      if(pct<=-riskRef.current.stopLoss){toast_(`🔴 Stop-loss: ${sym} ${pct.toFixed(2)}%`,"danger");closePos(sym,price,pct,"STOP_LOSS");}
      else if(pct>=riskRef.current.takeProfit){toast_(`🟢 Take-profit: ${sym} +${pct.toFixed(2)}%`,"success");closePos(sym,price,pct,"TAKE_PROFIT");}
    }
  },[prices]);

  function openPos(sym,price){
    const r=riskRef.current,usd=100*(r.maxPerTrade/100),qty=usd/price;
    const newPos={...positions,[sym]:{qty,entryPrice:price,usd,openTime:Date.now(),indicators:scanData[sym]?.indicators||{}}};
    const newTrades=[...trades,{time:new Date().toISOString(),type:"BUY",sym,qty,price,usd}];
    setPositions(newPos);setTrades(newTrades);persist({positions:newPos,trades:newTrades});
    alog(`BUY ${sym} @ ${fp(price)}`);toast_(`Opened ${sym} @ ${fp(price)}`,"success");
  }
  function closePos(sym,price,pnlPct,reason){
    const pos=positions[sym];if(!pos)return;
    brain.learn({indicators:pos.indicators||{},pnlPct});
    const usd=pos.qty*price,profit=usd-pos.usd;
    const newPos={...positions};delete newPos[sym];
    const newTrades=[...trades,{time:new Date().toISOString(),type:"SELL",sym,qty:pos.qty,price,usd,pnlPct,reason,profit}];
    setPositions(newPos);setTrades(newTrades);setDailyPnl(d=>d+pnlPct);
    persist({positions:newPos,trades:newTrades,brain:brain.serialize()});
    alog(`SELL ${sym} @ ${fp(price)} | ${pnlPct>0?"+":""}${pnlPct.toFixed(2)}% | ${reason}`);
  }

  const isValidAddr=a=>/^0x[0-9a-fA-F]{40}$/.test(a);

  const runAutoScan=useCallback(async()=>{
    if(!autoRef.current)return;
    if(dailyPnl<=-riskRef.current.dailyLossLimit){alog("⛔ Daily loss limit hit. Paused.");setAutoOn(false);autoRef.current=false;return;}
    const posCount=Object.keys(positions).length;
    for(const sym of COINS){
      if(!autoRef.current)break;
      const arr=await fetchOHLC(sym);if(arr.length<30)continue;
      const a=analyzeWithBrain(arr,brain);
      const price=pricesRef.current[sym]?.price||a.price;
      setScanData(prev=>({...prev,[sym]:{...a,price}}));
      if(a.signal==="BUY"&&a.confidence>=65&&posCount<riskRef.current.maxPositions&&!positions[sym])openPos(sym,price);
      await new Promise(r=>setTimeout(r,400));
    }
    alog(`Scan done — Gen ${brain.generation} | WR ${brain.winRate.toFixed(0)}%`);
    if(autoRef.current)setTimeout(runAutoScan,90000);
  },[brain,positions,dailyPnl]);

  const toggleAuto=()=>{const n=!autoOn;setAutoOn(n);autoRef.current=n;if(n){alog("Auto-trader started ▶");runAutoScan();}else alog("Auto-trader stopped ◼");};
  const completeStep=s=>{const n=s+1;setStep(n);persist({step:n});};

  /* ══ ONBOARDING (steps 0-2) ════════════════════════════ */
  if(step<3) return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",color:C.text}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:C.panel,borderBottom:`1px solid ${C.border}`,padding:"14px 20px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:20,color:C.accent}}>◈</span>
        <span style={{fontSize:17,fontWeight:800,color:C.text,letterSpacing:.5}}>Neural Trade</span>
      </div>

      <StepBar step={step}/>

      <div style={{padding:"24px 20px 40px",maxWidth:480,margin:"0 auto"}}>

        {/* ── STEP 0: INTRO ── */}
        {step===0&&(
          <>
            <div style={{textAlign:"center",marginBottom:28}}>
              <div style={{fontSize:40,marginBottom:12}}>🤖</div>
              <div style={{fontSize:22,fontWeight:800,marginBottom:8,lineHeight:1.2}}>Your AI Crypto Trading Bot</div>
              <div style={{fontSize:15,color:C.dim,lineHeight:1.6}}>No exchange account. No API keys. Send funds directly to the bot — it trades for you and sends profits back.</div>
            </div>

            {/* Flow cards */}
            {[
              {icon:"💸",title:"You send ETH or USDC to the bot's wallet",desc:"Fund it like sending crypto to a friend. The bot wallet is yours — stored in this browser."},
              {icon:"🤖",title:"Bot trades on Uniswap automatically",desc:"Uses 8 AI indicators to spot signals. Trades only when confidence is above 65%."},
              {icon:"📈",title:"Stop-loss and take-profit protect you",desc:"Every trade has automatic safety exits. The bot never risks more than your set limits."},
              {icon:"💰",title:"Profits sent back to your wallet",desc:"You set your personal wallet address. When trades close in profit, the bot sends your share automatically."},
            ].map(({icon,title,desc})=>(
              <Card key={title} style={{marginBottom:12,display:"flex",gap:14,alignItems:"flex-start"}}>
                <span style={{fontSize:26,flexShrink:0}}>{icon}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.3}}>{title}</div>
                  <div style={{fontSize:13,color:C.dim,lineHeight:1.5}}>{desc}</div>
                </div>
              </Card>
            ))}

            {/* Bot wallet preview */}
            {botWallet&&(
              <Card style={{marginBottom:24,background:"rgba(56,189,248,.06)",border:`1px solid rgba(56,189,248,.2)`}}>
                <div style={{fontSize:11,letterSpacing:2,color:C.accent,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>Your bot's wallet (you'll fund this)</div>
                <div style={{fontSize:12,color:C.text,wordBreak:"break-all",lineHeight:1.7,fontFamily:"'DM Mono',monospace"}}>{botWallet.address}</div>
              </Card>
            )}

            <BigBtn label="Let's Set It Up →" color={C.accent} onClick={()=>completeStep(0)}/>
          </>
        )}

        {/* ── STEP 1: PAYOUT WALLET ── */}
        {step===1&&(
          <>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:40,marginBottom:12}}>🏦</div>
              <div style={{fontSize:22,fontWeight:800,marginBottom:8}}>Where Do Profits Go?</div>
              <div style={{fontSize:15,color:C.dim,lineHeight:1.6}}>Enter your personal wallet address. The bot sends profits here automatically — it can't send anywhere else.</div>
            </div>

            <Card style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:4}}>Your Ethereum Wallet Address</div>
              <div style={{fontSize:12,color:C.dim,marginBottom:12,lineHeight:1.5}}>This should be your MetaMask, Coinbase Wallet, or any wallet you own. Starts with 0x.</div>
              <input
                style={{background:"#050910",border:`2px solid ${addrError?C.red:payoutAddr&&isValidAddr(payoutAddr)?C.green:C.border}`,color:C.text,fontFamily:"'DM Mono',monospace",fontSize:13,padding:"14px",width:"100%",borderRadius:10,outline:"none",boxSizing:"border-box",lineHeight:1.5}}
                placeholder="0x... paste your wallet address"
                value={payoutInput}
                onChange={e=>{setPayoutInput(e.target.value);setAddrError("");}}
              />
              {addrError&&<div style={{color:C.red,fontSize:12,marginTop:8,lineHeight:1.5}}>{addrError}</div>}
              {payoutInput&&isValidAddr(payoutInput)&&<div style={{color:C.green,fontSize:13,marginTop:8,fontWeight:700}}>✓ Valid address</div>}
            </Card>

            <Card style={{marginBottom:16,background:"rgba(251,191,36,.06)",border:`1px solid rgba(251,191,36,.2)`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.yellow,marginBottom:6}}>Don't have a wallet yet?</div>
              <div style={{fontSize:13,color:C.dim,lineHeight:1.6}}>Download <strong style={{color:C.text}}>MetaMask</strong> (free) at metamask.io. Open it, create a wallet, and copy your address — it starts with 0x.</div>
            </Card>

            <Card style={{marginBottom:24}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:12}}>Profit split — how much goes to you?</div>
              <div style={{fontSize:24,fontWeight:800,color:C.purple,textAlign:"center",marginBottom:8}}>{risk.profitSendPct}%</div>
              <input type="range" min={10} max={100} step={5} value={risk.profitSendPct}
                onChange={e=>setRisk(r=>({...r,profitSendPct:parseInt(e.target.value)}))}
                style={{width:"100%",accentColor:C.purple,marginBottom:6}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.dim}}>
                <span>10% to you (compound more)</span><span>100% to you</span>
              </div>
            </Card>

            <BigBtn label="Confirm Payout Wallet →" color={C.green} onClick={()=>{
              if(!isValidAddr(payoutInput)){setAddrError("That doesn't look right. It should start with 0x and be 42 characters long — paste it directly from your wallet app.");return;}
              setPayoutAddr(payoutInput);persist({payoutAddr:payoutInput,risk});completeStep(1);
            }}/>
          </>
        )}

        {/* ── STEP 2: RISK ── */}
        {step===2&&(
          <>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:40,marginBottom:12}}>🛡️</div>
              <div style={{fontSize:22,fontWeight:800,marginBottom:8}}>Set Your Risk Limits</div>
              <div style={{fontSize:15,color:C.dim,lineHeight:1.6}}>These protect your money. The bot never goes past them, even in auto mode.</div>
            </div>

            <Card style={{marginBottom:16}}>
              {[
                {key:"maxPerTrade",   emoji:"💼",label:"Max per trade",         suffix:"%",min:5,max:50,step:5, note:"% of bot balance used per trade"},
                {key:"stopLoss",      emoji:"🔴",label:"Stop-loss",             suffix:"%",min:1,max:20,step:.5,note:"Auto-sells if trade drops this much"},
                {key:"takeProfit",    emoji:"🟢",label:"Take-profit",           suffix:"%",min:2,max:50,step:1, note:"Auto-sells when trade gains this much"},
                {key:"maxPositions",  emoji:"📊",label:"Max coins at once",     suffix:"", min:1,max:8, step:1, note:"How many coins it can hold at once"},
                {key:"dailyLossLimit",emoji:"⛔",label:"Daily loss limit",      suffix:"%",min:2,max:50,step:1, note:"Bot pauses if total day losses hit this"},
              ].map(({key,emoji,label,suffix,min,max,step:s,note},i,arr)=>(
                <div key={key} style={{paddingBottom:18,marginBottom:i<arr.length-1?18:0,borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18}}>{emoji}</span>
                      <span style={{fontSize:14,fontWeight:700,color:C.text}}>{label}</span>
                    </div>
                    <span style={{fontSize:20,fontWeight:800,color:C.accent}}>{risk[key]}{suffix}</span>
                  </div>
                  <input type="range" min={min} max={max} step={s} value={risk[key]}
                    onChange={e=>setRisk(r=>({...r,[key]:parseFloat(e.target.value)}))}
                    style={{width:"100%",accentColor:C.accent,marginBottom:4}}/>
                  <div style={{fontSize:11,color:C.dim}}>{note}</div>
                </div>
              ))}
            </Card>

            {/* Summary */}
            <Card style={{marginBottom:24,background:"rgba(52,211,153,.05)",border:`1px solid rgba(52,211,153,.2)`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:12,letterSpacing:1,textTransform:"uppercase"}}>Your Risk Summary</div>
              {[
                [`Per trade:`, `up to ${risk.maxPerTrade}% of bot balance`],
                [`Stop-loss:`, `sell if trade drops ${risk.stopLoss}%`],
                [`Take-profit:`, `sell when trade gains ${risk.takeProfit}%`],
                [`Max positions:`, `${risk.maxPositions} coin${risk.maxPositions>1?"s":""} at once`],
                [`Daily limit:`, `pause if down ${risk.dailyLossLimit}% today`],
                [`Your profit cut:`, `${risk.profitSendPct}% sent to your wallet`],
              ].map(([l,v],i,a)=><Row key={l} left={l} right={v} rightColor={C.text} border={i<a.length-1}/>)}
            </Card>

            <BigBtn label="Confirm — Open Trading Dashboard →" color={C.green} onClick={()=>{persist({risk});completeStep(2);}}/>
          </>
        )}
      </div>
    </div>
  );

  /* ══ TRADING DASHBOARD (step 3) ════════════════════════ */
  const posCount=Object.keys(positions).length;

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",color:C.text,paddingBottom:80}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono&display=swap" rel="stylesheet"/>
      <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; } input[type=range]{height:6px;} `}</style>

      {/* TOAST */}
      {toast&&(
        <div style={{position:"fixed",top:16,left:16,right:16,zIndex:999,background:toast.type==="success"?"rgba(52,211,153,.95)":toast.type==="danger"?"rgba(248,113,113,.95)":"rgba(56,189,248,.95)",color:"#060a14",padding:"14px 18px",borderRadius:14,fontSize:14,fontWeight:700,boxShadow:"0 4px 24px rgba(0,0,0,.4)",lineHeight:1.4}}>
          {toast.msg}
        </div>
      )}

      {/* TOP BAR */}
      <div style={{background:C.panel,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:40}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18,color:C.accent}}>◈</span>
          <span style={{fontSize:16,fontWeight:800,letterSpacing:.5}}>Neural Trade</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:autoOn?C.green:C.dim,boxShadow:autoOn?`0 0 8px ${C.green}`:"none"}}/>
            <span style={{fontSize:12,color:autoOn?C.green:C.dim,fontWeight:700}}>{autoOn?"LIVE":"IDLE"}</span>
          </div>
          <button onClick={toggleAuto} style={{background:autoOn?"rgba(248,113,113,.15)":"rgba(52,211,153,.15)",color:autoOn?C.red:C.green,border:`1.5px solid ${autoOn?C.red:C.green}`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:800,cursor:"pointer"}}>
            {autoOn?"Stop":"Start"}
          </button>
        </div>
      </div>

      <div style={{padding:"16px 16px 0",maxWidth:520,margin:"0 auto"}}>

        {/* ── HOME ── */}
        {tab==="dashboard"&&(
          <>
            {/* Stats row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {label:"Positions",val:posCount,color:C.accent},
                {label:"Today P&L",val:`${dailyPnl>=0?"+":""}${dailyPnl.toFixed(1)}%`,color:dailyPnl>=0?C.green:C.red},
                {label:"AI Gen",val:`#${brain.generation}`,color:C.purple},
              ].map(({label,val,color})=>(
                <Card key={label} style={{textAlign:"center",padding:12}}>
                  <div style={{fontSize:11,color:C.dim,marginBottom:4,letterSpacing:1,textTransform:"uppercase"}}>{label}</div>
                  <div style={{fontSize:20,fontWeight:800,color}}>{val}</div>
                </Card>
              ))}
            </div>

            {/* Prices */}
            <Card style={{marginBottom:16}}>
              <div style={{fontSize:11,letterSpacing:2,color:C.dim,textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Live Prices</div>
              {Object.keys(prices).length===0
                ?<div style={{color:C.dim,textAlign:"center",padding:20,fontSize:14}}>Fetching prices...</div>
                :COINS.map(sym=>{
                  const p=prices[sym];if(!p)return null;
                  const sd=scanData[sym];
                  return(
                    <div key={sym} style={{display:"flex",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:16,fontWeight:700,color:C.text}}>{sym}</div>
                        <div style={{fontSize:13,color:C.dim,marginTop:1}}>{fp(p.price)}</div>
                      </div>
                      <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <Pct v={p.change24h}/>
                        {sd&&<SigPill s={sd.signal}/>}
                      </div>
                    </div>
                  );
                })
              }
            </Card>

            {/* Activity log */}
            <Card style={{marginBottom:16}}>
              <div style={{fontSize:11,letterSpacing:2,color:C.dim,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Activity</div>
              <div style={{maxHeight:180,overflowY:"auto"}}>
                {autoLog.map((l,i)=>(
                  <div key={i} style={{fontSize:12,color:l.includes("BUY")?C.green:l.includes("SELL")?C.yellow:l.includes("⛔")?C.red:C.dim,padding:"5px 0",borderBottom:`1px solid ${C.border}`,lineHeight:1.4,fontFamily:"'DM Mono',monospace"}}>
                    {l}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* ── SCAN ── */}
        {tab==="scan"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:800}}>Market Scan</div>
              <button onClick={async()=>{
                setScanning(true);
                for(const sym of COINS){
                  const arr=await fetchOHLC(sym);
                  if(arr.length>30){const a=analyzeWithBrain(arr,brain);setScanData(p=>({...p,[sym]:{...a,price:pricesRef.current[sym]?.price||a.price}}));}
                  await new Promise(r=>setTimeout(r,300));
                }
                setScanning(false);
              }} disabled={scanning} style={{background:C.accent,color:"#060a14",border:"none",borderRadius:20,padding:"8px 18px",fontSize:13,fontWeight:800,cursor:scanning?"not-allowed":"pointer",opacity:scanning?.6:1}}>
                {scanning?"Scanning...":"▶ Scan All"}
              </button>
            </div>

            {COINS.map(sym=>{
              const r=scanData[sym],p=prices[sym];
              if(!r)return(
                <Card key={sym} style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:16,fontWeight:700}}>{sym}</span>
                  <span style={{fontSize:13,color:C.dim}}>{p?fp(p.price):"—"}</span>
                </Card>
              );
              return(
                <Card key={sym} style={{marginBottom:10,borderLeft:`3px solid ${r.signal==="BUY"?C.green:r.signal==="SELL"?C.red:C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:18,fontWeight:800,color:C.text}}>{sym}</div>
                      <div style={{fontSize:14,color:C.dim,marginTop:2}}>{fp(r.price||0)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <SigPill s={r.signal}/>
                      <div style={{fontSize:13,color:C.dim,marginTop:6}}>{r.confidence}% confidence</div>
                    </div>
                  </div>
                  {/* Confidence bar */}
                  <div style={{height:4,background:C.border,borderRadius:2,marginBottom:8}}>
                    <div style={{width:`${r.confidence}%`,height:"100%",background:r.signal==="BUY"?C.green:r.signal==="SELL"?C.red:C.yellow,borderRadius:2}}/>
                  </div>
                  <div style={{display:"flex",gap:16,fontSize:12,color:C.dim}}>
                    <span>RSI <span style={{color:r.rsi<40?C.green:r.rsi>60?C.red:C.text,fontWeight:700}}>{r.rsi?.toFixed(0)}</span></span>
                    <span>Mom <Pct v={r.momentum||0} size={12}/></span>
                    <span style={{flex:1,color:C.dim,fontSize:11}}>{r.reasons?.[0]||""}</span>
                  </div>
                  {r.signal==="BUY"&&!positions[sym]&&(
                    <button onClick={()=>setConfirmModal({sym,price:r.price,type:"BUY"})} style={{marginTop:12,width:"100%",background:"rgba(52,211,153,.12)",color:C.green,border:`1.5px solid ${C.green}`,borderRadius:10,padding:"10px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                      Buy {sym}
                    </button>
                  )}
                </Card>
              );
            })}
          </>
        )}

        {/* ── POSITIONS ── */}
        {tab==="positions"&&(
          <>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>
              Open Positions <span style={{fontSize:14,color:C.dim,fontWeight:400}}>({posCount})</span>
            </div>

            {posCount===0?(
              <Card style={{textAlign:"center",padding:40}}>
                <div style={{fontSize:32,marginBottom:12}}>📭</div>
                <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>No open positions</div>
                <div style={{fontSize:14,color:C.dim,lineHeight:1.5}}>Start the auto-trader or tap Buy on a signal in the Scan tab.</div>
              </Card>
            ):Object.entries(positions).map(([sym,pos])=>{
              const price=prices[sym]?.price||0;
              const pnlPct=pos.entryPrice?((price-pos.entryPrice)/pos.entryPrice)*100:0;
              return(
                <Card key={sym} style={{marginBottom:12,borderLeft:`3px solid ${pnlPct>=0?C.green:C.red}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                    <div>
                      <div style={{fontSize:22,fontWeight:800,color:C.text}}>{sym}</div>
                      <div style={{fontSize:13,color:C.dim,marginTop:3}}>Entry {fp(pos.entryPrice||0)}</div>
                      <div style={{fontSize:13,color:C.dim}}>Now {fp(price)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:26,fontWeight:800,color:pnlPct>=0?C.green:C.red}}>{pnlPct>=0?"+":""}{pnlPct.toFixed(2)}%</div>
                      <div style={{fontSize:14,color:C.dim}}>${(pos.qty*price).toFixed(2)}</div>
                    </div>
                  </div>
                  {/* P&L bar */}
                  <div style={{height:6,background:C.border,borderRadius:3,marginBottom:12,overflow:"hidden"}}>
                    <div style={{height:"100%",background:pnlPct>=0?C.green:C.red,width:`${Math.min(100,Math.abs(pnlPct)/risk.takeProfit*100)}%`,borderRadius:3,transition:"width .5s"}}/>
                  </div>
                  <div style={{display:"flex",gap:10,fontSize:12,color:C.dim,marginBottom:14}}>
                    <span style={{background:"rgba(248,113,113,.12)",color:C.red,padding:"4px 10px",borderRadius:10}}>SL -{risk.stopLoss}%</span>
                    <span style={{background:"rgba(52,211,153,.12)",color:C.green,padding:"4px 10px",borderRadius:10}}>TP +{risk.takeProfit}%</span>
                    <span style={{color:C.dim}}>{pos.qty?.toFixed(4)} units</span>
                  </div>
                  <button onClick={()=>setConfirmModal({sym,price,type:"SELL",pnlPct})} style={{width:"100%",background:"rgba(248,113,113,.12)",color:C.red,border:`1.5px solid ${C.red}`,borderRadius:10,padding:"12px",fontSize:14,fontWeight:800,cursor:"pointer"}}>
                    Close Position
                  </button>
                </Card>
              );
            })}

            {/* Trade history */}
            {trades.length>0&&(
              <Card style={{marginTop:8}}>
                <div style={{fontSize:11,letterSpacing:2,color:C.dim,textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Recent Trades</div>
                {[...trades].reverse().slice(0,10).map((t,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                        <span style={{fontWeight:800,color:t.type==="BUY"?C.green:C.yellow,fontSize:13}}>{t.type}</span>
                        <span style={{fontWeight:700,fontSize:14}}>{t.sym}</span>
                      </div>
                      <div style={{fontSize:11,color:C.dim}}>{new Date(t.time).toLocaleDateString()} {new Date(t.time).toLocaleTimeString()}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:13,fontWeight:700}}>{fp(t.price)}</div>
                      {t.pnlPct!==undefined&&<div style={{fontSize:13,fontWeight:800,color:t.pnlPct>0?C.green:C.red}}>{t.pnlPct>0?"+":""}{t.pnlPct.toFixed(2)}%</div>}
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* ── FUND BOT ── */}
        {tab==="fund"&&botWallet&&(
          <>
            <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>Fund Your Bot</div>
            <div style={{fontSize:14,color:C.dim,marginBottom:20,lineHeight:1.5}}>Follow these steps to send money to the bot. Takes about 2 minutes.</div>

            {/* STEP 1 */}
            <Card style={{marginBottom:12,borderTop:`3px solid ${C.accent}`}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#060a14",flexShrink:0}}>1</div>
                <div style={{fontSize:16,fontWeight:800}}>Copy the Bot's Address</div>
              </div>
              <div style={{fontSize:12,color:C.dim,marginBottom:12,lineHeight:1.5}}>This is the bot's Ethereum wallet. Send ETH or USDC to this address — the bot trades from it.</div>
              <div style={{background:"#050910",border:`2px solid ${C.accent}`,borderRadius:12,padding:"14px",marginBottom:12,wordBreak:"break-all",fontSize:13,color:C.text,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
                {botWallet.address}
              </div>
              <BigBtn label={showCopied?"✓ Copied!":"⎘ Copy Address"} color={showCopied?C.green:C.accent} onClick={()=>{
                navigator.clipboard.writeText(botWallet.address);
                setShowCopied(true);setTimeout(()=>setShowCopied(false),2500);
                toast_("Address copied — now open your wallet app and send funds to this address","success");
              }}/>
              <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:8}}>
                {[["✓","ETH or USDC only",C.green],["✓","Ethereum network only",C.green],["✗","Don't send from an exchange",C.red]].map(([i,t,c])=>(
                  <span key={t} style={{fontSize:12,color:c,display:"flex",gap:4,alignItems:"center"}}><strong>{i}</strong>{t}</span>
                ))}
              </div>
            </Card>

            {/* STEP 2 */}
            <Card style={{marginBottom:12,borderTop:`3px solid ${C.purple}`}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:C.purple,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#060a14",flexShrink:0}}>2</div>
                <div style={{fontSize:16,fontWeight:800}}>Send from Your Wallet</div>
              </div>
              {[
                {e:"🦊",n:"MetaMask",s:["Open MetaMask","Tap 'Send'","Paste the address above","Choose ETH or USDC, enter amount","Tap Confirm"]},
                {e:"🔵",n:"Coinbase Wallet",s:["Open Coinbase Wallet","Tap 'Send'","Paste the address","Pick ETH or USDC","Enter amount and send"]},
                {e:"🛡️",n:"Trust Wallet",s:["Open Trust Wallet","Tap 'Send'","Choose Ethereum","Paste address, enter amount","Confirm"]},
              ].map(({e,n,s})=>(
                <div key={n} style={{background:"#050910",borderRadius:12,padding:14,marginBottom:10}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                    <span style={{fontSize:22}}>{e}</span>
                    <span style={{fontSize:15,fontWeight:700}}>{n}</span>
                  </div>
                  <ol style={{margin:0,padding:"0 0 0 18px",fontSize:13,color:C.dim,lineHeight:2}}>
                    {s.map((step,i)=><li key={i}>{step}</li>)}
                  </ol>
                </div>
              ))}
            </Card>

            {/* STEP 3 */}
            <Card style={{marginBottom:12,borderTop:`3px solid ${C.yellow}`}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:C.yellow,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#060a14",flexShrink:0}}>3</div>
                <div style={{fontSize:16,fontWeight:800}}>How Much to Send?</div>
              </div>
              <Row left="Just testing" right="$50 – $100" rightColor={C.text}/>
              <Row left="Comfortable start" right="$200 – $500" rightColor={C.text}/>
              <Row left="Serious trading" right="$500+" rightColor={C.text}/>
              <Row left="ETH for gas (required)" right="0.05 ETH (~$150)" rightColor={C.yellow} border={false}/>
              <div style={{marginTop:12,padding:12,background:"rgba(56,189,248,.06)",borderRadius:10,fontSize:13,color:C.dim,lineHeight:1.6}}>
                <strong style={{color:C.accent}}>Example:</strong> Send 0.05 ETH + $200 USDC. The bot trades the USDC and uses the ETH to pay gas fees on each trade.
              </div>
            </Card>

            {/* STEP 4 */}
            <Card style={{marginBottom:12,borderTop:`3px solid ${C.green}`}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:C.green,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#060a14",flexShrink:0}}>4</div>
                <div style={{fontSize:16,fontWeight:800}}>What Happens After</div>
              </div>
              {[
                {icon:"📨",title:"Funds confirmed on Ethereum",time:"~30 seconds"},
                {icon:"👀",title:"Bot detects your balance",time:"Within 1 min"},
                {icon:"🔍",title:"AI scans market every 90 sec",time:"Automatic"},
                {icon:"💱",title:"Bot trades on Uniswap",time:"When 65%+ confidence"},
                {icon:"💸",title:`${risk.profitSendPct}% of profits sent to ${payoutAddr.slice(0,8)}...`,time:"After each win"},
              ].map(({icon,title,time},i)=>(
                <div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<4?`1px solid ${C.border}`:"none",alignItems:"flex-start"}}>
                  <span style={{fontSize:20,flexShrink:0}}>{icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>{title}</div>
                    <div style={{fontSize:12,color:C.dim,marginTop:2}}>{time}</div>
                  </div>
                </div>
              ))}
            </Card>

            {/* Safety */}
            <Card style={{marginBottom:16,background:"rgba(248,113,113,.05)",border:`1px solid rgba(248,113,113,.2)`}}>
              <div style={{fontSize:14,fontWeight:800,color:C.red,marginBottom:10}}>⚠ Before You Send</div>
              {["Always paste the address — never type it manually","Only use Ethereum network — not Polygon or BSC","Start small — test with $50 before larger amounts","Transactions cannot be undone — double check everything"].map(t=>(
                <div key={t} style={{display:"flex",gap:8,fontSize:13,color:C.dim,padding:"6px 0",borderBottom:`1px solid ${C.border}`,lineHeight:1.4}}>
                  <span style={{color:C.red,flexShrink:0}}>!</span>{t}
                </div>
              ))}
            </Card>

            {/* Recovery phrase */}
            <Card style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:15,fontWeight:800}}>🔐 Recovery Phrase</div>
                <button onClick={()=>setShowMnemonic(m=>!m)} style={{background:"transparent",color:C.accent,border:`1.5px solid ${C.accent}`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:800,cursor:"pointer"}}>
                  {showMnemonic?"Hide":"Show"}
                </button>
              </div>
              <div style={{fontSize:13,color:C.dim,marginBottom:showMnemonic?12:0,lineHeight:1.5}}>Your backup if you clear browser storage. Write this on paper.</div>
              {showMnemonic&&(
                <>
                  <div style={{padding:10,background:"rgba(248,113,113,.08)",borderRadius:10,fontSize:12,color:C.red,marginBottom:12}}>Do not screenshot this. Write it on paper only.</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
                    {botWallet.mnemonic.split(" ").map((word,i)=>(
                      <div key={i} style={{background:"#050910",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{fontSize:9,color:C.dim,minWidth:12}}>{i+1}</span>
                        <span style={{fontSize:12,color:C.accent,fontWeight:700}}>{word}</span>
                      </div>
                    ))}
                  </div>
                  <SubBtn label="⎘ Copy Phrase" onClick={()=>{navigator.clipboard.writeText(botWallet.mnemonic);toast_("Copied — store offline only, never in a text or screenshot","success");}}/>
                </>
              )}
            </Card>
          </>
        )}

        {/* ── AI BRAIN ── */}
        {tab==="brain"&&(
          <>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>AI Brain</div>

            <Card style={{marginBottom:12}}>
              <div style={{fontSize:11,letterSpacing:2,color:C.dim,textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Learning Stats</div>
              <Row left="Generation" right={`#${brain.generation}`} rightColor={C.purple}/>
              <Row left="Win Rate" right={`${brain.winRate.toFixed(1)}%`} rightColor={brain.winRate>=50?C.green:C.red}/>
              <Row left="Trades Learned" right={brain.tradeMemory.length} rightColor={C.accent}/>
              <Row left="Total P&L" right={`${brain.totalPnl>=0?"+":""}${brain.totalPnl.toFixed(2)}%`} rightColor={brain.totalPnl>=0?C.green:C.red} border={false}/>
            </Card>

            <Card style={{marginBottom:12}}>
              <div style={{fontSize:11,letterSpacing:2,color:C.dim,textTransform:"uppercase",fontWeight:700,marginBottom:14}}>Indicator Weights</div>
              <div style={{fontSize:13,color:C.dim,marginBottom:14,lineHeight:1.5}}>Each bar shows how much the bot trusts this indicator. Green = reliable. Red = underperforming. Weights update after every trade.</div>
              {Object.entries(brain.weights).sort((a,b)=>b[1]-a[1]).map(([name,weight])=>{
                const pct=((weight-.1)/(2.5-.1))*100;
                const color=weight>1.2?C.green:weight<.8?C.red:C.yellow;
                return(
                  <div key={name} style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:14,fontWeight:700,textTransform:"capitalize"}}>{name}</span>
                      <span style={{fontSize:14,fontWeight:800,color}}>{weight.toFixed(2)}×</span>
                    </div>
                    <div style={{height:8,background:C.border,borderRadius:4}}>
                      <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:4,transition:"width .6s"}}/>
                    </div>
                  </div>
                );
              })}
              {brain.generation>0&&(
                <div style={{marginTop:4,padding:12,background:"rgba(56,189,248,.06)",borderRadius:12,fontSize:13,color:C.dim,lineHeight:1.7}}>
                  🏆 Strongest: <strong style={{color:C.green}}>{brain.top()?.[0]}</strong><br/>
                  ⚠️ Weakest: <strong style={{color:C.red}}>{brain.worst()?.[0]}</strong>
                </div>
              )}
            </Card>

            {brain.tradeMemory.length>0&&(
              <Card>
                <div style={{fontSize:11,letterSpacing:2,color:C.dim,textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Trade Memory</div>
                {[...brain.tradeMemory].reverse().slice(0,10).map((t,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
                    <span style={{fontSize:14,fontWeight:700,color:C.text}}>{t.sym||"Trade"}</span>
                    <span style={{fontSize:12,color:C.dim}}>{new Date(t.time).toLocaleTimeString()}</span>
                    <span style={{fontSize:15,fontWeight:800,color:t.pnlPct>0?C.green:C.red}}>{t.pnlPct>0?"+":""}{t.pnlPct?.toFixed(2)}%</span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

      </div>

      {/* BOTTOM NAV */}
      <BottomNav tab={tab} setTab={setTab} autoOn={autoOn}/>

      {/* CONFIRM MODAL */}
      {confirmModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(6,10,20,.88)",zIndex:200,display:"flex",alignItems:"flex-end",padding:"0 0 env(safe-area-inset-bottom)"}}>
          <div style={{background:C.panel,borderRadius:"24px 24px 0 0",padding:"28px 20px 32px",width:"100%",border:`1px solid ${C.border}`}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 24px"}}/>
            <div style={{fontSize:22,fontWeight:800,marginBottom:6,color:confirmModal.type==="BUY"?C.green:C.red}}>
              {confirmModal.type==="BUY"?"Confirm Buy":"Close Position"}
            </div>
            <div style={{fontSize:15,color:C.dim,marginBottom:20,lineHeight:1.5}}>
              {confirmModal.type==="BUY"
                ?`Buy ${confirmModal.sym} at ${fp(confirmModal.price)} using ${risk.maxPerTrade}% of bot balance. Stop-loss at -${risk.stopLoss}%, take-profit at +${risk.takeProfit}%.`
                :`Sell all ${confirmModal.sym} at ${fp(confirmModal.price)}. P&L: ${confirmModal.pnlPct>0?"+":""}${confirmModal.pnlPct?.toFixed(2)}%.`
              }
            </div>
            <div style={{padding:12,background:"rgba(251,191,36,.08)",borderRadius:12,marginBottom:20,fontSize:13,color:C.yellow}}>
              ⚠ Currently paper trading — no real funds moved.
            </div>
            <BigBtn label={`Confirm ${confirmModal.type}`} color={confirmModal.type==="BUY"?C.green:C.red} onClick={()=>{
              if(confirmModal.type==="BUY")openPos(confirmModal.sym,confirmModal.price);
              else closePos(confirmModal.sym,confirmModal.price,confirmModal.pnlPct||0,"MANUAL");
              setConfirmModal(null);
            }}/>
            <div style={{height:12}}/>
            <SubBtn label="Cancel" onClick={()=>setConfirmModal(null)} color={C.dim}/>
          </div>
        </div>
      )}
    </div>
  );
}
