import { getServerConfig, getRTCConfiguration } from "../../js/config.js";
import { createDisplayStringArray } from "../../js/stats.js";
import { VideoPlayer } from "../../js/videoplayer.js";
import { RenderStreaming } from "../../module/renderstreaming.js";
import { Signaling, WebSocketSignaling } from "../../module/signaling.js";

/** @enum {number} */
const ActionType = {
  ChangeLabel: 0
};

/** @type {Element} */
let playButton;
/** @type {RenderStreaming} */
let renderstreaming;
/** @type {boolean} */
let useWebSocket;
/** @type {RTCDataChannel} */
let multiplayChannel;

const codecPreferences = document.getElementById('codecPreferences');
const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
  'setCodecPreferences' in window.RTCRtpTransceiver.prototype;
const messageDiv = document.getElementById('message');
messageDiv.style.display = 'none';

const playerDiv = document.getElementById('player');
const lockMouseCheck = document.getElementById('lockMouseCheck');
const videoPlayer = new VideoPlayer();

setup();

window.document.oncontextmenu = function () {
  return false;     // cancel default menu
};

window.addEventListener('resize', function () {
  videoPlayer.resizeVideo();
}, true);

window.addEventListener('beforeunload', async () => {
  if(!renderstreaming)
    return;
  await renderstreaming.stop();
}, true);

async function setup() {
  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;
  showWarningIfNeeded(res.startupMode);
  showCodecSelect();
  showPlayButton();
}

function showWarningIfNeeded(startupMode) {
  const warningDiv = document.getElementById("warning");
  if (startupMode == "private") {
    warningDiv.innerHTML = "<h4>Warning</h4> This sample is not working on Private Mode.";
    warningDiv.hidden = false;
  }
}

function showPlayButton() {
  if (!document.getElementById('playButton')) {
    const elementPlayButton = document.createElement('img');
    elementPlayButton.id = 'playButton';
    elementPlayButton.src = '../../images/Play.png';
    elementPlayButton.alt = 'Start Streaming';
    playButton = document.getElementById('player').appendChild(elementPlayButton);
    playButton.addEventListener('click', onClickPlayButton);
  }
}

function onClickPlayButton() {
  playButton.style.display = 'none';

  // add video player
  videoPlayer.createPlayer(playerDiv, lockMouseCheck);
  setupRenderStreaming();

  // add blue button
  const elementBlueButton = document.createElement('button');
  elementBlueButton.id = "blueButton";
  elementBlueButton.innerHTML = "Light on";
  playerDiv.appendChild(elementBlueButton);
  elementBlueButton.addEventListener("click", function () {
    // sendClickEvent(videoPlayer, 1);
    sendMsg("idevkim");
  });
}

async function setupRenderStreaming() {
  codecPreferences.disabled = true;

  const signaling = useWebSocket ? new WebSocketSignaling() : new Signaling();
  const config = getRTCConfiguration();
  renderstreaming = new RenderStreaming(signaling, config);
  renderstreaming.onConnect = onConnect;
  renderstreaming.onDisconnect = onDisconnect;
  renderstreaming.onTrackEvent = (data) => videoPlayer.addTrack(data.track);
  renderstreaming.onGotOffer = setCodecPreferences;
  // renderstreaming.onAddChannel = (data) => {
  //   addDataChannel(data.channel);
  // };
  await renderstreaming.start();
  // await renderstreaming.createConnection(); //org...
  await renderstreaming.createConnection("Tank001");
}

function onConnect() {
  const channel = renderstreaming.createDataChannel("input");
  videoPlayer.setupInput(channel);
  multiplayChannel = renderstreaming.createDataChannel("multiplay");
  multiplayChannel.onopen = onOpenMultiplayChannel;
  showStatsMessage();
}

async function onOpenMultiplayChannel() {
  await new Promise(resolve => setTimeout(resolve, 100));
  const num = Math.floor(Math.random() * 100000);
  const json = JSON.stringify({ type: ActionType.ChangeLabel, argument: String(num) });
  multiplayChannel.send(json);
}

async function onDisconnect(connectionId) {
  clearStatsMessage();
  messageDiv.style.display = 'block';
  messageDiv.innerText = `Disconnect peer on ${connectionId}.`;

  await renderstreaming.stop();
  renderstreaming = null;
  multiplayChannel = null;
  videoPlayer.deletePlayer();
  if (supportsSetCodecPreferences) {
    codecPreferences.disabled = false;
  }
  showPlayButton();
}

