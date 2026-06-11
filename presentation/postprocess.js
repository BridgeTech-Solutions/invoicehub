/* Post-traitement : injecte transitions de slide + animations d'entrée (fade cascade)
 * Lit le pptx généré, produit deux fichiers :
 *   - InvoiceHub-v2.pptx                  (transitions + animations)
 *   - InvoiceHub-v2-transitions-only.pptx (transitions seules, filet de sécurité)
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const SRC = path.join(__dirname, "InvoiceHub-v2-Presentation-NEW.pptx");

// Transition par slide (1-indexé). fade par défaut ; push pour les slides sombres/section.
const TRANSITION = {
  1: '<p:transition spd="slow"><p:cover dir="d"/></p:transition>',
  4: '<p:transition spd="med"><p:push dir="l"/></p:transition>',
  11: '<p:transition spd="med"><p:push dir="l"/></p:transition>',
  16: '<p:transition spd="slow"><p:zoom/></p:transition>',
  17: '<p:transition spd="med"><p:push dir="l"/></p:transition>',
  18: '<p:transition spd="slow"><p:cover dir="d"/></p:transition>',
};
const FADE = '<p:transition spd="med"><p:fade/></p:transition>';

// Construit un bloc <p:timing> : fade-in en cascade automatique de tous les spids.
function buildTiming(spids) {
  let cid = 5; // ids 1..4 réservés à la structure
  const pars = spids.map((spid, i) => {
    const a = cid, b = cid + 1, c = cid + 2;
    cid += 3;
    const delay = i === 0 ? "0" : "120"; // 1er auto sur entrée, suivants enchaînés
    return `<p:par><p:cTn id="${a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${c}" dur="350"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
  }).join("");
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${pars}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

function shapeIds(xml) {
  // tous les cNvPr id, sauf le groupe racine (id=1)
  const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1]);
  return ids.filter(id => id !== "1");
}

async function process(withAnimations, outName) {
  const zip = await JSZip.loadAsync(fs.readFileSync(SRC));
  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  for (const f of slideFiles) {
    const n = parseInt(f.match(/slide(\d+)\.xml/)[1], 10);
    let xml = await zip.file(f).async("string");
    const trans = TRANSITION[n] || FADE;
    let inject = trans;
    if (withAnimations) inject += buildTiming(shapeIds(xml));
    // insérer juste avant </p:sld> (après cSld + clrMapOvr → ordre schéma respecté)
    xml = xml.replace(/<\/p:sld>\s*$/, inject + "</p:sld>");
    zip.file(f, xml);
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(path.join(__dirname, outName), buf);
  console.log("✅", outName, `(${slideFiles.length} slides, animations: ${withAnimations})`);
}

(async () => {
  await process(true, "InvoiceHub-v2.pptx");
  await process(false, "InvoiceHub-v2-transitions-only.pptx");
})();
