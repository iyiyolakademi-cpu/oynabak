/* Legal chess rules preserved from the existing OynaBak Satranç game.
   Move state is replayed deterministically from the room's ordered moves. */
(()=>{
'use strict';
const FILES='abcdefgh';
const PIECE_NAME={k:'Şah',q:'Vezir',r:'Kale',b:'Fil',n:'At',p:'Piyon'};
const VALUE={p:1,n:3,b:3,r:5,q:9,k:0};

let game;
let selected=null;
let selectedMoves=[];
let undoStack=[];
let promotionMove=null;
let positionCounts=new Map();
let positionHistory=[];
let clockState={w:Infinity,b:Infinity,last:0,running:false,paused:false};
let clockTimer=null;
let config={whiteName:'A Oyuncusu',blackName:'B Oyuncusu',minutes:10,sound:true};
let matchStartedAt=0;
let decisionMode=null;
let toastTimer=null;
let animating=false;

const idx=(r,c)=>r*8+c;
const rc=i=>[Math.floor(i/8),i%8];
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const enemy=c=>c==='w'?'b':'w';
const cp=p=>p?{c:p.c,t:p.t}:null;
const cloneBoard=b=>b.map(cp);

function initialBoard(){
  const b=Array(64).fill(null);
  const back=['r','n','b','q','k','b','n','r'];
  for(let c=0;c<8;c++){
    b[idx(0,c)]={c:'b',t:back[c]};
    b[idx(1,c)]={c:'b',t:'p'};
    b[idx(6,c)]={c:'w',t:'p'};
    b[idx(7,c)]={c:'w',t:back[c]};
  }
  return b;
}

function createGame(){
  return{
    board:initialBoard(),
    turn:'w',
    castle:{wK:true,wQ:true,bK:true,bQ:true},
    ep:null,
    halfmove:0,
    fullmove:1,
    last:null,
    captured:[],
    moves:[],
    finished:false
  };
}

function snapshot(){
  return{
    board:cloneBoard(game.board),
    turn:game.turn,
    castle:{...game.castle},
    ep:game.ep,
    halfmove:game.halfmove,
    fullmove:game.fullmove,
    last:game.last?{...game.last}:null,
    captured:game.captured.map(cp),
    moves:game.moves.slice(),
    finished:game.finished,
    positionHistory:positionHistory.slice(),
    clocks:{w:clockState.w,b:clockState.b}
  };
}

function restore(s){
  game.board=cloneBoard(s.board);
  game.turn=s.turn;
  game.castle={...s.castle};
  game.ep=s.ep;
  game.halfmove=s.halfmove;
  game.fullmove=s.fullmove;
  game.last=s.last?{...s.last}:null;
  game.captured=s.captured.map(cp);
  game.moves=s.moves.slice();
  game.finished=s.finished;
  positionHistory=s.positionHistory?s.positionHistory.slice():[];
  if(s.clocks){clockState.w=s.clocks.w;clockState.b=s.clocks.b}
}

function squareName(i){
  const [r,c]=rc(i);
  return FILES[c]+(8-r);
}

function findKing(board,color){
  for(let i=0;i<64;i++){
    const p=board[i];
    if(p&&p.c===color&&p.t==='k')return i;
  }
  return -1;
}

function attacked(board,target,by){
  const [tr,tc]=rc(target);

  const pawnRow=tr+(by==='w'?1:-1);
  for(const dc of [-1,1]){
    const cc=tc+dc;
    if(inside(pawnRow,cc)){
      const p=board[idx(pawnRow,cc)];
      if(p&&p.c===by&&p.t==='p')return true;
    }
  }

  for(const [dr,dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){
    const r=tr+dr,c=tc+dc;
    if(inside(r,c)){
      const p=board[idx(r,c)];
      if(p&&p.c===by&&p.t==='n')return true;
    }
  }

  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;
    const r=tr+dr,c=tc+dc;
    if(inside(r,c)){
      const p=board[idx(r,c)];
      if(p&&p.c===by&&p.t==='k')return true;
    }
  }

  const dirs=[
    [1,0,['r','q']],[-1,0,['r','q']],[0,1,['r','q']],[0,-1,['r','q']],
    [1,1,['b','q']],[1,-1,['b','q']],[-1,1,['b','q']],[-1,-1,['b','q']]
  ];

  for(const [dr,dc,types] of dirs){
    let r=tr+dr,c=tc+dc;
    while(inside(r,c)){
      const p=board[idx(r,c)];
      if(p){
        if(p.c===by&&types.includes(p.t))return true;
        break;
      }
      r+=dr;c+=dc;
    }
  }
  return false;
}

function inCheck(board,color){
  const k=findKing(board,color);
  return k>=0&&attacked(board,k,enemy(color));
}

function addMove(out,from,to,p,extra={}){
  const q=game.board[to];
  if(q&&q.c===p.c)return;
  out.push({from,to,capture:Boolean(q),...extra});
}

function pseudoMoves(from,attackMode=false,state=game){
  const p=state.board[from];
  if(!p)return[];
  const [r,c]=rc(from);
  const out=[];
  const add=(to,extra={})=>{
    const q=state.board[to];
    if(q&&q.c===p.c)return;
    out.push({from,to,capture:Boolean(q),...extra});
  };

  if(p.t==='p'){
    const dir=p.c==='w'?-1:1;
    const start=p.c==='w'?6:1;
    const promo=p.c==='w'?0:7;

    if(!attackMode){
      const r1=r+dir;
      if(inside(r1,c)&&!state.board[idx(r1,c)]){
        add(idx(r1,c),{promotion:r1===promo});
        const r2=r+dir*2;
        if(r===start&&!state.board[idx(r2,c)])add(idx(r2,c),{double:true});
      }
    }

    for(const dc of [-1,1]){
      const rr=r+dir,cc=c+dc;
      if(!inside(rr,cc))continue;
      const to=idx(rr,cc);
      if(attackMode){out.push({from,to});continue}
      const q=state.board[to];
      if(q&&q.c!==p.c)add(to,{promotion:rr===promo});
      else if(state.ep===to){
        const cap=idx(r,cc),epPawn=state.board[cap];
        if(epPawn&&epPawn.c!==p.c&&epPawn.t==='p'){
          out.push({from,to,capture:true,enPassant:true,epCapture:cap});
        }
      }
    }
    return out;
  }

  if(p.t==='n'){
    for(const [dr,dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){
      const rr=r+dr,cc=c+dc;
      if(inside(rr,cc))add(idx(rr,cc));
    }
    return out;
  }

  if(p.t==='b'||p.t==='r'||p.t==='q'){
    const dirs=[];
    if(p.t==='b'||p.t==='q')dirs.push([1,1],[1,-1],[-1,1],[-1,-1]);
    if(p.t==='r'||p.t==='q')dirs.push([1,0],[-1,0],[0,1],[0,-1]);
    for(const [dr,dc] of dirs){
      let rr=r+dr,cc=c+dc;
      while(inside(rr,cc)){
        const to=idx(rr,cc),q=state.board[to];
        if(!q)out.push({from,to,capture:false});
        else{
          if(q.c!==p.c)out.push({from,to,capture:true});
          break;
        }
        rr+=dr;cc+=dc;
      }
    }
    return out;
  }

  if(p.t==='k'){
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc)continue;
      const rr=r+dr,cc=c+dc;
      if(inside(rr,cc))add(idx(rr,cc));
    }

    if(!attackMode){
      const home=p.c==='w'?7:0;
      const enemyColor=enemy(p.c);
      const kingHome=idx(home,4);

      if(from===kingHome&&!inCheck(state.board,p.c)){
        const kRight=p.c==='w'?state.castle.wK:state.castle.bK;
        const qRight=p.c==='w'?state.castle.wQ:state.castle.bQ;

        if(kRight){
          const rook=state.board[idx(home,7)];
          if(rook&&rook.c===p.c&&rook.t==='r' &&
             !state.board[idx(home,5)]&&!state.board[idx(home,6)] &&
             !attacked(state.board,idx(home,5),enemyColor) &&
             !attacked(state.board,idx(home,6),enemyColor)){
            out.push({from,to:idx(home,6),castle:'K'});
          }
        }

        if(qRight){
          const rook=state.board[idx(home,0)];
          if(rook&&rook.c===p.c&&rook.t==='r' &&
             !state.board[idx(home,1)]&&!state.board[idx(home,2)]&&!state.board[idx(home,3)] &&
             !attacked(state.board,idx(home,3),enemyColor) &&
             !attacked(state.board,idx(home,2),enemyColor)){
            out.push({from,to:idx(home,2),castle:'Q'});
          }
        }
      }
    }
    return out;
  }

  return out;
}

function temporaryState(){
  return{
    board:cloneBoard(game.board),
    turn:game.turn,
    castle:{...game.castle},
    ep:game.ep,
    halfmove:game.halfmove,
    fullmove:game.fullmove,
    last:game.last?{...game.last}:null,
    captured:[],
    moves:[]
  };
}

function applyMove(state,m,promo='q',simulate=false){
  const moving=state.board[m.from];
  const captured=m.enPassant?state.board[m.epCapture]:state.board[m.to];

  state.board[m.to]=cp(moving);
  state.board[m.from]=null;

  if(m.enPassant)state.board[m.epCapture]=null;

  if(m.castle){
    const [r]=rc(m.from);
    if(m.castle==='K'){
      state.board[idx(r,5)]=state.board[idx(r,7)];
      state.board[idx(r,7)]=null;
    }else{
      state.board[idx(r,3)]=state.board[idx(r,0)];
      state.board[idx(r,0)]=null;
    }
  }

  if(m.promotion)state.board[m.to].t=promo;

  if(moving.t==='k'){
    if(moving.c==='w'){state.castle.wK=false;state.castle.wQ=false}
    else{state.castle.bK=false;state.castle.bQ=false}
  }

  if(moving.t==='r'){
    if(m.from===63)state.castle.wK=false;
    if(m.from===56)state.castle.wQ=false;
    if(m.from===7)state.castle.bK=false;
    if(m.from===0)state.castle.bQ=false;
  }

  if(captured&&captured.t==='r'){
    if(m.to===63)state.castle.wK=false;
    if(m.to===56)state.castle.wQ=false;
    if(m.to===7)state.castle.bK=false;
    if(m.to===0)state.castle.bQ=false;
  }

  state.ep=null;
  if(moving.t==='p'&&m.double){
    const [fr,fc]=rc(m.from),[tr]=rc(m.to);
    state.ep=idx((fr+tr)/2,fc);
  }

  if(moving.t==='p'||captured)state.halfmove=0;
  else state.halfmove++;

  if(moving.c==='b')state.fullmove++;

  state.last={from:m.from,to:m.to};
  if(!simulate&&captured)state.captured.push(cp(captured));
  state.turn=enemy(state.turn);
  return captured;
}

function legalMoves(from){
  const p=game.board[from];
  if(!p||p.c!==game.turn)return[];

  return pseudoMoves(from,false,game).filter(m=>{
    const t=temporaryState();
    applyMove(t,m,'q',true);
    return !inCheck(t.board,p.c);
  });
}

function allLegal(color=game.turn){
  const saved=game.turn;
  game.turn=color;
  const out=[];
  for(let i=0;i<64;i++){
    const p=game.board[i];
    if(p&&p.c===color)out.push(...legalMoves(i));
  }
  game.turn=saved;
  return out;
}

function notation(m,moving,captured,promo){
  if(m.castle)return m.castle==='K'?'O-O':'O-O-O';
  const symbol=moving.t==='p'?'':PIECE_NAME[moving.t][0];
  return symbol+squareName(m.from)+(captured?'x':'-')+squareName(m.to)+(m.promotion?'='+PIECE_NAME[promo][0]:'');
}

function positionKey(){
  const pieces=game.board.map(p=>p?p.c+p.t:'..').join('');
  return [
    pieces,game.turn,
    game.castle.wK?1:0,game.castle.wQ?1:0,
    game.castle.bK?1:0,game.castle.bQ?1:0,
    game.ep??'-'
  ].join('|');
}

function recordPosition(){
  const k=positionKey();
  positionHistory.push(k);
  positionCounts.set(k,(positionCounts.get(k)||0)+1);
}
function rebuildPositionCounts(){
  positionCounts=new Map();
  positionHistory.forEach(k=>positionCounts.set(k,(positionCounts.get(k)||0)+1));
}

function insufficientMaterial(){
  const pieces=[];
  for(let i=0;i<64;i++){
    const p=game.board[i];
    if(p&&p.t!=='k')pieces.push({p,i});
  }
  if(pieces.length===0)return true;
  if(pieces.length===1&&['b','n'].includes(pieces[0].p.t))return true;
  if(pieces.every(x=>x.p.t==='b')){
    const squareColors=pieces.map(x=>{const [r,c]=rc(x.i);return(r+c)%2});
    return squareColors.every(x=>x===squareColors[0]);
  }
  return false;
}

function getResult(){
  const legal=allLegal(game.turn);
  if(legal.length===0){
    if(inCheck(game.board,game.turn)){
      return{type:'checkmate',winner:enemy(game.turn),reason:'Şah mat'};
    }
    return{type:'draw',winner:null,reason:'Pat'};
  }

  if(game.halfmove>=100)return{type:'draw',winner:null,reason:'50 hamle kuralı'};
  if((positionCounts.get(positionKey())||0)>=3)return{type:'draw',winner:null,reason:'Üç kez aynı konum'};
  if(insufficientMaterial())return{type:'draw',winner:null,reason:'Yetersiz materyal'};

  return null;
}



function resetEngine(){
 game=createGame();selected=null;selectedMoves=[];undoStack=[];
 promotionMove=null;positionCounts=new Map();positionHistory=[];
 recordPosition();return game;
}
function legalMove(from,to,promo='q'){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>63||to<0||to>63)return null;
 if(!['q','r','b','n'].includes(promo))return null;
 return legalMoves(from).find(m=>m.to===to)||null;
}
function moveEngine(from,to,promo='q'){
 const m=legalMove(from,to,promo);
 if(!m)throw Error('Kurallara aykırı hamle');
 const moving=cp(game.board[m.from]);const captured=m.enPassant?cp(game.board[m.epCapture]):cp(game.board[m.to]);
 const notationText=notation(m,moving,captured,promo);
 applyMove(game,m,promo,false);
 game.moves.push(notationText);recordPosition();
 return {move:m,notation:notationText,result:getResult()};
}
function loadEngine(moves){
 if(!Array.isArray(moves)||moves.length>300)throw Error('Geçersiz maç geçmişi');
 resetEngine();
 for(const item of moves){
  if(!item||!Number.isInteger(item.from)||!Number.isInteger(item.to)||!['q','r','b','n'].includes(item.promo||'q'))
   throw Error('Bozuk satranç hamle kaydı');
  if(getResult())throw Error('Maç tamamlandıktan sonra hamle var');
  moveEngine(item.from,item.to,item.promo||'q');
 }
 return {game, result:getResult(),positionCount:positionHistory.length};
}
resetEngine();
window.OynaChessEngine={
 reset:resetEngine,load:loadEngine,move:moveEngine,legal:legalMoves,
 allLegal:allLegal,result:getResult,current:()=>game,
 enemy,squareName,inCheck,positionKey,counts:()=>new Map(positionCounts)
};
})();