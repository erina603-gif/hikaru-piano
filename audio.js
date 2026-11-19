"use strict";
(() => {
  class PianoAudio {
    constructor(onState = () => {}, onError = () => {}) {
      this.context = null; this.master = null; this.volume = 0.65;
      this.onState = onState; this.onError = onError;
      this.voices = new Set(); this.samples = new Map(); this.pending = null;
      this.analyser = null; this.needsRebuild = false; this.contextSerial = 0;
      this.lastError = "なし"; this.lastResume = "未実行"; this.lastProbe = "未測定";
      this.lastLifecycle = "初回"; this.sessionNote = "未設定";
      this.cancelUnlock = null; this.cancelProbe = null; this.sessionTimer = null;
    }
    get ready() { return this.context?.state === "running"; }
    report(error) { this.lastError = `${error.name || "Error"}: ${error.message}`; console.warn("[piano audio]", error); this.onError(error); }
    error(code, message) { const error = new Error(`${code}: ${message}`); error.name = code; return error; }
    // 背景移動中には再生しない。次のユーザー操作で接続を作り直す。
    background(reason = "background") {
      this.lastLifecycle = reason; this.needsRebuild = !!this.context;
      clearTimeout(this.sessionTimer);
      this.cancelUnlock?.(); this.cancelProbe?.(); this.stopAll();
    }
    resetContext() {
      this.cancelUnlock?.(); this.cancelProbe?.(); this.stopAll();
      if (this.context) { this.context.onstatechange = null; this.context.close().catch(() => {}); }
      this.context = null; this.master = null; this.analyser = null; this.pending = null;
    }
    configureSession(recover) {
      clearTimeout(this.sessionTimer);
      try {
        if (!navigator.audioSession) { this.sessionNote = "API未対応"; return; }
        if (!recover) { navigator.audioSession.type = "playback"; this.sessionNote = "playback"; return; }
        // WebKit #323104 c5の回復候補。再接続時だけ別タスクでカテゴリを戻す。
        navigator.audioSession.type = "ambient"; this.sessionNote = "カテゴリ切替中";
        this.sessionTimer = setTimeout(() => {
          try { navigator.audioSession.type = "playback"; this.sessionNote = "ambient → playback"; }
          catch (error) { this.sessionNote = `切替不可: ${error.name}`; }
          this.onState(this.context?.state || "未生成");
        }, 0);
      } catch (error) { this.sessionNote = `設定不可: ${error.name}`; }
    }
    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, Number(value) || 0));
      if (this.master) this.master.gain.setValueAtTime(this.volume * 0.55, this.context.currentTime);
    }
    // clickから直接呼ぶ。初期化・resume・無音バッファのstartはawaitより前。
    unlock(rebuild = false, testNote = null) {
      try {
        const recover = rebuild || this.needsRebuild;
        if (recover) this.resetContext();
        this.configureSession(recover);
        if (!this.context || this.context.state === "closed") {
          const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Context) throw new Error("このブラウザでは音声を使えません。Safariで開いてください。");
          try { this.context = new Context({ latencyHint: "interactive" }); } catch (_) { this.context = new Context(); }
          const context = this.context;
          this.contextSerial++;
          this.master = context.createGain();
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -10; limiter.knee.value = 12; limiter.ratio.value = 8;
          this.master.connect(limiter);
          this.analyser = context.createAnalyser ? context.createAnalyser() : null;
          if (this.analyser) { this.analyser.fftSize = 2048; limiter.connect(this.analyser).connect(context.destination); }
          else limiter.connect(context.destination);
          this.setVolume(this.volume);
          context.onstatechange = () => {
            if (context !== this.context) return;
            if (context.state === "interrupted" || context.state === "suspended") this.needsRebuild = true;
            this.onState(context.state);
          };
        }
        if (this.pending) return this.pending;
        const context = this.context;
        this.lastResume = "要求中"; this.lastProbe = "未測定"; this.lastError = "なし";
        const resume = context.resume(); // suspended と interrupted の両方を復帰
        const source = context.createBufferSource(); source.buffer = context.createBuffer(1, 1, context.sampleRate);
        source.connect(context.destination); source.onended = () => source.disconnect(); source.start(0);
        // 聞こえるテスト音も同じclickの呼出し内で予約。Promiseの後へ持ち越さない。
        if (testNote) { this.stopAll(); this.startVoice(testNote, 0.6, true); }
        let timer;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(this.error("RESUME_TIMEOUT", "音声の開始が応答しません。再接続を押してください。")), 2500); });
        const cancelled = new Promise((_, reject) => { this.cancelUnlock = () => reject(this.error("AbortError", "音声チェックを中止しました")); });
        const pending = Promise.race([Promise.resolve(resume), timeout, cancelled]).then(() => {
          if (context !== this.context || context.state !== "running") throw new Error(`音声が停止しています (${context.state})。再接続してください。`);
          this.lastResume = "完了"; this.needsRebuild = false;
          this.onState("running");
        }).catch((error) => {
          if (context === this.context && error.name !== "AbortError") { this.lastResume = "失敗"; this.needsRebuild = true; this.stopAll(); this.report(error); }
          throw error;
        }).finally(() => {
          clearTimeout(timer); if (this.pending === pending) { this.pending = null; this.cancelUnlock = null; }
        });
        this.pending = pending; return pending;
      } catch (error) { this.report(error); return Promise.reject(error); }
    }
    test(rebuild = false) {
      const ready = this.unlock(rebuild, "C5"), context = this.context;
      return ready.then(() => {
        if (context !== this.context || this.needsRebuild) throw this.error("AbortError", "音声チェックを中止しました");
        return new Promise((resolve, reject) => {
        const start = context.currentTime;
        const timer = setTimeout(() => {
          this.cancelProbe = null;
          try {
            if (context !== this.context || context.state !== "running") throw this.error("CONTEXT_STOPPED", "音声が中断されました。もう一度ためしてください。");
            const delta = context.currentTime - start;
            if (delta < 0.01) throw this.error("CLOCK_STOPPED", "音声の時計が止まっています。再接続を押してください。");
            let peak = null;
            if (this.analyser) {
              const samples = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(samples);
              peak = samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
            }
            this.lastProbe = `時計 +${delta.toFixed(3)}秒 / 信号 ${peak === null ? "未測定" : peak.toFixed(5)}`;
            if (peak !== null && peak < 0.000001) throw this.error("NO_SIGNAL", "音声信号を確認できません。再接続を押してください。");
            resolve(); // 端末から実際に聞こえたかは、この測定では分からない。
          } catch (error) { this.needsRebuild = true; this.lastProbe = `${this.lastProbe} / ${error.name}`; this.report(error); reject(error); }
        }, 180);
        this.cancelProbe = () => { clearTimeout(timer); this.cancelProbe = null; reject(this.error("AbortError", "音声チェックを中止しました")); };
        });
      });
    }
    play(note, duration = 0.55) {
      return this.startVoice(note, duration, false);
    }
    startVoice(note, duration, allowSuspended) {
      if (!this.context || (!allowSuspended && !this.ready)) throw new Error("音声が止まっています。おとチェックから再接続してください。");
      if (this.volume === 0) return false;
      const key = Rhythm.keys.find((item) => item.note === note);
      if (!key) throw new Error(`音名が不正です: ${note}`);
      if (this.voices.size >= 16) this.voices.values().next().value.stop();
      const ctx = this.context, start = ctx.currentTime, end = start + Math.max(0.3, duration) + 0.8;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, start); envelope.gain.exponentialRampToValueAtTime(0.55, start + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.16, start + 0.18); envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      envelope.connect(this.master);
      const sources = [], parts = [];
      const voice = { stop: () => { for (const source of sources) { try { source.stop(); } catch (_) {} } envelope.disconnect(); this.voices.delete(voice); } };
      const sample = this.samples.get(note);
      if (sample) { const source = ctx.createBufferSource(); source.buffer = sample; source.connect(envelope); sources.push(source); }
      else for (const [type, ratio, level] of [["triangle",1,0.65],["sine",2,0.18],["sine",3,0.06]]) {
        const osc = ctx.createOscillator(), partial = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(key.frequency * ratio, start);
        partial.gain.value = level; osc.connect(partial).connect(envelope); sources.push(osc); parts.push(partial);
      }
      let remaining = sources.length;
      for (const source of sources) {
        source.onended = () => { source.disconnect(); if (--remaining === 0) { parts.forEach((part) => part.disconnect()); envelope.disconnect(); this.voices.delete(voice); } };
        source.start(start); source.stop(end + 0.01);
      }
      this.voices.add(voice); return true;
    }
    stopAll() { for (const voice of [...this.voices]) voice.stop(); }
    async registerSample(note, url) {
      if (!this.context) throw new Error("先におとチェックを実行してください。");
      const response = await fetch(url); if (!response.ok) throw new Error(`音源を読み込めません (${response.status})`);
      this.samples.set(note, await this.context.decodeAudioData(await response.arrayBuffer()));
    }
  }
  PianoAudio.VERSION = "3.2-audio1";
  globalThis.PianoAudio = PianoAudio;
})();
