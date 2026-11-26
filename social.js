/* RAW 광장 — 필명 가입, 공유하기, 피드(무한 스크롤), 좋아요·댓글·저장·신고, 프로필
   서버: supabase-config.js 에 설정이 있으면 Supabase, 주소에 ?mock=1 이면 시험용 */
import { supabaseBackend, mockBackend } from "./backend.js?v=202611261737";

const L = SixLogic, APP = window.RawApp; // logic.js·ui.js 가 먼저 읽힘
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const colorVar = (node, id) => { node.style.setProperty("--c", `var(--c-${id})`); return node; };
const lensById = Object.fromEntries(LENSES.map(l => [l.id, l]));
const topicsById = Object.fromEntries(TOPICS.map(t => [t.id, t]));
const ageLabel = Object.fromEntries(L.AGE_BANDS), genderLabel = Object.fromEntries(L.GENDERS);
const LATER_KEY = "raw:loginLater";
const toast = msg => APP.toast(msg);

const ICON = {
  heart: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill="var(--fill,none)" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  comment: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 5.5h16v10.5H9.5L5 19.5V16H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  save: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" fill="var(--fill,none)" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
};

const S = { B: null, status: "loading", mode: "all", items: [], cursor: null, done: false, loading: false,
  liked: new Set(), saved: new Set(), afterLogin: null, commentsFor: null, menuFor: null, shareNote: null };

/* ================= 시작 ================= */
async function start() {
  const mock = /[?&]mock=1/.test(location.search);
  const cfg = window.RAW_SUPABASE;
  try {
    if (mock) S.B = await mockBackend(seedMock);
    else if (cfg && cfg.url && cfg.anonKey) S.B = await supabaseBackend(cfg);
    else { S.status = "off"; render(); return; }
    S.status = "ready";
    S.saved = await S.B.saved().catch(() => new Set());
  } catch (e) {
    console.warn("광장 연결 실패", e);
    S.status = "error";
  }
  render();
  renderProfile();
  let later = false; try { later = localStorage.getItem(LATER_KEY) === "1"; } catch (e) {}
  if (S.status === "ready" && !S.B.profile() && !later) openLogin();
}

