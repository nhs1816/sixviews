/* 여섯 시선 로직 — 화면과 상관없는 순수 함수들 (tests/tests.html 로 확인)
   글(note) 모양:
   { id, date, topicId|null, keyword, title, mode: "short"|"long", lens, against, text,
     savedAt, followups: [{ date, text, savedAt }] }                                    */

const START_DATE = "2026-11-26"; // 이날이 고민 1번
const NOTES_KEY = "sixviews:notes";
const REVISIT_DAYS = 30;

/* ---------- 날짜 ---------- */
function dateKey(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/* "YYYY-MM-DD" 사이 날 수 (b - a). 시간대 영향 없게 UTC 로 */
function daysBetween(a, b) {
  const t = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
/* 그날의 고민 번호 (0 ~ n-1). 시작일 이전도 음수 없이 순환 */
function topicIndexFor(key, n) {
  if (!n) return 0;
  const k = daysBetween(START_DATE, key);
  return ((k % n) + n) % n;
}

/* ---------- 저장 ---------- */
function persist(storage, list) {
  try { storage && storage.setItem(NOTES_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}
function sortNotes(list) {
  return list.sort((a, b) => (b.date + (b.savedAt || "")).localeCompare(a.date + (a.savedAt || "")));
}
function validNote(n) {
  return !!(n && typeof n.text === "string" && n.text.trim() && n.id && n.date && (n.topicId || n.keyword));
}
/* 불러오기 — 저장소가 막혀 있거나 깨진 값이면 빈 목록. 옛 기록(followups 없음)도 받아 줌 */
function loadNotes(storage) {
  try {
    const raw = storage && storage.getItem(NOTES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return sortNotes(list.filter(validNote).map(n => Object.assign({ mode: "short", followups: [] }, n)));
  } catch (e) { return []; }
}

/* 글 저장. 성공하면 새 목록, 내용이 없으면 null.
   - id 가 있고 목록에 있으면 그 글을 고침 (날짜·덧쓰기는 유지)
   - 고민 글은 id = 날짜_고민 (같은 날 같은 고민이면 덮어씀)
   - 자유 주제 글은 새 id */
function saveNote(storage, notes, note) {
  const text = (note.text || "").trim();
  const keyword = (note.keyword || "").trim();
  if (!text || !note.date || (!note.topicId && !keyword)) return null;
  const now = note.savedAt || new Date().toISOString();
  const old = note.id ? notes.find(n => n.id === note.id) : null;
  const id = old ? old.id : note.topicId ? `${note.date}_${note.topicId}` : `${note.date}_free_${Date.parse(now) || Date.now()}`;
  const prev = old || notes.find(n => n.id === id);
  const clean = {
    id, date: prev ? prev.date : note.date,
    topicId: note.topicId || null, keyword: note.topicId ? "" : keyword,
    title: (note.title || "").trim(), mode: note.mode === "long" ? "long" : "short",
    lens: note.lens || null, against: note.against || null, text,
    savedAt: prev ? prev.savedAt : now, updatedAt: now,
    followups: prev ? (prev.followups || []) : [],
    postId: prev ? (prev.postId || null) : null, // 광장에 공유한 글이면 그 글 번호
  };
  const next = sortNotes(notes.filter(n => n.id !== id).concat(clean));
  persist(storage, next);
  return next;
}

/* 광장 공유 표시: postId 를 붙이거나(null 이면) 뗌 */
function markShared(storage, notes, id, postId) {
  if (!notes.some(n => n.id === id)) return null;
  const next = notes.map(n => (n.id === id ? Object.assign({}, n, { postId: postId || null }) : n));
  persist(storage, next);
  return next;
}

/* ---------- 광장 ---------- */
const AGE_BANDS = [["14-19", "14~19세"], ["20s", "20대"], ["30s", "30대"], ["40s", "40대"], ["50s", "50대"], ["60+", "60대 이상"]];
const GENDERS = [["f", "여성"], ["m", "남성"], ["n", "밝히지 않음"]];
const RESERVED_NAMES = ["관리자", "운영자", "admin", "raw", "운영팀"];

/* 필명 검사: 2~12자, 한글·영문·숫자·_·. 만. 문제가 있으면 이유, 없으면 null */
function penNameError(name) {
  const s = String(name || "").trim();
  if (s.length < 2) return "필명은 2자 이상이어야 해요.";
  if (s.length > 12) return "필명은 12자까지 쓸 수 있어요.";
  if (!/^[가-힣a-zA-Z0-9_.]+$/.test(s)) return "한글, 영문, 숫자, _ . 만 쓸 수 있어요. (띄어쓰기 안 돼요)";
  if (RESERVED_NAMES.includes(s.toLowerCase())) return "쓸 수 없는 필명이에요.";
  return null;
}
/* 필명 중복 검사용 키 (영문은 대소문자 구분 안 함) */
function penNameKey(name) { return String(name || "").trim().toLowerCase(); }

/* "방금", "5분 전", "3시간 전", "2일 전", 일주일 넘으면 "11. 3." */
function timeAgo(ms, nowMs) {
  const s = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(ms), n = new Date(nowMs);
  return `${d.getFullYear() === n.getFullYear() ? "" : d.getFullYear() + ". "}${d.getMonth() + 1}. ${d.getDate()}.`;
}

/* 위험 신호 문구가 있으면 true → 공유 전에 상담 전화 안내 */
const RISK_WORDS = ["죽고 싶", "죽고싶", "자살", "자해", "사라지고 싶", "사라지고싶", "살기 싫", "살기싫", "끝내고 싶", "끝내고싶"];
function riskText(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  return RISK_WORDS.some(w => t.includes(w));
}

/* 광장에 보일 글인지: 숨김·신고 3건 이상은 가림 (내 글과 관리자는 보임) */
const REPORT_HIDE = 3;
function visiblePost(p, myUid, admin) {
  if (admin || (myUid && p.uid === myUid)) return true;
  return !p.hidden && (p.reportCount || 0) < REPORT_HIDE;
}

/* 덧쓰기: 지난 글 아래에 지금의 생각을 이어 붙임 */
function addFollowup(storage, notes, id, text, date) {
  const t = (text || "").trim();
  const n = notes.find(x => x.id === id);
  if (!t || !n || !date) return null;
  const upd = Object.assign({}, n, { followups: (n.followups || []).concat({ date, text: t, savedAt: new Date().toISOString() }) });
  const next = notes.map(x => (x.id === id ? upd : x));
  persist(storage, next);
  return next;
}

function deleteNote(storage, notes, id) {
  const next = notes.filter(n => n.id !== id);
  persist(storage, next);
  return next;
}

function findNote(notes, date, topicId) {
  return notes.find(n => n.id === `${date}_${topicId}`) || null;
}

/* 한 달 전 글 다시 묻기: REVISIT_DAYS 이상 지났고, 그 뒤로 덧쓰기가 없던 글 중 가장 최근 것 */
function revisitCandidate(notes, today, skipped) {
  const skip = new Set(skipped || []);
  const lastTouch = n => (n.followups && n.followups.length ? n.followups[n.followups.length - 1].date : n.date);
  const due = notes.filter(n => !skip.has(n.id) && daysBetween(lastTouch(n), today) >= REVISIT_DAYS);
  due.sort((a, b) => lastTouch(b).localeCompare(lastTouch(a)));
  return due[0] || null;
}

/* ---------- 나를 돌아보기 ---------- */
/* 내가 고른 시선 횟수 { change: 2, ..., total: 5 } (와닿은 시선 기준) */
function lensStats(notes, lensIds) {
  const s = { total: 0 };
  lensIds.forEach(id => { s[id] = 0; });
  notes.forEach(n => { if (n.lens && n.lens in s) { s[n.lens]++; s.total++; } });
  return s;
}

/* 사고 지도: 축마다 두 방향 점수. 와닿은 시선 +1, 반박한 시선은 맞수 쪽에 +0.5
   ratio = 왼쪽(pair[0]) 비중 0~1, 기록 없으면 null */
function axisLean(notes, axes) {
  return axes.map(ax => {
    const [a, b] = ax.pair;
    let L = 0, R = 0;
    notes.forEach(n => {
      if (n.lens === a) L += 1; if (n.lens === b) R += 1;
      if (n.against === b) L += 0.5; if (n.against === a) R += 0.5;
    });
    const total = L + R;
    return { title: ax.title, left: a, right: b, leftScore: L, rightScore: R, total, ratio: total ? L / total : null };
  });
}

/* 글을 쓴 날 (덧쓰기 한 날 포함) */
function writtenDays(notes) {
  const s = new Set();
  notes.forEach(n => { s.add(n.date); (n.followups || []).forEach(f => s.add(f.date)); });
  return s;
}
/* 연속 기록: 오늘부터 거꾸로. 오늘 아직 안 썼으면 어제부터 셈 */
function streak(days, today) {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
/* 달력 칸: 일요일 시작, 앞은 빈칸(null) */
function monthCells(y, m) { // m: 1~12
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(first).fill(null);
  for (let d = 1; d <= len; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return cells;
}

/* 글자 수 (띄어쓰기·줄바꿈 뺌) */
function charCount(text) { return String(text || "").replace(/\s/g, "").length; }

/* ---------- 서랍 ---------- */
/* filter: all | topic | free | long */
function searchNotes(notes, q, topicsById, filter) {
  const query = (q || "").trim().toLowerCase();
  return notes.filter(n => {
    if (filter === "topic" && !n.topicId) return false;
    if (filter === "free" && n.topicId) return false;
    if (filter === "long" && n.mode !== "long") return false;
    if (!query) return true;
    const tp = n.topicId && topicsById[n.topicId];
    const hay = [n.text, n.title, n.keyword, tp && tp.keyword, tp && tp.title]
      .concat((n.followups || []).map(f => f.text)).join("\n").toLowerCase();
    return hay.includes(query);
  });
}

function noteKeyword(n, topicsById) {
  const tp = n.topicId && topicsById[n.topicId];
  return tp ? tp.keyword : n.keyword;
}

/* 내보내기용 글 */
function exportText(notes, topicsById, lensesById) {
  return notes.slice().reverse().map(n => {
    const tp = n.topicId && topicsById[n.topicId];
    const head = [`[${n.date}] ${noteKeyword(n, topicsById)}`];
    if (tp) head.push(`고민: ${tp.title}`);
    if (n.title) head.push(`제목: ${n.title}`);
    const lens = [];
    if (n.lens && lensesById[n.lens]) lens.push(`와닿은 시선: ${lensesById[n.lens].name}`);
    if (n.against && lensesById[n.against]) lens.push(`반박한 시선: ${lensesById[n.against].name}`);
    if (lens.length) head.push(lens.join(" / "));
    const fu = (n.followups || []).map(f => `\n— ${f.date} 덧쓰기\n${f.text}`).join("\n");
    return head.join("\n") + "\n\n" + n.text + (fu ? "\n" + fu : "");
  }).join("\n\n────────\n\n");
}

/* 백업 파일 읽기 → 올바른 글 목록 또는 null */
function parseBackup(raw) {
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : data && Array.isArray(data.notes) ? data.notes : null;
    if (!list) return null;
    return list.filter(validNote).map(n => Object.assign({ mode: "short", followups: [] }, n));
  } catch (e) { return null; }
}
/* 백업 합치기: 같은 id 는 더 늦게 고친 쪽을 남김 */
function mergeNotes(existing, incoming) {
  const map = new Map(existing.map(n => [n.id, n]));
  incoming.forEach(n => {
    const cur = map.get(n.id);
    const stamp = x => x.updatedAt || x.savedAt || "";
    if (!cur || stamp(n) > stamp(cur)) map.set(n.id, n);
  });
  return sortNotes(Array.from(map.values()));
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

const SixLogic = {
  START_DATE, NOTES_KEY, REVISIT_DAYS, dateKey, daysBetween, addDays, topicIndexFor,
  loadNotes, saveNote, markShared, addFollowup, deleteNote, findNote, revisitCandidate,
  AGE_BANDS, GENDERS, penNameError, penNameKey, timeAgo, riskText, visiblePost, REPORT_HIDE,
  lensStats, axisLean, writtenDays, streak, monthCells, charCount,
  searchNotes, noteKeyword, exportText, parseBackup, mergeNotes, wrapLines,
};
if (typeof module !== "undefined") module.exports = SixLogic;
