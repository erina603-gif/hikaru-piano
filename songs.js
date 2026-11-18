"use strict";
// notes: C4〜C6、durations: 秒。初期版のオリジナル3曲をそのまま収録。
globalThis.PIANO_SONGS = [
  { id: "morning-hop", title: "おひさまジャンプ", difficulty: "かんたん", icon: "☀️", stars: 1,
    notes: ["C4","D4","E4","G4","E4","D4","C4","G4"], durations: [0.45,0.45,0.45,0.7,0.45,0.45,0.6,0.9] },
  { id: "cloud-walk", title: "くもの おさんぽ", difficulty: "ふつう", icon: "☁️", stars: 2,
    notes: ["E4","G4","A4","G4","E4","D4","F4","A4","C5","A4","G4","C5"], durations: [0.4,0.4,0.6,0.4,0.4,0.6,0.4,0.4,0.65,0.4,0.5,0.9] },
  { id: "star-parade", title: "ほしの パレード", difficulty: "ちょっとむずかしい", icon: "⭐", stars: 3,
    notes: ["C4","E4","G4","B4","C5","D5","E5","G5","F5","D5","B4","G4","A4","B4","C5","C6"],
    durations: [0.35,0.35,0.35,0.45,0.35,0.35,0.45,0.65,0.35,0.35,0.45,0.5,0.35,0.35,0.55,1.0] }
];
