"use strict";
(() => {
  const names = ["C4","C#4","D4","D#4","E4","F4","F#4","G4","G#4","A4","A#4","B4","C5","C#5","D5","D#5","E5","F5","F#5","G5","G#5","A5","A#5","B5","C6"];
  let whites = 0;
  const keys = names.map((note, index) => {
    const black = note.includes("#"), center = (black ? whites : whites + 0.5) / 15, width = (black ? 0.62 : 1) / 15;
    if (!black) whites++;
    return { note, black, center, width, left: center - width / 2, frequency: 440 * 2 ** ((index + 60 - 69) / 12) };
  });
  const speeds = {
    verySlow: { label: "とてもゆっくり", multiplier: 0.5 },
    slow: { label: "ゆっくり", multiplier: 0.75 },
    normal: { label: "ふつう", multiplier: 1 },
    fast: { label: "はやい", multiplier: 1.25 },
    veryFast: { label: "超はやい", multiplier: 1.5 }
  };
  // DOM・音声から独立した譜面と判定。時刻は秒。
  class Round {
    constructor(song, speed = "slow") {
      const selected = speeds[speed] || speeds.slow, rate = selected.multiplier;
      this.config = { ...selected, fall: 2.4 / rate, perfect: 0.14 / rate, good: 0.30 / rate };
      if (!Number.isFinite(song.tempo) || song.tempo <= 0 || !Array.isArray(song.notes) || !song.notes.length ||
          !Array.isArray(song.durations) || song.notes.length !== song.durations.length ||
          (song.timing && song.timing !== "legacy") ||
          (song.rests !== undefined && (!Array.isArray(song.rests) || song.rests.length !== song.notes.length || song.timing === "legacy"))) throw new Error("Invalid song data");
      // 全時刻は実時間の秒。曲のテンポと倍率をここで一度だけ適用する。
      const secondsPerBeat = 60 / song.tempo / rate, legacyScale = 100 / song.tempo / rate;
      let at = 3.4 / rate;
      this.events = song.notes.map((note, i) => {
        const length = song.durations[i], rest = song.rests ? song.rests[i] : 0;
        if (!names.includes(note) || !Number.isFinite(length) || length <= 0 || !Number.isFinite(rest) || rest < 0) throw new Error("Invalid song data");
        // 既存3曲は旧版の音の長さ・通常速度の間隔をそのまま保持。新曲は拍数。
        const duration = song.timing === "legacy" ? length * legacyScale : length * secondsPerBeat;
        const event = { note, at, duration, result: null, demoPlayed: false };
        at += song.timing === "legacy" ? Math.max(0.65, length * 1.8) * legacyScale : duration + rest * secondsPerBeat;
        return event;
      });
      this.score = 0; this.combo = 0; this.maxCombo = 0;
      this.counts = { PERFECT: 0, GOOD: 0, MISS: 0 };
    }
    resolve(event, result) {
      if (event.result) return null;
      event.result = result; this.counts[result]++;
      if (result === "MISS") this.combo = 0;
      else { this.score += result === "PERFECT" ? 100 : 60; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); }
      return { event, result };
    }
    expire(time) {
      return this.events.filter((event) => !event.result && time - event.at > this.config.good + 1e-8).map((event) => this.resolve(event, "MISS"));
    }
    hit(note, time) {
      this.expire(time);
      const target = this.events.filter((event) => !event.result && event.note === note && Math.abs(event.at - time) <= this.config.good + 1e-8)
        .sort((a, b) => Math.abs(a.at - time) - Math.abs(b.at - time))[0];
      if (!target) { this.combo = 0; return { event: null, result: "MISS" }; }
      return this.resolve(target, Math.abs(target.at - time) <= this.config.perfect + 1e-8 ? "PERFECT" : "GOOD");
    }
    get done() { return this.events.every((event) => event.result); }
    position(event, time) { return 1 - (event.at - time) / this.config.fall; }
  }
  globalThis.Rhythm = { keys, speeds, Round };
})();
