/* 여섯 시선 화면 — 오늘 · 쓰기 · 서랍 · 나 */
(function () {
  const L = SixLogic;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const colorVar = (node, id) => { node.style.setProperty("--c", `var(--c-${id})`); return node; };
  const lensById = Object.fromEntries(LENSES.map(l => [l.id, l]));
  const topicsById = Object.fromEntries(TOPICS.map(t => [t.id, t]));
  const rivalOf = id => lensById[id] && lensById[id].rival;
  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const DRAFT_KEY = "sixviews:draft", SKIP_KEY = "sixviews:revisitSkip";

  let store = null; try { store = window.localStorage; } catch (e) {}
  const getJSON = (k, d) => { try { const v = store && store.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const setJSON = (k, v) => { try { store && store.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const delKey = k => { try { store && store.removeItem(k); } catch (e) {} };

  let notes = L.loadNotes(store);
  const today = L.dateKey(new Date());
  const baseIdx = L.topicIndexFor(today, TOPICS.length);
  const N = TOPICS.length;

  const S = {
    offset: 0, allOpen: false,
    quick: { lens: null, against: null },
    ed: null, toolLens: null, toolIdx: 0,
    drawer: { q: "", filter: "all" },
    cal: { y: +today.slice(0, 4), m: +today.slice(5, 7) },
    noteId: null, fuId: null,
  };

  const topicIdx = () => ((baseIdx + S.offset) % N + N) % N;
  const topic = () => TOPICS[topicIdx()];
  const prettyDate = key => { const [y, m, d] = key.split("-").map(Number); return `${m}월 ${d}일 ${WEEK[new Date(y, m - 1, d).getDay()]}요일`; };
  const shortDate = key => { const [y, m, d] = key.split("-").map(Number); return `${y === +today.slice(0, 4) ? "" : y + ". "}${m}. ${d}.`; };

  let toastT = null;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* 시선 칩 묶음: agree/against 둘이 같은 시선을 고르지 않게 */
  function renderChips(box, selected, onPick) {
    box.textContent = "";
    LENSES.forEach(l => {
      const c = colorVar(el("button", "chip"), l.id);
      c.type = "button";
      c.setAttribute("aria-pressed", String(selected === l.id));
      c.append(el("i"), document.createTextNode(l.name));
      c.onclick = () => onPick(selected === l.id ? null : l.id);
      box.appendChild(c);
    });
  }

  /* ================= 오늘 ================= */
  function renderToday() {
    const tp = topic();
    const lab = $("dayLabel"); lab.textContent = S.offset === 0 ? `${prettyDate(today)} · 오늘의 고민` : `다른 고민 둘러보기 ${topicIdx() + 1} / ${N}`;
    if (S.offset !== 0) {
      const b = el("button", "linkbtn", "오늘로"); b.style.marginLeft = "8px";
      b.onclick = () => { S.offset = 0; renderToday(); }; lab.appendChild(b);
    }
    $("prevT").disabled = S.offset <= -(N - 1);
    $("nextT").disabled = S.offset >= N - 1;
    $("kw").textContent = tp.keyword; $("grp").textContent = tp.group;
    $("worry").textContent = tp.title; $("prompt").textContent = tp.prompt;

    renderRevisit();
    renderDuel(tp);

    const box = $("views"); box.textContent = "";
    const duelIds = tp.duel ? tp.duel.pair : [];
    LENSES.forEach((l, i) => {
      const v = tp.views[l.id];
      const card = colorVar(el("article", "view" + (S.allOpen ? " open" : "")), l.id);
      const head = el("button", "view-head"); head.type = "button";
      head.setAttribute("aria-expanded", String(S.allOpen));
      const name = el("div", "view-name", `${i + 1}  ${l.name}`);
      name.appendChild(el("span", null, v.voice));
      if (duelIds.includes(l.id)) name.appendChild(el("em", null, "맞대결"));
      head.append(name, el("div", "view-line", v.line), el("span", "chev", "›"));
      const body = el("div", "view-body");
      body.appendChild(el("p", null, v.body));
      const src = el("div", "src"); src.append(el("b", null, "사상 해석"), document.createTextNode(` · 근거 ${v.source}`));
      body.appendChild(src);
      head.onclick = () => { const o = card.classList.toggle("open"); head.setAttribute("aria-expanded", String(o)); };
      card.append(head, body); box.appendChild(card);
    });
    $("toggleAll").textContent = S.allOpen ? "모두 접기" : "모두 펼치기";

    const saved = L.findNote(notes, today, tp.id);
    S.quick = { lens: saved ? saved.lens : null, against: saved ? saved.against : null };
    $("qText").value = saved ? saved.text : "";
    renderQuickChips(); updateQuick();
  }

  function renderDuel(tp) {
    const box = $("duel"); box.textContent = "";
    if (!tp.duel) { box.hidden = true; return; }
    box.hidden = false;
    const [a, b] = tp.duel.pair;
    const vs = el("div", "vs");
    const side = (id, cls) => { const s = colorVar(el("div", "side " + cls), id); s.append(el("b", null, lensById[id].name), el("span", null, tp.views[id].line)); return s; };
    vs.append(side(a, "l"), el("div", "mid", "vs"), side(b, "r"));
    const split = el("p", "split"); split.append(el("b", null, "어디서 갈라지나 · "), document.createTextNode(tp.duel.split));
    box.append(vs, split);
  }

  function renderRevisit() {
    const box = $("revisit"); box.textContent = "";
    const skipped = getJSON(SKIP_KEY, {});
    const cand = L.revisitCandidate(notes, today, skipped[today] || []);
    if (!cand) { box.hidden = true; return; }
    box.hidden = false;
    const days = L.daysBetween(cand.date, today);
    box.append(el("div", "lbl", `${days}일 전의 나 · ${L.noteKeyword(cand, topicsById)}`), el("p", null, cand.title ? `${cand.title} — ${cand.text}` : cand.text));
    const row = el("div", "row");
    const later = el("button", "linkbtn", "나중에");
    later.onclick = () => { const s = getJSON(SKIP_KEY, {}); s[today] = (s[today] || []).concat(cand.id); setJSON(SKIP_KEY, { [today]: s[today] }); renderRevisit(); };
    const go = el("button", "btn small", "지금의 생각 덧붙이기"); go.onclick = () => openFollow(cand.id);
    row.append(el("span", "spacer"), later, go);
    box.appendChild(row);
  }

  function renderQuickChips() {
    renderChips($("qAgree"), S.quick.lens, id => { S.quick.lens = id; if (id && S.quick.against === id) S.quick.against = null; renderQuickChips(); });
    renderChips($("qAgainst"), S.quick.against, id => { S.quick.against = id; if (id && S.quick.lens === id) S.quick.lens = null; renderQuickChips(); });
  }
  function updateQuick() {
    $("qCount").textContent = `${L.charCount($("qText").value)}자`;
    const ok = $("qText").value.trim().length > 0;
    $("qSave").disabled = !ok; $("qCard").disabled = !ok;
  }

  $("qText").addEventListener("input", updateQuick);
  $("prevT").onclick = () => { S.offset--; renderToday(); };
  $("nextT").onclick = () => { S.offset++; renderToday(); };
  $("toggleAll").onclick = () => { S.allOpen = !S.allOpen; renderToday(); };
  $("qSave").onclick = () => {
    const tp = topic(), prev = L.findNote(notes, today, tp.id);
    const next = L.saveNote(store, notes, { date: today, topicId: tp.id, lens: S.quick.lens, against: S.quick.against,
      text: $("qText").value, mode: prev ? prev.mode : "short", title: prev ? prev.title : "" });
    if (!next) return;
    notes = next; toast("저장했어요. 서랍에서 다시 볼 수 있어요.");
  };
  $("qCard").onclick = () => {
    const tp = topic();
    openCard({ keyword: tp.keyword, worry: tp.title, lensId: S.quick.lens, lensLine: S.quick.lens && tp.views[S.quick.lens].line,
      title: "", text: $("qText").value, date: today }, $("qCard"));
  };
  $("qLong").onclick = () => {
    const tp = topic(), prev = L.findNote(notes, today, tp.id);
    openEditor({ source: "topic", topicId: tp.id, keyword: "", mode: "long", title: prev ? prev.title : "",
      lens: S.quick.lens, against: S.quick.against, text: $("qText").value, editingId: prev ? prev.id : null });
  };

  /* ================= 쓰기 ================= */
  const blankEd = () => ({ source: "topic", topicId: topic().id, keyword: "", mode: "short", title: "", lens: null, against: null, text: "", editingId: null });

  (function fillTopicSelect() {
    const sel = $("edTopic");
    TOPICS.forEach((t, i) => { const o = el("option", null, `${i + 1}. ${t.keyword} — ${t.title}`); o.value = t.id; sel.appendChild(o); });
  })();

  function openEditor(ed) {
    S.ed = Object.assign(blankEd(), ed);
    saveDraft();
    showTab("write");
  }

  let draftT = null;
  function saveDraft() {
    clearTimeout(draftT);
    draftT = setTimeout(() => {
      if (S.ed && (S.ed.text.trim() || S.ed.title.trim())) { setJSON(DRAFT_KEY, S.ed); $("edDraft").textContent = "임시 저장됨"; }
    }, 400);
  }

  function renderEditor() {
    if (!S.ed) {
      const d = getJSON(DRAFT_KEY, null);
      S.ed = d && typeof d.text === "string" ? Object.assign(blankEd(), d) : blankEd();
      if (d && d.text) toast("쓰던 글을 불러왔어요.");
    }
    const ed = S.ed;
    document.querySelectorAll("#edSource button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === ed.source)));
    document.querySelectorAll("#edMode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === ed.mode)));
    $("edTopicBox").hidden = ed.source !== "topic";
    $("edFreeBox").hidden = ed.source !== "free";
    $("edTitleBox").hidden = ed.mode !== "long";
    $("edPremium").hidden = ed.source !== "free";
    $("edTopic").value = ed.topicId || topic().id;
    $("edKeyword").value = ed.keyword; $("edTitle").value = ed.title; $("edText").value = ed.text;
    $("edText").classList.toggle("long", ed.mode === "long");
    const editing = ed.editingId && notes.find(n => n.id === ed.editingId);
    const st = $("edState"); st.textContent = "";
    if (editing) st.append(document.createTextNode(`${shortDate(editing.date)}에 쓴 글을 고치는 중이에요.`));
    else if (ed.source === "topic") st.append(document.createTextNode("오늘 이 고민에 쓰는 글이에요. 같은 날 다시 저장하면 덮어써요."));
    else st.append(document.createTextNode("오늘의 고민과 상관없이, 내가 정한 주제로 써요."));
    renderEdChips(); renderTool(); updateEd();
  }

  function renderEdChips() {
    renderChips($("edAgree"), S.ed.lens, id => { S.ed.lens = id; if (id && S.ed.against === id) S.ed.against = null; renderEdChips(); saveDraft(); });
    renderChips($("edAgainst"), S.ed.against, id => { S.ed.against = id; if (id && S.ed.lens === id) S.ed.lens = null; renderEdChips(); saveDraft(); });
  }

  function updateEd() {
    $("edCount").textContent = `${L.charCount($("edText").value)}자`;
    const ok = $("edText").value.trim() && (S.ed.source === "topic" || $("edKeyword").value.trim());
    $("edSave").disabled = !ok; $("edCard").disabled = !ok;
  }

  document.querySelectorAll("#edSource button").forEach(b => b.onclick = () => {
    if (S.ed.editingId && b.dataset.v !== S.ed.source) { toast("고치는 글은 주제 종류를 바꿀 수 없어요. '새 글'로 시작해 주세요."); return; }
    S.ed.source = b.dataset.v; renderEditor(); saveDraft();
  });
  document.querySelectorAll("#edMode button").forEach(b => b.onclick = () => { S.ed.mode = b.dataset.v; renderEditor(); saveDraft(); });
  $("edTopic").onchange = () => {
    if (S.ed.editingId) { $("edTopic").value = S.ed.topicId; toast("고치는 글은 고민을 바꿀 수 없어요."); return; }
    S.ed.topicId = $("edTopic").value; renderTool(); saveDraft();
  };
  $("edKeyword").addEventListener("input", () => { S.ed.keyword = $("edKeyword").value; updateEd(); saveDraft(); });
  $("edTitle").addEventListener("input", () => { S.ed.title = $("edTitle").value; saveDraft(); });
  $("edText").addEventListener("input", () => { S.ed.text = $("edText").value; updateEd(); saveDraft(); });

  $("edSave").onclick = () => {
    const ed = S.ed, now = new Date().toISOString();
    const next = L.saveNote(store, notes, { id: ed.editingId || undefined, date: today, topicId: ed.source === "topic" ? ed.topicId : null,
      keyword: ed.keyword, title: ed.mode === "long" ? ed.title : "", mode: ed.mode, lens: ed.lens, against: ed.against, text: ed.text, savedAt: now });
    if (!next) return;
    notes = next;
    const mine = notes.find(n => n.updatedAt === now);
    if (mine) ed.editingId = mine.id;
    delKey(DRAFT_KEY); $("edDraft").textContent = "";
    toast("저장했어요. 서랍에 담겼어요."); renderEditor();
  };
  $("edNew").onclick = () => {
    if (S.ed.text.trim() && !S.ed.editingId && !confirm("쓰던 글을 비우고 새로 시작할까요? 저장하지 않은 내용은 사라져요.")) return;
    S.ed = blankEd(); delKey(DRAFT_KEY); $("edDraft").textContent = ""; renderEditor();
  };
  $("edCard").onclick = () => {
    const ed = S.ed, tp = ed.source === "topic" ? topicsById[ed.topicId] : null;
    openCard({ keyword: tp ? tp.keyword : ed.keyword.trim(), worry: tp ? tp.title : "", lensId: ed.lens,
      lensLine: tp && ed.lens ? tp.views[ed.lens].line : "", title: ed.mode === "long" ? ed.title.trim() : "", text: ed.text, date: today }, $("edCard"));
  };

  /* 생각 도구 */
  function renderTool() {
    const box = $("toolLens"); box.textContent = "";
    LENSES.forEach(l => {
      const b = colorVar(el("button", null, l.name.slice(0, 1)), l.id);
      b.type = "button"; b.title = l.name; b.setAttribute("aria-label", l.name + "에게 묻기");
      b.setAttribute("aria-pressed", String(S.toolLens === l.id));
      b.onclick = () => { S.toolIdx = S.toolLens === l.id ? S.toolIdx + 1 : 0; S.toolLens = l.id; renderTool(); };
      box.appendChild(b);
    });
    const ask = $("toolAsk"); ask.textContent = "";
    $("toolActs").hidden = ask.hidden = !S.toolLens;
    if (!S.toolLens) return;
    const l = lensById[S.toolLens], prompts = LENS_TOOLS[l.id].prompts;
    colorVar(ask, l.id);
    ask.append(el("b", null, `${l.name} · ${l.who}`), el("p", null, prompts[S.toolIdx % prompts.length]));
    const tp = S.ed && S.ed.source === "topic" ? topicsById[S.ed.topicId] : null;
    if (tp) ask.appendChild(el("small", null, `이 고민에 대한 ${l.name}의 생각: ${tp.views[l.id].line}`));
    $("toolRival").textContent = `맞수 '${lensById[rivalOf(l.id)].name}'에게 묻기`;
  }
  $("toolNext").onclick = () => { S.toolIdx++; renderTool(); };
  $("toolRival").onclick = () => { S.toolLens = rivalOf(S.toolLens); S.toolIdx = 0; renderTool(); };
  $("toolInsert").onclick = () => {
    const ps = LENS_TOOLS[S.toolLens].prompts, ta = $("edText"), q = ps[S.toolIdx % ps.length];
    const pos = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    const before = ta.value.slice(0, pos), after = ta.value.slice(pos);
    const ins = (before && !before.endsWith("\n") ? "\n\n" : "") + `— ${q}\n`;
    ta.value = before + ins + after; ta.focus(); ta.selectionStart = ta.selectionEnd = pos + ins.length;
    S.ed.text = ta.value; updateEd(); saveDraft();
  };

  /* ================= 서랍 ================= */
  function renderDrawer() {
    document.querySelectorAll("#dFilter button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.drawer.filter)));
    const list = L.searchNotes(notes, S.drawer.q, topicsById, S.drawer.filter);
    $("dCount").textContent = notes.length ? `${list.length}편${S.drawer.q || S.drawer.filter !== "all" ? ` / 전체 ${notes.length}편` : ""}` : "";
    const box = $("dList"); box.textContent = "";
    if (!notes.length) { box.appendChild(el("div", "empty", "아직 쓴 글이 없어요.\n오늘의 고민에 한 문단을 써 보세요.")); return; }
    if (!list.length) { box.appendChild(el("div", "empty", "찾는 글이 없어요.")); return; }
    list.forEach(n => {
      const it = el("button", "item"); it.type = "button";
      const meta = el("div", "meta");
      meta.appendChild(el("span", null, shortDate(n.date)));
      meta.appendChild(el("span", null, L.noteKeyword(n, topicsById) + (n.topicId ? "" : " · 자유")));
      if (n.lens && lensById[n.lens]) meta.appendChild(colorVar(el("span", "lens", lensById[n.lens].name), n.lens));
      if (n.against && lensById[n.against]) meta.appendChild(colorVar(el("span", "lens ag", "반박 " + lensById[n.against].name), n.against));
      const fu = (n.followups || []).length;
      meta.appendChild(el("span", null, `${L.charCount(n.text)}자${fu ? ` · 덧쓰기 ${fu}` : ""}`));
      it.appendChild(meta);
      if (n.title) it.appendChild(el("h3", null, n.title));
      it.appendChild(el("p", null, n.text));
      it.onclick = () => openNote(n.id);
      box.appendChild(it);
    });
  }
  $("dQ").addEventListener("input", () => { S.drawer.q = $("dQ").value; renderDrawer(); });
  document.querySelectorAll("#dFilter button").forEach(b => b.onclick = () => { S.drawer.filter = b.dataset.v; renderDrawer(); });

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  $("dExport").onclick = () => {
    if (!notes.length) return toast("내보낼 글이 없어요.");
    download(`여섯시선_내글_${today}.txt`, L.exportText(notes, topicsById, lensById), "text/plain;charset=utf-8");
  };
  $("dBackup").onclick = () => {
    if (!notes.length) return toast("백업할 글이 없어요.");
    download(`여섯시선_백업_${today}.json`, JSON.stringify({ app: "sixviews", version: 2, exportedAt: new Date().toISOString(), notes }, null, 1), "application/json");
  };
  $("dRestore").onclick = () => $("dFile").click();
  $("dFile").onchange = async () => {
    const f = $("dFile").files[0]; $("dFile").value = "";
    if (!f) return;
    const list = L.parseBackup(await f.text());
    if (!list) return toast("여섯 시선 백업 파일이 아니에요.");
    notes = L.mergeNotes(notes, list);
    try { store && store.setItem(L.NOTES_KEY, JSON.stringify(notes)); } catch (e) {}
    toast(`백업에서 ${list.length}편을 불러왔어요.`); renderDrawer();
  };

  /* 글 자세히 보기 */
  function openNote(id) {
    const n = notes.find(x => x.id === id); if (!n) return;
    S.noteId = id;
    const box = $("noteBox"); box.textContent = "";
    const tp = n.topicId && topicsById[n.topicId];
    box.appendChild(el("h3", null, n.title || L.noteKeyword(n, topicsById)));
    const sub = [shortDate(n.date), n.title ? L.noteKeyword(n, topicsById) : null, tp ? tp.title : "자유 주제"].filter(Boolean).join(" · ");
    box.appendChild(el("p", "sub", sub));
    const lensLine = [];
    if (n.lens && lensById[n.lens]) lensLine.push(`와닿은 시선 ${lensById[n.lens].name}`);
    if (n.against && lensById[n.against]) lensLine.push(`반박한 시선 ${lensById[n.against].name}`);
    if (lensLine.length) box.appendChild(el("p", "sub", lensLine.join(" · ")));
    box.appendChild(el("p", "body", n.text));
    (n.followups || []).forEach(f => {
      const d = el("div", "fu");
      d.append(el("b", null, `${shortDate(f.date)} 덧쓰기 · ${L.daysBetween(n.date, f.date)}일 뒤`), el("p", null, f.text));
      box.appendChild(d);
    });
    const row = el("div", "row");
    const del = el("button", "linkbtn", "삭제");
    del.onclick = () => { if (confirm("이 글을 지울까요? 되돌릴 수 없어요.")) { notes = L.deleteNote(store, notes, id); $("dlgNote").close(); renderDrawer(); toast("지웠어요."); } };
    const edit = el("button", "btn ghost small", "고치기");
    edit.onclick = () => { $("dlgNote").close(); openEditor({ source: n.topicId ? "topic" : "free", topicId: n.topicId || topic().id, keyword: n.keyword || "", mode: n.mode || "short", title: n.title || "", lens: n.lens, against: n.against, text: n.text, editingId: n.id }); };
    const card = el("button", "btn ghost small", "카드");
    card.onclick = () => openCard({ keyword: L.noteKeyword(n, topicsById), worry: tp ? tp.title : "", lensId: n.lens, lensLine: tp && n.lens ? tp.views[n.lens].line : "", title: n.title, text: n.text, date: n.date }, card);
    const fu = el("button", "btn small", "덧쓰기"); fu.onclick = () => { $("dlgNote").close(); openFollow(n.id); };
    row.append(del, el("span", "spacer"), edit, card, fu);
    box.appendChild(row);
    if (!$("dlgNote").open) $("dlgNote").showModal();
  }

  /* 덧쓰기 */
  function openFollow(id) {
    const n = notes.find(x => x.id === id); if (!n) return;
    S.fuId = id;
    $("fuSub").textContent = `${shortDate(n.date)} · ${L.noteKeyword(n, topicsById)} · ${L.daysBetween(n.date, today)}일 전에 쓴 글`;
    $("fuQuote").textContent = (n.title ? n.title + "\n\n" : "") + n.text;
    $("fuText").value = "";
    $("dlgFollow").showModal();
  }
  $("fuSave").onclick = () => {
    const next = L.addFollowup(store, notes, S.fuId, $("fuText").value, today);
    if (!next) return toast("덧붙일 생각을 적어 주세요.");
    notes = next; $("dlgFollow").close(); toast("덧붙였어요.");
    renderRevisit();
    if (!$("v-drawer").hidden) renderDrawer();
  };

  /* ================= 나 ================= */
  function renderMe() {
    const days = L.writtenDays(notes);
    const tiles = $("tiles"); tiles.textContent = "";
    const chars = notes.reduce((s, n) => s + L.charCount(n.text) + (n.followups || []).reduce((a, f) => a + L.charCount(f.text), 0), 0);
    [[notes.length, "쓴 글"], [days.size, "쓴 날"], [L.streak(days, today), "연속"], [chars >= 10000 ? (chars / 10000).toFixed(1) + "만" : chars, "글자"]]
      .forEach(([v, k]) => { const t = el("div", "tile"); t.append(el("b", null, String(v)), el("span", null, k)); tiles.appendChild(t); });

    // 달력
    $("calTitle").textContent = `${S.cal.y}년 ${S.cal.m}월`;
    const cal = $("cal"); cal.textContent = "";
    WEEK.forEach(w => cal.appendChild(el("div", "wd", w)));
    L.monthCells(S.cal.y, S.cal.m).forEach(k => {
      const d = el("div", "d", k ? String(+k.slice(8)) : "");
      if (k && days.has(k)) d.classList.add("on");
      if (k === today) d.classList.add("today");
      cal.appendChild(d);
    });
    $("calNext").disabled = S.cal.y * 12 + S.cal.m >= +today.slice(0, 4) * 12 + +today.slice(5, 7);

    // 사고 지도
    const map = $("map"); map.textContent = "";
    const all = L.axisLean(notes, AXES);
    const recent = L.axisLean(notes.filter(n => L.daysBetween(n.date, today) < 30), AXES);
    if (!all.some(a => a.total)) map.appendChild(el("p", "muted", "글을 쓸 때 와닿은 시선과 반박하고 싶은 시선을 고르면, 내가 고민 앞에서 어느 쪽으로 기우는지 여기에 그려져요."));
    all.forEach((a, i) => {
      const g = el("div", "gauge");
      g.style.setProperty("--cl", `var(--c-${a.left})`); g.style.setProperty("--cr", `var(--c-${a.right})`);
      const ends = el("div", "ends");
      const lt = el("span", null, lensById[a.left].name); lt.appendChild(el("small", null, lensById[a.left].pole));
      const rt = el("span"); rt.append(el("small", null, lensById[a.right].pole), document.createTextNode(lensById[a.right].name));
      ends.append(lt, el("span", "faint", a.title), rt);
      const tr = el("div", "track");
      // ratio = 왼쪽 비중 → 왼쪽에 가까울수록 0%
      const pos = r => `${Math.round((1 - r) * 100)}%`;
      if (a.ratio != null) { const m = el("span", "mk"); m.style.left = pos(a.ratio); m.title = "전체"; tr.appendChild(m); }
      if (recent[i].ratio != null && a.ratio != null && Math.abs(recent[i].ratio - a.ratio) > 0.04) {
        const m = el("span", "mk recent"); m.style.left = pos(recent[i].ratio); m.title = "최근 30일"; tr.appendChild(m);
      }
      g.append(ends, tr);
      let msg = "아직 기록이 없어요.";
      if (a.ratio != null) {
        if (a.ratio >= 0.6) msg = `${lensById[a.left].name} 쪽 · ${LENS_TOOLS[a.left].lean}이에요.`;
        else if (a.ratio <= 0.4) msg = `${lensById[a.right].name} 쪽 · ${LENS_TOOLS[a.right].lean}이에요.`;
        else msg = "두 방향 사이에서 균형을 잡고 있어요.";
      }
      g.appendChild(el("p", null, msg));
      map.appendChild(g);
    });
    if (all.some(a => a.total)) {
      const lg = el("div", "legend");
      const s1 = el("span"); s1.append(el("i"), document.createTextNode("지금까지 전체"));
      const s2 = el("span"); s2.append(el("i", "r"), document.createTextNode("최근 30일 (달라졌을 때만)"));
      lg.append(s1, s2); map.appendChild(lg);
    }

    // 막대
    const st = L.lensStats(notes, LENSES.map(l => l.id));
    const bars = $("bars"); bars.textContent = "";
    const max = Math.max(1, ...LENSES.map(l => st[l.id]));
    LENSES.forEach(l => {
      const b = colorVar(el("div", "bar"), l.id);
      const tr = el("div", "track"), f = el("div", "fill"); f.style.width = `${(st[l.id] / max) * 100}%`; tr.appendChild(f);
      b.append(el("span", null, l.name), tr, el("span", "n", String(st[l.id])));
      bars.appendChild(b);
    });
  }
  $("calPrev").onclick = () => { S.cal.m--; if (S.cal.m < 1) { S.cal.m = 12; S.cal.y--; } renderMe(); };
  $("calNext").onclick = () => { S.cal.m++; if (S.cal.m > 12) { S.cal.m = 1; S.cal.y++; } renderMe(); };

  function renderAxes() {
    const box = $("axes"); box.textContent = "";
    AXES.forEach((a, i) => {
      const sec = el("div", "axis");
      sec.append(el("h3", null, `${["①", "②", "③"][i]} ${a.title}`), el("p", "story", a.story));
      const pair = el("div", "pair");
      a.pair.forEach(id => {
        const l = lensById[id];
        const c = colorVar(el("div", "lens-card"), id);
        const nm = el("div"); nm.append(el("span", "nm", l.name), document.createTextNode(" "), el("span", "pl", l.pole));
        const dl = el("dl");
        dl.append(el("dt", null, "다루는 것"), el("dd", null, l.covers), el("dt", null, "다루지 않음"), el("dd", null, l.avoids));
        c.append(nm, el("div", "who", l.voices), el("p", "ask", l.ask), dl);
        pair.appendChild(c);
      });
      sec.appendChild(pair); box.appendChild(sec);
    });
  }

  /* ================= 카드 이미지 ================= */
  const CARD_COLORS = { change: "#b4532a", govern: "#3d6a8e", overcome: "#a8742a", lessen: "#6b5b95", together: "#3f7d5a", free: "#2f8486" };
  async function makeCard(c) {
    const W = 1080, H = 1350, P = 96;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    try { await Promise.all([document.fonts.load("700 40px 'Noto Serif KR'"), document.fonts.load("400 40px 'Noto Serif KR'"), document.fonts.load("600 30px 'Gothic A1'")]); } catch (e) {}
    const SERIF = "'Noto Serif KR', serif", SANS = "'Gothic A1', sans-serif";
    const lc = CARD_COLORS[c.lensId] || "#24211d";
    const measure = s => g.measureText(s).width;
    g.fillStyle = "#f5f2ec"; g.fillRect(0, 0, W, H);
    g.fillStyle = lc; g.fillRect(0, 0, W, 14);
    g.textBaseline = "top";
    let y = P + 20;
    g.fillStyle = "#9c958a"; g.font = `600 30px ${SANS}`; g.fillText(`여섯 시선 · ${prettyDate(c.date)}`, P, y); y += 70;
    g.fillStyle = "#24211d"; g.font = `700 92px ${SERIF}`; g.fillText(c.keyword || "나의 시선", P, y); y += 126;
    if (c.worry) { g.fillStyle = "#6e675d"; g.font = `400 36px ${SERIF}`; L.wrapLines(c.worry, W - P * 2, measure, 2).forEach(s => { g.fillText(s, P, y); y += 54; }); y += 26; }
    if (c.lensId && c.lensLine) {
      g.fillStyle = lc; g.font = `600 30px ${SANS}`; g.fillText(`${lensById[c.lensId].name} · ${lensById[c.lensId].who}`, P, y); y += 50;
      g.fillStyle = "#24211d"; g.font = `400 40px ${SERIF}`;
      L.wrapLines(`“${c.lensLine}”`, W - P * 2, measure, 2).forEach(s => { g.fillText(s, P, y); y += 60; }); y += 30;
    }
    g.strokeStyle = "#e0d9cc"; g.lineWidth = 2; g.beginPath(); g.moveTo(P, y); g.lineTo(W - P, y); g.stroke(); y += 40;
    g.fillStyle = "#9c958a"; g.font = `600 30px ${SANS}`; g.fillText("나의 시선", P, y); y += 56;
    if (c.title) { g.fillStyle = "#24211d"; g.font = `700 44px ${SERIF}`; L.wrapLines(c.title, W - P * 2, measure, 2).forEach(s => { g.fillText(s, P, y); y += 64; }); y += 10; }
    // 남은 칸에 맞춰 본문 크기를 고름 (짧으면 크게)
    const room = H - P - 70 - y;
    let size = 44, lines;
    for (; size >= 32; size -= 2) {
      g.font = `400 ${size}px ${SERIF}`;
      lines = L.wrapLines(String(c.text).trim(), W - P * 2, measure);
      if (lines.length * size * 1.6 <= room) break;
    }
    g.font = `400 ${size}px ${SERIF}`; g.fillStyle = "#24211d";
    const maxLines = Math.max(2, Math.floor(room / (size * 1.6)));
    L.wrapLines(String(c.text).trim(), W - P * 2, measure, maxLines).forEach(s => { g.fillText(s, P, y); y += size * 1.6; });
    g.fillStyle = "#9c958a"; g.font = `600 26px ${SANS}`; g.textAlign = "right";
    g.fillText("하나의 고민, 여섯 개의 생각", W - P, H - P + 10);
    return new Promise(res => cv.toBlob(res, "image/png"));
  }

  let cardUrl = null, cardBlob = null, making = false;
  async function openCard(c, btn) {
    if (making) return;
    making = true;
    const label = btn && btn.textContent;
    if (btn) { btn.textContent = "만드는 중…"; btn.disabled = true; }
    try { cardBlob = await makeCard(c); }
    finally { making = false; if (btn) { btn.textContent = label; btn.disabled = false; } }
    if (!cardBlob) return;
    if (cardUrl) URL.revokeObjectURL(cardUrl);
    cardUrl = URL.createObjectURL(cardBlob);
    $("cardImg").src = cardUrl; $("dlBtn").href = cardUrl;
    $("dlBtn").download = `여섯시선_${c.date}_${(c.keyword || "글").replace(/[\\/:*?"<>|]/g, "")}.png`;
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([cardBlob], "card.png", { type: "image/png" })] })); } catch (e) {}
    $("shareBtn").hidden = !canShare;
    $("dlgCard").showModal();
  }
  $("shareBtn").onclick = async () => {
    try { await navigator.share({ files: [new File([cardBlob], $("dlBtn").download, { type: "image/png" })] }); } catch (e) {}
  };

  /* ================= 탭 · 창 ================= */
  function showTab(v) {
    document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", String(x.dataset.v === v)));
    ["today", "write", "drawer", "me"].forEach(k => { $("v-" + k).hidden = k !== v; });
    if (v === "today") renderToday();
    if (v === "write") renderEditor();
    if (v === "drawer") renderDrawer();
    if (v === "me") renderMe();
    scrollTo(0, 0);
  }
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.v));
  document.querySelectorAll("[data-premium]").forEach(b => b.onclick = () => $("dlgPremium").showModal());
  document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => {
    if (e.target === d || e.target.closest("[data-close]")) d.close();
  }));

  renderToday(); renderAxes();
})();
