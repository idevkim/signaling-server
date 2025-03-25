import * as Logger from "./logger.js";

export class WebSocketSignaling extends EventTarget {

  constructor(interval = 1000) {
    super();
    this.interval = interval;
    this.sleep = msec => new Promise(resolve => setTimeout(resolve, msec));

    let websocketUrl;
    if (location.protocol === "https:") {
      websocketUrl = "wss://" + location.host;
    } else {
      websocketUrl = "ws://" + location.host;
    }
    const protocols = "player"//player 정보만 보낸다. id는 아직 미정이고 플랫폼은 다양함으로.. 
    this.websocket = new WebSocket(websocketUrl, protocols);//signaling server에서 누구의 소켓인가확인할때 필요.
    this.id = null;

    this.websocket.onopen = () => {
      this.isWsOpen = true;
      this.dispatchEvent(new CustomEvent('wsOpen', {}));//idevkim 소켓생성후 자동처리시작
    };

    this.websocket.onclose = () => {
      this.isWsOpen = false;
      this.dispatchEvent(new CustomEvent('wsClose', {}));//idevkim
    };

    this.websocket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg || !this) {
        return;
      }
      
      Logger.log(msg);
      // console.log(msg.type);

      switch (msg.type) {
        case "connect":
          this.dispatchEvent(new CustomEvent('connect', { detail: msg }));
          break;
        case "disconnect":
          this.dispatchEvent(new CustomEvent('disconnect', { detail: msg }));
          break;
        case "offer":
          this.dispatchEvent(new CustomEvent('offer', { detail: { id: msg.from, sdp: msg.sdp, polite: msg.polite } }));
          break;
        case "answer":
          this.dispatchEvent(new CustomEvent('answer', { detail: { id: msg.from, sdp: msg.sdp } }));
          break;
        case "candidate":
          this.dispatchEvent(new CustomEvent('candidate', { detail: { id: msg.from, candidate: msg.candidate, sdpMLineIndex: msg.sdpMLineIndex, sdpMid: msg.sdpMid } }));
          break;
        case "error":
          this.dispatchEvent(new CustomEvent('error', { detail: msg }));
          break;        
        case "gotAvatarList":
          this.dispatchEvent(new CustomEvent('gotAvatarList', { detail: msg }));
          break;
        default:
          break;
      }
    };
  }

  async start() {
    while (!this.isWsOpen) {
      await this.sleep(100);
    }
  }

  async stop() {
    this.websocket.close();
    while (this.isWsOpen) {
      await this.sleep(100);
    }
  }

  reqAvatarList() {
    const sendJson = JSON.stringify({ type: "reqAvatarList" });
    Logger.log(sendJson);
    this.websocket.send(sendJson);
  }

  sendConnection(id, who) {
    const sendJson = JSON.stringify({ type: "connect", id: id, who: who });
    Logger.log(sendJson);
    this.websocket.send(sendJson);
  }

  sendDisConnection(id, who) {
    const sendJson = JSON.stringify({ type: "disconnect", id: id, who: who });
    Logger.log(sendJson);
    this.websocket.send(sendJson);
  }

  sendOffer(id, sdp) {
    const data = { 'sdp': sdp, 'id': id };
    const sendJson = JSON.stringify({ type: "offer", from: id, data: data });
    Logger.log(sendJson);
    this.websocket.send(sendJson);
  }

  sendAnswer(id, sdp) {
    const data = { 'sdp': sdp, 'id': id };
    const sendJson = JSON.stringify({ type: "answer", from: id, data: data });
    Logger.log(sendJson);
    this.websocket.send(sendJson);
  }

  sendCandidate(id, candidate, sdpMLineIndex, sdpMid) {
    const data = {
      'candidate': candidate,
      'sdpMLineIndex': sdpMLineIndex,
      'sdpMid': sdpMid,
      'id': id
    };
    const sendJson = JSON.stringify({ type: "candidate", from: id, data: data });
    Logger.log(sendJson);
    this.websocket.send(sendJson);
  }
}