/* ================= 가입(필명 정하기) ================= */
function fillLoginSelects() {
  const age = $("lgAge"), gen = $("lgGender");
  age.textContent = ""; gen.textContent = "";
  age.appendChild(Object.assign(el("option", null, "연령대를 골라 주세요"), { value: "" }));
  L.AGE_BANDS.forEach(([v, t]) => age.appendChild(Object.assign(el("option", null, t), { value: v })));
  L.GENDERS.forEach(([v, t]) => {
    const lab = el("label", "radio");
    const r = Object.assign(el("input"), { type: "radio", name: "lgGender", value: v });
    lab.append(r, document.createTextNode(t)); gen.appendChild(lab);
  });
}
function openLogin(after) {
  if (S.status !== "ready") return toast(S.status === "off" ? "광장은 준비 중이에요." : "광장에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  S.afterLogin = after || null;
  fillLoginSelects();
  $("lgName").value = ""; $("lgOld").checked = false; $("lgAgree").checked = false; $("lgErr").textContent = "";
  $("dlgLogin").showModal();
}
$("lgLater").onclick = () => { try { localStorage.setItem(LATER_KEY, "1"); } catch (e) {} $("dlgLogin").close(); S.afterLogin = null; };
$("lgSubmit").onclick = async () => {
  const name = $("lgName").value.trim(), age = $("lgAge").value;
  const g = document.querySelector('input[name="lgGender"]:checked');
  const err = L.penNameError(name)
    || (!age ? "연령대를 골라 주세요." : null)
    || (!g ? "성별을 골라 주세요." : null)
    || (!$("lgOld").checked ? "만 14세 이상만 가입할 수 있어요." : null)
    || (!$("lgAgree").checked ? "개인정보 수집에 동의해 주세요." : null);
  if (err) { $("lgErr").textContent = err; return; }
  $("lgSubmit").disabled = true; $("lgErr").textContent = "";
  try {
    await S.B.createProfile({ penName: name, ageBand: age, gender: g.value });
    $("dlgLogin").close(); toast(`반가워요, ${name}님.`);
    renderProfile(); render();
    const f = S.afterLogin; S.afterLogin = null; if (f) f();
  } catch (e) {
    $("lgErr").textContent = e.message === "taken" ? "이미 쓰이는 필명이에요. 다른 필명을 골라 주세요." : "가입하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  } finally { $("lgSubmit").disabled = false; }
};
const needProfile = then => { if (S.status === "ready" && S.B.profile()) return true; openLogin(then); return false; };

/* ================= 공유하기 ================= */
function shareNote(note) {
  if (!needProfile(() => shareNote(note))) return;
  S.shareNote = note;
  const tp = note.topicId && topicsById[note.topicId];
  $("shTitle").textContent = note.postId ? "광장에 올린 글이에요" : "광장에 공유할까요?";
  $("shSub").textContent = note.postId
    ? "글을 고쳤다면 광장의 글에도 반영할 수 있어요."
    : `광장에는 필명 '${S.B.profile().penName}'만 보이고, 나이와 성별은 보이지 않아요.`;
  const pv = $("shPreview"); pv.textContent = "";
  pv.append(el("b", null, tp ? `${tp.keyword} · ${tp.title}` : `${note.keyword} · 자유 주제`));
  if (note.title) pv.appendChild(el("div", "pv-title", note.title));
  pv.appendChild(el("p", null, note.text));
  $("shRisk").hidden = !L.riskText(note.text + " " + (note.title || ""));
  $("shGo").hidden = !!note.postId;
  $("shUpdate").hidden = $("shUndo").hidden = !note.postId;
  $("dlgShare").showModal();
}
const postFromNote = n => {
  const tp = n.topicId && topicsById[n.topicId];
  return { topicId: n.topicId || null, keyword: tp ? tp.keyword : n.keyword, worry: tp ? tp.title : "", title: n.title || "",
    lens: n.lens || null, against: n.against || null, text: n.text };
};
$("shGo").onclick = async () => {
  const n = S.shareNote; $("shGo").disabled = true;
  try {
    const id = await S.B.share(postFromNote(n));
    APP.markShared(n.id, id);
    $("dlgShare").close(); toast("광장에 올렸어요.");
    resetFeed();
  } catch (e) { toast("올리지 못했어요. 잠시 뒤 다시 시도해 주세요."); }
  finally { $("shGo").disabled = false; }
};
$("shUpdate").onclick = async () => {
  const n = S.shareNote;
  try { await S.B.updatePost(n.postId, postFromNote(n)); $("dlgShare").close(); toast("광장의 글도 고쳤어요."); resetFeed(); }
  catch (e) { toast("광장에서 이미 내려간 글이에요."); APP.markShared(n.id, null); $("dlgShare").close(); }
};
$("shUndo").onclick = async () => {
  const n = S.shareNote;
  if (!confirm("광장에서 이 글을 내릴까요? 받은 좋아요와 댓글도 함께 사라져요.")) return;
  try { await S.B.unshare(n.postId); } catch (e) {}
  APP.markShared(n.id, null); $("dlgShare").close(); toast("광장에서 내렸어요."); resetFeed();
};

/* ================= 광장 피드 ================= */
function render() {
  const box = $("sqBody"); if (!box) return;
  document.querySelectorAll("#sqMode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.mode)));
  $("sqMode").hidden = S.status !== "ready";
  box.textContent = "";
  if (S.status === "loading") { box.appendChild(el("div", "empty", "광장에 연결하는 중…")); return; }
  if (S.status === "off") { box.appendChild(el("div", "empty", "광장은 곧 열려요.\n그동안 오늘의 고민에 내 글을 써 두세요.")); return; }
  if (S.status === "error") { box.appendChild(el("div", "empty", "광장에 연결하지 못했어요.\n인터넷 연결을 확인하고 다시 열어 주세요.")); return; }
  if (!S.B.profile()) {
    const c = el("div", "join card");
    c.append(el("p", null, "필명을 정하면 다른 사람의 글에 좋아요와 댓글을 남기고, 내 글을 광장에 올릴 수 있어요."));
    const b = el("button", "btn small", "필명 정하기"); b.onclick = () => openLogin();
    c.appendChild(b); box.appendChild(c);
  }
  if (S.mode === "mine" && !S.items.length && S.done) box.appendChild(el("div", "empty", "아직 광장에 올린 글이 없어요.\n서랍에서 글을 열고 '광장에 공유'를 눌러 보세요."));
  if (S.mode === "saved" && !S.items.length && S.done) box.appendChild(el("div", "empty", "저장한 글이 없어요.\n마음에 남는 글에 책갈피를 눌러 보세요."));
  if (S.mode === "all" && !S.items.length && S.done) box.appendChild(el("div", "empty", "아직 광장에 글이 없어요.\n첫 글을 올려 보세요."));
  const list = el("div", "posts"); list.id = "sqList";
  S.items.forEach(p => list.appendChild(postCard(p)));
  box.appendChild(list);
  const sent = el("div", "sentinel", S.loading ? "불러오는 중…" : S.done ? (S.items.length > 3 ? "여기까지예요." : "") : "");
  sent.id = "sqSentinel"; box.appendChild(sent);
  observe();
}

let io = null;
function observe() {
  if (io) io.disconnect();
  if (S.done || S.status !== "ready") return;
  io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) loadMore(); }, { rootMargin: "400px 0px" });
  io.observe($("sqSentinel"));
}

