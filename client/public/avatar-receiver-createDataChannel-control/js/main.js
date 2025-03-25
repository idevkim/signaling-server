import { getServerConfig, getRTCConfiguration } from "../../js/config.js";
import { createDisplayStringArray } from "../../js/stats.js";
import { VideoPlayer } from "../../js/videoplayer.js";

//server.ts참조 app.use('/module', express.static(path.join(__dirname, '../client/src')));
import { RenderStreaming } from "../../module/renderstreaming.js";
import { WebSocketSignaling } from "../../module/signaling.js";


/** @enum {number} */
const ActionType = {
  ChangeLabel: 0
};

// /** @type {Element} */
// let playButton;
/** @type {RenderStreaming} */
let renderstreaming;
/** @type {boolean} */
let useWebSocket;
/** @type {RTCDataChannel} */
let dataChannel;
let connectionId = "";//default ""
let cntGotAnswer = 0;
let timerInterval;
let waitTime = 2000;//2초
let checkTime = 0;

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

// const codecPreferences = document.getElementById('codecPreferences');
// const supportsSetCodecPreferences = window.RTCRtpTransceiver && 'setCodecPreferences' in window.RTCRtpTransceiver.prototype;

const webrtcEventDiv = document.getElementById("webrtcEvent");
const messageDiv = document.getElementById('message'); messageDiv.style.display = 'none';
const warningDiv = document.getElementById("warning");
const playerDiv = document.getElementById('player');
const lockMouseCheck = document.getElementById('lockMouseCheck');
const videoPlayer = new VideoPlayer();

// const setupButton = document.getElementById('setUpButton');
// setupButton.addEventListener('click', onClickPlayButton);

const avatarListSelect = document.querySelector('select#avatarList');
avatarListSelect.addEventListener('change', (event) => {
  connectionId = event.target.value;
  if(connectionId == "")  connectButton.disabled = true;
  else                    connectButton.disabled = false;
});

const refresh_room_btn = document.getElementById('refresh_room');
refresh_room_btn.addEventListener('click', async function () {
  await renderstreaming.reqAvatarList();
});

// connect buttons
/////////////////////////////////////////////////////////////////////
const connectButton = document.getElementById('connectButton');
connectButton.addEventListener('click', async function () {
    // await renderstreaming.start();
    await renderstreaming.sendConnection(connectionId, "player");
});

const disConnectButton = document.getElementById('disConnectButton');
disConnectButton.addEventListener('click', async function () {
  // onDisconnect();
  await renderstreaming.sendDisConnection();
});

// control buttons
/////////////////////////////////////////////////////////////////////
const onoffLightButton = document.getElementById('onoffLightButton');
onoffLightButton.addEventListener("click", function () {
  sendMsg("onoffLightButton");
});
const upButton = document.getElementById('upButton');
upButton.addEventListener("click", function () {
  sendMsg("upButton");
});
const downButton = document.getElementById('downButton');
downButton.addEventListener("click", function () {
  sendMsg("downButton");
});
const leftButton = document.getElementById('leftButton');
leftButton.addEventListener("click", function () {
  sendMsg("leftButton");
});
const rightButton = document.getElementById('rightButton');
rightButton.addEventListener("click", function () {
  sendMsg("rightButton");
});
/////////////////////////////////////////////////////////////////////

