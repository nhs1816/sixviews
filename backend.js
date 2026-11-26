/* RAW 광장 서버 연결 — 같은 모양의 두 가지
   - supabaseBackend(config): 실제 서버 (Supabase 익명 로그인 + Postgres, 규칙은 supabase/schema.sql)
   - mockBackend(): 시험용 (이 브라우저 안에만 저장, 주소에 ?mock=1)
   글(post) 모양: { id, uid, penName, topicId, keyword, worry, title, lens, against, text,
                    createdAt(ms), likeCount, commentCount, reportCount, hidden }            */

export const PAGE = 8;
const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const POST_FIELDS = ["topicId", "keyword", "worry", "title", "lens", "against", "text"];
const cleanPost = p => Object.fromEntries(POST_FIELDS.map(k => [k, p[k] == null ? (k === "text" || k === "title" || k === "keyword" || k === "worry" ? "" : null) : p[k]]));

/* ================= Supabase ================= */
export async function supabaseBackend(config) {
  const { createClient } = await import(SDK);
  const sb = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "raw-auth" } });
  const ok = r => { if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; } return r.data; };

  let { data: { session } } = await sb.auth.getSession();
  if (!session) session = ok(await sb.auth.signInAnonymously()).session;
  const uid = session.user.id;
  let profile = null, admin = false, savedCache = null;

  const toPost = r => ({ id: r.id, uid: r.user_id, penName: r.pen_name, topicId: r.topic_id, keyword: r.keyword, worry: r.worry,
    title: r.title, lens: r.lens, against: r.against, text: r.body, createdAt: Date.parse(r.created_at),
    likeCount: r.like_count, commentCount: r.comment_count, reportCount: r.report_count, hidden: r.hidden });
  const toRow = p => { const c = cleanPost(p); return { topic_id: c.topicId, keyword: c.keyword, worry: c.worry, title: c.title, lens: c.lens, against: c.against, body: c.text }; };

  async function loadProfile() {
    const p = ok(await sb.from("profiles").select("pen_name, age_band, gender").eq("id", uid).maybeSingle());
    profile = p ? { penName: p.pen_name, ageBand: p.age_band, gender: p.gender } : null;
    const a = await sb.from("admins").select("user_id").eq("user_id", uid).maybeSingle();
    admin = !a.error && !!a.data;
    return profile;
  }
  await loadProfile();

  return {
    kind: "supabase", uid,
    profile: () => profile, isAdmin: () => admin,

    async createProfile({ penName, ageBand, gender }) {
      const r = await sb.from("profiles").insert({ id: uid, pen_name: penName.trim(), age_band: ageBand, gender });
      if (r.error) throw new Error(r.error.code === "23505" ? "taken" : r.error.message);
      return loadProfile();
    },
    async updateProfile({ ageBand, gender }) {
      ok(await sb.from("profiles").update({ age_band: ageBand, gender }).eq("id", uid));
      return loadProfile();
    },
    async deleteAccount() {
      ok(await sb.rpc("delete_me"));
      profile = null; savedCache = null;
      await sb.auth.signOut();
    },

    async share(p) { return ok(await sb.from("posts").insert(toRow(p)).select("id").single()).id; },
    async updatePost(id, p) {
      const r = toRow(p);
      const rows = ok(await sb.from("posts").update({ title: r.title, body: r.body, lens: r.lens, against: r.against }).eq("id", id).select("id"));
      if (!rows.length) throw new Error("gone");
    },
    async unshare(id) { ok(await sb.from("posts").delete().eq("id", id)); savedCache && savedCache.delete(id); },

    async feed(mode, cursor) {
      if (mode === "mine") {
        return { items: ok(await sb.from("posts").select("*").eq("user_id", uid).order("created_at", { ascending: false })).map(toPost), next: null };
      }
      if (mode === "saved") {
        const rows = ok(await sb.from("saves").select("created_at, posts(*)").eq("user_id", uid).order("created_at", { ascending: false }));
        savedCache = new Set(rows.filter(r => r.posts).map(r => r.posts.id));
        return { items: rows.filter(r => r.posts).map(r => toPost(r.posts)), next: null };
      }
      let q = sb.from("posts").select("*").order("created_at", { ascending: false }).limit(PAGE);
      if (cursor) q = q.lt("created_at", cursor);
      const rows = ok(await q);
      return { items: rows.map(toPost), next: rows.length === PAGE ? rows[rows.length - 1].created_at : null };
    },
    async liked(ids) {
      if (!ids.length || !profile) return new Set();
      return new Set(ok(await sb.from("likes").select("post_id").eq("user_id", uid).in("post_id", ids)).map(r => r.post_id));
    },
    async saved() {
      if (!profile) return new Set();
      if (!savedCache) savedCache = new Set(ok(await sb.from("saves").select("post_id").eq("user_id", uid)).map(r => r.post_id));
      return savedCache;
    },
    async setLike(id, on) {
      if (on) { const r = await sb.from("likes").insert({ post_id: id }); if (r.error && r.error.code !== "23505") throw new Error(r.error.message); }
      else ok(await sb.from("likes").delete().eq("post_id", id).eq("user_id", uid));
    },
    async setSave(id, on) {
      if (on) { const r = await sb.from("saves").insert({ post_id: id }); if (r.error && r.error.code !== "23505") throw new Error(r.error.message); }
      else ok(await sb.from("saves").delete().eq("post_id", id).eq("user_id", uid));
      const s = await this.saved(); on ? s.add(id) : s.delete(id);
    },
    async comments(id) {
      return ok(await sb.from("comments").select("id, user_id, pen_name, body, created_at").eq("post_id", id).order("created_at", { ascending: true }))
        .map(c => ({ id: c.id, uid: c.user_id, penName: c.pen_name, text: c.body, createdAt: Date.parse(c.created_at) }));
    },
    async addComment(id, text) { ok(await sb.from("comments").insert({ post_id: id, body: text })); },
    async deleteComment(id, cid) { ok(await sb.from("comments").delete().eq("id", cid)); },
    async report(id, reason) {
      const r = await sb.from("reports").insert({ post_id: id, reason });
      if (r.error) throw new Error(r.error.code === "23505" ? "already" : r.error.message);
    },
    async adminHide(id, hidden) { ok(await sb.rpc("admin_set_hidden", { p: id, h: hidden })); },
    async adminDelete(id) { ok(await sb.from("posts").delete().eq("id", id)); },
  };
}