async function loadMore() {
  if (S.loading || S.done || S.status !== "ready") return;
  S.loading = true; const s = $("sqSentinel"); if (s) s.textContent = "불러오는 중…";
  try {
    const r = await S.B.feed(S.mode, S.cursor);
    const admin = S.B.isAdmin();
    const fresh = r.items.filter(p => L.visiblePost(p, S.B.uid, admin) && !S.items.some(x => x.id === p.id));
    const liked = await S.B.liked(fresh.map(p => p.id));
    liked.forEach(id => S.liked.add(id));
    S.items = S.items.concat(fresh);
    S.cursor = r.next; S.done = !r.next;
  } catch (e) { console.warn(e); S.done = true; toast("글을 불러오지 못했어요."); }
  S.loading = false;
  render();
}

function resetFeed() {
  S.items = []; S.cursor = null; S.done = false; S.loading = false;
  if (!$("v-square").hidden) { render(); loadMore(); }
}
document.querySelectorAll("#sqMode button").forEach(b => b.onclick = () => {
  if ((b.dataset.v === "mine" || b.dataset.v === "saved") && !needProfile(() => { S.mode = b.dataset.v; resetFeed(); })) return;
  S.mode = b.dataset.v; resetFeed();
});

function postCard(p) {
  const a = el("article", "post");
  const h = el("div", "post-h");
  h.append(el("b", "pen", p.penName), el("span", "faint", "· " + L.timeAgo(p.createdAt, Date.now())));
  if (p.keyword) h.appendChild(el("span", "kwchip", p.keyword));
  if (p.hidden || (p.reportCount || 0) >= L.REPORT_HIDE) h.appendChild(el("span", "kwchip warn", p.hidden ? "숨김" : "신고됨"));
  const more = el("button", "more", "⋯"); more.type = "button"; more.setAttribute("aria-label", "더 보기 메뉴");
  more.onclick = () => openMenu(p); h.appendChild(more);
  a.appendChild(h);
  if (p.worry) a.appendChild(el("div", "post-worry", p.worry));
  if (p.title) a.appendChild(el("h3", null, p.title));
  const txt = el("p", "post-text clamp", p.text); a.appendChild(txt);
  const mt = el("button", "linkbtn moretext", "더 보기"); mt.hidden = true;
  mt.onclick = () => { txt.classList.remove("clamp"); mt.hidden = true; };
  a.appendChild(mt);
  requestAnimationFrame(() => { mt.hidden = txt.scrollHeight <= txt.clientHeight + 2; });
  const lens = el("div", "post-lens");
  if (p.lens && lensById[p.lens]) lens.appendChild(colorVar(el("span", "lchip", "와닿음 · " + lensById[p.lens].name), p.lens));
  if (p.against && lensById[p.against]) lens.appendChild(colorVar(el("span", "lchip ag", "반박 · " + lensById[p.against].name), p.against));
  if (lens.childNodes.length) a.appendChild(lens);

  const acts = el("div", "post-acts");
  const like = el("button", "act"); like.type = "button";
  const setLikeUI = () => {
    const on = S.liked.has(p.id);
    like.innerHTML = ICON.heart; like.appendChild(el("span", null, String(Math.max(0, p.likeCount || 0))));
    like.classList.toggle("on", on); like.setAttribute("aria-pressed", String(on)); like.setAttribute("aria-label", on ? "좋아요 취소" : "좋아요");
  };
  setLikeUI();
  like.onclick = async () => {
    if (!needProfile()) return;
    const on = !S.liked.has(p.id);
    on ? S.liked.add(p.id) : S.liked.delete(p.id); p.likeCount = (p.likeCount || 0) + (on ? 1 : -1); setLikeUI();
    try { await S.B.setLike(p.id, on); }
    catch (e) { on ? S.liked.delete(p.id) : S.liked.add(p.id); p.likeCount += on ? -1 : 1; setLikeUI(); toast("반영하지 못했어요."); }
  };
  const com = el("button", "act"); com.type = "button"; com.setAttribute("aria-label", "댓글");
  com.innerHTML = ICON.comment; com.appendChild(el("span", null, String(Math.max(0, p.commentCount || 0))));
  com.onclick = () => openComments(p, com);
  const sv = el("button", "act save"); sv.type = "button";
  const setSaveUI = () => { const on = S.saved.has(p.id); sv.innerHTML = ICON.save; sv.classList.toggle("on", on); sv.setAttribute("aria-pressed", String(on)); sv.setAttribute("aria-label", on ? "저장 취소" : "저장"); };
  setSaveUI();
  sv.onclick = async () => {
    if (!needProfile()) return;
    const on = !S.saved.has(p.id); on ? S.saved.add(p.id) : S.saved.delete(p.id); setSaveUI();
    try { await S.B.setSave(p.id, on); toast(on ? "저장했어요. 광장의 '저장'에서 볼 수 있어요." : "저장을 취소했어요."); }
    catch (e) { on ? S.saved.delete(p.id) : S.saved.add(p.id); setSaveUI(); toast("반영하지 못했어요."); }
  };
  acts.append(like, com, el("span", "spacer"), sv);
  a.appendChild(acts);
  return a;
}

