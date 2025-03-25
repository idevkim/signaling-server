import {getServers} from "./icesettings.js";

export async function getServerConfig() {
  // console.log("getServerConfig()........................"+location.origin);
  const protocolEndPoint = location.origin + '/config';
  // console.log("protocolEndPoint........................"+protocolEndPoint);
  // ===> http://localhost:8082/config
  // => {"useWebSocket":true,"startupMode":"public","logging":"dev"}
  
  const createResponse = await fetch(protocolEndPoint);
  return await createResponse.json();
}

export function getRTCConfiguration() {
  let config = {};
  config.sdpSemantics = 'unified-plan';
  config.iceServers = getServers();
  return config;
}
