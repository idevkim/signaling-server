import * as websocket from "ws";
import { Server } from 'http';
import * as handler from "./class/websockethandler";

export default class WSSignaling {
  server: Server;
  wss: websocket.Server;

  constructor(server: Server, mode: string) {
    this.server = server;
    this.wss = new websocket.Server({ server });
    handler.reset(mode);//idevkim : private로 고정하자 => isPrivate = true;

    this.wss.on('connection', (ws: WebSocket) => {

      handler.add(ws);

      ws.onclose = (): void => {
        handler.remove(ws);
      };

      ws.onmessage = (event: MessageEvent): void => {
        // type: connect, disconnec, offer, answer, candidate JSON Schema
        // connectionId: connect or disconnect connectionId
        // from: from connection id
        // to: to connection id
        // data: any message data structure

        const msg = JSON.parse(event.data);
        if (!msg || !this) {
          return;
        }

        switch (msg.janus) {
          case "create":
            handler.onCreate(ws, msg);//return rooms.key(방이름)
            break;
          case "connect":
            handler.onConnect(ws, msg);
            break;
          case "disconnect":
            handler.onDisconnect(ws, msg);
            break;
          case "offer":
            handler.onOffer(ws, msg);
            break;
          case "answer":
            handler.onAnswer(ws, msg);
            break;
          case "candidate":
            handler.onCandidate(ws, msg);
            break;
          default:
            break;
        }


        switch (msg.type) {
          case "reqAvatarList":
            handler.onReqAvatarList(ws);//return rooms.key(방이름)
            break;
          case "connect":
            handler.onConnect(ws, msg);
            break;
          case "disconnect":
            handler.onDisconnect(ws, msg);
            break;
          case "offer":
            handler.onOffer(ws, msg);
            break;
          case "answer":
            handler.onAnswer(ws, msg);
            break;
          case "candidate":
            handler.onCandidate(ws, msg);
            break;
          default:
            break;
        }
      };
    });
  }
}