/* ================= 댓글 ================= */
let commentBtn = null;
async function openComments(p, btn) {
  S.commentsFor = p; commentBtn = btn;
  $("cmTitle").textContent = `${p.penName}님의 글에 남긴 말`;
  $("cmText").value = "";
  $("cmForm").hidden = !(S.status === "ready" && S.B.profile());
  $("cmJoin").hidden = !$("cmForm").hidden;
  $("dlgComments").showModal();
  await loadComments();
}
async function loadComments() {
  const p = S.commentsFor, box = $("cmList");
  box.textContent = ""; box.appendChild(el("div", "faint", "불러오는 중…"));
  let list = [];
  try { list = await S.B.comments(p.id); } catch (e) { box.textContent = "댓글을 불러오지 못했어요."; return; }
  box.textContent = "";
  if (!list.length) box.appendChild(el("div", "faint", "아직 댓글이 없어요. 첫 마음을 남겨 보세요."));
  const admin = S.B.isAdmin();
  list.forEach(c => {
    const d = el("div", "cm");
    const h = el("div", "cm-h"); h.append(el("b", null, c.penName), el("span", "faint", "· " + L.timeAgo(c.createdAt, Date.now())));
    if (c.uid === S.B.uid || p.uid === S.B.uid || admin) {
      const del = el("button", "linkbtn", "지우기");
      del.onclick = async () => {
        if (!confirm("이 댓글을 지울까요?")) return;
        try { await S.B.deleteComment(p.id, c.id); p.commentCount = Math.max(0, (p.commentCount || 1) - 1); updateCommentCount(); loadComments(); }
        catch (e) { toast("지우지 못했어요."); }
      };
      h.append(el("span", "spacer"), del);
    }
    d.append(h, el("p", null, c.text));
    box.appendChild(d);
  });
}
function updateCommentCount() {
  if (commentBtn) { commentBtn.innerHTML = ICON.comment; commentBtn.appendChild(el("span", null, String(S.commentsFor.commentCount))); }
}
$("cmJoin").onclick = () => { $("dlgComments").close(); openLogin(() => openComments(S.commentsFor, commentBtn)); };
$("cmSend").onclick = async () => {
  const t = $("cmText").value.trim();
  if (!t) return;
  if (t.length > 500) return toast("댓글은 500자까지 쓸 수 있어요.");
  $("cmSend").disabled = true;
  try {
    await S.B.addComment(S.commentsFor.id, t);
    S.commentsFor.commentCount = (S.commentsFor.commentCount || 0) + 1; updateCommentCount();
    $("cmText").value = ""; await loadComments();
  } catch (e) { toast("댓글을 남기지 못했어요."); }
  finally { $("cmSend").disabled = false; }
};