function setCodecPreferences() {
  /** @type {RTCRtpCodecCapability[] | null} */
  let selectedCodecs = null;
  if (supportsSetCodecPreferences) {
    const preferredCodec = codecPreferences.options[codecPreferences.selectedIndex];
    if (preferredCodec.value !== '') {
      const [mimeType, sdpFmtpLine] = preferredCodec.value.split(' ');
      const { codecs } = RTCRtpSender.getCapabilities('video');
      const selectedCodecIndex = codecs.findIndex(c => c.mimeType === mimeType && c.sdpFmtpLine === sdpFmtpLine);
      const selectCodec = codecs[selectedCodecIndex];
      selectedCodecs = [selectCodec];
    }
  }

  if (selectedCodecs == null) {
    return;
  }
  const transceivers = renderstreaming.getTransceivers().filter(t => t.receiver.track.kind == "video");
  if (transceivers && transceivers.length > 0) {
    transceivers.forEach(t => t.setCodecPreferences(selectedCodecs));
  }
}

function showCodecSelect() {
  if (!supportsSetCodecPreferences) {
    messageDiv.style.display = 'block';
    messageDiv.innerHTML = `Current Browser does not support <a href="https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpTransceiver/setCodecPreferences">RTCRtpTransceiver.setCodecPreferences</a>.`;
    return;
  }

  const codecs = RTCRtpSender.getCapabilities('video').codecs;
  codecs.forEach(codec => {
    if (['video/red', 'video/ulpfec', 'video/rtx'].includes(codec.mimeType)) {
      return;
    }
    const option = document.createElement('option');
    option.value = (codec.mimeType + ' ' + (codec.sdpFmtpLine || '')).trim();
    option.innerText = option.value;
    codecPreferences.appendChild(option);
  });
  codecPreferences.disabled = false;
}

/** @type {RTCStatsReport} */
let lastStats;
/** @type {number} */
let intervalId;

function showStatsMessage() {
  intervalId = setInterval(async () => {
    if (renderstreaming == null) {
      return;
    }

    const stats = await renderstreaming.getStats();
    if (stats == null) {
      return;
    }

    const array = createDisplayStringArray(stats, lastStats);
    if (array.length) {
      messageDiv.style.display = 'block';
      messageDiv.innerHTML = array.join('<br>');
    }
    lastStats = stats;
  }, 1000);
}

function clearStatsMessage() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  lastStats = null;
  intervalId = null;
  messageDiv.style.display = 'none';
  messageDiv.innerHTML = '';
}

function addDataChannel(channel) {
  multiplayChannel = channel;  

  multiplayChannel.onopen = function () {
    console.log('Datachannel connected.');
  };
  multiplayChannel.onerror = function (e) {
    console.log("The error " + e.error.message + " occurred\n while handling data with proxy server.");
  };
  multiplayChannel.onclose = function () {
    console.log('Datachannel disconnected.');
  };
  multiplayChannel.onmessage = async (msg) => {
    // receive message from unity and operate message
    let data;
    // receive message data type is blob only on Firefox
    if (navigator.userAgent.indexOf('Firefox') != -1) {
      data = await msg.data.arrayBuffer();
    } else {
      data = msg.data;
    }
    this.recvMsg(data);

    // const bytes = new Uint8Array(data);
    // _this.videoTrackIndex = bytes[1];
    // switch (bytes[0]) {
    //   case UnityEventType.SWITCH_VIDEO:
    //     _this.switchVideo(_this.videoTrackIndex);
    //     break;
    // }
  };
}


function sendMsg(msg) {
  // console.log('sendMsg........');
  if (multiplayChannel == null) {
    return;
  }

  console.log(multiplayChannel.readyState);
  
  switch (multiplayChannel.readyState) {
    case 'connecting':
      console.log('Connection not ready');
      break;
    case 'open':
      // multiplayChannel.send(msg);
      onOpenMultiplayChannel();
      break;
    case 'closing':
      console.log('Attempt to sendMsg message while closing');
      break;
    case 'closed':
      console.log('Attempt to sendMsg message while connection closed.');
      break;
  }
}