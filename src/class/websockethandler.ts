import Offer from './offer';
import Answer from './answer';
import Candidate from './candidate';

let isPrivate: boolean;

// [{sessonId:[connectionId,...]}]
//const clients: Map<WebSocket, Set<string>> = new Map<WebSocket, Set<string>>();

// [{connectionId:[sessionId1, sessionId2]}]
// const connectionPair: Map<string, [WebSocket, WebSocket]> = new Map<string, [WebSocket, WebSocket]>();
//Map< roomName, [avatar, player, dashboard] > 아바타,플레이어,데쉬보드만! 많으면 속도문제 발생)
//const rooms: Map<string, [WebSocket, WebSocket, WebSocket]> = new Map<string, [WebSocket, WebSocket, WebSocket]>();

interface ISlot {
  ws: WebSocket;
  who: string;
}
// const rooms: Map<string, Set<ISlot>> = new Map<string, Set<ISlot>>();
const rooms: Map<string, [ISlot, ISlot, ISlot]> = new Map<string, [ISlot, ISlot, ISlot]>();

function reset(mode: string): void {
  isPrivate = true;//mode == "private";
}

function add(ws: WebSocket): void {
}

function remove(ws: WebSocket): void {
}

function onReqAvatarList(ws: WebSocket): void {
  const avatarList: string[] = [];
  rooms.forEach((value, key, map) => {
    avatarList.push(key)
  });
  ws.send(JSON.stringify({ type: "gotAvatarList", avatarList: avatarList.sort() }));
}
//idevkim
function send_error(ws: WebSocket, msg: string): void {
  ws.send(JSON.stringify({ type: "error", msg: msg }));
  console.error(`error => ${msg}`);
}

// idevkim : msg.janus 용 테스트 코드
////////////////////////////////////////////////////////////////////////////////////
function onCreate(ws: WebSocket, msg: any): void {
  ws.send(JSON.stringify({ type: "request", id: msg.transaction }));
}

////////////////////////////////////////////////////////////////////////////////////
function onConnect(ws: WebSocket, msg: any): void {
  switch (msg.who) {
    case "avatar":
    case "player":
    case "dashboard"://observer
      connect_room(ws, msg.id, msg.who);
      console.log(`${msg.who}:${msg.id}:::onConnect()`);
      break;
    default:
      send_error(ws, `${msg.id}: onConnect() who가 필요합니다(대소문자확인).`);
      break;
  }
}
function connect_room(ws: WebSocket, id: string, who: string): void {
  if(who == "avatar") {
    if (rooms.has(id)) {//방이 이미 존재함.
      send_error(ws, `${id}: This room already exists.`);
      return;
    }
    rooms.set(id, [{ws: ws, who: who}, null, null]);//방 생성 : 아바타이름으로...created_room      
  }
  const room = rooms.get(id);
  if (!room) {//방이 존재하지 않음.
    send_error(ws, `${id}: This room is not found.`);
    return;
  }
  if      (who == "player")     room[1] = {ws: ws, who: who};
  else if (who == "dashboard")  room[2] = {ws: ws, who: who};
 
  room.forEach( slot => {
    if(slot)//모두에게 알림. 중요!특히 "avatar"에게 알려 offer를 보내도록함.
      slot.ws.send(JSON.stringify({ type: "connect", id: id, who: who, polite: true }));//polite 아직 정확한 의미, 용도를 모르겠음.  
  });
}
////////////////////////////////////////////////////////////////////////////////////
function onDisconnect(ws: WebSocket, msg: any): void {
  switch (msg.who) {
    case "avatar":
    case "player":
    case "dashboard"://observer
      disconnect_room(ws, msg.id, msg.who);
      console.log(`${msg.who}:${msg.id}:::onDisconnect()`);
      break;
    default:
      send_error(ws, `${msg.id}: onDisconnect() who가 필요합니다(대소문자확인).`);
      break;
  }
}
function disconnect_room(ws: WebSocket, id: string, who: string): void {
  const room = rooms.get(id);
  if (room) {//disconnect 전송후 삭제
    room.forEach( slot => {
      if(slot)//모두에게 알림.
        slot.ws.send(JSON.stringify({ type: "disconnect", id: id, who: who }));
    });
    switch (who) {
      case "avatar":    rooms.delete(id); break;
      case "player":    room[1] = null;   break;
      case "dashboard": room[2] = null;   break;
    }
  } else { //방이 존재하지 않음.
    send_error(ws, `${id}: This room is not found.`);
  }
}
////////////////////////////////////////////////////////////////////////////////////
function onOffer(ws: WebSocket, msg: any): void {//ws: "avatar", msg: id, sdp, type
  console.log(`${ws.protocol}:${msg.id}:::onOffer()`);

  const id = msg.id as string;
  const newOffer = new Offer(msg.sdp, Date.now(), false);

  const room = rooms.get(id);
  const otherWs = room[0].ws == ws ? room[1].ws : room[0].ws;
  if (otherWs) {
    newOffer.polite = true;
    // otherWs.send(JSON.stringify({ from: id, to: "", type: "offer", data: newOffer }));
    //idvkim : 일단 sdp만 넘기는걸로.
    otherWs.send(JSON.stringify({ from: id, to: "", type: "offer", sdp: msg.sdp }));
  }
}

function onAnswer(ws: WebSocket, msg: any): void {
  //ws:::"player",data(sdp,id),from,type

//player에서 data로 넘어옴
  msg = msg.data;//임시로

  console.log(`${ws.protocol}:${msg.id}:::onAnswer()`);  

  const id = msg.id as string;
  // const newAnswer = new Answer(msg.sdp, Date.now());

  const room = rooms.get(id);
  const otherWs = room[0].ws == ws ? room[1].ws : room[0].ws;
  // otherWs.send(JSON.stringify({ from: id, to: "", type: "answer", data: newAnswer }));
  otherWs.send(JSON.stringify({ from: id, to: "", type: "answer", sdp: msg.sdp }));
}

function onCandidate(ws: WebSocket, msg: any): void {//1.ws::player, msg::data{condidate,id,sdpMid,sdpMidLine},from, type
//ws:::"player",data(sdp,id),from,type

//player에서 data로 넘어옴
  if(ws.protocol == "player"){
    msg = msg.data;
    return; //플레이어는 비디어 데이터를 보낼필요없으니... 굳이...
  }

  console.log(`${ws.protocol}:${msg.id}:::onCandidate()`);    

// esp에서 candidate 않옴 ...

  const id = msg.id;
  // const candidate = new Candidate(msg.candidate, msg.sdpMLineIndex, msg.sdpMid, Date.now());

  const room = rooms.get(id);
  const otherWs = room[0].ws == ws ? room[1].ws : room[0].ws;
  if (otherWs) {
    otherWs.send(JSON.stringify({ from: id, to: "", type: "candidate", candidate: msg.candidate, sdpMLineIndex: msg.sdpMLineIndex, sdpMid: msg.sdpMid }));
  }
}

export { onCreate, reset, add, remove, onReqAvatarList, onConnect, onDisconnect, onOffer, onAnswer, onCandidate };