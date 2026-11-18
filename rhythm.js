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
    slow: { label: "ゆっくり", scale: 2.6, minimum: 0.90, fall: 3.2, perfect: 0.18, good: 0.38 },
    normal: { label: "ふつう", scale: 1.8, minimum: 0.65, fall: 2.4, perfect: 0.14, good: 0.30 }
  };
  // DOM・音声から独立した譜面と判定。時刻は秒。
  class Round {
    constructor(song, speed = "slow") {
      this.config = speeds[speed] || speeds.slow;
      let at = this.config.fall + 1;
      this.events = song.notes.map((note, i) => {
        if (!names.includes(note) || !(song.durations[i] > 0)) throw new Error("Invalid song data");
        const event = { note, at, duration: song.durations[i], result: null, demoPlayed: false };
        at += Math.max(this.config.minimum, song.durations[i] * this.config.scale);
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
