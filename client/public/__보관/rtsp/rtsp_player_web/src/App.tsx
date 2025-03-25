import VideoFeed from "./VideoFeed";


// const FEED_URL: string = "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8";//실행됨.
// const FEED_URL: string = "http://59.8.86.15:1935/live/60.stream/playlist.m3u8";//실행됨 화순 해안


const FEED_URL: string = "http://59.8.86.15:1935/live/60.stream/playlist.m3u8";//실행됨
const WELCOME_MESSAGE: string = "RTSP Streaming Test! "+FEED_URL

function App() {
  return <div className="app">
    {WELCOME_MESSAGE}
    <VideoFeed src={FEED_URL} />
  </div>;
}

export default App;