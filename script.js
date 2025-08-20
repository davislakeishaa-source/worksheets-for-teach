// Minimal, working front-end with packs + importer + PDF call
const $ = (s) => document.querySelector(s);
const statusEl = $("#status");
let PACKS = {};
let FRAMEWORKS = [];
let SELECTED_CODES = [];

function setStatus(t){ statusEl.textContent = t || ""; }

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();

  const importer = $("#importerModal");
  $("#openImporter").addEventListener("click", () => importer.showModal());
  importer.addEventListener("close", () => { $("#previewBox").textContent = ""; });

  $("#loadSamplePacks").addEventListener("click", async () => {
    try{
      const files = ["packs/ccss-ela-sample.json","packs/ccss-math-sample.json","packs/ngss-sample.json","packs/c3-sample.json","packs/state-pack-template.json"];
      const loaded = await Promise.all(files.map(f => fetch(f).then(r => r.json())));
      for(const pack of loaded){ registerPack(pack); }
      populateFrameworks();
      setStatus("Loaded sample national packs.");
    }catch(e){ console.error(e); setStatus("Couldn't load sample packs."); }
  });

  $("#packInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    try{
      const text = await file.text();
      const pack = JSON.parse(text);
      registerPack(pack); populateFrameworks();
      e.target.value = ""; setStatus(`Loaded pack: ${pack.name || "Unknown"}`);
    }catch(err){ console.error(err); alert("Invalid JSON pack."); }
  });

  $("#frameworkSelect").addEventListener("change", renderStandards);
  $("#gradeBandSelect").addEventListener("change", renderStandards);
  $("#standardSearch").addEventListener("input", renderStandards);

  $("#sampleBtn").addEventListener("click", async () => {
    const payload = {
      title: "Sample Worksheet",
      directions: "Use context clues to choose the best answer.",
      questionType: "mixed",
      numQuestions: 8,
      includeAnswerKey: "yes",
      standards: SELECTED_CODES.map(s => s.code)
    };
    await generate(payload);
  });

  $("#generateBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    const title = $("#title").value.trim();
    if(!title) return alert("Please enter a title.");
    const numQuestions = parseInt($("#numQuestions").value || "0",10);
    if(!numQuestions || numQuestions < 1 || numQuestions > 30) return alert("Number of questions must be 1–30.");
    const payload = {
      title,
      directions: $("#directions").value.trim(),
      questionType: $("#questionType").value,
      numQuestions,
      includeAnswerKey: $("#includeAnswerKey").value,
      standards: SELECTED_CODES.map(s => s.code),
      topic: $("#topic").value.trim()
    };
    await generate(payload);
  });

  // Importer wiring
  $("#csvFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    const text = await file.text();
    file._textCache = text;
    const { headers } = parseCSV(text, 1);
    for(const id of ["colCode","colText","colGrades","colTags"]){
      const sel = $("#"+id);
      sel.innerHTML = "<option value=''>—</option>";
      headers.forEach(h => {
        const opt = document.createElement("option");
        opt.value = h; opt.textContent = h;
        sel.appendChild(opt);
      });
    }
  });
  $("#previewPack").addEventListener("click", () => makePack(true));
  $("#downloadPack").addEventListener("click", () => makePack(false));
});

// Packs
function registerPack(pack){
  if(!pack || !pack.id) throw new Error("Pack missing 'id'");
  PACKS[pack.id] = pack;
  if(Array.isArray(pack.frameworks)){
    for(const fw of pack.frameworks){
      FRAMEWORKS.push({...fw, _packId: pack.id});
    }
  }
}
function populateFrameworks(){
  const sel = $("#frameworkSelect");
  sel.innerHTML = '<option value="">— Select a framework —</option>';
  FRAMEWORKS.forEach(fw => {
    const opt = document.createElement("option");
    opt.value = fw.id;
    opt.textContent = `${fw.name} (${PACKS[fw._packId]?.name || "Pack"})`;
    sel.appendChild(opt);
  });
  renderStandards();
}
function renderStandards(){
  const fwId = $("#frameworkSelect").value;
  const gradeBand = $("#gradeBandSelect").value;
  const q = ($("#standardSearch").value || "").toLowerCase();
  const container = $("#standardsList"); container.innerHTML = "";

  const fw = FRAMEWORKS.find(f => f.id === fwId);
  if(!fw){ container.innerHTML = "<p class='hint'>Choose a framework or load a pack.</p>"; return; }

  const list = (fw.standards || []).filter(s => {
    let ok = true;
    if(gradeBand && s.grades && s.grades.length){ ok = s.grades.includes(gradeBand); }
    if(ok && q){
      const hay = `${s.code} ${s.statement || ""} ${Array.isArray(s.tags)?s.tags.join(" "):""}`.toLowerCase();
      ok = hay.includes(q);
    }
    return ok;
  });

  list.forEach(s => {
    const card = document.createElement("div"); card.className = "card";
    const h = document.createElement("h4"); h.textContent = s.code;
    const p = document.createElement("p"); p.textContent = s.statement || "(no description)";
    const meta = document.createElement("div"); meta.className = "meta";
    meta.textContent = (s.grades && s.grades.length) ? `Grades: ${s.grades.join(", ")}` : "";
    const btn = document.createElement("button"); btn.textContent = "Add";
    btn.addEventListener("click", () => addStandard({code:s.code, name:s.statement||s.code, framework:fw.name}));
    card.append(h,p,meta,btn); container.appendChild(card);
  });

  renderSelected();
}
function addStandard(item){
  if(!SELECTED_CODES.find(x => x.code === item.code)){
    SELECTED_CODES.push(item); renderSelected();
  }
}
function removeStandard(code){
  SELECTED_CODES = SELECTED_CODES.filter(s => s.code !== code);
  renderSelected();
}
function renderSelected(){
  const wrap = $("#selectedStandards"); wrap.innerHTML = "";
  if(SELECTED_CODES.length === 0){ wrap.innerHTML = "<span class='hint'>No standards selected yet.</span>"; return; }
  SELECTED_CODES.forEach(s => {
    const chip = document.createElement("span"); chip.className = "chip";
    chip.innerHTML = `${s.code}<button title='Remove'>✕</button>`;
    chip.querySelector("button").addEventListener("click", () => removeStandard(s.code));
    wrap.appendChild(chip);
  });
}

