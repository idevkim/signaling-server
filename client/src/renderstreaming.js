import Peer from "./peer.js";
import * as Logger from "./logger.js";

function uuid4() {
  var temp_url = URL.createObjectURL(new Blob());
  var uuid = temp_url.toString();
  URL.revokeObjectURL(temp_url);
  return uuid.split(/[:/]/g).pop().toLowerCase(); // remove prefixes
}

export class RenderStreaming {
  /**
   * @param signaling signaling class
   * @param {RTCConfiguration} config
   */
  constructor(signaling, config) {
    
    Logger.enable()
    
    this._peer = null;
    this._id = null;
    this._who = null;
    this.onConnect = function (id, who) { Logger.log(`Connect peer on ${id}-${who}.`); };
    this.onDisconnect = function (id, who) { Logger.log(`Disconnect peer on ${id}-${who}.`); };
    this.onGotOffer = function (id) { Logger.log(`On got Offer on ${id}.`); };
    this.onGotAnswer = function (id) { Logger.log(`On got Answer on ${id}.`); };
    this.onTrackEvent = function (data) { Logger.log(`OnTrack event peer with data:${data}`); };
    this.onAddChannel = function (data) { Logger.log(`onAddChannel event peer with data:${data}`); };
    this.onGotAvatarList = function (data) { Logger.log(`onGotAvatarList event peer with data:${data}`); };
    this.onWsOpen = function () { Logger.log(`onWsOpen event peer without data....`); };
    this.onWsClose = function () { Logger.log(`onWsClose event peer without data....`); };
    this.onError = function (data) { Logger.log(`onError event peer with data:${data}`); };

    this._config = config;
    this._signaling = signaling;
    this._signaling.addEventListener('connect', this._onConnect.bind(this));
    this._signaling.addEventListener('disconnect', this._onDisconnect.bind(this));
    this._signaling.addEventListener('offer', this._onOffer.bind(this));
    this._signaling.addEventListener('answer', this._onAnswer.bind(this));
    this._signaling.addEventListener('candidate', this._onIceCandidate.bind(this));
    this._signaling.addEventListener('gotAvatarList', this._onGotAvatarList.bind(this));
    this._signaling.addEventListener('wsOpen', this._onWsOpen.bind(this));
    this._signaling.addEventListener('wsClose', this._onWsClose.bind(this));
    this._signaling.addEventListener('error', this._error.bind(this));
  }

  async _onWsOpen(e) {
    this.onWsOpen();
  }

  async _onWsClose(e) {
    this.onWsClose();
  }

  async _onGotAvatarList(e) {
    const data = e.detail;
    this.onGotAvatarList(data.avatarList);
  }

  async _error(e) {
    const data = e.detail;
    this.onError(data);
  }    

  async _onConnect(e) {
    const data = e.detail;
    // console.info(`_onConnect(e): ${this._who} = who = ${data.who}`);
    if (this._id == data.id) {
      this._preparePeerConnection(this._id, data.polite);
      this.onConnect(data.id, data.who);
    }
  }

  async _onDisconnect(e) {
    const data = e.detail;
    // console.info(`_onDisconnect(e): ${this._who} = who = ${data.who}`);
    this.onDisconnect(data.id, data.who);
  }

  async _onOffer(e) {
    const offer = e.detail;
    if (!this._peer) {
      this._preparePeerConnection(offer.id, offer.polite);
    }
    const desc = new RTCSessionDescription({ sdp: offer.sdp, type: "offer" });
    try {
      await this._peer.onGotDescription(offer.id, desc);
    } catch (error) {
      Logger.warn(`Error happen on GotDescription that description.\n Message: ${error}\n RTCSdpType:${desc.type}\n sdp:${desc.sdp}`);
      return;
    }
  }

  async _onAnswer(e) {
    const answer = e.detail;
    const desc = new RTCSessionDescription({ sdp: answer.sdp, type: "answer" });
    if (this._peer) {
      try {
        await this._peer.onGotDescription(answer.id, desc);
      } catch (error) {
        Logger.warn(`Error happen on GotDescription that description.\n Message: ${error}\n RTCSdpType:${desc.type}\n sdp:${desc.sdp}`);
        return;
      }
    }
  }

  async _onIceCandidate(e) {
    const candidate = e.detail;
    const iceCandidate = new RTCIceCandidate({ candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex });
    if (this._peer) {
      await this._peer.onGotCandidate(candidate.id, iceCandidate);
    }
  }

  /**
   * if not set argument, a generated uuid is used.
   * @param {string | null} id
   */
  async sendConnection(id, who) {
    this._id = id ? id : uuid4();
    this._who = who;
    await this._signaling.sendConnection(this._id, this._who);
  }

  async sendDisConnection() {
    await this._signaling.sendDisConnection(this._id, this._who);
  }

  _preparePeerConnection(id, polite) {
    if (this._peer) {
      Logger.log('Close current PeerConnection');
      this._peer.close();
      this._peer = null;
    }

    // Create peerConnection with proxy server and set up handlers
    this._peer = new Peer(id, polite, this._config);
    this._peer.addEventListener('disconnect', () => {
      this.onDisconnect(`Receive disconnect message from peer. id:${id}`);
    });
    this._peer.addEventListener('trackevent', (e) => {
      const data = e.detail;
      this.onTrackEvent(data);
    });
    this._peer.addEventListener('adddatachannel', (e) => {
      const data = e.detail;
      this.onAddChannel(data);
    });
    this._peer.addEventListener('ongotoffer', (e) => {
      const id = e.detail.id;
      this.onGotOffer(id);
    });
    this._peer.addEventListener('ongotanswer', (e) => {
      const id = e.detail.id;
      this.onGotAnswer(id);
    });
    this._peer.addEventListener('sendoffer', (e) => {
      const offer = e.detail;
      this._signaling.sendOffer(offer.id, offer.sdp);
    });
    this._peer.addEventListener('sendanswer', (e) => {
      const answer = e.detail;
      this._signaling.sendAnswer(answer.id, answer.sdp);
    });
    this._peer.addEventListener('sendcandidate', (e) => {
      const candidate = e.detail;
      this._signaling.sendCandidate(candidate.id, candidate.candidate, candidate.sdpMid, candidate.sdpMLineIndex);
    });
    return this._peer;
  }

  /**
   * @returns {Promise<RTCStatsReport> | null}
   */
  async getStats() {
    return await this._peer.getStats(this._id);
  }

  /**
   * @param {string} label
   * @returns {RTCDataChannel | null}
   */
  createDataChannel(label) {
    return this._peer.createDataChannel(this._id, label);
  }

  /**
   * @param {MediaStreamTrack} track
   * @returns {RTCRtpSender | null}
   */
  addTrack(track) {
    return this._peer.addTrack(this._id, track);
  }

  /**
   * @param {MediaStreamTrack | string} trackOrKind
   * @param {RTCRtpTransceiverInit | null} init
   * @returns {RTCRtpTransceiver | null}
   */
  addTransceiver(trackOrKind, init) {
    return this._peer.addTransceiver(this._id, trackOrKind, init);
  }


  /**
   * @returns {RTCRtpTransceiver[] | null}
   */
  getTransceivers() {
    return this._peer.getTransceivers(this._id);
  }

  async start() {
    await this._signaling.start();
  }

  async stop() {
    if (this._peer) {
      this._peer.close();
      this._peer = null;
    }

    if (this._signaling) {
      await this._signaling.stop();
      this._signaling = null;
    }
  }

  async reqAvatarList() {
    await this._signaling.reqAvatarList();
  }

  async join_room(id) {
    await this._signaling.join_room(id);
  }
}