//idevkim : joystick
// index.html에 <script src="js/joy.js"></script> 선언참조.
//////////////////////////////////////////////////////////////////
  var joy1Timer = document.getElementById("joy1Timer");
  var joy1IinputPosX = document.getElementById("joy1PosizioneX");
  var joy1InputPosY = document.getElementById("joy1PosizioneY");
  var joy1Direzione = document.getElementById("joy1Direzione");
  var joy1X = document.getElementById("joy1X");
  var joy1Y = document.getElementById("joy1Y");

  //var param = { "title": "joystick", "autoReturnToCenter": true };
  // ==> new JoyStick('joy1Div', param, function(stickData) {...}
  var Joy1 = new JoyStick('joy1Div', {}, function(stickData) {
//데이터를 계속 보내야 하나???????
//////////////////////////////////////////////////////////////////////
    // timerInterval = setInterval(async () => {    
    //   if(stickData.x == 0 && stickData.y == 0) {
    //     if(new Date().getTime() - checkTime > waitTime) {
    //       joy1Timer.value = "stop";// String("stop");
    //       return;
    //     }
    //   } else {
    //     checkTime = new Date().getTime();
    //     joy1Timer.value = String(`move : ${checkTime}`);
    //   }

      joy1IinputPosX.value = stickData.xPosition;
      joy1InputPosY.value = stickData.yPosition;
      joy1Direzione.value = stickData.cardinalDirection;
      joy1X.value = stickData.x;
      joy1Y.value = stickData.y;

      sendStickData(stickData);//.xPosition)
    // }, 1000);
//////////////////////////////////////////////////////////////////////    
  });
/////////////////////////////////////////////////////////////////////////////////////

setup();

async function setup() {
  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;
  warningDiv.innerHTML = `Config Info : <br> WebSocket : ${res.useWebSocket} // Mode : ${res.startupMode}`;

// add video player
  videoPlayer.createPlayer(playerDiv, lockMouseCheck);

//setup RenderStreaming
  const signaling = new WebSocketSignaling();
  const config = getRTCConfiguration();
  renderstreaming = new RenderStreaming(signaling, config);
  renderstreaming.onWsOpen = ()  => { 
    webrtcEventDiv.innerHTML = "WsOpen :: reqAvatarList()//rooms 정보가져오기"; 
    renderstreaming.reqAvatarList(); } //websocket에 연결되면 아바타리스트 요구하기.
  renderstreaming.onWsClose = () => { webrtcEventDiv.innerHTML = "WsClose"; }     //websocket close.
  renderstreaming.onGotAvatarList = (data) => { onGotAvatarList(data); }// 아바타 리스트 얻음.
  renderstreaming.onConnect    = (id, who) => { onConnect(id, who); }
  renderstreaming.onDisconnect = (id, who) => { onDisconnect(id, who); }
  renderstreaming.onTrackEvent = (data)    => { videoPlayer.addTrack(data.track); }
  // renderstreaming.onGotOffer = setCodecPreferences;
  renderstreaming.onGotOffer  = () => { webrtcEventDiv.innerHTML = "gotOffer"; cntGotAnswer = 0; }
  renderstreaming.onGotAnswer = () => { webrtcEventDiv.innerHTML = `gotAnswer(${++cntGotAnswer})`; }
// avatar쪽에서 createDataChannel()하기.
  renderstreaming.onAddChannel = (data) => {
    if(data.channel.label=='input')
      videoPlayer.setupInput(data.channel);
    else  // 'avatar-data'
      addDataChannel(data.channel);
  };
  renderstreaming.onError = (data) => { onError(data); }//idevkim

  // await renderstreaming.start();
  // await renderstreaming.createConnection(connectionId);
}

function onGotAvatarList(data) {
  //clear
  document.getElementById('avatarList').innerHTML = '';
  //append
  if(data.length) {
    for (let i = 0; i < data.length; i++) {
      const option = document.createElement('option');
      option.value = data[i];
      option.text = `${data[i]}`;
      avatarListSelect.appendChild(option);
    }
    if(data.indexOf(connectionId) == -1)//없으면
      connectionId = data[0];
    avatarListSelect.value = connectionId;
    connectButton.disabled = false;
  } else {
    const option = document.createElement('option');
    option.value = "";
    option.text = "No Avatar!!!";
    avatarListSelect.appendChild(option);

    connectionId = "";
    avatarListSelect.value = connectionId;
    connectButton.disabled = true;
  }
}

function onError(data) {
  messageDiv.style.display = 'block';
  messageDiv.innerText = `${data.msg}`;
}

