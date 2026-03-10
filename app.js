/* app.js - Graduation Checker (robust full version) */
"use strict";

const App = (() => {
  const STORAGE_KEY = "grad_checker_split_v1";

  const CATEGORIES = [
    "校定必修",
    "系必修",
    "專業選修",
    "通識核心",
    "通識博雅",
    "體育",
    "其他",
  ];

  // --------------------------
  // Safe utilities
  // --------------------------
  const $ = (id) => document.getElementById(id);

  function safeClone(obj) {
    // structuredClone is not supported in some old browsers
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  function safeUUID() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    // fallback
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // --------------------------
  // Default state
  // --------------------------
  const defaultState = {
    courses: [],
    requirements: {
      totalCredits: 128,
      hoursMin: 18,
      coreMin: 0,
      englishType: "TOEIC",
      englishRule: {
        toeicMin: 650,
        geptLevelMin: "中級",
        campusMin: 60,
        courseAltMinCount: 1,
      },

      deptRule: {
        enabled: false,

        requiredDesignated: [],
        requiredDesignatedMin: 3,

        electiveRule: {
          enabled: false,
          fields: [],
          sameFieldMin: 2,
          crossFieldMin: 3,
        },

        outsideDeptMin: 2,
        interProgramMin: 1,
      },
    },

    user: {
      hours: 0,
      englishType: "TOEIC",
      englishData: {
        toeicScore: 0,
        geptLevel: "初級",
        campusScore: 0,
        courseAltDoneCount: 0,
      },
    },
  };

  let state = loadState();

  // --------------------------
  // Storage
  // --------------------------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return safeClone(defaultState);

      const s = JSON.parse(raw);

      const merged = {
        ...safeClone(defaultState),
        ...s,

        requirements: {
          ...safeClone(defaultState.requirements),
          ...(s.requirements || {}),

          englishRule: {
            ...safeClone(defaultState.requirements.englishRule),
            ...((s.requirements || {}).englishRule || {}),
          },

          deptRule: {
            ...safeClone(defaultState.requirements.deptRule),
            ...((s.requirements || {}).deptRule || {}),

            electiveRule: {
              ...safeClone(defaultState.requirements.deptRule.electiveRule),
              ...((s.requirements || {}).deptRule?.electiveRule || {}),
            },
          },
        },

        user: {
          ...safeClone(defaultState.user),
          ...(s.user || {}),
          englishData: {
            ...safeClone(defaultState.user.englishData),
            ...((s.user || {}).englishData || {}),
          },
        },
      };

      if (!Array.isArray(merged.requirements.deptRule.electiveRule.fields)) {
        merged.requirements.deptRule.electiveRule.fields = [];
      }

      return merged;
    } catch {
      return safeClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // --------------------------
  // Helpers
  // --------------------------
  function normalizeCategory(cat) {
    const t = String(cat || "").trim();
    if (!t) return "其他";

    const map = new Map([
      ["必修", "系必修"],
      ["選修", "專業選修"],
      ["通識", "通識博雅"],
      ["通識(核心)", "通識核心"],
      ["通識(博雅)", "通識博雅"],
      ["校必修", "校定必修"],
    ]);

    if (map.has(t)) return map.get(t);
    if (CATEGORIES.includes(t)) return t;
    return "其他";
  }

  function parsePassed(v) {
    const t = String(v || "").trim().toLowerCase();
    if (["true", "1", "y", "yes", "通過", "已通過", "pass", "passed"].includes(t)) return true;
    if (["false", "0", "n", "no", "未通過", "修課中", "未過", "fail", "failed", "inprogress"].includes(t))
      return false;
    return false;
  }

  // --------------------------
  // Credits calculation
  // --------------------------
  function calcCredits() {
    const passed = state.courses.filter((c) => c.passed);
    const total = passed.reduce((a, c) => a + (Number(c.credits) || 0), 0);

    const byCat = {};
    for (const c of passed) {
      byCat[c.cat] = (byCat[c.cat] || 0) + (Number(c.credits) || 0);
    }

    const core = (byCat["校定必修"] || 0) + (byCat["系必修"] || 0);
    return { total, byCat, core };
  }

  // --------------------------
  // Field selector show/hide
  // --------------------------
 function updateFieldSelector() {
  // ✅ 每次都重新讀 localStorage，避免切頁後 state 還是舊的
  state = loadState();

  const fieldRow = $("fieldRow");
  const sel = $("courseField");
  const cat = $("courseCat")?.value;

  if (!fieldRow || !sel) return;

  const dept = state.requirements.deptRule || {};
  const elective = dept.electiveRule || {};
  const fields = elective.fields || [];

  
  const shouldShow = (cat === "專業選修") && (fields.length > 0);

  if (shouldShow) {
    fieldRow.style.display = "block";

    sel.innerHTML =
      `<option value="">請選擇領域</option>` +
      fields.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
  } else {
    fieldRow.style.display = "none";
    sel.innerHTML = `<option value="">請選擇領域</option>`;
  }
}

  // --------------------------
  // Remove course
  // --------------------------
  function removeCourseById(id) {
    state.courses = state.courses.filter((c) => c.id !== id);
    saveState();
    renderCredits();
    renderCourseCards(state.courses);
  }

  // --------------------------
  // Credits page init
  // --------------------------
  function initCreditsPage() {
    state = loadState();

    const catSel = $("courseCat");
    if (catSel) {
      catSel.innerHTML = CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      catSel.addEventListener("change", updateFieldSelector);
    }

    const addBtn = $("addCourseBtn");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const nameEl = $("courseName");
        const catEl = $("courseCat");
        const creditsEl = $("courseCredits");
        const passedEl = $("coursePassed");

        const name = (nameEl?.value || "").trim();
        const cat = catEl?.value || "其他";
        const credits = Number(creditsEl?.value || 0);
        const passed = (passedEl?.value || "false") === "true";

        if (!name) {
          alert("請輸入課名");
          return;
        }
        if (credits < 0) {
          alert("學分不可為負");
          return;
        }

        const isOutsideDept = $("courseOutsideDept")?.checked || false;

        let fieldId = "";
        const needField =
          !!state.requirements.deptRule?.enabled &&
          !!state.requirements.deptRule?.electiveRule?.enabled &&
          cat === "專業選修";

        if (needField) {
          fieldId = $("courseField")?.value || "";
          if (!fieldId) {
            alert("請選擇專業選修領域");
            return;
          }
        }

        state.courses.unshift({
          id: safeUUID(),
          name,
          cat,
          credits: isFinite(credits) ? credits : 0,
          passed,
          fieldId,
          isOutsideDept,
        });

        if (nameEl) nameEl.value = "";
        const outEl = $("courseOutsideDept");
        if (outEl) outEl.checked = false;
        const fieldEl = $("courseField");
        if (fieldEl) fieldEl.value = "";

        saveState();
        renderCredits();
        renderCourseCards(state.courses);
        updateFieldSelector();
      });
    }

    $("seedBtn")?.addEventListener("click", () => {
      state.courses = [
        { id: safeUUID(), name: "國文", cat: "校定必修", credits: 2, passed: true, fieldId: "", isOutsideDept: false },
        {
          id: safeUUID(),
          name: "日語會話（二）",
          cat: "系必修",
          credits: 2,
          passed: true,
          fieldId: "",
          isOutsideDept: false,
        },
        {
          id: safeUUID(),
          name: "日本文化概論",
          cat: "通識博雅",
          credits: 2,
          passed: true,
          fieldId: "",
          isOutsideDept: false,
        },
        {
          id: safeUUID(),
          name: "通識核心：思辨與表達",
          cat: "通識核心",
          credits: 2,
          passed: true,
          fieldId: "",
          isOutsideDept: false,
        },
        { id: safeUUID(), name: "體育（二）", cat: "體育", credits: 0, passed: true, fieldId: "", isOutsideDept: false },
        {
          id: safeUUID(),
          name: "專業選修：日語聽解",
          cat: "專業選修",
          credits: 2,
          passed: false,
          fieldId: "",
          isOutsideDept: false,
        },
      ];
      saveState();
      renderCredits();
      renderCourseCards(state.courses);
      updateFieldSelector();
    });

    $("clearBtn")?.addEventListener("click", () => {
      if (confirm("確定要清空全部資料嗎？")) {
        state = safeClone(defaultState);
        saveState();
        renderCredits();
        renderCourseCards(state.courses);
        updateFieldSelector();
      }
    });

    $("importCsvBtn")?.addEventListener("click", () => importCsv(false));
    $("appendCsvBtn")?.addEventListener("click", () => importCsv(true));

    renderCredits();
    renderCourseCards(state.courses);
    updateFieldSelector();
  }

  // --------------------------
  // CSV import
  // --------------------------
  function splitCsvLine(line) {
    const out = [];
    let cur = "",
      inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function importCsv(append) {
    const input = $("csvInput");
    const text = (input?.value || "").trim();
    if (!text) {
      alert("請先貼上 CSV 內容");
      return;
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const first = (lines[0] || "").toLowerCase();
    const startIdx = first.includes("課名") || first.includes("name") ? 1 : 0;

    const imported = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);

      const name = (cols[0] || "").trim();
      const cat = normalizeCategory(cols[1]);
      const credits = Number((cols[2] || "").trim() || 0);
      const passed = parsePassed(cols[3]);

      if (!name) continue;

      imported.push({
        id: safeUUID(),
        name,
        cat,
        credits: isFinite(credits) ? credits : 0,
        passed,
        fieldId: "",
        isOutsideDept: false,
      });
    }

    if (imported.length === 0) {
      alert("沒有成功匯入任何課程（請檢查格式：課名,分類,學分,狀態）");
      return;
    }

    state.courses = append ? [...imported, ...state.courses] : imported;

    saveState();
    renderCredits();
    renderCourseCards(state.courses);
    alert(`匯入完成：${imported.length} 筆`);
  }

  // --------------------------
  // Render credits table + KPI
  // --------------------------
  function fieldNameById(fieldId) {
    const fields = state.requirements.deptRule?.electiveRule?.fields || [];
    const hit = fields.find((f) => String(f.id) === String(fieldId));
    return hit ? hit.name : "";
  }

  function renderCredits() {
    const tbody = $("courseTable");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!Array.isArray(state.courses) || state.courses.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" class="muted">尚未新增課程</td>`;
      tbody.appendChild(tr);
    } else {
      for (const c of state.courses) {
        const tr = document.createElement("tr");

        const fieldName = c.cat === "專業選修" ? fieldNameById(c.fieldId) : "";
        const extra = [fieldName ? `領域：${fieldName}` : "", c.isOutsideDept ? "外系" : ""]
          .filter(Boolean)
          .join(" / ");

        tr.innerHTML = `
          <td>${escapeHtml(c.name)}</td>
          <td><span class="tag">${escapeHtml(c.cat)}</span></td>
          <td>${Number(c.credits) || 0}</td>
          <td>${c.passed ? `<span class="pill ok">通過</span>` : `<span class="pill bad">未通過/修課中</span>`}</td>
          <td class="muted">${extra ? escapeHtml(extra) : "-"}</td>
          <td><button class="danger" data-del="${escapeHtml(c.id)}">刪除</button></td>
        `;
        tbody.appendChild(tr);
      }

      tbody.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => removeCourseById(btn.dataset.del));
      });
    }

    const { total, byCat } = calcCredits();
    const reqTotal = Number(state.requirements.totalCredits || 0);

    const kpi = $("creditKpi");
    if (kpi) {
      kpi.innerHTML = `
        <div class="pill ${reqTotal > 0 && total >= reqTotal ? "ok" : "bad"}">總學分：${total} / ${reqTotal || "未設定"}</div>
        <div class="pill">校定必修：${byCat["校定必修"] || 0}</div>
        <div class="pill">系必修：${byCat["系必修"] || 0}</div>
        <div class="pill">專業選修：${byCat["專業選修"] || 0}</div>
        <div class="pill">通識核心：${byCat["通識核心"] || 0}</div>
        <div class="pill">通識博雅：${byCat["通識博雅"] || 0}</div>
      `;
    }

    const pct = reqTotal > 0 ? Math.min(100, Math.round((total / reqTotal) * 100)) : 0;
    const bar = $("totalBar");
    if (bar) bar.style.width = pct + "%";

    const catStats = $("catStats");
    if (catStats) {
      const entries = Object.entries(byCat);
      catStats.innerHTML = entries.length
        ? entries.map(([k, v]) => `<div class="muted">• ${escapeHtml(k)}：${v} 學分</div>`).join("")
        : `<div class="muted">尚無「通過」的課程可統計</div>`;
    }
  }

  // --------------------------
  // Mobile cards
  // --------------------------
  function renderCourseCards(courses) {
    const wrap = $("courseCards");
    if (!wrap) return;

    if (!Array.isArray(courses) || courses.length === 0) {
      wrap.innerHTML = `<div class="muted">尚未新增課程</div>`;
      return;
    }

    wrap.innerHTML = courses
      .map((c) => {
        const statusText = c.passed ? "通過" : "未通過 / 修課中";
        const statusClass = c.passed ? "ok" : "bad";
        const fieldName = c.cat === "專業選修" ? fieldNameById(c.fieldId) : "";

        return `
          <div class="courseCard" data-id="${escapeHtml(c.id)}">
            <h3 class="courseTitle">${escapeHtml(c.name)}</h3>

            <div class="courseMeta">
              <div><b>分類：</b>${escapeHtml(c.cat)}</div>
              <div><b>學分：</b>${escapeHtml(String(Number(c.credits) || 0))}</div>
              ${fieldName ? `<div><b>領域：</b>${escapeHtml(fieldName)}</div>` : ""}
              ${c.isOutsideDept ? `<div><b>外系選修：</b>是</div>` : ""}
            </div>

            <div class="badges">
              <span class="badgePill">${escapeHtml(c.cat)}</span>
              <span class="badgePill ${statusClass}">${escapeHtml(statusText)}</span>
            </div>

            <div class="cardActions">
              <button class="danger" data-action="delete">刪除</button>
            </div>
          </div>
        `;
      })
      .join("");

    wrap.onclick = (e) => {
      const btn = e.target.closest("button[data-action='delete']");
      if (!btn) return;

      const card = e.target.closest(".courseCard");
      if (!card) return;

      removeCourseById(card.dataset.id);
    };
  }

    // --------------------------
  // Schedule page
  // --------------------------
  const SCHEDULE_DAYS = ["一", "二", "三", "四", "五", "六", "日"];

  function initSchedulePage() {
    state = loadState();

    $("addScheduleBtn")?.addEventListener("click", () => {
      const name = $("scheduleName")?.value.trim();
      const day = $("scheduleDay")?.value;
      const start = Number($("scheduleStart")?.value || 0);
      const end = Number($("scheduleEnd")?.value || 0);
      const room = $("scheduleRoom")?.value.trim() || "";
      const teacher = $("scheduleTeacher")?.value.trim() || "";

      if (!name) {
        alert("請輸入課名");
        return;
      }

      if (!day) {
        alert("請選擇星期");
        return;
      }

      if (start <= 0 || end <= 0) {
        alert("請選擇正確節次");
        return;
      }

      if (start > end) {
        alert("開始節次不可大於結束節次");
        return;
      }

      state.schedule.unshift({
        id: crypto.randomUUID(),
        name,
        day,
        start,
        end,
        room,
        teacher
      });

      saveState();
      clearScheduleForm();
      renderSchedulePage();
    });

    $("seedScheduleBtn")?.addEventListener("click", () => {
      state.schedule = [
        {
          id: crypto.randomUUID(),
          name: "資料庫系統",
          day: "三",
          start: 3,
          end: 4,
          room: "M203",
          teacher: "王老師"
        },
        {
          id: crypto.randomUUID(),
          name: "經濟學",
          day: "二",
          start: 3,
          end: 4,
          room: "B101",
          teacher: "陳老師"
        },
        {
          id: crypto.randomUUID(),
          name: "英文閱讀",
          day: "一",
          start: 1,
          end: 2,
          room: "A305",
          teacher: "林老師"
        }
      ];

      saveState();
      renderSchedulePage();
    });

    $("clearScheduleBtn")?.addEventListener("click", () => {
      if (!confirm("確定要清空整份課表嗎？")) return;
      state.schedule = [];
      saveState();
      renderSchedulePage();
    });

    renderSchedulePage();
  }

  function clearScheduleForm() {
    if ($("scheduleName")) $("scheduleName").value = "";
    if ($("scheduleDay")) $("scheduleDay").value = "一";
    if ($("scheduleStart")) $("scheduleStart").value = "1";
    if ($("scheduleEnd")) $("scheduleEnd").value = "1";
    if ($("scheduleRoom")) $("scheduleRoom").value = "";
    if ($("scheduleTeacher")) $("scheduleTeacher").value = "";
  }

  function removeScheduleById(id) {
    state.schedule = state.schedule.filter(item => item.id !== id);
    saveState();
    renderSchedulePage();
  }

  function renderSchedulePage() {
    renderScheduleKpi();
    renderScheduleTable();
    renderScheduleList();
  }

  function renderScheduleKpi() {
    const kpi = $("scheduleKpi");
    const summary = $("scheduleSummary");
    if (!kpi || !summary) return;

    const totalCourses = state.schedule.length;

    const byDay = {};
    for (const d of SCHEDULE_DAYS) byDay[d] = 0;

    for (const item of state.schedule) {
      if (byDay[item.day] !== undefined) {
        byDay[item.day] += 1;
      }
    }

    kpi.innerHTML = `
      <div class="pill">本學期課程：${totalCourses} 門</div>
    `;

    const usedDays = SCHEDULE_DAYS.filter(d => byDay[d] > 0);

    if (totalCourses === 0) {
      summary.innerHTML = `<div class="section-note">目前尚未加入任何課表課程。</div>`;
      return;
    }

    summary.innerHTML = `
      <div class="section-note">有課的日期：${usedDays.length ? usedDays.join("、") : "無"}</div>
      ${SCHEDULE_DAYS.map(d => `<div class="section-note">${d}：${byDay[d]} 門</div>`).join("")}
    `;
  }

  function renderScheduleTable() {
    const tbody = $("scheduleTableBody");
    if (!tbody) return;

    const cellMap = {};
    const rows = [];

    for (let period = 1; period <= 13; period++) {
      rows.push(`<tr>
        <td>${period}</td>
        <td data-day="一" data-period="${period}"></td>
        <td data-day="二" data-period="${period}"></td>
        <td data-day="三" data-period="${period}"></td>
        <td data-day="四" data-period="${period}"></td>
        <td data-day="五" data-period="${period}"></td>
        <td data-day="六" data-period="${period}"></td>
        <td data-day="日" data-period="${period}"></td>
      </tr>`);
    }

    tbody.innerHTML = rows.join("");

    tbody.querySelectorAll("td[data-day][data-period]").forEach(td => {
      const key = `${td.dataset.day}-${td.dataset.period}`;
      cellMap[key] = td;
    });

    for (const item of state.schedule) {
      for (let p = item.start; p <= item.end; p++) {
        const key = `${item.day}-${p}`;
        const td = cellMap[key];
        if (!td) continue;

        const block = document.createElement("div");
        block.style.padding = "6px";
        block.style.borderRadius = "10px";
        block.style.background = "#f6f6f6";
        block.style.marginBottom = "6px";
        block.style.fontSize = "14px";
        block.style.lineHeight = "1.5";
        block.innerHTML = `
          <div style="font-weight:700;">${escapeHtml(item.name)}</div>
          ${item.room ? `<div>${escapeHtml(item.room)}</div>` : ""}
          ${item.teacher ? `<div>${escapeHtml(item.teacher)}</div>` : ""}
        `;
        td.appendChild(block);
      }
    }
  }

  function renderScheduleList() {
    const tbody = $("scheduleList");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!state.schedule || state.schedule.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" class="muted">尚未新增課表課程</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const item of state.schedule) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.day)}</td>
        <td>第 ${item.start} ~ ${item.end} 節</td>
        <td>${escapeHtml(item.room || "-")}</td>
        <td>${escapeHtml(item.teacher || "-")}</td>
        <td><button type="button" class="danger" data-del-schedule="${item.id}">刪除</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("[data-del-schedule]").forEach(btn => {
      btn.addEventListener("click", () => {
        removeScheduleById(btn.dataset.delSchedule);
      });
    });
  }

  // --------------------------
  // Requirements / English
  // --------------------------
  const GEPT_LEVELS = ["初級", "中級", "中高級", "高級", "優級"];

  function englishRuleUI(type) {
    const R = state.requirements.englishRule;

    if (type === "TOEIC") {
      return `
        <div class="row">
          <div>
            <label>TOEIC 最低分</label>
            <input id="ruleToeicMin" type="number" min="0" step="10" value="${Number(R.toeicMin || 0)}" />
          </div>
          <div class="notice">會用：你的 TOEIC 成績 ≥ 最低分 來判斷</div>
        </div>
      `;
    }

    if (type === "GEPT") {
      const opts = GEPT_LEVELS.map(
        (l) => `<option value="${l}" ${R.geptLevelMin === l ? "selected" : ""}>${l}</option>`
      ).join("");
      return `
        <div class="row">
          <div>
            <label>GEPT 最低級別</label>
            <select id="ruleGeptMin">${opts}</select>
          </div>
          <div class="notice">會用：你的 GEPT 級別 ≥ 最低級別 來判斷</div>
        </div>
      `;
    }

    if (type === "CAMPUS") {
      return `
        <div class="row">
          <div>
            <label>校內測驗最低分（例如 60）</label>
            <input id="ruleCampusMin" type="number" min="0" step="1" value="${Number(R.campusMin || 0)}" />
          </div>
          <div class="notice">會用：你的校內測驗分數 ≥ 最低分 來判斷</div>
        </div>
      `;
    }

    return `
      <div class="row">
        <div>
          <label>修課替代：需完成門數（例如 1）</label>
          <input id="ruleCourseMinCount" type="number" min="0" step="1" value="${Number(R.courseAltMinCount || 0)}" />
        </div>
        <div class="notice">會用：你完成的「替代課程門數」≥ 需求門數 來判斷</div>
      </div>
    `;
  }

  function englishUserUI(type) {
    const U = state.user.englishData;

    if (type === "TOEIC") {
      return `
        <label>你的 TOEIC 成績（沒有就填 0）</label>
        <input id="userToeicScore" type="number" min="0" step="5" value="${Number(U.toeicScore || 0)}" />
      `;
    }

    if (type === "GEPT") {
      const opts = GEPT_LEVELS.map(
        (l) => `<option value="${l}" ${U.geptLevel === l ? "selected" : ""}>${l}</option>`
      ).join("");
      return `
        <label>你的 GEPT 級別</label>
        <select id="userGeptLevel">${opts}</select>
      `;
    }

    if (type === "CAMPUS") {
      return `
        <label>你的校內測驗分數</label>
        <input id="userCampusScore" type="number" min="0" step="1" value="${Number(U.campusScore || 0)}" />
      `;
    }

    return `
      <label>你已完成的修課替代門數</label>
      <input id="userCourseAltDoneCount" type="number" min="0" step="1" value="${Number(U.courseAltDoneCount || 0)}" />
    `;
  }

  function englishCheck() {
    const type = state.requirements.englishType;
    const R = state.requirements.englishRule;
    const U = state.user.englishData;

    if (type === "TOEIC") {
      const ok = Number(U.toeicScore || 0) >= Number(R.toeicMin || 0);
      return { ok, msg: `${U.toeicScore || 0} / ${R.toeicMin || 0}` };
    }

    if (type === "GEPT") {
      const idxU = GEPT_LEVELS.indexOf(U.geptLevel || "初級");
      const idxR = GEPT_LEVELS.indexOf(R.geptLevelMin || "中級");
      const ok = idxU >= idxR;
      return { ok, msg: `${U.geptLevel || "初級"} / ${R.geptLevelMin || "中級"}` };
    }

    if (type === "CAMPUS") {
      const ok = Number(U.campusScore || 0) >= Number(R.campusMin || 0);
      return { ok, msg: `${U.campusScore || 0} / ${R.campusMin || 0}` };
    }

    const ok = Number(U.courseAltDoneCount || 0) >= Number(R.courseAltMinCount || 0);
    return { ok, msg: `${U.courseAltDoneCount || 0} / ${R.courseAltMinCount || 0} 門` };
  }

  function renderEnglishBoxes() {
    const ruleBox = $("englishRuleBox");
    const userBox = $("englishUserBox");
    const reqTypeEl = $("reqEnglishType");
    const userTypeEl = $("userEnglishType");

    if (!ruleBox || !userBox || !reqTypeEl || !userTypeEl) return;

    ruleBox.innerHTML = englishRuleUI(reqTypeEl.value);
    userBox.innerHTML = englishUserUI(userTypeEl.value);
  }

  // --------------------------
  // Dept rule UI (Requirements page)
  // --------------------------
  let deptUIInited = false;

  function renderDeptRuleUI() {
    const D = state.requirements?.deptRule;
    if (!D) return;

    const deptEnabled = $("deptEnabled");
    const deptOutsideMin = $("deptOutsideMin");
    const deptElectiveEnabled = $("deptElectiveEnabled");
    const deptSameFieldMin = $("deptSameFieldMin");
    const deptCrossFieldMin = $("deptCrossFieldMin");

    if (deptEnabled) deptEnabled.value = String(!!D.enabled);
    if (deptOutsideMin) deptOutsideMin.value = Number(D.outsideDeptMin ?? 2);

    if (deptElectiveEnabled) deptElectiveEnabled.value = String(!!D.electiveRule?.enabled);
    if (deptSameFieldMin) deptSameFieldMin.value = Number(D.electiveRule?.sameFieldMin ?? 2);
    if (deptCrossFieldMin) deptCrossFieldMin.value = Number(D.electiveRule?.crossFieldMin ?? 3);

    const tbody = $("fieldTable");
    if (!tbody) return;

    const fields = D.electiveRule?.fields || [];
    tbody.innerHTML = "";

    if (fields.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="muted" colspan="2">尚未新增領域</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const f of fields) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(f.name)}</td>
        <td><button type="button" class="danger" data-del-field="${escapeHtml(f.id)}">刪除</button></td>
      `;
      tbody.appendChild(tr);
    }
  }

  function initDeptRuleUI() {
    if (!$("saveDeptBtn")) return;

    if (!deptUIInited) {
      deptUIInited = true;

      const tbody = $("fieldTable");
      if (tbody) {
        tbody.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-del-field]");
          if (!btn) return;

          const id = btn.dataset.delField;
          state.requirements.deptRule.electiveRule.fields =
            (state.requirements.deptRule.electiveRule.fields || []).filter((x) => x.id !== id);

          saveState();
          renderDeptRuleUI();
          renderRequirements();
        });
      }

      $("addFieldBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        const input = $("newFieldName");
        const name = (input?.value || "").trim();
        if (!name) {
          alert("請輸入領域名稱");
          return;
        }

        const fields = state.requirements.deptRule.electiveRule.fields || [];
        if (fields.some((f) => f.name === name)) {
          alert("這個領域名稱已存在");
          return;
        }

        fields.push({ id: safeUUID(), name });
        state.requirements.deptRule.electiveRule.fields = fields;
        // 新增領域時自動啟用（避免你忘了開）
        state.requirements.deptRule.enabled = true;
        state.requirements.deptRule.electiveRule.enabled = true;

        // 同步把下拉選單 UI 顯示成啟用
        document.getElementById("deptEnabled").value = "true";
         document.getElementById("deptElectiveEnabled").value = "true";
        if (input) input.value = "";

        saveState();
        renderDeptRuleUI();
        renderRequirements();
      });

      $("clearFieldsBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (!confirm("確定要清空所有領域嗎？")) return;
        state.requirements.deptRule.electiveRule.fields = [];
        saveState();
        renderDeptRuleUI();
        renderRequirements();
      });

      $("saveDeptBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        const D = state.requirements.deptRule;

        D.enabled = $("deptEnabled")?.value === "true";
        D.outsideDeptMin = Number($("deptOutsideMin")?.value || 0);

        D.electiveRule.enabled = $("deptElectiveEnabled")?.value === "true";
        D.electiveRule.sameFieldMin = Number($("deptSameFieldMin")?.value || 0);
        D.electiveRule.crossFieldMin = Number($("deptCrossFieldMin")?.value || 0);

        if (!Array.isArray(D.electiveRule.fields)) D.electiveRule.fields = [];

        saveState();
        renderDeptRuleUI();
        renderRequirements();

        alert("系規定已儲存 ✅\n\n提醒：如果你啟用『專業選修領域規則』，新增課程（分類=專業選修）就會要求選領域。");
      });
    }

    renderDeptRuleUI();
  }

  // --------------------------
  // Requirements page init
  // --------------------------
  function initRequirementsPage() {
    state = loadState();
    initDeptRuleUI();

    // guard: if page doesn't have these, do nothing
    if (!$("reqTotalCredits") || !$("saveReqBtn") || !$("saveUserBtn")) {
      return;
    }

    $("reqTotalCredits").value = state.requirements.totalCredits;
    $("reqHoursMin").value = state.requirements.hoursMin;
    $("reqCoreMin").value = state.requirements.coreMin;
    $("reqEnglishType").value = state.requirements.englishType;

    $("userHours").value = state.user.hours;
    $("userEnglishType").value = state.user.englishType;

    renderEnglishBoxes();

    $("reqEnglishType")?.addEventListener("change", () => {
      state.requirements.englishType = $("reqEnglishType").value;
      state.user.englishType = state.requirements.englishType;
      if ($("userEnglishType")) $("userEnglishType").value = state.user.englishType;
      saveState();
      renderEnglishBoxes();
      renderRequirements();
    });

    $("userEnglishType")?.addEventListener("change", () => {
      state.user.englishType = $("userEnglishType").value;
      saveState();
      renderEnglishBoxes();
      renderRequirements();
    });

    $("saveReqBtn")?.addEventListener("click", () => {
      state.requirements.totalCredits = Number($("reqTotalCredits")?.value || 0);
      state.requirements.hoursMin = Number($("reqHoursMin")?.value || 0);
      state.requirements.coreMin = Number($("reqCoreMin")?.value || 0);
      state.requirements.englishType = $("reqEnglishType")?.value || "TOEIC";

      const t = state.requirements.englishType;
      if (t === "TOEIC") state.requirements.englishRule.toeicMin = Number($("ruleToeicMin")?.value || 0);
      if (t === "GEPT") state.requirements.englishRule.geptLevelMin = $("ruleGeptMin")?.value || "中級";
      if (t === "CAMPUS") state.requirements.englishRule.campusMin = Number($("ruleCampusMin")?.value || 0);
      if (t === "COURSE") state.requirements.englishRule.courseAltMinCount = Number($("ruleCourseMinCount")?.value || 0);

      state.user.englishType = state.requirements.englishType;
      if ($("userEnglishType")) $("userEnglishType").value = state.user.englishType;

      saveState();
      renderEnglishBoxes();
      renderRequirements();
      alert("門檻設定已儲存");
    });

    $("saveUserBtn")?.addEventListener("click", () => {
      state.user.hours = Number($("userHours")?.value || 0);
      state.user.englishType = $("userEnglishType")?.value || state.user.englishType;

      const t = state.user.englishType;
      if (t === "TOEIC") state.user.englishData.toeicScore = Number($("userToeicScore")?.value || 0);
      if (t === "GEPT") state.user.englishData.geptLevel = $("userGeptLevel")?.value || "初級";
      if (t === "CAMPUS") state.user.englishData.campusScore = Number($("userCampusScore")?.value || 0);
      if (t === "COURSE") state.user.englishData.courseAltDoneCount = Number($("userCourseAltDoneCount")?.value || 0);

      saveState();
      renderRequirements();
      alert("已儲存");
    });

    $("exportPdfBtn")?.addEventListener("click", exportPdf);

    // step UI (optional)
    function setStep(n) {
      $("step1")?.classList.toggle("is-on", n === 1);
      $("step2")?.classList.toggle("is-on", n === 2);
      $("step3")?.classList.toggle("is-on", n === 3);
    }
    setStep(1);

    document.querySelectorAll(".inputs__input").forEach((block) => {
      block.addEventListener("focusin", () => {
        const step = Number(block.getAttribute("data-step") || "1");
        setStep(step);
      });
    });

    renderRequirements();
  }

  function renderRequirements() {
    const summary = $("reqSummary");
    const ul = $("todoList");
    const reqTypeEl = $("reqEnglishType");
    const totalEl = $("reqTotalCredits");
    const hoursEl = $("reqHoursMin");
    const coreEl = $("reqCoreMin");
    const userHoursEl = $("userHours");

    // If not on requirements page, silently skip
    if (!summary || !ul || !reqTypeEl || !totalEl || !hoursEl || !coreEl || !userHoursEl) return;

    const { total, core } = calcCredits();

    state.requirements.totalCredits = Number(totalEl.value || state.requirements.totalCredits);
    state.requirements.hoursMin = Number(hoursEl.value || state.requirements.hoursMin);
    state.requirements.coreMin = Number(coreEl.value || state.requirements.coreMin);
    state.requirements.englishType = reqTypeEl.value;

    state.user.hours = Number(userHoursEl.value || state.user.hours);

    const R = state.requirements;
    const D = R.deptRule;

    const todo = [];
    const checks = [];

    const okCredits = total >= R.totalCredits;
    checks.push(["總學分", okCredits, `${total} / ${R.totalCredits}`]);
    if (!okCredits) todo.push(`總學分還差 ${Math.max(0, R.totalCredits - total)} 學分`);

    const okCore = R.coreMin <= 0 ? true : core >= R.coreMin;
    if (R.coreMin > 0) {
      checks.push(["必修最低學分（校定+系）", okCore, `${core} / ${R.coreMin}`]);
      if (!okCore) todo.push(`必修（校定+系）還差 ${Math.max(0, R.coreMin - core)} 學分`);
    }

    const okHours = state.user.hours >= R.hoursMin;
    checks.push(["時數門檻", okHours, `${state.user.hours} / ${R.hoursMin} 小時`]);
    if (!okHours) todo.push(`時數還差 ${Math.max(0, R.hoursMin - state.user.hours)} 小時`);

    const e = englishCheck();
    checks.push([`英文門檻（${R.englishType}）`, e.ok, e.msg]);
    if (!e.ok) {
      if (R.englishType === "TOEIC")
        todo.push(
          `TOEIC 還差 ${Math.max(
            0,
            Number(R.englishRule.toeicMin || 0) - Number(state.user.englishData.toeicScore || 0)
          )} 分`
        );
      if (R.englishType === "GEPT") todo.push(`GEPT 未達最低級別：${R.englishRule.geptLevelMin}`);
      if (R.englishType === "CAMPUS")
        todo.push(
          `校內測驗還差 ${Math.max(
            0,
            Number(R.englishRule.campusMin || 0) - Number(state.user.englishData.campusScore || 0)
          )} 分`
        );
      if (R.englishType === "COURSE")
        todo.push(
          `修課替代還差 ${Math.max(
            0,
            Number(R.englishRule.courseAltMinCount || 0) - Number(state.user.englishData.courseAltDoneCount || 0)
          )} 門`
        );
    }

    // Dept rules (optional)
    if (D?.enabled) {
      const passedCourses = state.courses.filter((c) => c.passed);

      if (Array.isArray(D.requiredDesignated) && D.requiredDesignated.length > 0) {
        const hitRequired = passedCourses.filter((c) => D.requiredDesignated.includes(c.name)).length;
        const okReq = hitRequired >= Number(D.requiredDesignatedMin || 0);

        checks.push(["系規定：指定必修", okReq, `${hitRequired} / ${D.requiredDesignatedMin} 門`]);
        if (!okReq) todo.push(`指定必修還差 ${Math.max(0, D.requiredDesignatedMin - hitRequired)} 門`);
      }

      const outsideCount = passedCourses.filter((c) => !!c.isOutsideDept).length;
      const okOutside = outsideCount >= Number(D.outsideDeptMin || 0);

      checks.push(["系規定：外系選修", okOutside, `${outsideCount} / ${D.outsideDeptMin} 門`]);
      if (!okOutside) todo.push(`外系選修還差 ${Math.max(0, D.outsideDeptMin - outsideCount)} 門`);

      const ER = D.electiveRule;
      if (ER?.enabled) {
        const electives = passedCourses.filter((c) => c.cat === "專業選修" && c.fieldId);

        const byField = {};
        for (const c of electives) {
          byField[c.fieldId] = (byField[c.fieldId] || 0) + 1;
        }

        const maxSameField = Math.max(0, ...Object.values(byField));
        const distinctFields = Object.keys(byField).length;

        const okElective =
          maxSameField >= Number(ER.sameFieldMin || 0) || distinctFields >= Number(ER.crossFieldMin || 0);

        checks.push(["系規定：專業選修領域", okElective, `同領域最多 ${maxSameField} / 跨領域 ${distinctFields}`]);

        if (!okElective) todo.push(`專業選修需：同領域 ≥ ${ER.sameFieldMin} 或跨領域 ≥ ${ER.crossFieldMin}`);
      }
    }

    const allOk = checks.every((x) => x[1]);

    summary.innerHTML = `
      <div class="pill ${allOk ? "ok" : "bad"}" style="margin-bottom:10px;">
        ${allOk ? "🎓 目前已達成畢業門檻" : "⚠️ 尚未達成畢業門檻"}
      </div>
      <div>
        ${checks
          .map(
            ([name, ok, msg]) => `
          <div class="pill ${ok ? "ok" : "bad"}" style="margin:6px 0;">
            ${escapeHtml(name)}：${escapeHtml(msg)}
          </div>
        `
          )
          .join("")}
      </div>
    `;

    ul.innerHTML = "";
    if (todo.length === 0) {
      const li = document.createElement("li");
      li.textContent = "全部達標 ✅";
      ul.appendChild(li);
    } else {
      for (const t of todo) {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      }
    }

    saveState();
  }

  // --------------------------
  // PDF export (keep original behavior)
  // --------------------------
  function exportPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF 模組載入失敗，請確認你有網路（因為用 CDN）");
      return;
    }

    const { total, byCat, core } = calcCredits();
    const R = state.requirements;
    const e = englishCheck();

    const todo = [];
    if (total < R.totalCredits) todo.push(`總學分：缺 ${R.totalCredits - total}`);
    if (R.coreMin > 0 && core < R.coreMin) todo.push(`必修（校定+系）：缺 ${R.coreMin - core}`);
    if (state.user.hours < R.hoursMin) todo.push(`時數：缺 ${R.hoursMin - state.user.hours}`);
    if (!e.ok) todo.push(`英文（${R.englishType}）：未達標`);

    const allOk = todo.length === 0;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const margin = 48;
    let y = 56;

    doc.setFontSize(18);
    doc.text("畢業檢核報告", margin, y);
    y += 22;

    doc.setFontSize(11);
    doc.text(`產生時間：${new Date().toLocaleString("zh-TW")}`, margin, y);
    y += 18;

    doc.setFontSize(12);
    doc.text(allOk ? "狀態：已達標 ✅" : "狀態：尚未達標 ⚠️", margin, y);
    y += 22;

    doc.setFontSize(13);
    doc.text("門檻摘要", margin, y);
    y += 14;
    doc.setFontSize(11);
    doc.text(`總學分需求：${R.totalCredits}`, margin, y);
    y += 14;
    doc.text(`時數需求：${R.hoursMin}`, margin, y);
    y += 14;
    doc.text(`必修最低（校定+系）：${R.coreMin}`, margin, y);
    y += 14;
    doc.text(`英文門檻類型：${R.englishType}`, margin, y);
    y += 18;

    doc.setFontSize(13);
    doc.text("你的完成狀態", margin, y);
    y += 14;
    doc.setFontSize(11);
    doc.text(`總學分（通過）：${total} / ${R.totalCredits}`, margin, y);
    y += 14;
    doc.text(`必修（校定+系）：${core} / ${R.coreMin}`, margin, y);
    y += 14;
    doc.text(`時數：${state.user.hours} / ${R.hoursMin}`, margin, y);
    y += 14;
    doc.text(`英文（${R.englishType}）：${e.msg}`, margin, y);
    y += 18;

    doc.setFontSize(13);
    doc.text("分類學分（通過）", margin, y);
    y += 14;
    doc.setFontSize(11);

    const lines = [
      `校定必修：${byCat["校定必修"] || 0}`,
      `系必修：${byCat["系必修"] || 0}`,
      `專業選修：${byCat["專業選修"] || 0}`,
      `通識核心：${byCat["通識核心"] || 0}`,
      `通識博雅：${byCat["通識博雅"] || 0}`,
      `體育：${byCat["體育"] || 0}`,
      `其他：${byCat["其他"] || 0}`,
    ];

    for (const line of lines) {
      doc.text(line, margin, y);
      y += 14;
      if (y > 760) {
        doc.addPage();
        y = 56;
      }
    }

    y += 6;

    doc.setFontSize(13);
    doc.text("未達標項目", margin, y);
    y += 14;
    doc.setFontSize(11);

    if (todo.length === 0) {
      doc.text("全部達標 ✅", margin, y);
      y += 14;
    } else {
      for (const t of todo) {
        doc.text(`• ${t}`, margin, y);
        y += 14;
        if (y > 760) {
          doc.addPage();
          y = 56;
        }
      }
    }

    doc.save("畢業檢核報告.pdf");
  }

  // --------------------------
  // Public API
  // --------------------------
  return {
    initCreditsPage,
    initRequirementsPage,
    initSchedulePage,
    removeCourseById,
    get state() {
      return state;
    },
  };
})();

// --------------------------
// Extra DOMContentLoaded (safe)
// --------------------------
document.addEventListener("DOMContentLoaded", () => {
  const cb = document.getElementById("courseSubDone");
  const status = document.getElementById("courseSubStatus");
  const openRule = document.getElementById("openRule");

  function renderStatus() {
    if (!status) return;
    status.textContent = cb?.checked ? "狀態：已完成修課替代 ✅" : "狀態：尚未完成修課替代 ☐";
  }

  if (cb && status) {
    const saved = localStorage.getItem("courseSubDone") === "1";
    cb.checked = saved;
    renderStatus();

    cb.addEventListener("change", () => {
      localStorage.setItem("courseSubDone", cb.checked ? "1" : "0");
      renderStatus();
    });
  }

  if (openRule) {
    openRule.addEventListener("click", () => {
      alert("修課替代規則範例：\n- 完成指定英語相關課程\n- 通過成績門檻\n- 以系上公告為準");
    });
  }
});
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("sendMailBtn");
  const textarea = document.getElementById("suggestText");

  if (btn && textarea) {
    btn.addEventListener("click", () => {
      const content = textarea.value.trim();
      if (!content) {
        alert("請輸入建議內容");
        return;
      }

      const subject = encodeURIComponent("Graduation Checker 使用建議");
      const body = encodeURIComponent(content);

      window.location.href =
        `mailto:ztingwei333@gmail.com?subject=${subject}&body=${body}`;
    });
  }
});