// API call
async function generate(payload){
  try{
    setStatus("Generating PDF…");
    const res = await fetch("/api/generate-pdf", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!res.ok){ const err = await res.text(); throw new Error(err || "PDF failed"); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = (payload.title || "worksheet").replace(/[^a-z0-9-_]+/gi,"_") + ".pdf";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setStatus("Done! Check your downloads.");
  }catch(e){ console.error(e); alert("Something went wrong generating the PDF."); setStatus("Error. Please try again."); }
}

// CSV → Pack
function parseCSV(text, headerRows=1){
  const rows = []; let cur = []; let val = ""; let inQuotes = false;
  for(let i=0; i<text.length; i++){
    const c = text[i]; const n = text[i+1];
    if(c === '"'){ if(inQuotes && n === '"'){ val += '"'; i++; } else inQuotes = !inQuotes; }
    else if(c === ',' && !inQuotes){ cur.push(val); val = ""; }
    else if((c === '\n' || c === '\r') && !inQuotes){
      if(val !== "" || cur.length>0){ cur.push(val); rows.push(cur); cur = []; val = ""; }
      if(c === '\r' && n === '\n') i++;
    } else { val += c; }
  }
  if(val !== "" || cur.length>0){ cur.push(val); rows.push(cur); }
  const headers = rows.slice(0, headerRows).pop() || [];
  const data = rows.slice(headerRows);
  return { headers, data };
}
function makePack(previewOnly){
  const fileInput = $("#csvFile");
  if(!fileInput.files || !fileInput.files[0]) return alert("Upload a CSV first.");
  if(!fileInput.files[0]._textCache){ fileInput.files[0].text().then(txt => { fileInput.files[0]._textCache = txt; makePack(previewOnly); }); return; }
  const { headers, data } = parseCSV(fileInput.files[0]._textCache, 1);

  const getSel = id => $("#"+id).value || "";
  const colMap = { code: getSel("colCode"), statement: getSel("colText"), grades: getSel("colGrades"), tags: getSel("colTags") };
  if(!colMap.code) return alert("Map the Code column."); if(!colMap.statement) return alert("Map the Description column.");
  const gi = headers.indexOf(colMap.grades), ti = headers.indexOf(colMap.tags), ci = headers.indexOf(colMap.code), si = headers.indexOf(colMap.statement);
  const gradesDelim = ($("#gradesDelim").value || "|").trim(), tagsDelim = ($("#tagsDelim").value || "|").trim();

  const standards = data.map(row => {
    const code = (row[ci]||"").trim(); const statement = (row[si]||"").trim();
    if(!code || !statement) return null;
    const grades = gi>=0 ? String(row[gi]||"").split(gradesDelim).map(s => s.trim()).filter(Boolean) : [];
    const tags = ti>=0 ? String(row[ti]||"").split(tagsDelim).map(s => s.trim()).filter(Boolean) : [];
    return { code, statement, grades, tags };
  }).filter(Boolean);

  const pack = {
    id: ($("#packId").value || "state-pack").trim(),
    name: ($("#packName").value || "State Standards Pack").trim(),
    version: ($("#packVersion").value || new Date().toISOString().slice(0,10)).trim(),
    scope: ($("#packScope").value || "state").trim(),
    frameworks: [{
      id: ($("#fwId").value || "state-fw").trim(),
      name: ($("#fwName").value || "State Framework").trim(),
      subjects: ($("#fwSubjects").value || "ELA").split(",").map(s=>s.trim()).filter(Boolean),
      grade_bands: ($("#fwBands").value || "K-2,3-5,6-8,9-10,11-12").split(",").map(s=>s.trim()).filter(Boolean),
      standards
    }]
  };

  if(previewOnly){
    $("#previewBox").textContent = JSON.stringify(pack, null, 2).slice(0, 10000);
  }else{
    const blob = new Blob([JSON.stringify(pack, null, 2)], {type: "application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (pack.id || "state-pack") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    registerPack(pack); populateFrameworks();
    alert("Pack generated, downloaded, and loaded.");
  }
}
