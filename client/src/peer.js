import * as Logger from "./logger.js";

export default class Peer extends EventTarget {
  constructor(id, polite, config, resendIntervalMsec = 5000) {
    super();
    const _this = this;
    this.id = id;
    this.polite = polite;
    this.config = config;
    this.pc = new RTCPeerConnection(this.config);
    this.makingOffer = false;
    this.waitingAnswer = false;
    this.ignoreOffer = false;
    this.srdAnswerPending = false;
    this.log = str => void Logger.log(`[${_this.polite ? 'POLITE' : 'IMPOLITE'}] ${str}`);
    this.warn = str => void Logger.warn(`[${_this.polite ? 'POLITE' : 'IMPOLITE'}] ${str}`);
    this.assert_equals = window.assert_equals ? window.assert_equals : (a, b, msg) => { if (a === b) { return; } throw new Error(`${msg} expected ${b} but got ${a}`); };
    this.interval = resendIntervalMsec;
    this.sleep = msec => new Promise(resolve => setTimeout(resolve, msec));

    this.pc.ontrack = e => {
      _this.log(`ontrack:${e}`);
      _this.dispatchEvent(new CustomEvent('trackevent', { detail: e }));
    };
    this.pc.ondatachannel = e => {
      _this.log(`ondatachannel:${e}`);
      _this.dispatchEvent(new CustomEvent('adddatachannel', { detail: e }));
    };
    this.pc.onicecandidate = ({ candidate }) => {
      _this.log(`send candidate:${candidate}`);
      if (candidate == null) {
        return;
      }
      _this.dispatchEvent(new CustomEvent('sendcandidate', { detail: { id: _this.id, candidate: candidate.candidate, sdpMLineIndex: candidate.sdpMLineIndex, sdpMid: candidate.sdpMid } }));
    };

    this.pc.onnegotiationneeded = this._onNegotiation.bind(this);

    this.pc.onsignalingstatechange = () => {
      _this.log(`signalingState changed:${_this.pc.signalingState}`);
    };

    this.pc.oniceconnectionstatechange = () => {
      _this.log(`iceConnectionState changed:${_this.pc.iceConnectionState}`);
      if (_this.pc.iceConnectionState === 'disconnected') {
        this.dispatchEvent(new Event('disconnect'));
      }
    };

    this.pc.onicegatheringstatechange = () => {
      _this.log(`iceGatheringState changed:${_this.pc.iceGatheringState}'`);
    };

    this.loopResendOffer();
  }

  async _onNegotiation() {
    try {
      this.log(`SLD due to negotiationneeded`);
      this.assert_equals(this.pc.signalingState, 'stable', 'negotiationneeded always fires in stable state');
      this.assert_equals(this.makingOffer, false, 'negotiationneeded not already in progress');
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      this.assert_equals(this.pc.signalingState, 'have-local-offer', 'negotiationneeded not racing with onmessage');
      this.assert_equals(this.pc.localDescription.type, 'offer', 'negotiationneeded SLD worked');
      this.waitingAnswer = true;
      this.dispatchEvent(new CustomEvent('sendoffer', { detail: { id: this.id, sdp: this.pc.localDescription.sdp } }));
    } catch (e) {
      this.log(e);
    } finally {
      this.makingOffer = false;
    }
  }

  async loopResendOffer() {
    while (this.id) {
      if (this.pc && this.waitingAnswer) {
        this.dispatchEvent(new CustomEvent('sendoffer', { detail: { id: this.id, sdp: this.pc.localDescription.sdp } }));
      }
      await this.sleep(this.interval);
    }
  }

  close() {
    this.id = null;
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  getTransceivers(id) {
    if (this.id != id) {
      return null;
    }

    return this.pc.getTransceivers();
  }

  addTrack(id, track) {
    if (this.id != id) {
      return null;
    }

    return this.pc.addTrack(track);
  }

  addTransceiver(id, trackOrKind, init) {
    if (this.id != id) {
      return null;
    }

    return this.pc.addTransceiver(trackOrKind, init);
  }

  createDataChannel(id, label) {
    if (this.id != id) {
      return null;
    }

    return this.pc.createDataChannel(label);
  }

  async getStats(id) {
    if (this.id != id) {
      return null;
    }

    return await this.pc.getStats();
  }

  async onGotDescription(id, description) {
    if (this.id != id) {
      return;
    }

    const _this = this;
    const isStable =
      this.pc.signalingState == 'stable' ||
      (this.pc.signalingState == 'have-local-offer' && this.srdAnswerPending);
    this.ignoreOffer =
      description.type == 'offer' && !this.polite && (this.makingOffer || !isStable);

    if (this.ignoreOffer) {
      _this.log(`glare - ignoring offer`);
      return;
    }

    this.waitingAnswer = false;
    this.srdAnswerPending = description.type == 'answer';
    _this.log(`SRD(${description.type})`);
    await this.pc.setRemoteDescription(description);
    this.srdAnswerPending = false;

    if (description.type == 'offer') {
      _this.dispatchEvent(new CustomEvent('ongotoffer', { detail: { id: _this.id } }));

      _this.assert_equals(this.pc.signalingState, 'have-remote-offer', 'Remote offer');
      _this.assert_equals(this.pc.remoteDescription.type, 'offer', 'SRD worked');
      _this.log('SLD to get back to stable');
      await this.pc.setLocalDescription();
      _this.assert_equals(this.pc.signalingState, 'stable', 'onmessage not racing with negotiationneeded');
      _this.assert_equals(this.pc.localDescription.type, 'answer', 'onmessage SLD worked');
      _this.dispatchEvent(new CustomEvent('sendanswer', { detail: { id: _this.id, sdp: _this.pc.localDescription.sdp } }));

    } else {
      _this.dispatchEvent(new CustomEvent('ongotanswer', { detail: { id: _this.id } }));

      _this.assert_equals(this.pc.remoteDescription.type, 'answer', 'Answer was set');
      _this.assert_equals(this.pc.signalingState, 'stable', 'answered');
      this.pc.dispatchEvent(new Event('negotiated'));
    }
  }

  async onGotCandidate(id, candidate) {
    if (this.id != id) {
      return;
    }

    try {
      await this.pc.addIceCandidate(candidate);
    } catch (e) {
      if (this.pc && !this.ignoreOffer)
        this.warn(`${this.pc} this candidate can't accept current signaling state ${this.pc.signalingState}.`);
    }
  }
}
