import PDFDocument from "pdfkit";

export default async function handler(req, res){
  if(req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try{
    const {
      title = "Worksheet",
      directions = "",
      questionType = "mixed",
      numQuestions = 10,
      includeAnswerKey = "yes",
      standards = [],
      topic = ""
    } = req.body || {};

    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const fileNameSafe = String(title).replace(/[^a-z0-9-_]+/gi, "_") + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileNameSafe}"`);
    doc.pipe(res);

    const footer = () => drawFooter(doc, standards);
    doc.on("pageAdded", footer);

    doc.fontSize(18).fillColor("#111111").text(title, 54, 60, { width: doc.page.width - 108, align: "left" });
    let y = 96;

    if(directions){
      y = sectionHeader(doc, "Directions", y);
      y = paragraph(doc, directions, y, 13);
    }

    y = sectionHeader(doc, "Questions", y);
    const qs = buildQuestions({ numQuestions, questionType, topic });
    const answers = [];

    for(let i=0;i<qs.length;i++){
      const q = qs[i];
      const block = renderQuestion(doc, { index: i+1, q });
      y = block.nextY;
      if(y > doc.page.height - 96){ footer(); doc.addPage(); y = 72; }
      answers.push({ n: i+1, ans: q.type === "multiple_choice" ? q.correct : "(varies)" });
    }

    footer();

    if(String(includeAnswerKey).toLowerCase() === "yes"){
      doc.addPage();
      doc.fontSize(18).fillColor("#111111").text("Answer Key", 54, 60);
      doc.fontSize(11).fillColor("#111111");
      const colWidth = (doc.page.width - 108) / 3;
      for(let i=0;i<answers.length;i++){
        const col = i % 3; const row = Math.floor(i/3);
        const ax = 54 + col * colWidth; const ay = 100 + row * 20;
        doc.text(`${answers[i].n}. ${answers[i].ans}`, ax, ay);
      }
      footer();
    }

    doc.end();
  }catch(err){
    console.error(err);
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
}

function drawFooter(doc, standards){
  const bottom = doc.page.height - 36;
  const width = doc.page.width - 108;
  doc.fontSize(8).fillColor("#888888").text("DynamicSheets4Teach™", 54, bottom, { width: width/3, align: "left" });
  const codes = (standards && standards.length) ? standards.join(", ") : "—";
  doc.fontSize(8).fillColor("#888888").text(`Aligned with: ${codes}`, 54 + width/3, bottom, { width: width/3, align: "center" });
  doc.fontSize(8).fillColor("#888888").text(`Page ${doc.page.number}`, 54 + 2*width/3, bottom, { width: width/3, align: "right" });
}
function sectionHeader(doc, label, y){
  if(y > doc.page.height - 96){ doc.addPage(); return 72; }
  doc.fontSize(12).fillColor("#111111").text(label.toUpperCase(), 54, y);
  doc.moveTo(54, y+16).lineTo(doc.page.width-54, y+16).stroke("#000000");
  return y + 24;
}
function paragraph(doc, text, y, size=12){
  doc.fontSize(size).fillColor("#111111");
  const h = doc.heightOfString(text, { width: doc.page.width - 108, align: "left" });
  doc.text(text, 54, y, { width: doc.page.width - 108, align: "left" });
  return y + h + 8;
}
function buildQuestions({ numQuestions, questionType, topic }){
  const out = []; const types = ["multiple_choice","short_answer","fill_blank","graphic_organizer"];
  for(let i=0;i<numQuestions;i++){ let t = questionType; if(t === "mixed"){ t = types[i % types.length]; } out.push(makeQuestion(t, topic, i+1)); }
  return out;
}
function makeQuestion(type, topic, n){
  const baseText = topic ? topic : "Practice Item";
  if(type === "multiple_choice"){
    const correctIndex = Math.floor(Math.random()*4); const letters = ["A","B","C","D"];
    const choices = letters.map((L, idx) => `${L}. ${baseText} — option ${idx+1}`);
    return { type, prompt: `Q${n}. Choose the best answer:`, stem: baseText, choices, correct: letters[correctIndex] };
  }
  if(type === "short_answer"){ return { type, prompt: `Q${n}. Respond briefly:`, stem: baseText }; }
  if(type === "fill_blank"){ return { type, prompt: `Q${n}. Complete the sentence:`, stem: baseText }; }
  if(type === "graphic_organizer"){ return { type, prompt: `Q${n}. Complete the organizer:`, stem: baseText }; }
  return { type: "short_answer", prompt: `Q${n}. Respond:`, stem: baseText };
}
function renderQuestion(doc, { index, q }){
  let y = doc.y; const left = 54, right = doc.page.width - 54, width = right - left;
  const title = `${q.prompt}`;
  doc.fontSize(11).fillColor("#111111").text(title, left, y, { width });
  y += doc.heightOfString(title, { width }) + 4;
  if(q.stem){ doc.fontSize(11).fillColor("#111111").text(q.stem, left+8, y, { width }); y += doc.heightOfString(q.stem, { width }) + 6; }
  if(q.type === "multiple_choice"){
    doc.fontSize(11).fillColor("#111111");
    for(const c of q.choices){ const h = doc.heightOfString(c, { width }); doc.text(c, left+12, y, { width }); y += h + 3; }
    y = drawLines(doc, y, 1);
  } else if(q.type === "short_answer"){ y = drawLines(doc, y, 4);
  } else if(q.type === "fill_blank"){ y = drawLines(doc, y, 3);
  } else if(q.type === "graphic_organizer"){
    const boxW = (width - 12)/2, boxH = 70; const r1 = y + 6;
    doc.rect(left, r1, boxW, boxH).stroke("#000000"); doc.rect(left + boxW + 12, r1, boxW, boxH).stroke("#000000");
    const r2 = r1 + boxH + 12; doc.rect(left, r2, boxW, boxH).stroke("#000000"); doc.rect(left + boxW + 12, r2, boxW, boxH).stroke("#000000");
    y = r2 + boxH + 6;
  }
  doc.moveTo(left, y).lineTo(right, y).stroke("#000000"); y += 8; doc.y = y; return { nextY: y };
}
function drawLines(doc, y, count){
  const left = 54, right = doc.page.width - 54;
  for(let i=0;i<count;i++){ const ly = y + i*16; doc.moveTo(left, ly).lineTo(right, ly).stroke("#000000"); }
  return y + count*16 + 4;
}
