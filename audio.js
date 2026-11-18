"use strict";
(() => {
  class PianoAudio {
    constructor(onState = () => {}, onError = () => {}) {
      this.context = null; this.master = null; this.volume = 0.65;
      this.onState = onState; this.onError = onError;
      this.voices = new Set(); this.samples = new Map(); this.pending = null;
    }
    get ready() { return this.context?.state === "running"; }
    report(error) { console.warn("[piano audio]", error); this.onError(error); }
    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, Number(value) || 0));
      if (this.master) this.master.gain.setValueAtTime(this.volume * 0.55, this.context.currentTime);
    }
    // clickから直接呼ぶ。初期化・resume・無音バッファのstartはawaitより前。
    unlock(rebuild = false) {
      try {
        if (rebuild) {
          this.stopAll();
          if (this.context) { this.context.onstatechange = null; this.context.close().catch(() => {}); }
          this.context = null; this.pending = null;
        }
        try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (_) { /* 未対応なら通常のWeb Audio */ }
        if (!this.context || this.context.state === "closed") {
          const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Context) throw new Error("このブラウザでは音声を使えません。Safariで開いてください。");
          try { this.context = new Context({ latencyHint: "interactive" }); } catch (_) { this.context = new Context(); }
          const context = this.context;
          this.master = context.createGain();
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -10; limiter.knee.value = 12; limiter.ratio.value = 8;
          this.master.connect(limiter).connect(context.destination); this.setVolume(this.volume);
          context.onstatechange = () => { if (context === this.context) this.onState(context.state); };
        }
        if (this.ready) return Promise.resolve();
        if (this.pending) return this.pending;
        const context = this.context;
        const resume = context.resume(); // suspended と interrupted の両方を復帰
        const source = context.createBufferSource(); source.buffer = context.createBuffer(1, 1, context.sampleRate);
        source.connect(context.destination); source.onended = () => source.disconnect(); source.start(0);
        let timer;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("音声の開始を確認できません。『再接続』を押してください。")), 2000); });
        const pending = Promise.race([Promise.resolve(resume), timeout]).then(() => {
          if (context !== this.context || context.state !== "running") throw new Error(`音声が停止しています (${context.state})。再接続してください。`);
          this.onState("running");
        }).catch((error) => { if (context === this.context) this.report(error); throw error; }).finally(() => {
          clearTimeout(timer); if (this.pending === pending) this.pending = null;
        });
        this.pending = pending; return pending;
      } catch (error) { this.report(error); return Promise.reject(error); }
    }
    play(note, duration = 0.55) {
      if (!this.ready) throw new Error("音声が止まっています。おとチェックから再接続してください。");
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
  globalThis.PianoAudio = PianoAudio;
})();