function onConnect(id, who) {
  // const channel = renderstreaming.createDataChannel("input");
  // videoPlayer.setupInput(channel);
  avatarListSelect.disabled = true;
  refresh_room_btn.disabled = true;
  connectButton.disabled = true;
  disConnectButton.disabled = false;

  showStatsMessage();
  messageDiv.style.display = 'block';
  messageDiv.innerText = `Connect peer on ${id} - ${who}.`;  
}

async function onDisconnect(id, who) {
  avatarListSelect.disabled = false;
  refresh_room_btn.disabled = false;
  connectButton.disabled = false;  
  disConnectButton.disabled = true;  

  clearStatsMessage();
  messageDiv.style.display = 'block';
  messageDiv.innerText = `Disconnect peer on ${id} - ${who}.`;

  //joystick 관련 
  /////////////////////////////////
  // if (timerInterval) {
  //   clearInterval(timerInterval);
  // }
  // timerInterval = null;
  // Joy1.disabled = true;
  /////////////////////////////////

  await renderstreaming.stop();
  renderstreaming = null;
  dataChannel = null;
  videoPlayer.deletePlayer();
  // if (supportsSetCodecPreferences) {
  //   codecPreferences.disabled = false;
  // }
  setup();
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


function sendStickData(stickData) {
  if (dataChannel == null) {
    return;
  }

  switch (dataChannel.readyState) {
    case 'connecting':
      console.log('connecting...............');
      break;
    case 'open':
      // await new Promise(resolve => setTimeout(resolve, 100));
      const num = Math.floor(Math.random() * 100000);
      const json = JSON.stringify({ 
        type: ActionType.ChangeLabel, 
        xPosition : stickData.xPosition,
        yPosition : stickData.yPosition,
        cardinalDirection : stickData.cardinalDirection,
        x : stickData.x,
        y : stickData.y,
      });
      dataChannel.send(json);
      console.log(`open : Channel.send(${json})`);
      break;
    case 'closing':
      console.log('Attempt to sendMsg message while closing');
      break;
    case 'closed':
      console.log('Attempt to sendMsg message while connection closed.');
      break;
  }
}
function sendMsg(data) {

}

function recvMsg(data) {
  messageDiv.style.display = 'block';
  messageDiv.innerText = `${data}`;  
}

// function showCodecSelect() {
//   if (!supportsSetCodecPreferences) {
//     messageDiv.style.display = 'block';
//     messageDiv.innerHTML = `Current Browser does not support <a href="https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpTransceiver/setCodecPreferences">RTCRtpTransceiver.setCodecPreferences</a>.`;
//     return;
//   }

//   const codecs = RTCRtpSender.getCapabilities('video').codecs;
//   codecs.forEach(codec => {
//     if (['video/red', 'video/ulpfec', 'video/rtx'].includes(codec.mimeType)) {
//       return;
//     }
//     const option = document.createElement('option');
//     option.value = (codec.mimeType + ' ' + (codec.sdpFmtpLine || '')).trim();
//     option.innerText = option.value;
//     codecPreferences.appendChild(option);
//   });
//   codecPreferences.disabled = false;
// }

// function setCodecPreferences() {
//   /** @type {RTCRtpCodecCapability[] | null} */
//   let selectedCodecs = null;
//   if (supportsSetCodecPreferences) {
//     const preferredCodec = codecPreferences.options[codecPreferences.selectedIndex];
//     if (preferredCodec.value !== '') {
//       const [mimeType, sdpFmtpLine] = preferredCodec.value.split(' ');
//       const { codecs } = RTCRtpSender.getCapabilities('video');
//       const selectedCodecIndex = codecs.findIndex(c => c.mimeType === mimeType && c.sdpFmtpLine === sdpFmtpLine);
//       const selectCodec = codecs[selectedCodecIndex];
//       selectedCodecs = [selectCodec];
//     }
//   }

//   if (selectedCodecs == null) {
//     return;
//   }
//   const transceivers = renderstreaming.getTransceivers().filter(t => t.receiver.track.kind == "video");
//   if (transceivers && transceivers.length > 0) {
//     transceivers.forEach(t => t.setCodecPreferences(selectedCodecs));
//   }
// }