/* ================= ⋯ 메뉴: 신고 · 내 글 내리기 · 관리자 ================= */
function openMenu(p) {
  S.menuFor = p;
  const box = $("mnBox"); box.textContent = "";
  const mine = S.status === "ready" && p.uid === S.B.uid, admin = S.status === "ready" && S.B.isAdmin();
  const add = (label, fn, cls) => { const b = el("button", "menu-item" + (cls ? " " + cls : ""), label); b.onclick = fn; box.appendChild(b); };
  if (mine) add("광장에서 내리기", async () => {
    if (!confirm("광장에서 이 글을 내릴까요? 받은 좋아요와 댓글도 함께 사라져요.")) return;
    try { await S.B.unshare(p.id); APP.unmarkPost(p.id); $("dlgMenu").close(); toast("내렸어요."); resetFeed(); } catch (e) { toast("내리지 못했어요."); }
  }, "danger");
  if (!mine) {
    $("mnReason").hidden = false;
    add("신고하기", async () => {
      if (!needProfile()) return;
      const reason = $("mnReasonSel").value;
      try { await S.B.report(p.id, reason); p.reportCount = (p.reportCount || 0) + 1; $("dlgMenu").close(); toast("신고했어요. 살펴볼게요."); render(); }
      catch (e) { toast(e.message === "already" ? "이미 신고한 글이에요." : "신고하지 못했어요."); }
    }, "danger");
  } else $("mnReason").hidden = true;
  if (admin) {
    add(p.hidden ? "관리자 · 다시 보이기" : "관리자 · 숨기기", async () => { await S.B.adminHide(p.id, !p.hidden); p.hidden = !p.hidden; $("dlgMenu").close(); render(); });
    add("관리자 · 삭제", async () => { if (!confirm("이 글을 삭제할까요?")) return; await S.B.adminDelete(p.id); $("dlgMenu").close(); resetFeed(); }, "danger");
  }
  $("dlgMenu").showModal();
}

/* ================= 나 탭의 프로필 ================= */
function renderProfile() {
  const box = $("profileBox"); if (!box) return;
  box.textContent = "";
  if (S.status !== "ready") { box.hidden = true; return; }
  box.hidden = false;
  const p = S.B.profile();
  if (!p) {
    box.append(el("p", "muted", "필명을 정하면 광장에 글을 올리고 다른 사람과 생각을 나눌 수 있어요."));
    const b = el("button", "btn small", "필명 정하기"); b.onclick = () => openLogin(); box.appendChild(b);
    return;
  }
  const h = el("div", "prof-h");
  h.append(el("b", "pen", p.penName), el("span", "faint", `${ageLabel[p.ageBand] || ""} · ${genderLabel[p.gender] || ""} · 나만 보여요`));
  box.appendChild(h);
  const row = el("div", "row");
  const edit = el("button", "linkbtn", "연령대·성별 고치기");
  edit.onclick = () => {
    fillLoginSelects();
    $("peAge").innerHTML = $("lgAge").innerHTML; $("peAge").value = p.ageBand;
    $("peGender").value = p.gender; $("dlgProfile").showModal();
  };
  const out = el("button", "linkbtn", "탈퇴하기");
  out.onclick = async () => {
    if (!confirm("탈퇴할까요? 광장에 올린 글과 저장한 글, 필명이 모두 지워지고 되돌릴 수 없어요. (내 기기에 쓴 글은 그대로 남아요)")) return;
    try { await S.B.deleteAccount(); APP.clearShared(); toast("탈퇴했어요."); location.reload(); } catch (e) { toast("탈퇴하지 못했어요. 잠시 뒤 다시 시도해 주세요."); }
  };
  row.append(edit, el("span", "spacer"), out);
  box.appendChild(row);
  if (S.B.isAdmin()) box.appendChild(el("p", "faint", "관리자로 들어와 있어요. 광장의 ⋯ 메뉴에서 글을 숨기거나 지울 수 있어요."));
  box.appendChild(el("p", "faint small", `내 번호: ${S.B.uid}`));
}
$("peSave").onclick = async () => {
  try { await S.B.updateProfile({ ageBand: $("peAge").value, gender: $("peGender").value }); $("dlgProfile").close(); renderProfile(); toast("고쳤어요."); }
  catch (e) { toast("고치지 못했어요."); }
};

