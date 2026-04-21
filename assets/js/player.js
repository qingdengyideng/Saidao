(() => {
  const DEFAULT_UID = "5861538369";
  const infoBase = "https://api.saidao.cc/player/info/";
  const wsBase = "wss://api.saidao.cc/player/ws";

  const video = document.getElementById("video");
  const statusOverlay = document.getElementById("statusOverlay");
  const statusTitle = document.getElementById("statusTitle");
  const statusSub = document.getElementById("statusSub");
  const soundHint = document.getElementById("soundHint");
  const streamSub = document.getElementById("streamSub");
  const commentCount = document.getElementById("commentCount");
  const toggleMuteBtn = document.getElementById("toggleMuteBtn");
  const muteLabel = document.getElementById("muteLabel");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const fullscreenLabel = document.getElementById("fullscreenLabel");
  const originBtn = document.getElementById("originBtn");
  const tapPlayBtn = document.getElementById("tapPlayBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const volumeSlider = document.getElementById("volumeSlider");
  const volumeBtn = document.getElementById("volumeBtn");
  const volumePopover = document.getElementById("volumePopover");
  const commentList = document.getElementById("commentList");
  const commentSub = document.getElementById("commentSub");
  const playerLayout = document.getElementById("playerLayout");
  const danmakuLayer = document.getElementById("danmakuLayer");

  let hls = null;
  let flvPlayer = null;
  let totalComments = 0;
  let audioUnlocked = false;
  let originUrl = "";
  const COMMENT_DELAY_MS = 5000;
  const MAX_PENDING_COMMENTS = 500;
  const pendingComments = [];
  let wsClient = null;
  let reconnectTimer = null;
  let isPageClosing = false;

  const params = new URLSearchParams(window.location.search);
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
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  };

  const showStatus = (title, sub) => {
    statusTitle.textContent = title;
    statusSub.textContent = sub;
    statusOverlay.classList.remove("hidden");
  };

  const hideStatus = () => {
    statusOverlay.classList.add("hidden");
  };

  const showTapPlay = () => {
    tapPlayBtn.classList.add("show");
  };

  const hideTapPlay = () => {
    tapPlayBtn.classList.remove("show");
  };

  const showSoundHint = () => {
    soundHint.classList.add("show");
  };

  const hideSoundHint = () => {
    soundHint.classList.remove("show");
  };

  const setMuted = (muted) => {
    video.muted = muted;
    muteLabel.textContent = muted ? "静音" : "有声";
    toggleMuteBtn.querySelector(".icon").textContent = muted ? "🔇" : "🔊";
    volumeBtn.textContent = muted || video.volume === 0 ? "🔇" : "🔈";
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
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
    video.muted = true;
    try {
      await video.play();
      hideStatus();
      hideTapPlay();
      setMuted(video.muted || video.volume === 0);
    } catch (err) {
      showStatus("需要手动播放", "点击屏幕或按 P 开启声音");
      showTapPlay();
    }

    if (!audioUnlocked) {
      try {
        video.muted = false;
        await video.play();
        audioUnlocked = true;
        hideSoundHint();
        hideTapPlay();
        setMuted(false);
      } catch (err) {
        setMuted(true);
        showSoundHint();
      }
    }
  };

  const attachStream = (url) => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (flvPlayer) {
      flvPlayer.destroy();
      flvPlayer = null;
    }

    const streamType = getStreamType(url);

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
          console.error("FLV 播放错误", errType, errDetail, data);
          const info = (data && (data.info || data.msg)) || "";
          // codec id 12 = HEVC，codec id 13 = AV1
          if (/Unsupported codec/i.test(info) || /codec/i.test(String(errDetail || ""))) {
            showStatus("编码不支持", "浏览器不支持该视频编码（可能是 H.265/HEVC），请使用 Edge/Safari 或安装 HEVC 扩展");
          } else {
            showStatus("播放失败", "FLV 流解析失败");
          }
        });
        flvPlayer.on(flvLib.Events.MEDIA_ATTACHING, () => {
          tryAutoplay();
        });
      } else {
        showStatus("无法播放", "当前浏览器不支持 FLV");
        return;
      }
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.load();
      video.play().catch(() => {
        // handled by tryAutoplay
      });
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
    } else {
      showStatus("无法播放", "当前浏览器不支持该流格式");
      return;
    }

    video.addEventListener(
      "canplay",
      () => {
        tryAutoplay();
      },
      { once: true }
    );

    video.addEventListener(
      "loadedmetadata",
      () => {
        tryAutoplay();
      },
      { once: true }
    );
  };

  const addDanmaku = (item) => {
    const node = document.createElement("div");
    node.className = "danmaku-item";
    node.innerHTML = item.text || "";
    node.style.visibility = "hidden";

    const layerHeight = danmakuLayer.clientHeight || 1;
    const laneCount = Math.max(6, Math.floor(layerHeight / 40));
    const lane = Math.floor(Math.random() * laneCount);
    node.style.top = `${12 + lane * 32}px`;

    const duration = 7.2 + Math.random() * 3.6;
    node.style.animationDuration = `${duration}s`;

    danmakuLayer.appendChild(node);

    const layerWidth = danmakuLayer.clientWidth || 1;
    const nodeWidth = node.getBoundingClientRect().width || 1;
    const travel = layerWidth + nodeWidth;
    node.style.setProperty("--danmaku-distance", `${travel}px`);
    node.style.visibility = "visible";

    node.addEventListener("animationend", () => node.remove());

    const maxItems = 60;
    while (danmakuLayer.children.length > maxItems) {
      danmakuLayer.removeChild(danmakuLayer.firstChild);
    }
  };

  const appendComment = (item) => {
    const node = document.createElement("div");
    node.className = "comment-item";

    const user = document.createElement("div");
    user.className = "comment-user";
    user.innerHTML = `${item.user || "匿名"}`.trim();

    const text = document.createElement("div");
    text.className = "comment-text";
    text.innerHTML = item.text || "";

    node.appendChild(user);
    node.appendChild(text);

    commentList.appendChild(node);
    commentList.scrollTop = commentList.scrollHeight;

    const maxItems = 200;
    while (commentList.children.length > maxItems) {
      commentList.removeChild(commentList.firstChild);
    }
  };

  const connectWs = () => {
    if (isPageClosing) {
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
    const isFs = !!document.fullscreenElement;
    fullscreenLabel.textContent = isFs ? "退出" : "全屏";
    playerLayout.classList.toggle("fullscreen", isFs);
  };

  const init = async () => {
    showStatus("正在获取直播信息", "请稍候");

    try {
      if (directStreamUrl) {
        originUrl = directStreamUrl;
        streamSub.textContent = directStreamUrl;
        hideStatus();
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        attachStream(directStreamUrl);
        setTimeout(() => {
          tryAutoplay();
        }, 0);
        connectWs();
        return;
      }

      const res = await fetch(`${infoBase}${encodeURIComponent(uid)}`);
      if (!res.ok) {
        throw new Error("接口请求失败");
      }
      const data = await res.json();
      originUrl = data.orig || "";

      if (isMobile()) {
        if (data.orig) {
          window.location.href = data.orig;
          return;
        }
        showStatus("移动端跳转失败", "未返回 orig 链接");
        return;
      }

      if (data.status !== "1" || !data.m3u8) {
        showStatus("当前未开播", "请稍后再来");
        return;
      }

      streamSub.textContent = "直播已连接";
      hideStatus();
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      attachStream(data.m3u8);
      setTimeout(() => {
        tryAutoplay();
      }, 0);
      setTimeout(() => {
        if (video.paused) {
          showTapPlay();
        }
      }, 1200);
      connectWs();
    } catch (err) {
      showStatus("加载失败", "请检查接口服务");
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
      totalComments += 1;
      commentCount.textContent = String(totalComments);
      streamSub.textContent = `${next.item.platform || ""} · ${next.item.user || ""}`.trim();
    }
  };

  toggleMuteBtn.addEventListener("click", () => {
    const next = !video.muted;
    setMuted(next);
    if (!next) {
      audioUnlocked = true;
      hideSoundHint();
      video.play().catch(() => {
        showSoundHint();
      });
    }
  });

  fullscreenBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await playerLayout.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  });

  originBtn.addEventListener("click", () => {
    if (originUrl) {
      window.open(originUrl, "_blank", "noopener");
    } else {
      showStatus("源站不可用", "未返回 orig 链接");
    }
  });

  refreshBtn.addEventListener("click", () => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (flvPlayer) {
      flvPlayer.destroy();
      flvPlayer = null;
    }
    clearReconnectTimer();
    closeWs({ preventReconnect: true });
    pendingComments.length = 0;
    danmakuLayer.innerHTML = "";
    video.pause();
    video.removeAttribute("src");
    video.load();
    init();
    setMuted(true);
  });

  volumeSlider.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    video.volume = value;
    if (value === 0) {
      setMuted(true);
    } else if (video.muted) {
      setMuted(false);
    }
  });

  volumeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (video.muted || video.volume === 0) {
      if (video.volume === 0) {
        video.volume = 0.6;
        volumeSlider.value = String(video.volume);
      }
      setMuted(false);
    } else {
      setMuted(true);
    }
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

  tapPlayBtn.addEventListener("click", () => {
    video.muted = true;
    video.play().then(() => {
      hideTapPlay();
      hideStatus();
    });
  });

  document.addEventListener("fullscreenchange", syncFullscreenState);

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "p") {
      const next = !video.muted;
      setMuted(next);
      if (!next) {
        audioUnlocked = true;
        hideSoundHint();
        video.play().catch(() => {
          showSoundHint();
        });
      }
    }
  });

  document.addEventListener("click", () => {
    if (!audioUnlocked && video.muted) {
      setMuted(false);
      audioUnlocked = true;
      hideSoundHint();
      video.play().catch(() => {
        showSoundHint();
      });
    }
  });

  video.addEventListener("play", () => {
    hideTapPlay();
  });

  video.addEventListener("pause", () => {
    if (!video.ended) {
      showTapPlay();
    }
  });

  const flushIntervalId = setInterval(flushPendingComments, 200);

  window.addEventListener("pagehide", (event) => {
    if (event.persisted) {
      return;
    }

    isPageClosing = true;
    clearReconnectTimer();
    closeWs({ preventReconnect: true });
    pendingComments.length = 0;

    if (volumeHideTimer) {
      clearTimeout(volumeHideTimer);
      volumeHideTimer = null;
    }

    clearInterval(flushIntervalId);

    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (flvPlayer) {
      flvPlayer.destroy();
      flvPlayer = null;
    }

    video.pause();
  });

  init();
})();
