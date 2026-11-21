/* Shared MoDOT live-video player (Cameras tab + map popups).
   hls.js over MSE wherever it exists (Chrome's native HLS fails on some MoDOT playlists); native HLS only on iOS Safari.
   Tuned for MoDOT's plain (non-LL) HLS: low-latency off, bounded retries with backoff, and a 10 s watchdog. If no
   picture arrives, or playback freezes, within 10 s the player stops itself and offers "Open official page" + Retry
   instead of spinning forever. Muted + playsinline so autoplay is allowed on phones. */
(function () {
  "use strict";
  var HLS_SRC = "vendor/hls.min.js", hlsLoading = null, STALL_MS = 10000;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsLoading) hlsLoading = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = HLS_SRC; s.onload = function () { res(window.Hls); }; s.onerror = function () { hlsLoading = null; rej(new Error("player failed to load")); }; document.head.appendChild(s); });
    return hlsLoading;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var HLS_CFG = {
    lowLatencyMode: false, enableWorker: true, maxBufferLength: 10, backBufferLength: 10, liveSyncDurationCount: 3,
    manifestLoadingTimeOut: 8000, manifestLoadingMaxRetry: 2, manifestLoadingRetryDelay: 1000, manifestLoadingMaxRetryTimeout: 4000,
    levelLoadingTimeOut: 8000, levelLoadingMaxRetry: 3, levelLoadingRetryDelay: 1000, levelLoadingMaxRetryTimeout: 4000,
    fragLoadingTimeOut: 12000, fragLoadingMaxRetry: 4, fragLoadingRetryDelay: 1000, fragLoadingMaxRetryTimeout: 6000
  };
  // start(media, url, opts) -> { stop() }. opts: official (url), officialText, onStatus(text), onLive()
  function start(media, url, opts) {
    opts = opts || {};
    var dead = false, hls = null, watch = null, lastT = -1, lastMove = Date.now(), gotPicture = false, t0 = Date.now();
    var say = opts.onStatus || function () {};
    var v = document.createElement("video");
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); v.controls = true; v.autoplay = true; v.preload = "auto";
    media.innerHTML = ""; media.appendChild(v);
    var loading = document.createElement("div"); loading.className = "camera-loading"; loading.setAttribute("role", "status");
    loading.textContent = "Loading camera…"; media.appendChild(loading);
    say("Loading camera…");
    function teardown() {
      clearInterval(watch); watch = null; clearTimeout(retryT); loading.remove();
      try { if (hls) hls.destroy(); } catch (e) {} hls = null;
      try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {}
    }
    function fail(why) {
      if (dead) return; dead = true; teardown();
      say("");
      media.innerHTML = '<div class="err cam-fallback" role="status"><b>Stream unavailable</b><span>' + esc(why || "MoDOT's video server isn't sending this camera right now.") + '</span>' +
        '<span class="cam-fb-btns"><a class="small-btn primary" href="' + esc(opts.official || "https://traveler.modot.org/map/") + '" target="_blank" rel="noopener">' + esc(opts.officialText || "Open official page ↗") + '</a>' +
        '<button type="button" class="small-btn cam-retry">Retry</button></span></div>';
      var rb = media.querySelector(".cam-retry");
      if (rb) rb.addEventListener("click", function (e) { e.stopPropagation(); ctl.restart(); });
    }
    // watchdog: no picture within 10 s, or the clock stops moving for 10 s while playing -> fallback
    watch = setInterval(function () {
      if (dead) return;
      if (document.hidden) { lastMove = Date.now(); return; }   // background tabs don't count as stalls
      var t = v.currentTime;
      if (t !== lastT) { lastT = t; lastMove = Date.now(); if (v.readyState >= 2 && t > 0) gotPicture = true; }
      if (!gotPicture && Date.now() - t0 > STALL_MS) fail((lastWhy ? lastWhy + " " : "No video arrived in 10 seconds. ") + "The camera may be offline or MoDOT's stream server is busy.");
      else if (gotPicture && Date.now() - lastMove > STALL_MS) fail("The video froze for 10 seconds.");
    }, 1000);
    v.addEventListener("playing", function () { if (!dead) { gotPicture = true; lastMove = Date.now(); loading.hidden = true; say("Live · MoDOT"); if (opts.onLive) opts.onLive(); } });
    v.addEventListener("waiting", function () { if (!dead && gotPicture) { loading.hidden = false; loading.textContent = "Buffering camera…"; say("Buffering camera…"); } });
    function canH264() {
      var MS = window.MediaSource || window.ManagedMediaSource;
      return !MS || !MS.isTypeSupported || MS.isTypeSupported('video/mp4; codecs="avc1.42c01e"') || MS.isTypeSupported('video/mp4; codecs="avc1.640029"');
    }
    function native() {
      if (!v.canPlayType("application/vnd.apple.mpegurl")) return fail("This browser can't play live HLS video.");
      v.src = url; v.addEventListener("error", function () { fail(); }); var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    }
    var ctl = {
      video: v,
      stop: function () { dead = true; teardown(); },
      restart: function () { ctl.stop(); var n = start(media, url, opts); ctl.stop = n.stop; ctl.restart = n.restart; ctl.video = n.video; },
      state: function () { return { dead: dead, gotPicture: gotPicture, hls: !!hls, t: v.currentTime, rs: v.readyState }; }
    };
    if (!(window.MediaSource || window.ManagedMediaSource)) { native(); return ctl; }
    if (!canH264()) { fail("This browser can't decode MoDOT's H.264 video."); return ctl; }
    // MoDOT's stream servers hand out intermittent 404/503s and timeouts, so a failed load is retried with backoff
    // (1 s, 2 s, 4 s) inside the 10 s window; only then does the watchdog switch to the fallback.
    var attempt = 0, lastWhy = null, retryT = null;
    function attach(Hls) {
      if (dead) return;
      try { if (hls) hls.destroy(); } catch (e) {}
      hls = new Hls(HLS_CFG);
      var mediaRecovered = false;
      hls.on(Hls.Events.ERROR, function (e, d) {
        if (!d.fatal || dead) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return; }
        var http = d.response && d.response.code;
        lastWhy = http >= 400 ? "MoDOT's stream server answered HTTP " + http + " for this camera." : d.type === Hls.ErrorTypes.NETWORK_ERROR ? "MoDOT's stream server didn't answer." : "The video couldn't be decoded.";
        if (http === 403) return fail("MoDOT only plays this camera on its own traveler map right now.");
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && attempt < 3 && !gotPicture) {
          var wait = 1000 * Math.pow(2, attempt++); say("Reconnecting… (try " + (attempt + 1) + ")");
          try { hls.destroy(); } catch (x) {} hls = null;
          retryT = setTimeout(function () { attach(Hls); }, wait); return;
        }
        fail(lastWhy + " The camera may be offline.");
      });
      hls.on(Hls.Events.MANIFEST_PARSED, function () { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); });
      hls.loadSource(url); hls.attachMedia(v);
    }
    var baseStop = ctl.stop; ctl.stop = function () { clearTimeout(retryT); baseStop(); };
    loadHls().then(function (Hls) {
      if (dead) return;
      if (!Hls || !Hls.isSupported()) return native();
      attach(Hls);
    }).catch(function () { fail("The video player couldn't load. Check your connection."); });
    return ctl;
  }
  // Cross-origin iframe content cannot be inspected. "Viewer loaded" does not claim its image is live.
  function startFrame(media, url, opts) {
    opts = opts || {};
    var dead = false, timer = null, slow = null, say = opts.onStatus || function () {};
    var frame = document.createElement("iframe"), loading = document.createElement("div");
    frame.title = opts.title || "Official IDOT / Travel Midwest camera viewer";
    frame.referrerPolicy = "no-referrer";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    loading.className = "camera-loading"; loading.setAttribute("role", "status");
    media.innerHTML = ""; media.appendChild(frame); media.appendChild(loading);
    function load() {
      if (dead) return;
      clearTimeout(slow); loading.hidden = false; loading.textContent = "Loading camera…"; say("Loading camera…");
      slow = setTimeout(function () {
        if (dead) return;
        loading.innerHTML = '<span>The official camera viewer is taking longer than usual.</span><a href="' + esc(url) + '" target="_blank" rel="noopener">Open official viewer ↗</a><button class="small-btn" type="button">Retry</button>';
        loading.querySelector("button").addEventListener("click", function (e) { e.stopPropagation(); load(); });
        say("Still loading camera…");
      }, 20000);
      frame.src = url;
    }
    frame.addEventListener("load", function () {
      if (dead || frame.src === "about:blank") return;
      clearTimeout(slow); loading.hidden = true;
      say("Viewer loaded " + new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" }) + " CT · image may take longer · every 60 s");
    });
    frame.addEventListener("error", function () { if (!dead) { loading.hidden = false; loading.textContent = "Camera viewer unavailable. Open the official viewer below."; say("Viewer unavailable"); } });
    load(); timer = setInterval(function () { if (!document.hidden) load(); }, 60000);
    return { iframe: frame, stop: function () { dead = true; clearInterval(timer); clearTimeout(slow); frame.remove(); loading.remove(); } };
  }
  window.FTPCamPlayer = { start: start, startFrame: startFrame, STALL_MS: STALL_MS };
})();