/* ================= 화면과 잇기 ================= */
window.RawSocial = {
  shareNote,
  onTab(v) {
    if (v === "square") { render(); if (!S.items.length && !S.done) loadMore(); }
    if (v === "me") renderProfile();
  },
};

/* ================= 시험용 서버의 예시 글 ================= */
function seedMock(D) {
  const people = ["새벽독서", "고래", "느린걸음", "물고기", "책갈피", "밤산책", "소금", "둥근달"];
  const texts = [
    "남의 저울에서 내려오라는 말이 오래 남았다. 오늘은 회의에서 내 기준을 한 번 말해 봤다.",
    "빈 배 이야기를 읽고 나니, 팀장님의 날 선 말이 조금 덜 아팠다. 화낼 상대가 사라진다는 게 이런 거구나.",
    "그만두고 싶은 이유를 적어 보니 절반은 상상이었다. 세네카 말이 맞았다.",
    "포정처럼 결을 따라 일해 보기로 했다. 같은 일인데 오늘은 덜 지겨웠다.",
    "연봉 숫자에 오르내리는 내가 조삼모사의 원숭이 같았다. 웃겨서 조금 가벼워졌다.",
    "떨어진 곳들의 공통점을 적어 봤다. 운이 아니라 방식이었다.",
    "필요한 돈을 계산해 보니 생각보다 적었다. 하고 싶은 일을 해 볼 용기가 조금 생겼다.",
    "나비 꿈 이야기가 위로가 됐다. 좋아하는 게 바뀌어도 괜찮다는 말.",
    "모르는 걸 모른다고 말하는 게 이렇게 어려운 일인 줄 몰랐다. 오늘 처음 손을 들었다.",
    "어울리되 같아지지 않기. 친구들과 다른 의견을 내도 관계는 무너지지 않았다.",
    "쉬는 걸 게으름이라 여긴 게 나를 태웠다. 오늘은 죄책감 없이 낮잠을 잤다.",
    "실수 하나로 나를 다 재는 잣대를 내려놓기로. 사과는 하고, 자책은 덜고.",
  ];
  const now = Date.now();
  texts.forEach((t, i) => {
    const tp = TOPICS[i % TOPICS.length], ls = LENSES[i % 6].id, ag = LENSES[(i + 3) % 6].id;
    const id = "seed" + i;
    D.posts[id] = { id, uid: "u" + (i % people.length), penName: people[i % people.length], topicId: tp.id, keyword: tp.keyword, worry: tp.title,
      title: i % 4 === 2 ? "오늘의 한 문단" : "", lens: ls, against: i % 3 ? ag : null, text: t,
      createdAt: now - (i * 47 + 5) * 60 * 1000, likeCount: (i * 7) % 13, commentCount: i % 3 ? 1 : 0, reportCount: 0, hidden: false,
      likes: {}, comments: i % 3 ? [{ id: "c" + i, uid: "u9", penName: "지나가는독자", text: "저도 비슷한 마음이었어요. 고마워요.", createdAt: now - i * 30 * 60 * 1000 }] : [] };
  });
}

start();