/* ================= 시험용 (브라우저 안에만 저장) ================= */
export async function mockBackend(seed) {
  const KEY = "raw:mock";
  let uid; try { uid = localStorage.getItem(KEY + ":uid"); if (!uid) { uid = "me" + Math.random().toString(36).slice(2, 8); localStorage.setItem(KEY + ":uid", uid); } } catch (e) { uid = "me"; }
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  let D = load() || { users: {}, names: {}, posts: {}, saves: {}, reports: {}, admins: {} };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} };
  if (!Object.keys(D.posts).length && seed) { seed(D); save(); }
  const wait = () => new Promise(r => setTimeout(r, 120));
  const pub = p => { const { likes, comments, ...rest } = p; return Object.assign({}, rest); };
  const need = () => { if (!D.users[uid]) throw new Error("no-profile"); };

  return {
    kind: "mock", uid,
    profile: () => D.users[uid] || null, isAdmin: () => !!D.admins[uid],
    async createProfile({ penName, ageBand, gender }) {
      await wait();
      const key = penName.trim().toLowerCase();
      if (D.names[key] && D.names[key] !== uid) throw new Error("taken");
      D.names[key] = uid; D.users[uid] = { penName: penName.trim(), ageBand, gender, createdAt: Date.now() }; save();
      return D.users[uid];
    },
    async updateProfile({ ageBand, gender }) { await wait(); Object.assign(D.users[uid], { ageBand, gender }); save(); return D.users[uid]; },
    async deleteAccount() {
      await wait();
      Object.keys(D.posts).forEach(id => { if (D.posts[id].uid === uid) delete D.posts[id]; });
      const p = D.users[uid]; if (p) delete D.names[p.penName.toLowerCase()];
      delete D.users[uid]; delete D.saves[uid]; save();
    },
    async share(p) {
      await wait(); need();
      const id = "p" + Date.now().toString(36);
      D.posts[id] = Object.assign(cleanPost(p), { id, uid, penName: D.users[uid].penName, createdAt: Date.now(), likeCount: 0, commentCount: 0, reportCount: 0, hidden: false, likes: {}, comments: [] });
      save(); return id;
    },
    async updatePost(id, p) { await wait(); const c = cleanPost(p); Object.assign(D.posts[id], { title: c.title, text: c.text, lens: c.lens, against: c.against }); save(); },
    async unshare(id) { await wait(); delete D.posts[id]; save(); },
    async feed(mode, cursor) {
      await wait();
      let all = Object.values(D.posts).sort((a, b) => b.createdAt - a.createdAt);
      if (mode === "mine") return { items: all.filter(p => p.uid === uid).map(pub), next: null };
      if (mode === "saved") {
        const s = D.saves[uid] || {};
        return { items: Object.keys(s).sort((a, b) => s[b] - s[a]).map(id => D.posts[id]).filter(Boolean).map(pub), next: null };
      }
      const start = cursor || 0;
      const items = all.slice(start, start + PAGE).map(pub);
      return { items, next: start + PAGE < all.length ? start + PAGE : null };
    },
    async liked(ids) { return new Set(ids.filter(id => D.posts[id] && D.posts[id].likes[uid])); },
    async saved() { return new Set(Object.keys(D.saves[uid] || {})); },
    async setLike(id, on) {
      await wait(); need(); const p = D.posts[id]; if (!p) return;
      if (on && !p.likes[uid]) { p.likes[uid] = 1; p.likeCount++; }
      if (!on && p.likes[uid]) { delete p.likes[uid]; p.likeCount--; }
      save();
    },
    async setSave(id, on) { await wait(); need(); D.saves[uid] = D.saves[uid] || {}; if (on) D.saves[uid][id] = Date.now(); else delete D.saves[uid][id]; save(); },
    async comments(id) { await wait(); return (D.posts[id] ? D.posts[id].comments : []).slice(); },
    async addComment(id, text) {
      await wait(); need(); const p = D.posts[id];
      p.comments.push({ id: "c" + Date.now().toString(36), uid, penName: D.users[uid].penName, text, createdAt: Date.now() });
      p.commentCount++; save();
    },
    async deleteComment(id, cid) { await wait(); const p = D.posts[id]; p.comments = p.comments.filter(c => c.id !== cid); p.commentCount = p.comments.length; save(); },
    async report(id, reason) {
      await wait(); need(); const k = `${id}_${uid}`;
      if (D.reports[k]) throw new Error("already");
      D.reports[k] = { reason, at: Date.now() }; D.posts[id].reportCount++; save();
    },
    async adminHide(id, hidden) { D.posts[id].hidden = hidden; save(); },
    async adminDelete(id) { delete D.posts[id]; save(); },
  };
}
