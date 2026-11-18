"use strict";

// 曲はここに追加できます。notes は鍵盤名、durations は各音の長さ（秒）です。
const SONGS = [
  {
    id: "morning-hop",
    title: "おひさまジャンプ",
    difficulty: "かんたん",
    icon: "☀️",
    stars: 1,
    notes: ["C4", "D4", "E4", "G4", "E4", "D4", "C4", "G4"],
    durations: [0.45, 0.45, 0.45, 0.7, 0.45, 0.45, 0.6, 0.9]
  },
  {
    id: "cloud-walk",
    title: "くもの おさんぽ",
    difficulty: "ふつう",
    icon: "☁️",
    stars: 2,
    notes: ["E4", "G4", "A4", "G4", "E4", "D4", "F4", "A4", "C5", "A4", "G4", "C5"],
    durations: [0.4, 0.4, 0.6, 0.4, 0.4, 0.6, 0.4, 0.4, 0.65, 0.4, 0.5, 0.9]
  },
  {
    id: "star-parade",
    title: "ほしの パレード",
    difficulty: "ちょっとむずかしい",
    icon: "⭐",
    stars: 3,
    notes: ["C4", "E4", "G4", "B4", "C5", "D5", "E5", "G5", "F5", "D5", "B4", "G4", "A4", "B4", "C5", "C6"],
    durations: [0.35, 0.35, 0.35, 0.45, 0.35, 0.35, 0.45, 0.65, 0.35, 0.35, 0.45, 0.5, 0.35, 0.35, 0.55, 1.0]
  }
];

const NOTE_NAMES = ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4", "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5", "C6"];
const SOLFEGE = { C: "ド", D: "レ", E: "ミ", F: "ファ", G: "ソ", A: "ラ", B: "シ" };

const ui = {
  home: document.querySelector("#home-screen"),
  game: document.querySelector("#game-screen"),
  songList: document.querySelector("#song-list"),
  songTitle: document.querySelector("#song-title"),
  progressFill: document.querySelector("#progress-fill"),
  progressText: document.querySelector("#progress-text"),
  piano: document.querySelector("#piano"),
  sparkles: document.querySelector("#sparkles"),
  clearDialog: document.querySelector("#clear-dialog"),
  back: document.querySelector("#back-button"),
  sound: document.querySelector("#sound-button"),
  retry: document.querySelector("#retry-button"),
  songs: document.querySelector("#songs-button")
};

let currentSong = null;
let noteIndex = 0;
let muted = false;
let completionTimer = 0;
const keyElements = new Map();
const activePointers = new Map();

class PianoAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.sampleBuffers = new Map();
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  frequency(note) {
    const noteNumber = NOTE_NAMES.indexOf(note) + 60;
    return 440 * Math.pow(2, (noteNumber - 69) / 12);
  }

  play(note, duration = 0.55) {
    if (muted || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const sample = this.sampleBuffers.get(note);

    // 将来ピアノ音源を登録した場合は、合成音ではなくサンプルを再生します。
    if (sample) {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = sample;
      gain.gain.setValueAtTime(0.72, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(duration, 0.35) + 1.2);
      source.connect(gain).connect(this.master);
      source.start(now);
      source.stop(now + Math.max(duration, 0.35) + 1.25);
      return;
    }

    const frequency = this.frequency(note);
    const voiceGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(5200, frequency * 9), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(900, frequency * 2.4), now + 1.2);
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(0.48, now + 0.009);
    voiceGain.gain.exponentialRampToValueAtTime(0.14, now + 0.18);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(duration, 0.45) + 1.15);
    filter.connect(voiceGain).connect(this.master);

    [["triangle", 1, 0.55], ["sine", 2, 0.18], ["sine", 3, 0.06]].forEach(([type, ratio, level]) => {
      const oscillator = this.context.createOscillator();
      const partial = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * ratio, now);
      oscillator.detune.setValueAtTime(ratio === 1 ? -2 : 2, now);
      partial.gain.value = level;
      oscillator.connect(partial).connect(filter);
      oscillator.start(now);
      oscillator.stop(now + Math.max(duration, 0.45) + 1.2);
    });
  }

  async registerSample(note, url) {
    await this.unlock();
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    this.sampleBuffers.set(note, await this.context.decodeAudioData(data));
  }
}

const audio = new PianoAudio();

function renderSongs() {
  const fragment = document.createDocumentFragment();
  SONGS.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "song-card";
    button.dataset.songId = song.id;
    button.innerHTML = `
      <span class="song-icon" aria-hidden="true">${song.icon}</span>
      <strong>${song.title}</strong>
      <span class="difficulty">${song.difficulty}</span>
      <span class="difficulty-stars" aria-label="むずかしさ ${song.stars}">${"★".repeat(song.stars)}${"☆".repeat(3 - song.stars)}</span>`;
    button.addEventListener("click", () => startSong(song));
    fragment.appendChild(button);
  });
  ui.songList.appendChild(fragment);
}

