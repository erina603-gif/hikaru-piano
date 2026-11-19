"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const BUILD = "3.2-audio1";
  let workerVersion = "未確認（旧版Workerは応答しません）", updateState = "未確認", registration = null, updating = false, lastGesture = "未確認";
  const ui = Object.fromEntries(["home-screen","game-screen","song-list","song-title","progress-fill","progress-text","piano","note-field","judgement","score","combo","clear-dialog","clear-result","sound-dialog","audio-status","audio-detail","sound-start","test-sound","reconnect","volume","mute","pause-button","countdown","update-notice"].map((id) => [id, $(id)]));
  let song = null, round = null, running = false, elapsed = 0, origin = 0, frame = 0;
  let speed = "slow", silent = false, demonstrated = false, tested = false, audioAction = 0;
  const keyElements = new Map(), pointers = new Map();
  let noteElements = [], feedbackUntil = 0, fieldHeight = 100;
  const visible = (element, show) => { element.hidden = !show; };
  const isPortrait = () => matchMedia("(orientation: portrait)").matches;
  const audio = new PianoAudio((state) => {
    ui["audio-detail"].textContent = `音声の状態: ${state}`;
    if (state !== "running") {
      tested = false; ui["sound-start"].disabled = true;
      if (running && !silent) { pause(); showSound("音声が中断されました。おとをためして再開してね。"); }
    }
    renderDiagnostics();
  }, (error) => { ui["audio-status"].textContent = error.message; renderDiagnostics(); });

  function renderDiagnostics() {
    const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
    const ios = navigator.userAgent?.match(/OS ([\d_]+) like Mac OS X/)?.[1]?.replace(/_/g, ".") || "取得不可";
    const screenBuild = $("html-build")?.dataset.version || "旧版";
    const diagnostics = $("audio-diagnostics");
    if (diagnostics) diagnostics.textContent = [
      `画面 ${screenBuild} / 操作 ${BUILD} / 音声 ${PianoAudio.VERSION || "旧版"}`,
      `起動: ${standalone ? "ホーム画面PWA" : "ブラウザ"} / iOS: ${ios} / ${document.hidden ? "背景" : "表示中"}`,
      `AudioContext: ${audio.context?.state || "未生成"} / 接続 #${audio.contextSerial || 0} / 再生成待ち: ${audio.needsRebuild ? "あり" : "なし"}`,
      `タップ時の操作権限: ${lastGesture} / resume: ${audio.lastResume || "未実行"}`,
      `AudioSession: ${navigator.audioSession?.type || "未対応"} / ${navigator.audioSession?.state || "状態APIなし"} / ${audio.sessionNote || "未設定"}`,
      `直近テスト: ${audio.lastProbe || "未測定"}（スピーカー出力は測定不可）`,
      `音量: ${ui.volume.value}% / ミュート: ${ui.mute.checked ? "ON" : "OFF"} / 復帰: ${audio.lastLifecycle || "初回"}`,
      `最後のエラー: ${audio.lastError || "なし"}`,
      `Service Worker: ${workerVersion} / 更新: ${updateState}`
    ].join("\n");
    if (screenBuild !== BUILD || PianoAudio.VERSION !== BUILD) visible(ui["update-notice"], true);
  }
  function askWorkerVersion() { navigator.serviceWorker?.controller?.postMessage?.({ type: "PIANO_VERSION" }); }
  function checkForUpdate() {
    if (!registration || updating) return;
    updating = true; updateState = "確認中"; renderDiagnostics();
    registration.update().then(() => { updateState = "確認済み"; askWorkerVersion(); }).catch(() => {
      updateState = "取得失敗（通信状況を確認）";
      $("offline-status").textContent = navigator.serviceWorker.controller ? "Rhythm 3.2 · 保存したゲームで あそべます" : "オフライン保存は未完了です";
    }).finally(() => { updating = false; renderDiagnostics(); });
  }

  function showSound(message = "まずは おとを ためしてね") {
    tested = false; ui["sound-start"].disabled = true;
    ui["sound-start"].textContent = elapsed > 0 ? "きこえた！ つづける" : "きこえた！ スタート";
    ui["audio-status"].textContent = message; visible(ui["sound-dialog"], true);
    ui["test-sound"].focus({ preventScroll: true });
    renderDiagnostics();
  }
  function testSound(rebuild) {
    const action = ++audioAction;
    tested = false; ui["sound-start"].disabled = true;
    ui["test-sound"].disabled = true;
    ui["audio-status"].textContent = "おとを じゅんびしています…";
    ui.mute.checked = false; silent = false;
    if (Number(ui.volume.value) === 0) ui.volume.value = "65";
    $("volume-value").textContent = `${ui.volume.value}%`;
    audio.setVolume(Number(ui.volume.value) / 100);
    if (typeof audio.test !== "function") {
      ui["audio-status"].textContent = "音声ファイルが旧版です。新版を確認して更新してください。";
      ui["test-sound"].disabled = false; visible(ui["update-notice"], true); renderDiagnostics(); return;
    }
    lastGesture = navigator.userActivation ? (navigator.userActivation.isActive ? "有効" : "無効") : "API未対応";
    // 初期化・resume・聞こえるテスト音の予約までをclick内で実行。
    audio.test(rebuild).then(() => {
      if (action !== audioAction || ui["sound-dialog"].hidden) return;
      tested = true; ui["sound-start"].disabled = false;
      ui["audio-status"].textContent = "♪ おとが きこえたら スタート！";
      ui["audio-detail"].textContent = "音声の時計と信号を確認しました。聞こえたらスタートしてね。";
    }).catch((error) => {
      if (action !== audioAction) return;
      ui["audio-status"].textContent = error.message;
      ui["audio-detail"].textContent = `音声エラー: ${error.name || "Error"} / ${audio.context?.state || "未開始"}`;
    }).finally(() => { if (action === audioAction) { ui["test-sound"].disabled = false; renderDiagnostics(); } });
    renderDiagnostics();
  }
  function updateScore() {
    ui.score.textContent = round.score; ui.combo.textContent = round.combo;
    const done = round.events.filter((event) => event.result).length;
    ui["progress-text"].textContent = `${done} / ${round.events.length}`;
    ui["progress-fill"].style.width = `${done / round.events.length * 100}%`;
  }
  function feedback(result) {
    ui.judgement.textContent = result === "PERFECT" ? "PERFECT ★" : result === "GOOD" ? "GOOD ♪" : "MISS · つぎへ！";
    ui.judgement.dataset.result = result; feedbackUntil = performance.now() + 650; updateScore();
  }
  function pause() {
    if (running) elapsed = (performance.now() - origin) / 1000;
    running = false; cancelAnimationFrame(frame); audio.stopAll();
    pointers.clear(); keyElements.forEach((key) => key.classList.remove("active", "next"));
  }
  function resume() {
    if (!round || isPortrait() || document.hidden) return;
    visible(ui["sound-dialog"], false);
    origin = performance.now() - elapsed * 1000; running = true;
    frame = requestAnimationFrame(tick);
  }
  function measure() { fieldHeight = Math.max(1, ui["note-field"].clientHeight - 18); }
  function startSong(selected) {
    pause(); audioAction++; song = selected; elapsed = 0;
    round = new Rhythm.Round(song, speed); demonstrated = $("demo").checked;
    ui["song-title"].textContent = `${song.title}${song.edition ? " " + song.edition : ""}${song.excerpt ? "（ショート）" : ""} · ${Rhythm.speeds[speed].label} ${Rhythm.speeds[speed].multiplier}倍`;
    visible(ui["home-screen"], false); visible(ui["game-screen"], true); visible(ui["clear-dialog"], false);
    ui["note-field"].replaceChildren();
    noteElements = round.events.map((event) => {
      const key = Rhythm.keys.find((item) => item.note === event.note);
      const element = document.createElement("span");
      element.className = `falling-note ${key.black ? "black-note" : ""}`; element.textContent = key.black ? "♯" : "♪";
      element.style.left = `${key.center * 100}%`; element.style.width = `${key.width * (key.black ? 0.8 : 0.62) * 100}%`;
      element.hidden = true; ui["note-field"].appendChild(element); return element;
    });
    ui.judgement.textContent = ""; ui.countdown.textContent = "";
    measure(); updateScore(); showSound();
  }
  function finish() {
    running = false; keyElements.forEach((key) => key.classList.remove("next"));
    ui["clear-result"].textContent = `${round.score} てん · さいこう ${round.maxCombo} コンボ`;
    $("result-counts").textContent = `PERFECT ${round.counts.PERFECT} / GOOD ${round.counts.GOOD} / MISS ${round.counts.MISS}`;
    visible(ui["clear-dialog"], true); $("retry-button").focus({ preventScroll: true });
  }
  function tick(now) {
    if (!running) return;
    elapsed = (now - origin) / 1000;
    if (round.expire(elapsed).length) feedback("MISS");
    keyElements.forEach((key) => key.classList.remove("next"));
    round.events.forEach((event, i) => {
      if (demonstrated && !silent && !event.demoPlayed && elapsed >= event.at) {
        event.demoPlayed = true;
        if (elapsed - event.at < 0.2 && event.result !== "PERFECT" && event.result !== "GOOD") safePlay(event.note, event.duration);
      }
      const position = round.position(event, elapsed), element = noteElements[i];
      element.hidden = !!event.result || position < 0 || position > 1 + round.config.good / round.config.fall;
      element.style.top = `${position * fieldHeight}px`;
      if (!event.result && Math.abs(event.at - elapsed) <= round.config.good) keyElements.get(event.note).classList.add("next");
    });
    ui.countdown.textContent = elapsed < round.events[0].at - 0.4 ? `${Math.ceil(round.events[0].at - elapsed)}` : "";
    if (now > feedbackUntil) ui.judgement.textContent = "";
    if (round.done) { finish(); return; }
    if (running) frame = requestAnimationFrame(tick);
  }
  function safePlay(note, duration) {
    if (silent) return;
    try { audio.play(note, duration); }
    catch (error) { audio.report(error); pause(); showSound(error.message); }
  }
  function press(note, time) {
    if (!running) return;
    const result = round.hit(note, time); feedback(result.result);
    if (result.event && result.result !== "MISS") safePlay(note, result.event.duration);
  }
  for (const key of Rhythm.keys) {
    const element = document.createElement("button");
    element.type = "button"; element.className = `key ${key.black ? "black-key" : "white-key"}`;
    element.style.left = `${key.left * 100}%`; element.style.width = `${key.width * 100}%`;
    element.dataset.note = key.note; element.setAttribute("aria-label", key.note);
    const release = (event) => { pointers.delete(event.pointerId); if (![...pointers.values()].includes(element)) element.classList.remove("active"); };
    element.addEventListener("pointerdown", (event) => {
      event.preventDefault(); if (!running || pointers.has(event.pointerId)) return;
      // 音声の非同期処理より前にタップ時刻を確定。
      const time = (performance.now() - origin) / 1000;
      pointers.set(event.pointerId, element); element.classList.add("active");
      try { element.setPointerCapture(event.pointerId); } catch (_) {}
      press(key.note, time);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) element.addEventListener(name, release);
    element.addEventListener("keydown", (event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); press(key.note, (performance.now() - origin) / 1000); } });
    ui.piano.appendChild(element); keyElements.set(key.note, element);
  }
  const songButtons = [];
  for (const item of PIANO_SONGS) {
    const button = document.createElement("button"); button.className = "song-card"; button.type = "button";
    button.innerHTML = `<span class="song-icon">${item.icon}${item.edition ? `<small> ${item.edition}</small>` : ""}</span><strong>${item.title}</strong><span class="difficulty">${item.difficulty} · ${item.notes.length}おん${item.excerpt ? " · ショート" : ""}</span>`;
    button.dataset.difficulty = item.difficulty;
    button.addEventListener("click", () => startSong(item)); ui["song-list"].appendChild(button); songButtons.push(button);
  }
  function filterSongs(difficulty) {
    songButtons.forEach((button) => visible(button, button.dataset.difficulty === difficulty));
    ui["song-list"].scrollTop = 0;
    $("song-count").textContent = `${difficulty} ${songButtons.filter((button) => !button.hidden).length}きょく`;
    document.querySelectorAll(".difficulty-tabs [data-difficulty]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty)));
  }
  // 難易度の切替ボタンだけを扱う。
  document.querySelectorAll(".difficulty-tabs [data-difficulty]").forEach((button) => button.addEventListener("click", () => filterSongs(button.dataset.difficulty)));
  filterSongs("かんたん");
  function home() {
    pause(); audioAction++; round = null;
    audio.cancelUnlock?.(); audio.cancelProbe?.(); ui["test-sound"].disabled = false;
    for (const id of ["game-screen", "clear-dialog", "sound-dialog"]) visible(ui[id], false);
    visible(ui["home-screen"], true);
  }
  $("back-button").addEventListener("click", home); $("songs-button").addEventListener("click", home); $("sound-back").addEventListener("click", home);
  $("retry-button").addEventListener("click", () => startSong(song));
  ui["test-sound"].addEventListener("click", () => testSound(false)); ui.reconnect.addEventListener("click", () => testSound(true));
  ui.volume.addEventListener("input", () => {
    audio.setVolume(Number(ui.volume.value) / 100); $("volume-value").textContent = `${ui.volume.value}%`;
    if (+ui.volume.value === 0) { tested = false; ui["sound-start"].disabled = true; ui["audio-status"].textContent = "音量が0です。音量を上げてためしてね。"; }
    renderDiagnostics();
  });
  ui.mute.addEventListener("change", () => { silent = ui.mute.checked; if (silent) { audio.stopAll(); tested = false; ui["sound-start"].disabled = true; } renderDiagnostics(); });
  ui["sound-start"].addEventListener("click", () => {
    if (!tested || !audio.ready || audio.volume === 0 || ui.mute.checked) { showSound(); return; }
    silent = false; audio.stopAll(); resume();
  });
  $("silent-start").addEventListener("click", () => {
    audioAction++; audio.cancelUnlock?.(); audio.cancelProbe?.(); ui["test-sound"].disabled = false;
    silent = true; ui.mute.checked = true; audio.stopAll(); resume();
  });
  ui["pause-button"].addEventListener("click", () => { pause(); showSound("ひとやすみ。おとをためして つづけよう！"); });
  $("sound-button").addEventListener("click", () => { pause(); showSound(); });
  $("speed-select").addEventListener("change", () => { if (Rhythm.speeds[$("speed-select").value]) speed = $("speed-select").value; });
  function layoutChanged() { measure(); if (isPortrait() && running) { pause(); showSound("よこむきに もどして つづけよう！"); } }
  window.addEventListener("resize", layoutChanged);
  function background(reason) {
    pause(); audioAction++; audio.background?.(reason); tested = false;
    ui["test-sound"].disabled = false; ui["sound-start"].disabled = true;
    if (round && !ui["game-screen"].hidden && ui["clear-dialog"].hidden) showSound("おかえり！ おとをためして つづけよう！");
    renderDiagnostics();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) background("visibilitychange");
    else { renderDiagnostics(); askWorkerVersion(); checkForUpdate(); }
  });
  window.addEventListener("pagehide", () => background("pagehide"));
  window.addEventListener("pageshow", (event) => { if (event.persisted) background("pageshow: bfcache"); askWorkerVersion(); checkForUpdate(); });
  $("diagnostics-refresh")?.addEventListener("click", () => { askWorkerVersion(); renderDiagnostics(); });
  $("check-update")?.addEventListener("click", checkForUpdate);
  document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      askWorkerVersion();
      if (refreshing || !hadController) return; refreshing = true;
      // Workerが旧版も含めて再読込する。失敗時にも手動更新ボタンを残す。
      visible(ui["update-notice"], true);
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.source !== navigator.serviceWorker.controller || event.data?.type !== "PIANO_VERSION") return;
      workerVersion = String(event.data.version); renderDiagnostics();
      if (workerVersion !== BUILD) visible(ui["update-notice"], true);
    });
    $("update-button").addEventListener("click", () => location.reload());
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((value) => { registration = value; askWorkerVersion(); checkForUpdate(); }).catch((error) => {
        if (navigator.serviceWorker.controller) {
          // オフラインでは更新確認に失敗するが、保存済みゲームは利用できる。
          $("offline-status").textContent = "Rhythm 3.2 · 保存したゲームで あそべます";
        } else {
          console.warn("[piano offline]", error); $("offline-status").textContent = "オフライン保存は未完了です。オンラインで遊べます。";
        }
        updateState = "登録失敗"; renderDiagnostics();
      });
    });
  }
  renderDiagnostics();
})();
