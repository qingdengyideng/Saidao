(() => {
  const DEFAULT_UID = "1159606549";
  const infoBase = "https://api.saidao.cc/saidao/player/";
  const wsBase = "wss://api.saidao.cc/player/ws";

  const video = document.getElementById("video");
  const mediaHost = document.getElementById("mediaHost");
  const statusOverlay = document.getElementById("statusOverlay");
  const statusTitle = document.getElementById("statusTitle");
  const statusSub = document.getElementById("statusSub");
  const streamSub = document.getElementById("streamSub");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const fullscreenLabel = document.getElementById("fullscreenLabel");
  const pipBtn = document.getElementById("pipBtn");
  const pipLabel = document.getElementById("pipLabel");
  const pipPlaceholder = document.getElementById("pipPlaceholder");
  const pipReturnBtn = document.getElementById("pipReturnBtn");
  const pipMessage = document.getElementById("pipMessage");
  const pipCommentsBtn = document.getElementById("pipCommentsBtn");
  const pipCommentsCloseBtn = document.getElementById("pipCommentsCloseBtn");
  const commentPanel = document.getElementById("commentPanel");
  const youtubeChatFrame = document.getElementById("youtubeChatFrame");
  const playerShell = document.getElementById("playerShell");
  const playerArea = document.getElementById("playerArea");
  const originBtn = document.getElementById("originBtn");
  const streamerOnline = document.getElementById("streamerOnline");
  const tapPlayBtn = document.getElementById("tapPlayBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const volumeSlider = document.getElementById("volumeSlider");
  const volumeBtn = document.getElementById("volumeBtn");
  const volumePopover = document.getElementById("volumePopover");
  const danmakuToggleBtn = document.getElementById("danmakuToggleBtn");
  const commentList = document.getElementById("commentList");
  const commentSub = document.getElementById("commentSub");
  const scrollBottomBtn = document.getElementById("scrollBottomBtn");
  const playerLayout = document.getElementById("playerLayout");
  const danmakuLayer = document.getElementById("danmakuLayer");
  const streamerName = document.getElementById("streamerName");
  const streamerAvatar = document.getElementById("streamerAvatar");
  const streamerInitial = document.getElementById("streamerInitial");
  const streamerRoom = document.getElementById("streamerRoom");
  const liveBadge = document.getElementById("liveBadge");
  const liveState = document.getElementById("liveState");
  const commentEmpty = document.getElementById("commentEmpty");
  const danmakuLabel = document.getElementById("danmakuLabel");

  let hls = null;
  let flvPlayer = null;
  let xgPlayer = null;
  let streamRetryTimer = null;
  let playbackTimerWindow = window;
  let flushIntervalId = null;
  let refreshInProgress = false;
  let infoRequest = null;
  let streamGeneration = 0;
  let firstFrameRequest = null;
  let firstFrameRendered = false;
  let pipWindow = null;
  let pipOpening = false;
  let nativeVideoFullscreen = !!video.webkitDisplayingFullscreen;
  const PIP_COMMENT_WIDTH = 200;
  let savedCommentScrollTop = 0;
  let audioUnlocked = false;
  let originUrl = "";
  const COMMENT_DELAY_MS = 5000;
  const STREAM_RETRY_MS = 10000;
  const MAX_PENDING_COMMENTS = 500;
  const pendingComments = [];
  let wsClient = null;
  let reconnectTimer = null;
  let isPageClosing = false;
  let isCommentListAtBottom = true;
  let danmakuEnabled = true;
  const danmakuLanes = [];
  const DANMAKU_LANE_HEIGHT = 36;
  const DANMAKU_GAP = 32;
  const DANMAKU_SPEED = 90;
  let streamEnded = false;

  const params = new URLSearchParams(window.location.search);
  let isYoutubeChannel = params.get("channel")?.toLowerCase() === "youtube";
  const uid = params.get("uid") || DEFAULT_UID;
  const directStreamUrl = params.get("src") || params.get("url") || params.get("stream") || "";

  const getStreamType = (url) => {
    const cleanUrl = String(url || "").split("#")[0];
    const path = cleanUrl.split("?")[0].toLowerCase();

    if (path.endsWith(".flv")) {
      return "flv";
    }

    if (path.endsWith(".m3u8")) {
      return "hls";
    }

    return "";
  };

  const isMobile = () => {
    const ua = navigator.userAgent || "";
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  };

  const mobilePlayer = isMobile();
  document.documentElement.classList.toggle("mobile-player", mobilePlayer);
  pipBtn.hidden = mobilePlayer;
  commentPanel.hidden = mobilePlayer;

  const cancelFirstFrameRequest = () => {
    if (firstFrameRequest !== null) {
      video.cancelVideoFrameCallback?.(firstFrameRequest);
      firstFrameRequest = null;
    }
  };

  const showStatus = (title, sub, loading = false) => {
    statusTitle.textContent = title;
    statusSub.textContent = sub;
    statusOverlay.classList.toggle("is-loading", loading);
    statusOverlay.setAttribute("aria-busy", String(loading));
    statusOverlay.setAttribute("aria-hidden", "false");
    statusOverlay.classList.remove("hidden");
    if (!loading) cancelFirstFrameRequest();
  };

  const hideStatus = () => {
    statusOverlay.setAttribute("aria-busy", "false");
    statusOverlay.setAttribute("aria-hidden", "true");
    statusOverlay.classList.add("hidden");
  };

  const finishFirstFrame = () => {
    if (streamEnded || isPageClosing) return;
    firstFrameRendered = true;
    cancelFirstFrameRequest();
    if (statusOverlay.classList.contains("is-loading")) hideStatus();
  };

  const watchFirstFrame = () => {
    if (firstFrameRendered || firstFrameRequest !== null ||
        typeof video.requestVideoFrameCallback !== "function") return;
    const generation = streamGeneration;
    firstFrameRequest = video.requestVideoFrameCallback(() => {
      if (generation !== streamGeneration || streamEnded || isPageClosing ||
          !statusOverlay.classList.contains("is-loading")) return;
      firstFrameRequest = null;
      finishFirstFrame();
    });
  };

  const checkFirstFrameFallback = () => {
    if (typeof video.requestVideoFrameCallback !== "function" &&
        video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      finishFirstFrame();
    }
  };

  const showTapPlay = () => {
    tapPlayBtn.classList.add("show");
  };

  const hideTapPlay = () => {
    tapPlayBtn.classList.remove("show");
  };

  const syncAudioState = () => {
    const silent = video.muted || video.volume === 0;
    volumeBtn.querySelector("use").setAttribute("href", silent ? "#icon-volume-off" : "#icon-volume-on");
    volumeBtn.setAttribute("aria-label", silent ? "开启声音" : "静音");
    volumeBtn.setAttribute("aria-pressed", String(!silent));
    volumeBtn.title = silent ? "开启声音" : "静音";
    volumeSlider.value = String(video.volume);
  };

  const setMuted = (muted) => {
    video.muted = muted;
    syncAudioState();
  };

  const updateLiveState = (state, label) => {
    liveBadge.dataset.state = state;
    liveState.textContent = label;
    streamSub.textContent = label;
  };

  const updateStreamer = (data) => {
    const name = String(data.uname || "").trim() || "直播间";
    document.title = name;
    if (pipWindow) pipWindow.document.title = name;
    streamerName.textContent = name;
    streamerInitial.textContent = Array.from(name)[0];
    streamerRoom.textContent = `房间 ${data.roomid || data.uid || uid}`;
    const online = data.onlineCount ?? data.online ?? data.viewerCount ?? data.viewers;
    if (streamerOnline) {
      streamerOnline.hidden = online === undefined || online === null || online === "";
      streamerOnline.textContent = streamerOnline.hidden ? "" : `${online}人在线`;
    }
    if (data.avatar) {
      streamerAvatar.src = data.avatar;
      streamerAvatar.hidden = false;
      streamerInitial.hidden = true;
    } else {
      streamerAvatar.removeAttribute("src");
      streamerAvatar.hidden = true;
      streamerInitial.hidden = false;
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearStreamRetryTimer = () => {
    if (streamRetryTimer !== null) {
      playbackTimerWindow.clearInterval(streamRetryTimer);
      streamRetryTimer = null;
    }
  };

  const startStreamRetry = () => {
    if (streamRetryTimer === null && !isPageClosing) {
      streamRetryTimer = playbackTimerWindow.setInterval(refreshStream, STREAM_RETRY_MS);
    }
  };

  const movePlaybackTimers = (targetWindow) => {
    const retrying = streamRetryTimer !== null;
    clearStreamRetryTimer();
    playbackTimerWindow.clearInterval(flushIntervalId);
    playbackTimerWindow = targetWindow;
    flushIntervalId = isPageClosing ? null : targetWindow.setInterval(flushPendingComments, 200);
    if (retrying) startStreamRetry();
  };

  const stopStream = () => {
    streamGeneration += 1;
    cancelFirstFrameRequest();
    firstFrameRendered = false;
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (flvPlayer) {
      try {
        flvPlayer.pause();
        flvPlayer.unload();
        flvPlayer.destroy();
      } catch (err) {
        // ignore destroy failure
      }
      flvPlayer = null;
    }
    if (xgPlayer) {
      const muted = video.muted;
      const volume = video.volume;
      const closingPlayer = xgPlayer;
      xgPlayer = null;
      try { closingPlayer.destroy(); } catch (_) { /* already destroyed */ }
      if (video.parentNode !== mediaHost) mediaHost.appendChild(video);
      video.muted = muted;
      video.volume = volume;
    }

    try {
      video.pause();
    } catch (err) {
      // ignore pause failure
    }
  };

  const handleStreamEnded = (title = "直播已结束") => {
    if (isPageClosing) return;
    if (!streamEnded) {
      streamEnded = true;
      stopStream();
    }
    hideTapPlay();
    updateLiveState("ended", "等待开播");
    if (!wsClient) commentSub.textContent = "等待开播";
    showStatus(title, "每 10 秒自动重试，开播后自动恢复");
    startStreamRetry();
  };

  const closeWs = ({ preventReconnect = false } = {}) => {
    if (!wsClient) {
      return;
    }

    const client = wsClient;
    wsClient = null;

    if (preventReconnect) {
      client.__skipReconnect = true;
    }

    try {
      client.close();
    } catch (err) {
      // ignore close failure
    }
  };

  const getCommentListBottomThreshold = () => Math.max(12, commentList.clientHeight * 0.08);

  const isCommentListScrolledToBottom = () => {
    const distance = commentList.scrollHeight - commentList.scrollTop - commentList.clientHeight;
    return distance <= getCommentListBottomThreshold();
  };

  const syncCommentListState = () => {
    if (commentPanel.hidden || commentList.clientHeight === 0) return;
    isCommentListAtBottom = isCommentListScrolledToBottom();
    if (scrollBottomBtn) {
      scrollBottomBtn.classList.toggle("is-visible", !isCommentListAtBottom);
      scrollBottomBtn.setAttribute("aria-hidden", isCommentListAtBottom ? "true" : "false");
    }
  };

  const scrollCommentListToBottom = (behavior = "auto") => {
    commentList.scrollTo({
      top: commentList.scrollHeight,
      behavior,
    });
    isCommentListAtBottom = true;
    if (scrollBottomBtn) {
      scrollBottomBtn.classList.remove("is-visible");
      scrollBottomBtn.setAttribute("aria-hidden", "true");
    }
  };

  const enqueueComments = (comments) => {
    const dueAt = Date.now() + COMMENT_DELAY_MS;

    comments.forEach((comment) => {
      pendingComments.push({
        at: dueAt,
        item: comment,
      });
    });

    const overflow = pendingComments.length - MAX_PENDING_COMMENTS;
    if (overflow > 0) {
      pendingComments.splice(0, overflow);
    }
  };

  const tryAutoplay = async () => {
    if (streamEnded || isPageClosing) return;
    const generation = streamGeneration;
    if (!firstFrameRendered) {
      showStatus("正在加载画面", "精彩即将开始，请稍候", true);
      watchFirstFrame();
    }
    try {
      try {
        await video.play();
      } catch (error) {
        if (generation !== streamGeneration || streamEnded || isPageClosing) return;
        // 首次优先有声播放；浏览器拦截后静音重试，不覆盖用户的手动选择。
        if (error?.name !== "NotAllowedError" || audioUnlocked || video.muted) throw error;
        setMuted(true);
        await video.play();
      }
      if (generation !== streamGeneration || streamEnded || isPageClosing) return;
      hideTapPlay();
      syncAudioState();
      checkFirstFrameFallback();
    } catch (err) {
      if (generation !== streamGeneration || streamEnded || isPageClosing) return;
      if (err?.name === "AbortError") return;
      showStatus("需要手动播放", "点击屏幕或按 P 开启声音");
      showTapPlay();
    }

  };

  const attachStream = (url) => {
    streamEnded = false;

    const streamType = getStreamType(url);
    // Mobile native HLS can keep audio decoding under OS background media controls.
    if (mobilePlayer && isYoutubeChannel && streamType === "hls" &&
        video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.load();
      return true;
    }

    const xg = window.SaidaoXgPlayer;
    const xgPlugin = streamType === "hls" ? xg?.HlsPlugin
      : streamType === "flv" ? xg?.FlvPlugin
      : /\.mp4(?:$|[?#])/i.test(url) ? xg?.Mp4Plugin : null;
    if (xg?.Player && (xgPlugin || /\.mp4(?:$|[?#])/i.test(url))) {
      try {
        const generation = streamGeneration;
        let sourceNotFound = false;
        let failureScheduled = false;
        const stopFailedStream = () => {
          if (failureScheduled) return;
          failureScheduled = true;
          // 等插件完成错误回调和轮询计时器登记后再销毁，防止旧轮询重新启动。
          playbackTimerWindow.setTimeout(() => {
            if (generation !== streamGeneration || isPageClosing) return;
            clearStreamRetryTimer();
            handleStreamEnded(sourceNotFound ? "直播源暂不可用" : "播放连接中断");
          }, 0);
        };
        xgPlayer = new xg.Player({
          el: mediaHost,
          // 使用函数避免小窗刷新时跨文档 instanceof HTMLMediaElement 检查失败。
          mediaEl: () => video,
          url,
          width: "100%",
          height: "100%",
          volume: video.volume,
          autoplayMuted: video.muted,
          isLive: streamType === "hls" || streamType === "flv",
          autoplay: true,
          videoInit: false,
          remainMediaAfterDestroy: true,
          controls: false,
          presets: [],
          closeVideoClick: true,
          closeVideoDblclick: true,
          keyShortcut: false,
          playsinline: true,
          plugins: xgPlugin ? [xgPlugin] : [],
          hls: {
            fetchOptions: {
              retryCheckFunc: (error) => {
                if (error?.response?.status !== 404) return true;
                sourceNotFound = true;
                stopFailedStream();
                return false;
              },
            },
          },
          videoAttributes: { playsinline: true, "webkit-playsinline": true },
        });
        const currentPlayer = xgPlayer;
        currentPlayer.on?.("error", () => {
          if (xgPlayer === currentPlayer && !isPageClosing) stopFailedStream();
        });
        return true;
      } catch (error) {
        console.warn("xgplayer 初始化失败，回退原生播放内核", error);
        xgPlayer = null;
      }
    }

    if (streamType === "flv") {
      // 优先使用 mpegts.js（支持 HEVC/H.265），回退到 flv.js（仅支持 H.264）
      const flvLib =
        (window.mpegts && window.mpegts.isSupported && window.mpegts.isSupported() && window.mpegts) ||
        (window.flvjs && window.flvjs.isSupported && window.flvjs.isSupported() && window.flvjs) ||
        null;

      if (flvLib) {
        flvPlayer = flvLib.createPlayer(
          {
            type: "flv",
            url,
            isLive: true,
          },
          {
            enableWorker: true,
            enableStashBuffer: false,
            stashInitialSize: 128,
            lazyLoad: false,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 60,
            autoCleanupMinBackwardDuration: 30,
          }
        );
        flvPlayer.attachMediaElement(video);
        flvPlayer.load();
        flvPlayer.on(flvLib.Events.ERROR, (errType, errDetail, data) => {
          if (streamEnded || isPageClosing) return;
          console.error("FLV 播放错误", errType, errDetail, data);
          const info = (data && (data.info || data.msg)) || "";
          // codec id 12 = HEVC，codec id 13 = AV1
          if (/Unsupported codec/i.test(info) || /codec/i.test(String(errDetail || ""))) {
            showStatus("编码不支持", "浏览器不支持该视频编码（可能是 H.265/HEVC），请使用 Edge/Safari 或安装 HEVC 扩展");
          } else {
            handleStreamEnded("直播连接中断");
          }
        });
        flvPlayer.on(flvLib.Events.MEDIA_ATTACHING, () => {
          tryAutoplay();
        });
        // 直播流被服务端关闭（关播）时，mpegts/flv 会触发 LOADING_COMPLETE
        flvPlayer.on(flvLib.Events.LOADING_COMPLETE, () => {
          handleStreamEnded();
        });
      } else {
        showStatus("无法播放", "当前浏览器不支持 FLV");
        return false;
      }
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.load();
    } else if (window.Hls && streamType !== "flv") {
      hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        tryAutoplay();
      });
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        tryAutoplay();
      });
      // 直播流末尾出现 #EXT-X-ENDLIST（关播）时，hls.js 会触发 BUFFER_EOS
      hls.on(Hls.Events.BUFFER_EOS, () => {
        handleStreamEnded();
      });
      // 直播流转为点播（出现 ENDLIST）说明已关播，缓冲播放完毕后提示
      hls.on(Hls.Events.LEVEL_UPDATED, (event, data) => {
        if (data && data.details && data.details.live === false) {
          const checkEnded = () => {
            if (streamEnded) {
              return;
            }
            const buffered = video.buffered;
            const remaining =
              buffered.length > 0 ? buffered.end(buffered.length - 1) - video.currentTime : 0;
            if (video.ended || remaining <= 0.5) {
              handleStreamEnded();
            }
          };
          checkEnded();
        }
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (streamEnded) {
          return;
        }
        console.warn("HLS 播放错误", data.type, data.details, data);

        if (!data.fatal) {
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            hls.startLoad(-1);
            video.play().catch(() => {
              showTapPlay();
            });
          }
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          handleStreamEnded("直播连接中断");
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          showStatus("播放解码异常", "正在恢复播放器...");
          hls.recoverMediaError();
          video.play().catch(() => {
            showTapPlay();
          });
          return;
        }

        handleStreamEnded("直播连接中断");
      });
    } else {
      showStatus("无法播放", "当前浏览器不支持该流格式");
      return false;
    }
    return true;
  };

  const clearDanmaku = () => {
    danmakuLayer.innerHTML = "";
    danmakuLanes.length = 0;
  };

  const addDanmaku = (item) => {
    if (!danmakuEnabled || danmakuLayer.children.length >= 60) {
      return;
    }

    const layer = danmakuLayer.getBoundingClientRect();
    const laneCount = Math.floor(layer.height / DANMAKU_LANE_HEIGHT);
    if (layer.width <= 0 || laneCount === 0) return;

    let lane = 0;
    for (; lane < laneCount; lane += 1) {
      const tail = danmakuLanes[lane];
      if (!tail || tail.parentNode !== danmakuLayer ||
          tail.getBoundingClientRect().right + DANMAKU_GAP <= layer.right) break;
    }
    // 拥挤时略过画面弹幕；右侧评论仍完整显示。
    if (lane === laneCount) return;

    const node = danmakuLayer.ownerDocument.createElement("div");
    node.className = "danmaku-item";
    if (item.plainText) node.textContent = item.text || "";
    else node.innerHTML = item.text || "";
    node.style.visibility = "hidden";
    node.style.animationName = "none";
    node.style.top = `${4 + lane * DANMAKU_LANE_HEIGHT}px`;
    danmakuLayer.appendChild(node);

    const nodeWidth = Math.ceil(node.getBoundingClientRect().width);
    const travel = layer.width + nodeWidth;
    // 所有轨道保持相同像素速度，长弹幕不会追上前一条。
    node.style.width = `${nodeWidth}px`;
    node.style.setProperty("--danmaku-distance", `${travel}px`);
    node.style.animationDuration = `${travel / DANMAKU_SPEED}s`;
    node.style.animationName = "danmaku-move";
    node.style.visibility = "visible";
    danmakuLanes[lane] = node;
    node.addEventListener("animationend", () => node.remove());
  };

  const danmakuResizeObserver = new ResizeObserver(clearDanmaku);
  danmakuResizeObserver.observe(danmakuLayer);

  const syncDanmakuState = () => {
    danmakuLayer.classList.toggle("is-hidden", !danmakuEnabled);
    danmakuToggleBtn.classList.toggle("is-on", danmakuEnabled);
    danmakuLabel.textContent = danmakuEnabled ? "弹幕开" : "弹幕关";
    danmakuToggleBtn.setAttribute("aria-pressed", danmakuEnabled ? "true" : "false");
    danmakuToggleBtn.setAttribute("aria-label", danmakuEnabled ? "关闭弹幕" : "开启弹幕");

    if (!danmakuEnabled) {
      clearDanmaku();
    }
  };

  const appendComment = (item) => {
    const shouldStickToBottom = isCommentListAtBottom;
    const commentDocument = commentList.ownerDocument;
    const node = commentDocument.createElement("div");
    node.className = "comment-item";

    const user = commentDocument.createElement("span");
    user.className = "comment-user";
    user.innerHTML = `${item.user || "匿名"}`.trim();

    const text = commentDocument.createElement("span");
    text.className = "comment-text";
    text.innerHTML = item.text || "";

    node.appendChild(user);
    node.appendChild(commentDocument.createTextNode(" "));
    node.appendChild(text);

    commentList.appendChild(node);
    commentEmpty.hidden = true;

    const maxItems = 200;
    while (commentList.children.length > maxItems) {
      commentList.removeChild(commentList.firstChild);
    }

    if (commentPanel.hidden) return;
    if (shouldStickToBottom) {
      scrollCommentListToBottom("auto");
    } else {
      syncCommentListState();
    }
  };

  const handleChatDanmaku = (event) => {
    if (isPageClosing || !isYoutubeChannel || event.origin !== window.location.origin ||
        !youtubeChatFrame?.contentWindow || event.source !== youtubeChatFrame.contentWindow) return;
    if (event.data?.type === "saidao-chat-online") {
      if (streamerOnline && event.data.count !== undefined) {
        streamerOnline.hidden = false;
        streamerOnline.textContent = `${event.data.count}人在线`;
      }
      return;
    }
    if (mobilePlayer) return;
    if (event.data?.type === "saidao-chat-close") {
      setPipCommentsVisible(false);
      return;
    }
    if (event.data?.type !== "saidao-chat-danmaku" || typeof event.data.text !== "string") return;
    const text = event.data.text.trim().slice(0, 512);
    if (text) addDanmaku({ text, plainText: true });
  };
  window.addEventListener("message", handleChatDanmaku);

  const setYoutubeChat = (enabled) => {
    document.documentElement.classList.toggle("mobile-youtube", enabled && mobilePlayer);
    if (mobilePlayer) commentPanel.hidden = !enabled;
    if (mobilePlayer) {
      danmakuEnabled = false;
      clearDanmaku();
      danmakuLayer.classList.add("is-hidden");
    }
    commentPanel.classList.toggle("has-youtube-chat", enabled);
    if (!youtubeChatFrame) return;
    youtubeChatFrame.hidden = !enabled;
    if (enabled && !youtubeChatFrame.src) youtubeChatFrame.src = `${String(location.pathname || "").replace(/[^/]*$/, "")}index.html?chatOnly=1${mobilePlayer ? "&chatView=mobile" : ""}&v=20260923-mobile6`;
    if (!enabled) youtubeChatFrame.removeAttribute("src");
  };

  const setupBackgroundPlayback = () => {
    if (!mobilePlayer || !isYoutubeChannel || !navigator.mediaSession) return;
    const session = navigator.mediaSession;
    if (window.MediaMetadata) session.metadata = new window.MediaMetadata({
      title: document.title, artist: "Saidao 直播",
    });
    // No visibilitychange pause: switching apps should leave playback running.
    for (const [action, handler] of Object.entries({
      play: () => { if (streamEnded) refreshStream(); else tryAutoplay(); },
      pause: () => video.pause(),
    })) {
      try { session.setActionHandler(action, handler); } catch (_) { /* Unsupported OS action. */ }
    }
    session.playbackState = video.paused ? "paused" : "playing";
  };
  video.addEventListener("touchend", () => {
    if (!mobilePlayer || !isYoutubeChannel || video.paused || !video.muted) return;
    audioUnlocked = true;
    setMuted(false);
    video.play().catch(() => {});
  }, { passive: true });
  for (const event of ["playing", "pause", "ended"]) {
    video.addEventListener(event, () => {
      if (mobilePlayer && isYoutubeChannel && navigator.mediaSession) {
        navigator.mediaSession.playbackState = event === "playing" ? "playing" : "paused";
      }
    });
  }
  const syncMobileViewport = () => {
    if (!mobilePlayer) return;
    document.documentElement.style.setProperty("--player-visible-height", `${window.visualViewport?.height || window.innerHeight}px`);
  };
  window.visualViewport?.addEventListener("resize", syncMobileViewport);
  window.addEventListener("resize", syncMobileViewport);
  syncMobileViewport();

  const connectWs = () => {
    if (isPageClosing || isYoutubeChannel) {
      clearReconnectTimer();
      closeWs({ preventReconnect: true });
      return;
    }

    clearReconnectTimer();

    if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = `${wsBase}?uid=${encodeURIComponent(uid)}`;
    const client = new WebSocket(wsUrl);
    wsClient = client;

    client.onopen = () => {
      if (wsClient !== client) {
        return;
      }
      commentSub.textContent = "已连接";
    };

    client.onmessage = (event) => {
      if (wsClient !== client) {
        return;
      }

      try {
        const payload = JSON.parse(event.data);
        const comments = Array.isArray(payload.comments) ? payload.comments : [];
        enqueueComments(comments);
      } catch (err) {
        // ignore invalid payload
      }
    };

    client.onclose = () => {
      if (wsClient === client) {
        wsClient = null;
      }

      if (client.__skipReconnect || isPageClosing) {
        return;
      }

      commentSub.textContent = "断开，重连中...";
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        if (!wsClient && !isPageClosing) {
          connectWs();
        }
      }, 2000);
    };

    client.onerror = () => {
      try {
        client.close();
      } catch (err) {
        // ignore close failure
      }
    };
  };

  const syncFullscreenState = () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement ||
      nativeVideoFullscreen ||
      playerLayout.classList.contains("viewport-fullscreen"));
    fullscreenLabel.textContent = isFs ? "退出全屏" : "全屏";
    fullscreenBtn.querySelector("use").setAttribute("href", isFs ? "#icon-exit-fullscreen" : "#icon-fullscreen");
    fullscreenBtn.setAttribute("aria-label", isFs ? "退出全屏" : "全屏");
    fullscreenBtn.title = isFs ? "退出全屏" : "全屏";
    playerLayout.classList.toggle("fullscreen", isFs);
  };

  const showPipMessage = (message) => {
    pipMessage.textContent = message;
    pipMessage.hidden = false;
  };

  const getPipSize = () => {
    const ratio = video.videoWidth / video.videoHeight;
    const maxWidth = Math.floor(window.screen.availWidth * 0.8);
    const maxHeight = Math.floor(window.screen.availHeight * 0.8);
    if (isYoutubeChannel) {
      return {
        width: Math.min(ratio < 1 ? 720 : 1000, maxWidth),
        height: Math.min(ratio < 1 ? 760 : 560, maxHeight),
      };
    }
    const videoWidth = Math.min(ratio < 1 ? 360 : 640, maxWidth - PIP_COMMENT_WIDTH, maxHeight * ratio);
    const height = Math.round(videoWidth / ratio);
    // 竖屏直播加上评论栏后仍优先保持竖向窗口，视频通过 contain 完整显示。
    const width = Math.min(videoWidth + PIP_COMMENT_WIDTH, ratio < 1 ? height * 0.95 : maxWidth);
    return { width: Math.round(width), height };
  };

  const restoreCommentScroll = () => {
    if (isCommentListAtBottom) {
      scrollCommentListToBottom();
    } else {
      commentList.scrollTop = savedCommentScrollTop;
    }
  };

  const setPipCommentsVisible = (visible) => {
    if (!pipWindow && !isYoutubeChannel) return;
    if (!visible && !commentPanel.hidden) savedCommentScrollTop = commentList.scrollTop;
    commentPanel.hidden = !visible;
    playerLayout.classList.toggle("chat-panel-hidden", !visible);
    pipWindow?.document.body.classList.toggle("pip-comments-hidden", !visible);
    pipCommentsBtn.setAttribute("aria-pressed", String(visible));
    pipCommentsBtn.title = visible ? "关闭评论栏" : "显示评论栏";
    pipCommentsBtn.setAttribute("aria-label", pipCommentsBtn.title);
    if (visible) restoreCommentScroll();
    clearDanmaku();
  };

  const syncPipButton = () => {
    pipLabel.textContent = pipWindow ? "返回" : "小屏";
    pipBtn.title = pipWindow ? "返回页面播放" : "小屏播放";
    pipBtn.setAttribute("aria-label", pipBtn.title);
    pipBtn.setAttribute("aria-pressed", String(!!pipWindow));
    pipPlaceholder.hidden = !pipWindow;
  };

  const openPip = async () => {
    if (mobilePlayer || pipOpening || isPageClosing) return;
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    pipMessage.hidden = true;
    if (!window.documentPictureInPicture?.requestWindow) {
      showPipMessage("当前浏览器不支持带弹幕的小窗，请使用最新版 Chrome 或 Edge");
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      showPipMessage("直播画面就绪后即可开启小屏播放");
      return;
    }

    pipOpening = true;
    pipBtn.disabled = true;
    let openedWindow = null;
    try {
      // 必须直接在点击事件内申请窗口，不能先 await 退出全屏而丢失用户手势。
      openedWindow = await window.documentPictureInPicture.requestWindow({
        ...getPipSize(),
        preferInitialWindowPlacement: true,
      });
      if (isPageClosing || openedWindow.closed) {
        openedWindow.close();
        return;
      }
      const pipDocument = openedWindow.document;
      pipDocument.title = document.title;
      pipDocument.documentElement.lang = "zh-CN";
      const stylesheet = document.getElementById("playerStyles").cloneNode(true);
      stylesheet.href = document.getElementById("playerStyles").href;
      stylesheet.addEventListener("load", () => {
        if (pipWindow === openedWindow) restoreCommentScroll();
      }, { once: true });
      pipDocument.head.appendChild(stylesheet);
      pipDocument.body.classList.add("pip-window");
      pipDocument.body.appendChild(document.querySelector(".icon-definitions").cloneNode(true));
      // 使用小窗自己的观察器，母页在后台时缩放也能及时重排弹幕。
      const pipResizeObserver = new openedWindow.ResizeObserver(clearDanmaku);
      pipWindow = openedWindow;
      savedCommentScrollTop = commentList.scrollTop;
      danmakuResizeObserver.disconnect();
      const restorePlayer = () => {
        if (pipWindow !== openedWindow) return;
        openedWindow.removeEventListener("message", handleChatDanmaku);
        const wasPlaying = !video.paused;
        pipResizeObserver.disconnect();
        pipDocument.removeEventListener("keydown", handlePlayerKeydown);
        pipDocument.removeEventListener("click", handlePlayerClick);
        if (!commentPanel.hidden) savedCommentScrollTop = commentList.scrollTop;
        playerArea.appendChild(playerShell);
        playerLayout.appendChild(commentPanel);
        pipWindow = null;
        if (isYoutubeChannel) setPipCommentsVisible(!commentPanel.hidden);
        else commentPanel.hidden = false;
        if (!isPageClosing) danmakuResizeObserver.observe(danmakuLayer);
        movePlaybackTimers(window);
        clearDanmaku();
        syncPipButton();
        restoreCommentScroll();
        if (wasPlaying && !isPageClosing) tryAutoplay();
      };
      openedWindow.addEventListener("pagehide", restorePlayer, { once: true });
      openedWindow.addEventListener("message", handleChatDanmaku);
      pipDocument.addEventListener("keydown", handlePlayerKeydown);
      pipDocument.addEventListener("click", handlePlayerClick);
      const wasPlaying = !video.paused;
      clearDanmaku();
      pipDocument.body.appendChild(playerShell);
      pipDocument.body.appendChild(commentPanel);
      setPipCommentsVisible(isYoutubeChannel ? !commentPanel.hidden : true);
      pipResizeObserver.observe(danmakuLayer);
      // 让可见小窗驱动弹幕与关播重试，避免母页切入后台后的定时器限频。
      movePlaybackTimers(openedWindow);
      syncPipButton();
      if (wasPlaying) tryAutoplay();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err) {
      openedWindow?.close();
      console.warn("小窗打开失败", err?.name || "", err?.message || "浏览器未提供错误信息");
      showPipMessage("小窗未能打开，请点击小屏按钮重试");
    } finally {
      pipOpening = false;
      pipBtn.disabled = false;
    }
  };

  const init = async () => {
    updateLiveState("loading", "连接中");
    showStatus("正在连接直播", "精彩即将开始，请稍候", true);
    let requestTimeout = null;

    try {
      if (directStreamUrl) {
        originUrl = directStreamUrl;
        updateStreamer({ uname: params.get("name"), uid });
        setYoutubeChat(isYoutubeChannel);
        setupBackgroundPlayback();
        if (attachStream(directStreamUrl)) tryAutoplay();
        connectWs();
        return;
      }

      infoRequest = new AbortController();
      requestTimeout = setTimeout(() => infoRequest?.abort(), 8000);
      const res = await fetch(`${infoBase}${encodeURIComponent(uid)}`, {
        cache: "no-store",
        signal: infoRequest.signal,
      });
      if (!res.ok) {
        throw new Error("接口请求失败");
      }
      const data = await res.json();
      if (isPageClosing) return;
      updateStreamer(data);
      isYoutubeChannel = String(data.channel).toLowerCase() === "youtube";
      setYoutubeChat(isYoutubeChannel);
      setupBackgroundPlayback();
      originUrl = data.orig || "";

      if (mobilePlayer && data.channel !== "youtube") {
        if (originUrl) {
          window.location.href = originUrl;
        } else {
          showStatus("移动端跳转失败", "未返回 orig 链接");
        }
        return;
      }

      if (String(data.status) !== "1" || !data.m3u8) {
        handleStreamEnded("主播暂未开播");
        return;
      }

      if (attachStream(data.m3u8)) tryAutoplay();
      connectWs();
    } catch (err) {
      if (isPageClosing) return;
      updateLiveState("error", "连接中断");
      commentSub.textContent = "等待重连";
      showStatus("暂时无法连接直播", "每 10 秒自动重试，也可点击下方刷新");
      startStreamRetry();
    } finally {
      clearTimeout(requestTimeout);
      infoRequest = null;
    }
  };

  // 手动刷新与关播重试共用入口；保留当前静音、音量和用户声音授权。
  const refreshStream = async () => {
    if (refreshInProgress || isPageClosing) return;
    refreshInProgress = true;
    refreshBtn.disabled = true;
    refreshBtn.classList.add("is-refreshing");
    streamEnded = true;
    stopStream();
    clearReconnectTimer();
    closeWs({ preventReconnect: true });
    commentSub.textContent = "连接中…";
    pendingComments.length = 0;
    clearDanmaku();
    hideTapPlay();
    video.removeAttribute("src");
    video.load();
    try {
      await init();
    } finally {
      refreshInProgress = false;
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("is-refreshing");
    }
  };

  const flushPendingComments = () => {
    const now = Date.now();
    if (pendingComments.length === 0) {
      return;
    }
    while (pendingComments.length > 0 && pendingComments[0].at <= now) {
      const next = pendingComments.shift();
      if (!next) {
        break;
      }
      appendComment(next.item);
      addDanmaku(next.item);
    }
  };

  const toggleSound = () => {
    audioUnlocked = true;
    const next = !(video.muted || video.volume === 0);
    if (!next && video.volume === 0) video.volume = 0.6;
    setMuted(next);
    if (!next) {
      if (!streamEnded) tryAutoplay();
    }
  };

  fullscreenBtn.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        syncFullscreenState();
        return;
      }
      if (document.webkitFullscreenElement) {
        await document.webkitExitFullscreen();
        syncFullscreenState();
        return;
      }
      if (nativeVideoFullscreen) {
        video.webkitExitFullscreen();
        return;
      }
    } catch (err) {
      showPipMessage("暂时无法退出全屏，请使用浏览器的退出按钮");
      return;
    }
    if (playerLayout.classList.contains("viewport-fullscreen")) {
      playerLayout.classList.remove("viewport-fullscreen");
      syncFullscreenState();
      return;
    }
    pipMessage.hidden = true;
    for (const requestFullscreen of [playerLayout.requestFullscreen, playerLayout.webkitRequestFullscreen]) {
      if (typeof requestFullscreen !== "function") continue;
      try {
        await requestFullscreen.call(playerLayout);
        syncFullscreenState();
        return;
      } catch (err) {
        // 某些移动浏览器暴露接口但拒绝容器全屏，继续尝试视频原生全屏。
      }
    }
    if (typeof video.webkitEnterFullscreen === "function") {
      if (video.readyState < 1) {
        showPipMessage("直播画面加载后即可开启全屏");
        return;
      }
      try {
        video.webkitEnterFullscreen();
        return;
      } catch (err) {
        // 内嵌浏览器可能禁止系统全屏，手机端退回铺满当前页面。
      }
    }
    if (mobilePlayer) {
      playerLayout.classList.add("viewport-fullscreen");
      syncFullscreenState();
    } else {
      showPipMessage("当前浏览器暂不支持全屏");
    }
  });

  originBtn.addEventListener("click", () => {
    if (originUrl) {
      window.open(originUrl, "_blank", "noopener");
    } else {
      showStatus("源站不可用", "未返回 orig 链接");
    }
  });

  refreshBtn.addEventListener("click", refreshStream);

  danmakuToggleBtn.addEventListener("click", () => {
    danmakuEnabled = !danmakuEnabled;
    syncDanmakuState();
  });

  commentList.addEventListener("scroll", () => {
    syncCommentListState();
  });

  if (scrollBottomBtn) {
    scrollBottomBtn.addEventListener("click", () => {
      scrollCommentListToBottom("smooth");
    });
  }

  volumeSlider.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    audioUnlocked = true;
    video.volume = value;
    setMuted(value === 0);
  });

  pipBtn.addEventListener("click", openPip);
  pipReturnBtn.addEventListener("click", () => pipWindow?.close());
  pipCommentsBtn.addEventListener("click", () => setPipCommentsVisible(commentPanel.hidden));
  pipCommentsCloseBtn.addEventListener("click", () => setPipCommentsVisible(false));

  volumeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSound();
  });

  const volumePop = document.querySelector(".volume-pop");
  let volumeHideTimer = null;

  const showVolumePopover = () => {
    if (volumeHideTimer) {
      clearTimeout(volumeHideTimer);
      volumeHideTimer = null;
    }
    volumePopover.classList.add("show");
  };

  const scheduleHideVolumePopover = () => {
    if (volumeHideTimer) {
      clearTimeout(volumeHideTimer);
    }
    volumeHideTimer = setTimeout(() => {
      volumePopover.classList.remove("show");
      volumeHideTimer = null;
    }, 250);
  };

  volumePop.addEventListener("mouseenter", showVolumePopover);
  volumePop.addEventListener("mouseleave", scheduleHideVolumePopover);
  volumePopover.addEventListener("mouseenter", showVolumePopover);
  volumePopover.addEventListener("mouseleave", scheduleHideVolumePopover);
  volumePop.addEventListener("focusin", showVolumePopover);
  volumePop.addEventListener("focusout", scheduleHideVolumePopover);

  tapPlayBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    audioUnlocked = true;
    if (video.volume === 0) video.volume = 0.6;
    setMuted(false);
    hideTapPlay();
    tryAutoplay();
  });

  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("webkitfullscreenchange", syncFullscreenState);
  video.addEventListener("webkitbeginfullscreen", () => {
    nativeVideoFullscreen = true;
    syncFullscreenState();
  });
  video.addEventListener("webkitendfullscreen", () => {
    nativeVideoFullscreen = false;
    syncFullscreenState();
  });

  const handlePlayerKeydown = (event) => {
    if (event.key === "Escape" && playerLayout.classList.contains("viewport-fullscreen")) {
      playerLayout.classList.remove("viewport-fullscreen");
      syncFullscreenState();
      return;
    }
    if (event.target.closest("input, textarea, [contenteditable='true']")) return;
    if (!event.repeat && event.key.toLowerCase() === "p") {
      toggleSound();
    }
  };

  const handlePlayerClick = (event) => {
    if (event.target.closest("button, input, a") || streamEnded) {
      return;
    }

    if (!audioUnlocked && video.muted && !video.paused) {
      setMuted(false);
      audioUnlocked = true;
      tryAutoplay();
    }
  };

  syncCommentListState();
  syncDanmakuState();
  setMuted(false);

  streamerAvatar.addEventListener("error", () => {
    streamerAvatar.hidden = true;
    streamerInitial.hidden = false;
  });

  document.addEventListener("keydown", handlePlayerKeydown);
  document.addEventListener("click", handlePlayerClick);

  video.addEventListener("volumechange", syncAudioState);
  video.addEventListener("canplay", tryAutoplay);
  video.addEventListener("loadedmetadata", tryAutoplay);
  video.addEventListener("loadeddata", checkFirstFrameFallback);
  video.addEventListener("timeupdate", checkFirstFrameFallback);

  // 只有实际恢复播放才停止关播轮询，拿到地址不代表直播已恢复。
  video.addEventListener("playing", () => {
    if (streamEnded || isPageClosing) return;
    clearStreamRetryTimer();
    if (firstFrameRendered || !statusOverlay.classList.contains("is-loading")) hideStatus();
    else checkFirstFrameFallback();
    hideTapPlay();
    updateLiveState("live", "直播中");
  });

  video.addEventListener("play", () => {
    hideTapPlay();
  });

  video.addEventListener("pause", () => {
    if (!video.ended && !streamEnded && !isPageClosing) {
      showTapPlay();
    }
  });

  // 媒体真正播放结束（关播兜底信号）
  video.addEventListener("ended", () => {
    handleStreamEnded();
  });

  // 原生 HLS 在源站关播返回 404 时可能只触发 error，不触发 ended。
  video.addEventListener("error", () => {
    if (!hls && !flvPlayer && !xgPlayer && !streamEnded) {
      handleStreamEnded("直播连接中断");
    }
  });

  video.addEventListener("stalled", () => {
    if (streamEnded) {
      return;
    }
    if (hls && !video.paused) {
      hls.startLoad(-1);
    }
  });

  video.addEventListener("waiting", () => {
    if (streamEnded) {
      return;
    }
    if (hls && !video.paused) {
      hls.startLoad(-1);
    }
  });

  movePlaybackTimers(window);

  window.addEventListener("pagehide", (event) => {
    if (event.persisted) {
      return;
    }

    isPageClosing = true;
    pipWindow?.close();
    clearStreamRetryTimer();
    infoRequest?.abort();
    clearReconnectTimer();
    closeWs({ preventReconnect: true });
    pendingComments.length = 0;

    if (volumeHideTimer) {
      clearTimeout(volumeHideTimer);
      volumeHideTimer = null;
    }

    playbackTimerWindow.clearInterval(flushIntervalId);
    danmakuResizeObserver.disconnect();
    clearDanmaku();

    stopStream();
  });

  refreshStream();
})();