function renderPiano() {
  let whiteIndex = 0;
  NOTE_NAMES.forEach((note) => {
    const isBlack = note.includes("#");
    const key = document.createElement("button");
    key.type = "button";
    key.className = `key ${isBlack ? "black-key" : "white-key"}`;
    key.dataset.note = note;
    key.setAttribute("aria-label", `${SOLFEGE[note[0]]}${isBlack ? " シャープ" : ""} ${note.slice(-1)}`);
    if (isBlack) {
      key.style.setProperty("--after-white", whiteIndex);
    } else {
      key.style.setProperty("--white-index", whiteIndex);
      whiteIndex += 1;
    }
    key.addEventListener("pointerdown", onKeyDown);
    key.addEventListener("pointerup", onKeyUp);
    key.addEventListener("pointercancel", onKeyUp);
    key.addEventListener("lostpointercapture", onKeyUp);
    ui.piano.appendChild(key);
    keyElements.set(note, key);
  });
}

async function onKeyDown(event) {
  event.preventDefault();
  const key = event.currentTarget;
  const note = key.dataset.note;
  if (activePointers.has(event.pointerId)) return;
  key.setPointerCapture?.(event.pointerId);
  activePointers.set(event.pointerId, key);
  key.classList.add("active");

  try { await audio.unlock(); } catch (_) { /* 音声不可でもゲームは続ける */ }
  const expected = currentSong?.notes[noteIndex];
  const duration = note === expected ? currentSong.durations[noteIndex] : 0.45;
  audio.play(note, duration);

  if (!currentSong || !ui.clearDialog.classList.contains("is-hidden")) return;
  if (note === expected) {
    showSparkle(key);
    noteIndex += 1;
    updateProgress();
    if (noteIndex >= currentSong.notes.length) {
      clearNextKey();
      completionTimer = window.setTimeout(showClear, 450);
    } else {
      highlightNextKey();
    }
  } else {
    key.classList.remove("wrong");
    void key.offsetWidth;
    key.classList.add("wrong");
  }
}

function onKeyUp(event) {
  const key = activePointers.get(event.pointerId) || event.currentTarget;
  key.classList.remove("active");
  activePointers.delete(event.pointerId);
}

function startSong(song) {
  window.clearTimeout(completionTimer);
  currentSong = song;
  noteIndex = 0;
  ui.songTitle.textContent = song.title;
  ui.home.classList.add("is-hidden");
  ui.game.classList.remove("is-hidden");
  ui.clearDialog.classList.add("is-hidden");
  updateProgress();
  highlightNextKey();
  audio.unlock().catch(() => {});
}

function updateProgress() {
  const total = currentSong.notes.length;
  ui.progressText.textContent = `${noteIndex} / ${total}`;
  ui.progressFill.style.width = `${(noteIndex / total) * 100}%`;
}

function clearNextKey() {
  keyElements.forEach((key) => key.classList.remove("next"));
}

function highlightNextKey() {
  clearNextKey();
  keyElements.get(currentSong.notes[noteIndex])?.classList.add("next");
}

function showSparkle(key) {
  const pianoRect = ui.piano.getBoundingClientRect();
  const keyRect = key.getBoundingClientRect();
  for (let index = 0; index < 3; index += 1) {
    const star = document.createElement("span");
    star.className = "sparkle";
    star.textContent = index === 1 ? "✦" : "★";
    star.style.left = `${keyRect.left - pianoRect.left + keyRect.width * (0.25 + index * 0.25)}px`;
    star.style.top = `${keyRect.top - pianoRect.top + keyRect.height * 0.42 + index * 8}px`;
    star.style.animationDelay = `${index * 55}ms`;
    ui.sparkles.appendChild(star);
    star.addEventListener("animationend", () => star.remove(), { once: true });
    window.setTimeout(() => star.remove(), 1000);
  }
}

function showClear() {
  ui.clearDialog.classList.remove("is-hidden");
  ui.retry.focus({ preventScroll: true });
}

function goHome() {
  window.clearTimeout(completionTimer);
  currentSong = null;
  noteIndex = 0;
  clearNextKey();
  ui.clearDialog.classList.add("is-hidden");
  ui.game.classList.add("is-hidden");
  ui.home.classList.remove("is-hidden");
}

ui.back.addEventListener("click", goHome);
ui.songs.addEventListener("click", goHome);
ui.retry.addEventListener("click", () => startSong(currentSong));
ui.sound.addEventListener("click", () => {
  muted = !muted;
  ui.sound.textContent = muted ? "🔇" : "🔊";
  ui.sound.setAttribute("aria-label", muted ? "おとをオンにする" : "おとをオフにする");
});

document.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
document.addEventListener("contextmenu", (event) => event.preventDefault());

renderSongs();
renderPiano();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
