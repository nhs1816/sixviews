/* 여섯 시선 로직 — 화면과 상관없는 순수 함수들 (tests/tests.html, node 로 확인) */

const START_DATE = "2026-11-26"; // 이날이 고민 1번
const NOTES_KEY = "sixviews:notes";

/* 로컬 날짜 → "YYYY-MM-DD" */
function dateKey(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* "YYYY-MM-DD" 두 개 사이의 날 수 (b - a). 시간대·서머타임 영향 없게 UTC 로 계산 */
function daysBetween(a, b) {
  const t = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

/* 그날의 고민 번호 (0 ~ n-1). 시작일 이전 날짜도 음수 없이 순환 */
function topicIndexFor(key, n) {
  if (!n) return 0;
  const k = daysBetween(START_DATE, key);
  return ((k % n) + n) % n;
}

/* 기록 불러오기 — 저장소가 막혀 있거나 깨진 값이면 빈 목록 */
function loadNotes(storage) {
  try {
    const raw = storage && storage.getItem(NOTES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(n => n && typeof n.text === "string" && n.topicId) : [];
  } catch (e) { return []; }
}

/* 기록 하나 저장 (같은 날 같은 고민이면 덮어씀). 성공하면 새 목록, 실패하면 null */
function saveNote(storage, notes, note) {
  const text = (note.text || "").trim();
  if (!text || !note.topicId || !note.date) return null;
  const clean = { id: `${note.date}_${note.topicId}`, date: note.date, topicId: note.topicId,
                  lens: note.lens || null, text, savedAt: note.savedAt || new Date().toISOString() };
  const next = notes.filter(n => n.id !== clean.id).concat(clean)
                    .sort((a, b) => (b.date + b.savedAt).localeCompare(a.date + a.savedAt));
  try { storage && storage.setItem(NOTES_KEY, JSON.stringify(next)); } catch (e) { /* 저장 못 해도 화면엔 남김 */ }
  return next;
}

function deleteNote(storage, notes, id) {
  const next = notes.filter(n => n.id !== id);
  try { storage && storage.setItem(NOTES_KEY, JSON.stringify(next)); } catch (e) {}
  return next;
}

function findNote(notes, date, topicId) {
  return notes.find(n => n.id === `${date}_${topicId}`) || null;
}

/* 내가 고른 시선 횟수 { change: 2, ... , total: 5 } */
function lensStats(notes, lensIds) {
  const s = { total: 0 };
  lensIds.forEach(id => { s[id] = 0; });
  notes.forEach(n => { if (n.lens && n.lens in s) { s[n.lens]++; s.total++; } });
  return s;
}

/* 카드 이미지용 줄바꿈: measure(text) 가 maxWidth 를 넘지 않게 글자 단위로 자름 */
function wrapLines(text, maxWidth, measure, maxLines) {
  const out = [];
  String(text).split("\n").forEach(par => {
    let line = "";
    for (const ch of par) {
      if (measure(line + ch) > maxWidth && line) { out.push(line); line = ch.trim() ? ch : ""; }
      else line += ch;
    }
    out.push(line);
  });
  if (maxLines && out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.?$/, "…");
    return cut;
  }
  return out;
}

if (typeof module !== "undefined") module.exports = {
  START_DATE, NOTES_KEY, dateKey, daysBetween, topicIndexFor,
  loadNotes, saveNote, deleteNote, findNote, lensStats, wrapLines,
};
