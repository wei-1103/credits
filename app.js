const App = (() => {
  const STORAGE_KEY = "grad_checker_split_v1";

  const CATEGORIES = [
    "校定必修",
    "系必修",
    "專業選修",
    "通識核心",
    "通識博雅",
    "體育",
    "其他"
  ];

  const defaultState = {
    courses: [],
    requirements: {
      totalCredits: 128,
      hoursMin: 18,
      coreMin: 0,
      englishType: "TOEIC",
      englishRule: {
        // 依 type 使用不同欄位
        toeicMin: 650,
        geptLevelMin: "中級",
        campusMin: 60,
        courseAltMinCount: 1
      }
    },
    user: {
      hours: 0,
      englishType: "TOEIC",
      englishData: {
        toeicScore: 0,
        geptLevel: "初級",
        campusScore: 0,
        courseAltDoneCount: 0
      }
    }
  };

  const $ = (id) => document.getElementById(id);

  function clone(obj){ return structuredClone(obj); }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return clone(defaultState);
      const s = JSON.parse(raw);
      // 淺合併（保留 default 新欄位）
      return {
        ...clone(defaultState),
        ...s,
        requirements: { ...clone(defaultState.requirements), ...(s.requirements||{}) ,
          englishRule: { ...clone(defaultState.requirements.englishRule), ...((s.requirements||{}).englishRule||{}) }
        },
        user: { ...clone(defaultState.user), ...(s.user||{}) ,
          englishData: { ...clone(defaultState.user.englishData), ...((s.user||{}).englishData||{}) }
        }
      };
    }catch{
      return clone(defaultState);
    }
  }

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  // --------- Courses / Credits ----------
  function normalizeCategory(cat){
    const t = String(cat||"").trim();
    if(!t) return "其他";
    // 容錯：常見寫法對應
    const map = new Map([
      ["必修","系必修"],
      ["選修","專業選修"],
      ["通識","通識博雅"],
      ["通識(核心)","通識核心"],
      ["通識(博雅)","通識博雅"],
      ["校必修","校定必修"],
      ["系必修","系必修"],
      ["專業選修","專業選修"],
      ["通識核心","通識核心"],
      ["通識博雅","通識博雅"],
      ["體育","體育"],
      ["其他","其他"]
    ]);
    if(map.has(t)) return map.get(t);
    // 如果使用者貼來的剛好在清單內
    if(CATEGORIES.includes(t)) return t;
    return "其他";
  }

  function parsePassed(v){
    const t = String(v||"").trim().toLowerCase();
    if(["true","1","y","yes","通過","已通過","pass","passed"].includes(t)) return true;
    if(["false","0","n","no","未通過","修課中","未過","fail","failed","inprogress"].includes(t)) return false;
    // 空白預設當通過？不安全 → 預設 false
    return false;
  }

  function calcCredits(){
    // 通過才計入
    const passed = state.courses.filter(c => c.passed);
    const total = passed.reduce((a,c)=>a + (Number(c.credits)||0), 0);

    const byCat = {};
    for(const c of passed){
      byCat[c.cat] = (byCat[c.cat] || 0) + (Number(c.credits)||0);
    }

    // 必修最低：校定必修 + 系必修
    const core = (byCat["校定必修"]||0) + (byCat["系必修"]||0);
    return { total, byCat, core };
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------- Credits page ----------
  function initCreditsPage(){
    state = loadState(); // refresh

    // categories dropdown
    const catSel = $("courseCat");
    catSel.innerHTML = CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

    $("addCourseBtn").addEventListener("click", () => {
      const name = $("courseName").value.trim();
      const cat = $("courseCat").value;
      const credits = Number($("courseCredits").value || 0);
      const passed = $("coursePassed").value === "true";

      if(!name){ alert("請輸入課名"); return; }
      if(credits < 0){ alert("學分不可為負"); return; }

      state.courses.unshift({ id: crypto.randomUUID(), name, cat, credits, passed });
      $("courseName").value = "";
      saveState();
      renderCredits();
      renderCourseCards(state.courses);
    });

    $("seedBtn").addEventListener("click", () => {
      state.courses = [
        { id: crypto.randomUUID(), name:"國文", cat:"校定必修", credits:2, passed:true },
        { id: crypto.randomUUID(), name:"日語會話（二）", cat:"系必修", credits:2, passed:true },
        { id: crypto.randomUUID(), name:"日本文化概論", cat:"通識博雅", credits:2, passed:true },
        { id: crypto.randomUUID(), name:"通識核心：思辨與表達", cat:"通識核心", credits:2, passed:true },
        { id: crypto.randomUUID(), name:"體育（二）", cat:"體育", credits:0, passed:true },
        { id: crypto.randomUUID(), name:"專業選修：日語聽解", cat:"專業選修", credits:2, passed:false }
      ];
      saveState();
      renderCredits();
      renderCourseCards(state.courses);
    });

    $("clearBtn").addEventListener("click", () => {
      if(confirm("確定要清空全部資料嗎？")){
        state = clone(defaultState);
        saveState();
        renderCredits();
        renderCourseCards(state.courses);
      }
    });

    $("importCsvBtn").addEventListener("click", () => importCsv(false));
    $("appendCsvBtn").addEventListener("click", () => importCsv(true));

    renderCredits();
    renderCourseCards(state.courses);
  }

  function importCsv(append){
    const text = $("csvInput").value.trim();
    if(!text){ alert("請先貼上 CSV 內容"); return; }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 如果第一行像 header，就跳過
    const first = lines[0]?.toLowerCase() || "";
    const startIdx = (first.includes("課名") || first.includes("name")) ? 1 : 0;

    const imported = [];
    for(let i=startIdx; i<lines.length; i++){
      const line = lines[i];
      const cols = splitCsvLine(line);
      // 期望：name, cat, credits, status
      const name = (cols[0]||"").trim();
      const cat = normalizeCategory(cols[1]);
      const credits = Number((cols[2]||"").trim() || 0);
      const passed = parsePassed(cols[3]);

      if(!name) continue;
      imported.push({ id: crypto.randomUUID(), name, cat, credits: isFinite(credits)?credits:0, passed });
    }

    if(imported.length === 0){
      alert("沒有成功匯入任何課程（請檢查格式：課名,分類,學分,狀態）");
      return;
    }

    if(!append) state.courses = imported;
    else state.courses = [...imported, ...state.courses];

    saveState();
    renderCredits();
    renderCourseCards(state.courses);
    alert(`匯入完成：${imported.length} 筆`);
  }

  // 簡易 CSV line splitter：支援雙引號包住含逗號內容
  function splitCsvLine(line){
    const out = [];
    let cur = "", inQ = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"'){
        if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      }else if(ch === "," && !inQ){
        out.push(cur); cur = "";
      }else{
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function renderCredits(){
    // table
    const tbody = $("courseTable");
    tbody.innerHTML = "";

    if(state.courses.length === 0){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="muted">尚未新增課程</td>`;
      tbody.appendChild(tr);
    }else{
      for(const c of state.courses){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(c.name)}</td>
          <td><span class="tag">${escapeHtml(c.cat)}</span></td>
          <td>${Number(c.credits)||0}</td>
          <td>${c.passed ? `<span class="pill ok">通過</span>` : `<span class="pill bad">未通過/修課中</span>`}</td>
          <td><button class="danger" data-del="${c.id}">刪除</button></td>
        `;
        tbody.appendChild(tr);
      }
      tbody.querySelectorAll("[data-del]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          state.courses = state.courses.filter(c => c.id !== btn.dataset.del);
          renderCourseCards(state.courses);
          saveState();
          renderCredits();
          
        });
      });
    }

    // stats
    const { total, byCat } = calcCredits();
    const reqTotal = Number(state.requirements.totalCredits || 0);

    $("creditKpi").innerHTML = `
      <div class="pill ${reqTotal>0 && total>=reqTotal ? "ok":"bad"}">總學分：${total} / ${reqTotal||"未設定"}</div>
      <div class="pill">校定必修：${byCat["校定必修"]||0}</div>
      <div class="pill">系必修：${byCat["系必修"]||0}</div>
      <div class="pill">專業選修：${byCat["專業選修"]||0}</div>
      <div class="pill">通識核心：${byCat["通識核心"]||0}</div>
      <div class="pill">通識博雅：${byCat["通識博雅"]||0}</div>
    `;

    const pct = (reqTotal>0) ? Math.min(100, Math.round((total/reqTotal)*100)) : 0;
    $("totalBar").style.width = pct + "%";

    const catStats = $("catStats");
    const entries = Object.entries(byCat);
    catStats.innerHTML = entries.length
      ? entries.map(([k,v])=>`<div class="muted">• ${escapeHtml(k)}：${v} 學分</div>`).join("")
      : `<div class="muted">尚無「通過」的課程可統計</div>`;
  }

  // --------- Requirements / English ----------
  const GEPT_LEVELS = ["初級", "中級", "中高級", "高級", "優級"]; // 你也能改

  function englishRuleUI(type){
    const R = state.requirements.englishRule;
    if(type === "TOEIC"){
      return `
        <div class="row">
          <div>
            <label>TOEIC 最低分</label>
            <input id="ruleToeicMin" type="number" min="0" step="10" value="${Number(R.toeicMin||0)}" />
          </div>
          <div class="notice">
            會用：你的 TOEIC 成績 ≥ 最低分 來判斷
          </div>
        </div>
      `;
    }
    if(type === "GEPT"){
      const opts = GEPT_LEVELS.map(l => `<option value="${l}" ${R.geptLevelMin===l?"selected":""}>${l}</option>`).join("");
      return `
        <div class="row">
          <div>
            <label>GEPT 最低級別</label>
            <select id="ruleGeptMin">${opts}</select>
          </div>
          <div class="notice">
            會用：你的 GEPT 級別 ≥ 最低級別 來判斷
          </div>
        </div>
      `;
    }
    if(type === "CAMPUS"){
      return `
        <div class="row">
          <div>
            <label>校內測驗最低分（例如 60）</label>
            <input id="ruleCampusMin" type="number" min="0" step="1" value="${Number(R.campusMin||0)}" />
          </div>
          <div class="notice">
            會用：你的校內測驗分數 ≥ 最低分 來判斷
          </div>
        </div>
      `;
    }
    // COURSE
    return `
      <div class="row">
        <div>
          <label>修課替代：需完成門數（例如 1）</label>
          <input id="ruleCourseMinCount" type="number" min="0" step="1" value="${Number(R.courseAltMinCount||0)}" />
        </div>
        <div class="notice">
          會用：你完成的「替代課程門數」≥ 需求門數 來判斷
        </div>
      </div>
    `;
  }

  function englishUserUI(type){
    const U = state.user.englishData;
    if(type === "TOEIC"){
      return `
        <label>你的 TOEIC 成績（沒有就填 0）</label>
        <input id="userToeicScore" type="number" min="0" step="5" value="${Number(U.toeicScore||0)}" />
      `;
    }
    if(type === "GEPT"){
      const opts = GEPT_LEVELS.map(l => `<option value="${l}" ${U.geptLevel===l?"selected":""}>${l}</option>`).join("");
      return `
        <label>你的 GEPT 級別</label>
        <select id="userGeptLevel">${opts}</select>
      `;
    }
    if(type === "CAMPUS"){
      return `
        <label>你的校內測驗分數</label>
        <input id="userCampusScore" type="number" min="0" step="1" value="${Number(U.campusScore||0)}" />
      `;
    }
    return `
      <label>你已完成的修課替代門數</label>
      <input id="userCourseAltDoneCount" type="number" min="0" step="1" value="${Number(U.courseAltDoneCount||0)}" />
    `;
  }

  function englishCheck(){
    const type = state.requirements.englishType;
    const R = state.requirements.englishRule;
    const U = state.user.englishData;

    if(type === "TOEIC"){
      const ok = Number(U.toeicScore||0) >= Number(R.toeicMin||0);
      return { ok, msg: `${U.toeicScore||0} / ${R.toeicMin||0}` };
    }
    if(type === "GEPT"){
      const idxU = GEPT_LEVELS.indexOf(U.geptLevel || "初級");
      const idxR = GEPT_LEVELS.indexOf(R.geptLevelMin || "中級");
      const ok = idxU >= idxR;
      return { ok, msg: `${U.geptLevel||"初級"} / ${R.geptLevelMin||"中級"}` };
    }
    if(type === "CAMPUS"){
      const ok = Number(U.campusScore||0) >= Number(R.campusMin||0);
      return { ok, msg: `${U.campusScore||0} / ${R.campusMin||0}` };
    }
    // COURSE
    const ok = Number(U.courseAltDoneCount||0) >= Number(R.courseAltMinCount||0);
    return { ok, msg: `${U.courseAltDoneCount||0} / ${R.courseAltMinCount||0} 門` };
  }

  function initRequirementsPage(){
    state = loadState(); // refresh

    // load to inputs
    $("reqTotalCredits").value = state.requirements.totalCredits;
    $("reqHoursMin").value = state.requirements.hoursMin;
    $("reqCoreMin").value = state.requirements.coreMin;
    $("reqEnglishType").value = state.requirements.englishType;

    $("userHours").value = state.user.hours;
    $("userEnglishType").value = state.user.englishType;

    // render english boxes
    renderEnglishBoxes();

    $("reqEnglishType").addEventListener("change", ()=>{
      state.requirements.englishType = $("reqEnglishType").value;
      // 預設讓使用者英文類型跟著一致（比較直覺）
      state.user.englishType = state.requirements.englishType;
      $("userEnglishType").value = state.user.englishType;
      saveState();
      renderEnglishBoxes();
      renderRequirements();
    });

    $("userEnglishType").addEventListener("change", ()=>{
      state.user.englishType = $("userEnglishType").value;
      saveState();
      renderEnglishBoxes();
      renderRequirements();
    });

    $("saveReqBtn").addEventListener("click", ()=>{
      state.requirements.totalCredits = Number($("reqTotalCredits").value||0);
      state.requirements.hoursMin = Number($("reqHoursMin").value||0);
      state.requirements.coreMin = Number($("reqCoreMin").value||0);
      state.requirements.englishType = $("reqEnglishType").value;

      // 依類型抓 rule input
      const t = state.requirements.englishType;
      if(t === "TOEIC") state.requirements.englishRule.toeicMin = Number($("ruleToeicMin")?.value||0);
      if(t === "GEPT") state.requirements.englishRule.geptLevelMin = $("ruleGeptMin")?.value || "中級";
      if(t === "CAMPUS") state.requirements.englishRule.campusMin = Number($("ruleCampusMin")?.value||0);
      if(t === "COURSE") state.requirements.englishRule.courseAltMinCount = Number($("ruleCourseMinCount")?.value||0);

      // 同步使用者英文類型（避免判斷不同步）
      state.user.englishType = state.requirements.englishType;
      $("userEnglishType").value = state.user.englishType;

      saveState();
      renderEnglishBoxes();
      renderRequirements();
      alert("門檻設定已儲存");
    });

    $("saveUserBtn").addEventListener("click", ()=>{
      state.user.hours = Number($("userHours").value||0);
      state.user.englishType = $("userEnglishType").value;

      // 依使用者英文類型保存資料（通常會跟門檻一致）
      const t = state.user.englishType;
      if(t === "TOEIC") state.user.englishData.toeicScore = Number($("userToeicScore")?.value||0);
      if(t === "GEPT") state.user.englishData.geptLevel = $("userGeptLevel")?.value || "初級";
      if(t === "CAMPUS") state.user.englishData.campusScore = Number($("userCampusScore")?.value||0);
      if(t === "COURSE") state.user.englishData.courseAltDoneCount = Number($("userCourseAltDoneCount")?.value||0);

      saveState();
      renderRequirements();
      alert("已儲存");
    });

    $("exportPdfBtn").addEventListener("click", exportPdf);

    function setStep(n){
  document.getElementById("step1")?.classList.toggle("is-on", n===1);
  document.getElementById("step2")?.classList.toggle("is-on", n===2);
  document.getElementById("step3")?.classList.toggle("is-on", n===3);
}
setStep(1);

document.querySelectorAll(".inputs__input").forEach((block)=>{
  block.addEventListener("focusin", ()=>{
    const step = Number(block.getAttribute("data-step") || "1");
    setStep(step);
  });
});

    renderRequirements();
  }

  function renderEnglishBoxes(){
    // rules
    $("englishRuleBox").innerHTML = englishRuleUI($("reqEnglishType").value);
    // user
    $("englishUserBox").innerHTML = englishUserUI($("userEnglishType").value);
  }

  function renderRequirements(){
    const { total, core } = calcCredits();

    // sync top inputs if needed
    state.requirements.totalCredits = Number($("reqTotalCredits").value || state.requirements.totalCredits);
    state.requirements.hoursMin = Number($("reqHoursMin").value || state.requirements.hoursMin);
    state.requirements.coreMin = Number($("reqCoreMin").value || state.requirements.coreMin);
    state.requirements.englishType = $("reqEnglishType").value;

    state.user.hours = Number($("userHours").value || state.user.hours);

    const R = state.requirements;
    const todo = [];
    const checks = [];

    // credits
    const okCredits = total >= R.totalCredits;
    checks.push(["總學分", okCredits, `${total} / ${R.totalCredits}`]);
    if(!okCredits) todo.push(`總學分還差 ${Math.max(0, R.totalCredits-total)} 學分`);

    // core min (校定必修+系必修)
    const okCore = (R.coreMin<=0) ? true : (core >= R.coreMin);
    if(R.coreMin>0){
      checks.push(["必修最低學分（校定+系）", okCore, `${core} / ${R.coreMin}`]);
      if(!okCore) todo.push(`必修（校定+系）還差 ${Math.max(0, R.coreMin-core)} 學分`);
    }

    // hours
    const okHours = state.user.hours >= R.hoursMin;
    checks.push(["時數門檻", okHours, `${state.user.hours} / ${R.hoursMin} 小時`]);
    if(!okHours) todo.push(`時數還差 ${Math.max(0, R.hoursMin-state.user.hours)} 小時`);

    // english
    // 注意：判斷用「門檻的英文類型」
    const e = englishCheck();
    checks.push([`英文門檻（${R.englishType}）`, e.ok, e.msg]);
    if(!e.ok){
      if(R.englishType === "TOEIC") todo.push(`TOEIC 還差 ${Math.max(0, Number(R.englishRule.toeicMin||0)-Number(state.user.englishData.toeicScore||0))} 分`);
      if(R.englishType === "GEPT") todo.push(`GEPT 未達最低級別：${R.englishRule.geptLevelMin}`);
      if(R.englishType === "CAMPUS") todo.push(`校內測驗還差 ${Math.max(0, Number(R.englishRule.campusMin||0)-Number(state.user.englishData.campusScore||0))} 分`);
      if(R.englishType === "COURSE") todo.push(`修課替代還差 ${Math.max(0, Number(R.englishRule.courseAltMinCount||0)-Number(state.user.englishData.courseAltDoneCount||0))} 門`);
    }

    const allOk = checks.every(x => x[1]);

    $("reqSummary").innerHTML = `
      <div class="pill ${allOk ? "ok":"bad"}" style="margin-bottom:10px;">
        ${allOk ? "🎓 目前已達成畢業門檻" : "⚠️ 尚未達成畢業門檻"}
      </div>
      <div>
        ${checks.map(([name, ok, msg])=>`
          <div class="pill ${ok ? "ok":"bad"}" style="margin:6px 0;">
            ${escapeHtml(name)}：${escapeHtml(msg)}
          </div>
        `).join("")}
      </div>
    `;

    const ul = $("todoList");
    ul.innerHTML = "";
    if(todo.length === 0){
      const li = document.createElement("li");
      li.textContent = "全部達標 ✅";
      ul.appendChild(li);
    }else{
      for(const t of todo){
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      }
    }

    // persist (讓你輸入完就算沒按儲存也不會掉太多)
    saveState();
  }

  // ---------- PDF export ----------
  function exportPdf(){
    // 需要 jsPDF
    if(!window.jspdf || !window.jspdf.jsPDF){
      alert("PDF 模組載入失敗，請確認你有網路（因為用 CDN）");
      return;
    }

    const { total, byCat, core } = calcCredits();
    const R = state.requirements;
    const e = englishCheck();

    // 準備待辦與狀態
    const todo = [];
    if(total < R.totalCredits) todo.push(`總學分：缺 ${R.totalCredits-total}`);
    if(R.coreMin>0 && core < R.coreMin) todo.push(`必修（校定+系）：缺 ${R.coreMin-core}`);
    if(state.user.hours < R.hoursMin) todo.push(`時數：缺 ${R.hoursMin-state.user.hours}`);
    if(!e.ok) todo.push(`英文（${R.englishType}）：未達標`);

    const allOk = todo.length === 0;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const margin = 48;
    let y = 56;

    doc.setFontSize(18);
    doc.text("畢業檢核報告", margin, y); y += 22;

    doc.setFontSize(11);
    doc.text(`產生時間：${new Date().toLocaleString("zh-TW")}`, margin, y); y += 18;

    doc.setFontSize(12);
    doc.text(allOk ? "狀態：已達標 ✅" : "狀態：尚未達標 ⚠️", margin, y); y += 22;

    // 基本門檻
    doc.setFontSize(13);
    doc.text("門檻摘要", margin, y); y += 14;
    doc.setFontSize(11);
    doc.text(`總學分需求：${R.totalCredits}`, margin, y); y += 14;
    doc.text(`時數需求：${R.hoursMin}`, margin, y); y += 14;
    doc.text(`必修最低（校定+系）：${R.coreMin}`, margin, y); y += 14;
    doc.text(`英文門檻類型：${R.englishType}`, margin, y); y += 18;

    // 你的完成狀態
    doc.setFontSize(13);
    doc.text("你的完成狀態", margin, y); y += 14;
    doc.setFontSize(11);
    doc.text(`總學分（通過）：${total} / ${R.totalCredits}`, margin, y); y += 14;
    doc.text(`必修（校定+系）：${core} / ${R.coreMin}`, margin, y); y += 14;
    doc.text(`時數：${state.user.hours} / ${R.hoursMin}`, margin, y); y += 14;
    doc.text(`英文（${R.englishType}）：${e.msg}`, margin, y); y += 18;

    // 分類學分
    doc.setFontSize(13);
    doc.text("分類學分（通過）", margin, y); y += 14;
    doc.setFontSize(11);
    const lines = [
      `校定必修：${byCat["校定必修"]||0}`,
      `系必修：${byCat["系必修"]||0}`,
      `專業選修：${byCat["專業選修"]||0}`,
      `通識核心：${byCat["通識核心"]||0}`,
      `通識博雅：${byCat["通識博雅"]||0}`,
      `體育：${byCat["體育"]||0}`,
      `其他：${byCat["其他"]||0}`
    ];
    for(const line of lines){
      doc.text(line, margin, y); y += 14;
      if(y > 760){ doc.addPage(); y = 56; }
    }
    y += 6;

    // 未達標
    doc.setFontSize(13);
    doc.text("未達標項目", margin, y); y += 14;
    doc.setFontSize(11);
    if(todo.length === 0){
      doc.text("全部達標 ✅", margin, y); y += 14;
    }else{
      for(const t of todo){
        doc.text(`• ${t}`, margin, y); y += 14;
        if(y > 760){ doc.addPage(); y = 56; }
      }
    }

    doc.save("畢業檢核報告.pdf");
  }

  return {
    initCreditsPage,
    initRequirementsPage
  };
})();
document.addEventListener("DOMContentLoaded", () => {
  const cb = document.getElementById("courseSubDone");
  const status = document.getElementById("courseSubStatus");
  const openRule = document.getElementById("openRule");

  if (cb && status) {
    // 讀取保存狀態（可選）
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

  function renderStatus(){
    status.textContent = cb.checked ? "狀態：已完成修課替代 ✅" : "狀態：尚未完成修課替代 ☐";
  }
});
function renderCourseCards(courses){
  const wrap = document.getElementById("courseCards");
  if(!wrap) return;

  if(!courses || courses.length === 0){
    wrap.innerHTML = `<div class="muted">尚未新增課程</div>`;
    return;
  }

  wrap.innerHTML = courses.map(c => {
    const statusText = c.passed ? "通過" : "未通過 / 修課中";
    const statusClass = c.passed ? "ok" : "bad";

    return `
      <div class="courseCard" data-id="${c.id}">
        <h3 class="courseTitle">${escapeHtml(c.name)}</h3>

        <div class="courseMeta">
          <div><b>分類：</b>${escapeHtml(c.cat)}</div>
          <div><b>學分：</b>${escapeHtml(String(Number(c.credits)||0))}</div>
        </div>

        <div class="badges">
          <span class="badgePill">${escapeHtml(c.cat)}</span>
          <span class="badgePill ${statusClass}">${statusText}</span>
        </div>

        <div class="cardActions">
          <button class="danger" data-action="delete">刪除</button>
        </div>
      </div>
    `;
  }).join("");

  // 刪除：事件委派
  wrap.onclick = (e) => {
    const btn = e.target.closest("button[data-action='delete']");
    if(!btn) return;
    const card = e.target.closest(".courseCard");
    if(!card) return;

    const id = card.dataset.id;

    // 用同一個 STORAGE_KEY 刪掉資料
    const STORAGE_KEY = "grad_checker_split_v1";
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;

    const s = JSON.parse(raw);
    s.courses = (s.courses || []).filter(x => x.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));

    // 重新整理讓 table + KPI + cards 同步
    location.reload();
  };
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}