import { getServerConfig, getRTCConfiguration } from "../../js/config.js";
import { createDisplayStringArray } from "../../js/stats.js";
import { VideoPlayer } from "../../js/videoplayer.js";
//아래 module은 src폴더 소스참조
import { RenderStreaming } from "../../module/renderstreaming.js";
import { Signaling, WebSocketSignaling } from "../../module/signaling.js";
import { registerGamepadEvents, registerKeyboardEvents, registerMouseEvents, sendClickEvent } from "./register-events.js";

const codecPreferences = document.getElementById('codecPreferences');
const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
  'setCodecPreferences' in window.RTCRtpTransceiver.prototype;
const messageDiv = document.getElementById('message');
messageDiv.style.display = 'none';
const statusDiv = document.getElementById('status');
statusDiv.style.display = 'none';

showCodecSelect();

/** @type {Element} */
let playButton;
/** @type {RenderStreaming} */
let renderstreaming;
/** @type {boolean} */
let useWebSocket;
let connectionId;


const textForConnectionId = document.getElementById('textForConnectionId');
textForConnectionId.value = 'Tank001';

const setupButton = document.getElementById('setUpButton');
setupButton.addEventListener('click', setUp);
const hangUpButton = document.getElementById('hangUpButton');
hangUpButton.addEventListener('click', hangUp);

// lightOn
let lightOnButton = document.getElementById('lightOn');
lightOnButton.addEventListener("click", function () {
  sendClickEvent(sendVideo, 1);
});
// // add blue button
// const elementBlueButton = document.createElement('button');
// elementBlueButton.id = "blueButton";
// elementBlueButton.innerHTML = "Light on";
// playerDiv.appendChild(elementBlueButton);
// elementBlueButton.addEventListener("click", function () {
//   sendClickEvent(videoPlayer, 1);
// });

// lightOff
let lightOffButton = document.getElementById('lightOff');
lightOffButton.addEventListener("click", function () {
  sendClickEvent(sendVideo, 2);
});

const playerDiv = document.getElementById('player');
const lockMouseCheck = document.getElementById('lockMouseCheck');
const videoPlayer = new VideoPlayer();

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

setupConfig();

async function setupConfig() {
  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;
  showWarningIfNeeded(res.startupMode);
}

function showWarningIfNeeded(startupMode) {
  const warningDiv = document.getElementById("warning");
  if (startupMode == "private") {
    warningDiv.innerHTML = "<h4>Warning</h4> This sample is not working on Private Mode.";
    warningDiv.hidden = false;
  }
}

async function setUp() {
  // add video player
  videoPlayer.createPlayer(playerDiv, lockMouseCheck);

  setupButton.disabled = true;
  hangUpButton.disabled = false;
  connectionId = textForConnectionId.value;
  codecPreferences.disabled = true;

  const signaling = useWebSocket ? new WebSocketSignaling() : new Signaling();
  const config = getRTCConfiguration();
  renderstreaming = new RenderStreaming(signaling, config);
  renderstreaming.onConnect = onConnect;
  renderstreaming.onDisconnect = () => {
    hangUp();
  };  
  renderstreaming.onTrackEvent = (data) => videoPlayer.addTrack(data.track);
  renderstreaming.onGotOffer = setCodecPreferences;

  renderstreaming.onAddChannel = (data) => {
    addDataChannel(data.channel);
  };     

  await renderstreaming.start();
  await renderstreaming.createConnection(connectionId);
}

function onConnect() {
  statusDiv.style.display = 'block';
  statusDiv.innerText = `Connect peer on ${connectionId}`;
  const channel = renderstreaming.createDataChannel("input");
  videoPlayer.setupInput(channel);
  showStatsMessage();
}

async function hangUp() {
  clearStatsMessage();
  statusDiv.style.display = 'block';
  statusDiv.innerText = `Disconnect peer on ${connectionId}`;

  await renderstreaming.deleteConnection();
  await renderstreaming.stop();
  renderstreaming = null;
  videoPlayer.deletePlayer();
  if (supportsSetCodecPreferences) {
    codecPreferences.disabled = false;
  }
  setupButton.disabled = false;
  hangUpButton.disabled = true;
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
  dataChannel = channel;
    
  dataChannel.onopen = function () {
    console.log('Datachannel connected.');
  };
  dataChannel.onerror = function (e) {
    console.log("The error " + e.error.message + " occurred\n while handling data with proxy server.");
  };
  dataChannel.onclose = function () {
    console.log('Datachannel disconnected.');
  };
  dataChannel.onmessage = async (msg) => {
    // receive message from unity and operate message
    let data;
    // receive message data type is blob only on Firefox
    if (navigator.userAgent.indexOf('Firefox') != -1) {
      data = await msg.data.arrayBuffer();
    } else {
      data = msg.data;
    }
    recvMsg(data);

    // const bytes = new Uint8Array(data);
    // _this.videoTrackIndex = bytes[1];
    // switch (bytes[0]) {
    //   case UnityEventType.SWITCH_VIDEO:
    //     _this.switchVideo(_this.videoTrackIndex);
    //     break;
    // }
  };
}

function recvMsg(data) {
  console.log('recvMsg........');

  console.log('recvMsg........');
  console.log(dataChannel.readyState);
  console.log(data);


  // if (dataChannel == null) {
  //   return;
  // }
  // switch (dataChannel.readyState) {
  //   case 'connecting':
  //     console.log('Connection not ready');
  //     break;
  //   case 'open':
  //     console.log(data);
  //     console.log(data);
  //     const bytes = new Uint8Array(data);
  //     // _this.videoTrackIndex = bytes[1];
  //     // switch (bytes[0]) {
  //     //   case UnityEventType.SWITCH_VIDEO:
  //     //     _this.switchVideo(_this.videoTrackIndex);
  //     //     break;
  //     // }

  //     break;
  //   case 'closing':
  //     console.log('Attempt to recvMsg message while closing');
  //     break;
  //   case 'closed':
  //     console.log('Attempt to recvMsg message while connection closed.');
  //     break;
  // }
}