/* InvoiceHub v2 — Présentation BTS (v3 du deck)
 * Icônes Lucide, logos BTS, sommaire, démo, notes = script à dire, sans IA.
 */
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
const p = new pptxgen();

p.defineLayout({ name: "W", width: 13.333, height: 7.5 });
p.layout = "W";
p.author = "Bridge Technologies Solutions";
p.company = "BTS";
p.title = "InvoiceHub v2";

const C = {
  navy: "0F2D4A", navy2: "16385C", blue: "2D7DD2", blueLt: "6FB1E8",
  ice: "CFE3F5", bg: "F5F7FA", card: "FFFFFF", ink: "1A2A3A",
  muted: "5A6B7B", line: "E2E8F0", green: "2BB673", red: "E2574C",
  amber: "E0A030", gray: "94A3B8", white: "FFFFFF",
};
const FH = "Trebuchet MS", FB = "Calibri";

// ─── Icônes Lucide ─────────────────────────────────────────────
const ICON_DIR = path.join(__dirname, "node_modules/lucide-static/icons");
const _ic = {};
function iconUri(name, color) {
  const key = name + color;
  if (_ic[key]) return _ic[key];
  let svg = fs.readFileSync(path.join(ICON_DIR, name + ".svg"), "utf8");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim()
    .replace(/stroke="currentColor"/g, `stroke="#${color}"`)
    .replace(/stroke-width="2"/g, `stroke-width="2.2"`);
  return (_ic[key] = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"));
}
function iconChip(s, x, y, size, bg, name, ic = C.white) {
  s.addShape(p.ShapeType.roundRect, { x, y, w: size, h: size, fill: { color: bg }, line: { type: "none" }, rectRadius: size * 0.26 });
  const isz = size * 0.56, off = (size - isz) / 2;
  s.addImage({ data: iconUri(name, ic), x: x + off, y: y + off, w: isz, h: isz });
}
const icon = (s, name, x, y, sz, color) => s.addImage({ data: iconUri(name, color), x, y, w: sz, h: sz });

// ─── Logos ─────────────────────────────────────────────────────
const LOGO_RATIO = 1.541;
const logo = (s, dark, x, y, h) => s.addImage({ path: path.join(__dirname, dark ? "logo-bts-white.png" : "logo-bts-blue.png"), x, y, w: h * LOGO_RATIO, h });

function footer(s, idx) {
  s.addText("InvoiceHub v2  ·  Bridge Technologies Solutions", { x: 0.5, y: 7.06, w: 8, h: 0.33, fontFace: FB, fontSize: 9, color: C.muted });
  s.addText(`${idx}`, { x: 12.4, y: 7.06, w: 0.5, h: 0.33, fontFace: FB, fontSize: 9, color: C.muted, align: "right" });
}
function contentTitle(s, kicker, title) {
  s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.52, w: 9, h: 0.3, fontFace: FH, fontSize: 12, bold: true, color: C.blue, charSpacing: 2 });
  s.addText(title, { x: 0.55, y: 0.8, w: 10.5, h: 0.8, fontFace: FH, fontSize: 30, bold: true, color: C.navy });
}
const bgFill = (s, c) => { s.background = { color: c }; };
const notes = (s, t) => s.addNotes(t);

// ════════════════════════════════════════════ 1 — TITRE
{
  const s = p.addSlide(); bgFill(s, C.navy);
  s.addShape(p.ShapeType.ellipse, { x: 9.2, y: 3.4, w: 6.5, h: 6.5, fill: { color: C.blue, transparency: 78 }, line: { type: "none" } });
  s.addShape(p.ShapeType.ellipse, { x: 10.7, y: 4.7, w: 4, h: 4, fill: { color: C.blueLt, transparency: 85 }, line: { type: "none" } });
  logo(s, true, 0.85, 0.8, 0.7);
  s.addText("InvoiceHub", { x: 0.8, y: 2.4, w: 11, h: 1.2, fontFace: FH, fontSize: 76, bold: true, color: C.white });
  s.addText([{ text: "v2", options: { fontSize: 44, bold: true, color: C.blueLt } }, { text: "   ·   De la facturation à la gestion complète", options: { fontSize: 22, color: C.ice } }], { x: 0.85, y: 3.65, w: 11.5, h: 0.8, fontFace: FH });
  s.addText("Vendre · Acheter · Encaisser · Comptabiliser — une seule plateforme, conforme SYSCOHADA / OHADA.", { x: 0.85, y: 4.7, w: 8.6, h: 0.8, fontFace: FB, fontSize: 16, color: C.ice, lineSpacingMultiple: 1.2 });
  s.addText("Présentation de l'évolution v1 → v2", { x: 0.85, y: 6.4, w: 8, h: 0.4, fontFace: FB, fontSize: 13, italic: true, color: C.blueLt });
  notes(s, "Bonjour à tous. Vous connaissez déjà InvoiceHub : c'est l'outil avec lequel nous facturons nos clients depuis la première version. Aujourd'hui, je vais vous présenter la version 2. Et vous allez voir, ce n'est plus seulement un outil de facturation : c'est devenu une véritable plateforme de gestion, qui couvre toute l'activité de l'entreprise, de l'achat jusqu'à la comptabilité. Je vais vous montrer d'où l'on part, tout ce qui a été ajouté, et où nous en sommes aujourd'hui.");
}

// ════════════════════════════════════════════ 2 — SOMMAIRE
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "Au programme", "Sommaire");
  const items = [
    { ic: "file-text", t: "Le point de départ — la v1" },
    { ic: "lightbulb", t: "Le besoin & la vision de la v2" },
    { ic: "layout-dashboard", t: "Les grands modules ajoutés" },
    { ic: "shield-check", t: "Conformité OHADA & socle technique" },
    { ic: "gauge", t: "Où en est-on aujourd'hui ?" },
    { ic: "monitor", t: "Démonstration en direct" },
  ];
  items.forEach((it, i) => {
    const y = 1.85 + i * 0.78;
    s.addShape(p.ShapeType.roundRect, { x: 0.6, y, w: 12.1, h: 0.64, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.08 });
    s.addShape(p.ShapeType.roundRect, { x: 0.78, y: y + 0.09, w: 0.46, h: 0.46, fill: { color: C.navy }, line: { type: "none" }, rectRadius: 0.08 });
    s.addText(`${i + 1}`, { x: 0.78, y: y + 0.09, w: 0.46, h: 0.46, align: "center", valign: "middle", fontFace: FH, fontSize: 16, bold: true, color: C.white });
    icon(s, it.ic, 1.55, y + 0.17, 0.3, C.blue);
    s.addText(it.t, { x: 2.1, y, w: 10.3, h: 0.64, fontFace: FB, fontSize: 15, color: C.ink, valign: "middle" });
  });
  footer(s, 2);
  notes(s, "Voici comment je vais procéder. D'abord, un rappel de ce que faisait la première version. Ensuite, le besoin qui nous a poussés à aller plus loin, et la vision de la version 2. Puis je vous présenterai les grands modules que nous avons ajoutés. Nous verrons comment tout cela respecte les règles comptables OHADA. Je serai ensuite totalement transparent sur l'état d'avancement réel du projet. Et pour finir, je vous ferai une démonstration en direct.");
}

// ════════════════════════════════════════════ 3 — v1
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "Le point de départ", "La v1 : une application de vente");
  s.addText("Efficace, mais limitée à un seul maillon de la chaîne de gestion.", { x: 0.6, y: 1.55, w: 11.5, h: 0.4, fontFace: FB, fontSize: 15, italic: true, color: C.muted });
  const had = ["Clients", "Produits", "Proformas / Devis", "Factures de vente", "Paiements", "Tableau de bord"];
  s.addText("CE QUE LA V1 SAVAIT FAIRE", { x: 0.6, y: 2.25, w: 5.6, h: 0.3, fontFace: FH, fontSize: 12, bold: true, color: C.navy, charSpacing: 1 });
  had.forEach((t, i) => {
    const y = 2.7 + i * 0.62;
    s.addShape(p.ShapeType.roundRect, { x: 0.6, y, w: 5.6, h: 0.5, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.08 });
    icon(s, "check", 0.78, y + 0.13, 0.24, C.green);
    s.addText(t, { x: 1.2, y, w: 4.9, h: 0.5, fontFace: FB, fontSize: 14, color: C.ink, valign: "middle" });
  });
  const missing = ["Achats & fournisseurs", "Suivi de stock", "Factures récurrentes", "Comptabilité", "Banque & rapprochement", "Rapports & déclaration TVA"];
  s.addText("CE QU'IL MANQUAIT", { x: 7.1, y: 2.25, w: 5.6, h: 0.3, fontFace: FH, fontSize: 12, bold: true, color: C.red, charSpacing: 1 });
  missing.forEach((t, i) => {
    const y = 2.7 + i * 0.62;
    s.addShape(p.ShapeType.roundRect, { x: 7.1, y, w: 5.6, h: 0.5, fill: { color: "FBEDEC" }, line: { color: "F3D2CF", width: 1 }, rectRadius: 0.08 });
    icon(s, "x", 7.28, y + 0.13, 0.24, C.red);
    s.addText(t, { x: 7.7, y, w: 4.9, h: 0.5, fontFace: FB, fontSize: 14, color: C.ink, valign: "middle" });
  });
  footer(s, 3);
  notes(s, "Reprenons depuis le début. La première version d'InvoiceHub faisait une chose, et elle la faisait bien : la vente. On créait des clients, un catalogue de produits, des devis — les proformas — qu'on transformait en factures, et on enregistrait les paiements, avec un tableau de bord pour suivre l'activité. Mais elle s'arrêtait là. Dès qu'il fallait acheter à un fournisseur, suivre un stock, tenir une comptabilité ou pointer les opérations bancaires, on sortait du logiciel : Excel, papier, ou un autre outil. C'est exactement ce manque que la version 2 vient combler.");
}

// ════════════════════════════════════════════ 4 — BESOIN / VISION
{
  const s = p.addSlide(); bgFill(s, C.navy);
  s.addShape(p.ShapeType.ellipse, { x: -2, y: -2.5, w: 7, h: 7, fill: { color: C.blue, transparency: 82 }, line: { type: "none" } });
  logo(s, true, 11.55, 0.45, 0.45);
  s.addText("LE BESOIN", { x: 0.8, y: 0.85, w: 8, h: 0.4, fontFace: FH, fontSize: 13, bold: true, color: C.blueLt, charSpacing: 2 });
  s.addText("Gérer tout le cycle, pas seulement vendre", { x: 0.8, y: 1.25, w: 11.5, h: 1.0, fontFace: FH, fontSize: 34, bold: true, color: C.white });
  s.addText("Une entreprise ne fait pas que vendre. Elle achète, gère ses stocks, suit sa trésorerie, tient sa comptabilité et répond à ses obligations OHADA. La v2 couvre l'ensemble de ce cycle.", { x: 0.8, y: 2.45, w: 11.6, h: 1.0, fontFace: FB, fontSize: 17, color: C.ice, lineSpacingMultiple: 1.25 });
  const steps = [
    { ic: "shopping-cart", t: "Acheter", d: "Fournisseurs, BC,\nfactures fournisseurs" },
    { ic: "package", t: "Gérer", d: "Stock,\nmouvements" },
    { ic: "credit-card", t: "Encaisser", d: "Factures, paiements,\nbanque" },
    { ic: "calculator", t: "Comptabiliser", d: "Écritures, TVA,\nrapports SYSCOHADA" },
  ];
  steps.forEach((st, i) => {
    const x = 0.8 + i * 3.05;
    s.addShape(p.ShapeType.roundRect, { x, y: 4.05, w: 2.75, h: 2.4, fill: { color: C.navy2 }, line: { color: C.blue, width: 1 }, rectRadius: 0.1 });
    iconChip(s, x + 1.0, 4.3, 0.75, C.blue, st.ic, C.white);
    s.addText(st.t, { x, y: 5.2, w: 2.75, h: 0.4, align: "center", fontFace: FH, fontSize: 17, bold: true, color: C.white });
    s.addText(st.d, { x: x + 0.1, y: 5.6, w: 2.55, h: 0.7, align: "center", fontFace: FB, fontSize: 11.5, color: C.ice });
    if (i < 3) icon(s, "arrow-right", x + 2.74, 5.05, 0.34, C.blueLt);
  });
  notes(s, "Parce qu'une entreprise ne fait pas que vendre. Elle achète des marchandises, elle gère un stock, elle suit sa trésorerie, elle tient sa comptabilité, et elle doit répondre à ses obligations légales OHADA. La vision de la version 2, c'est de couvrir tout ce cycle dans un seul outil : on achète, on gère le stock, on encaisse, et on comptabilise. Et surtout, les données circulent d'un bout à l'autre : un achat alimente le stock, une vente le diminue, et tout se retrouve automatiquement en comptabilité.");
}

// ════════════════════════════════════════════ 5 — AVANT / APRÈS
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "En un coup d'œil", "Avant / Après");
  s.addShape(p.ShapeType.roundRect, { x: 0.6, y: 1.9, w: 5.7, h: 4.7, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.12 });
  s.addShape(p.ShapeType.roundRect, { x: 7.0, y: 1.9, w: 5.7, h: 4.7, fill: { color: C.navy }, line: { type: "none" }, rectRadius: 0.12 });
  s.addText("v1", { x: 0.6, y: 2.2, w: 5.7, h: 0.6, align: "center", fontFace: FH, fontSize: 22, bold: true, color: C.muted });
  s.addText("6", { x: 0.6, y: 2.7, w: 5.7, h: 1.4, align: "center", fontFace: FH, fontSize: 96, bold: true, color: C.muted });
  s.addText("domaines fonctionnels", { x: 0.6, y: 4.1, w: 5.7, h: 0.4, align: "center", fontFace: FB, fontSize: 15, color: C.muted });
  s.addText("Ventes uniquement", { x: 0.6, y: 4.65, w: 5.7, h: 0.4, align: "center", fontFace: FB, fontSize: 14, italic: true, color: C.muted });
  s.addText("Clients · Produits · Proformas · Factures · Paiements · Dashboard", { x: 0.9, y: 5.25, w: 5.1, h: 1.0, align: "center", fontFace: FB, fontSize: 12, color: C.muted, lineSpacingMultiple: 1.2 });
  s.addText("v2", { x: 7.0, y: 2.2, w: 5.7, h: 0.6, align: "center", fontFace: FH, fontSize: 22, bold: true, color: C.blueLt });
  s.addText("30+", { x: 7.0, y: 2.7, w: 5.7, h: 1.4, align: "center", fontFace: FH, fontSize: 92, bold: true, color: C.white });
  s.addText("modules métier", { x: 7.0, y: 4.1, w: 5.7, h: 0.4, align: "center", fontFace: FB, fontSize: 15, color: C.ice });
  s.addText("Plateforme de gestion complète", { x: 7.0, y: 4.65, w: 5.7, h: 0.4, align: "center", fontFace: FB, fontSize: 14, italic: true, color: C.blueLt });
  s.addText("Ventes · Achats · Stock · Banque · Comptabilité · Rapports · Gouvernance · Productivité", { x: 7.3, y: 5.25, w: 5.1, h: 1.0, align: "center", fontFace: FB, fontSize: 12, color: C.ice, lineSpacingMultiple: 1.2 });
  icon(s, "arrow-right", 6.35, 3.85, 0.65, C.blue);
  footer(s, 5);
  notes(s, "En une image : la première version couvrait six domaines, tous liés à la vente. La version 2 en couvre plus de trente. On ne parle pas d'une simple mise à jour : on a changé d'échelle. On est passé d'une application de facturation à une plateforme de gestion d'entreprise complète. Je le précise tout de suite, et j'y reviendrai à la fin en toute transparence : tous ces modules ne sont pas encore validés pour la production, certains sont encore en cours de fiabilisation.");
}

// ════════════════════════════════════════════ 6 — CARTOGRAPHIE (8 cartes)
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "Vue d'ensemble", "Les grands chantiers de la v2");
  const cards = [
    { ic: "shopping-cart", t: "Cycle Achats", d: "Fournisseurs, BC, factures fournisseurs", c: C.blue },
    { ic: "package", t: "Stock", d: "Niveaux, mouvements, alertes", c: C.green },
    { ic: "repeat", t: "Factures récurrentes", d: "Abonnements générés tout seuls", c: C.amber },
    { ic: "landmark", t: "Banque & Trésorerie", d: "Import relevés, rapprochement", c: C.blue },
    { ic: "calculator", t: "Comptabilité", d: "SYSCOHADA, partie double", c: C.navy },
    { ic: "chart-column", t: "Rapports & TVA", d: "CA, impayés, déclaration TVA", c: C.green },
    { ic: "shield-check", t: "Gouvernance", d: "Maker/checker, audit, RBAC", c: C.red },
    { ic: "keyboard", t: "Productivité", d: "Raccourcis, recherche, temps réel", c: C.blue },
  ];
  const cols = 4, cw = 2.94, ch = 2.15, gx = 0.21, gy = 0.3, x0 = 0.5, y0 = 1.8;
  cards.forEach((c, i) => {
    const r = Math.floor(i / cols), col = i % cols;
    const x = x0 + col * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.1 });
    iconChip(s, x + (cw - 0.8) / 2, y + 0.28, 0.8, c.c, c.ic, C.white);
    s.addText(c.t, { x: x + 0.1, y: y + 1.18, w: cw - 0.2, h: 0.4, align: "center", fontFace: FH, fontSize: 14.5, bold: true, color: C.navy });
    s.addText(c.d, { x: x + 0.15, y: y + 1.55, w: cw - 0.3, h: 0.5, align: "center", fontFace: FB, fontSize: 10.5, color: C.muted, lineSpacingMultiple: 1.0 });
  });
  footer(s, 6);
  notes(s, "Voici une vue d'ensemble des grands chantiers de la version 2. Il y a le cycle des achats, la gestion de stock, les factures récurrentes, la banque, la comptabilité, les rapports, la gouvernance, et la productivité. Je ne vais pas tous les détailler ici — je vais m'arrêter sur les plus importants dans les prochaines minutes.");
}

// ── focus helper ──
function focusSlide(idx, kicker, title, iconName, accent, intro, features, badge, badgeColor, note) {
  const s = p.addSlide(); bgFill(s, C.bg);
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 4.6, h: 7.5, fill: { color: C.navy }, line: { type: "none" } });
  s.addShape(p.ShapeType.ellipse, { x: -1.5, y: 4.4, w: 5, h: 5, fill: { color: accent, transparency: 80 }, line: { type: "none" } });
  iconChip(s, 0.6, 0.8, 1.25, accent, iconName, C.white);
  s.addText(kicker.toUpperCase(), { x: 0.6, y: 2.3, w: 3.7, h: 0.35, fontFace: FH, fontSize: 12, bold: true, color: C.blueLt, charSpacing: 1.5 });
  s.addText(title, { x: 0.55, y: 2.65, w: 3.9, h: 1.8, fontFace: FH, fontSize: 30, bold: true, color: C.white, lineSpacingMultiple: 0.95 });
  if (badge) {
    s.addShape(p.ShapeType.roundRect, { x: 0.6, y: 6.35, w: 2.35, h: 0.5, fill: { color: badgeColor }, line: { type: "none" }, rectRadius: 0.25 });
    s.addText(badge, { x: 0.6, y: 6.35, w: 2.35, h: 0.5, align: "center", valign: "middle", fontFace: FH, fontSize: 11.5, bold: true, color: C.white });
  }
  s.addText(intro, { x: 5.0, y: 0.85, w: 7.7, h: 1.0, fontFace: FB, fontSize: 16, italic: true, color: C.muted, lineSpacingMultiple: 1.2 });
  features.forEach((f, i) => {
    const y = 2.1 + i * 1.05;
    s.addShape(p.ShapeType.roundRect, { x: 5.0, y, w: 7.7, h: 0.88, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.08 });
    s.addShape(p.ShapeType.roundRect, { x: 5.18, y: y + 0.19, w: 0.5, h: 0.5, fill: { color: accent }, line: { type: "none" }, rectRadius: 0.12 });
    s.addText(`${i + 1}`, { x: 5.18, y: y + 0.19, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: FH, fontSize: 16, bold: true, color: C.white });
    s.addText([{ text: f.t + "\n", options: { fontFace: FH, fontSize: 15, bold: true, color: C.navy } }, { text: f.d, options: { fontFace: FB, fontSize: 12, color: C.muted } }], { x: 5.85, y: y + 0.05, w: 6.7, h: 0.78, valign: "middle", lineSpacingMultiple: 1.0 });
  });
  footer(s, idx);
  notes(s, note);
}

// 7 — Achats
focusSlide(7, "Nouveau en v2", "Le cycle\nAchats", "shopping-cart", C.blue,
  "Là où la v1 ne savait que vendre, la v2 gère la chaîne d'approvisionnement de bout en bout.",
  [
    { t: "Fournisseurs", d: "Fiche complète : coordonnées, RIB/SWIFT, conditions de paiement, notation" },
    { t: "Bons de commande", d: "Création, envoi, réception, suivi — numérotation SYSCOHADA" },
    { t: "Factures fournisseurs", d: "Rattachées aux BC, contrôle des montants reçus" },
    { t: "Dépenses", d: "Saisie et suivi des charges, catégories et budgets" },
  ], "EN VALIDATION", C.amber,
  "Commençons par les achats. C'est le grand miroir de la vente. Concrètement : on enregistre nos fournisseurs, avec leurs coordonnées bancaires et leurs conditions de paiement. On émet des bons de commande, qu'on peut envoyer puis marquer comme reçus. Et quand la facture du fournisseur arrive, on l'enregistre en la rattachant au bon de commande, ce qui permet de vérifier que les montants correspondent. On gère aussi les dépenses courantes, avec des catégories et des budgets. À noter : achats et ventes partagent le même catalogue de produits. Ce module est développé, et nous sommes en train de le valider avant de l'utiliser en production.");

// 8 — Stock + Récurrent
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "Nouveau en v2", "Stock & Factures récurrentes");
  const blocks = [
    { x: 0.6, ic: "package", t: "Suivi de stock", c: C.green, pts: ["Niveaux de stock par produit", "Mouvements d'entrée / sortie", "Alertes de seuil bas", "Historique par article"] },
    { x: 6.95, ic: "repeat", t: "Factures récurrentes", c: C.amber, pts: ["Modèles d'abonnement réutilisables", "Génération automatique planifiée", "Idéal pour contrats & maintenance", "Zéro ressaisie mensuelle"] },
  ];
  blocks.forEach((b) => {
    s.addShape(p.ShapeType.roundRect, { x: b.x, y: 1.85, w: 5.78, h: 4.8, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.12 });
    iconChip(s, b.x + 0.4, 2.25, 1.1, b.c, b.ic, C.white);
    s.addText(b.t, { x: b.x + 1.7, y: 2.35, w: 3.9, h: 0.6, fontFace: FH, fontSize: 22, bold: true, color: C.navy, valign: "middle" });
    s.addText("Absent de la v1.", { x: b.x + 1.72, y: 2.95, w: 3.9, h: 0.4, fontFace: FB, fontSize: 13, italic: true, color: C.red });
    b.pts.forEach((pt, i) => {
      const y = 3.8 + i * 0.62;
      icon(s, "circle-dot", b.x + 0.45, y + 0.08, 0.22, b.c);
      s.addText(pt, { x: b.x + 0.85, y, w: 4.7, h: 0.5, fontFace: FB, fontSize: 13.5, color: C.ink, valign: "middle" });
    });
  });
  footer(s, 8);
  notes(s, "Deux nouveautés que la version 1 n'avait pas du tout. À gauche, le stock : on sait enfin combien on a de chaque article, chaque entrée et chaque sortie est enregistrée, et le système nous alerte quand un produit passe sous un seuil critique. À droite, les factures récurrentes : on crée un modèle une seule fois, et le logiciel génère la facture tout seul à chaque échéance. C'est idéal pour les abonnements, les contrats de maintenance ou les loyers : fini les oublis et la ressaisie chaque mois.");
}

// 9 — Banque
focusSlide(9, "Nouveau en v2", "Banque &\nrapprochement", "landmark", C.blue,
  "La v2 connecte la facturation à la réalité bancaire — un atout majeur pour la trésorerie.",
  [
    { t: "Comptes & relevés", d: "Import de relevés bancaires : détection, prévisualisation, confirmation" },
    { t: "Rapprochement automatique", d: "Auto-matching des transactions avec suggestions intelligentes" },
    { t: "Règles & profils d'import", d: "Formats de relevés mémorisés par banque, règles de correspondance" },
    { t: "Rapports de rapprochement", d: "État de la trésorerie et écarts identifiés" },
  ], "EN VALIDATION", C.amber,
  "Le module banque relie l'argent réel à nos factures. On importe le relevé bancaire — le système reconnaît le format de notre banque — et le rapprochement automatique propose, pour chaque ligne du relevé, à quelle facture ou quel paiement elle correspond. On valide en un clic. Le bénéfice est énorme : on sait précisément qui a payé, ce qui reste dû, et l'état réel de notre trésorerie, sans tout pointer à la main. Comme les achats, ce module est développé et en cours de validation.");

// 10 — Comptabilité
focusSlide(10, "Nouveau en v2 · chantier structurant", "Comptabilité\nSYSCOHADA", "scale", "1C5DA0",
  "La v2 tient la comptabilité générale automatiquement, en partie double et conforme OHADA — et alimente votre outil expert pour les états financiers.",
  [
    { t: "Écritures 100 % automatiques", d: "Chaque facture, paiement, achat et mouvement de stock génère son écriture SYSCOHADA" },
    { t: "Lettrage & inventaire permanent", d: "Lettrage auto clients/fournisseurs, stock valorisé au CMUP" },
    { t: "Plan comptable, journaux, balance, grand livre", d: "Comptes paramétrables, numérotation continue sans trou" },
    { t: "TVA & export Sage", d: "TVA collectée/déductible comptabilisées, export vers le cabinet" },
  ], "EN VALIDATION", C.amber,
  "Et voici le chantier le plus important : la comptabilité. La première version n'en avait aucune. Et là, attention : la version 2 ne se contente pas de stocker des écritures — elle tient la comptabilité générale toute seule. Chaque facture émise, chaque encaissement, chaque achat, chaque paiement fournisseur et même chaque mouvement de stock génère automatiquement son écriture comptable, en partie double et conforme au SYSCOHADA. Le lettrage des clients et des fournisseurs se fait automatiquement, et le stock est valorisé au coût moyen pondéré. Le comptable n'a plus qu'à vérifier et valider. Soyons clairs sur le positionnement : l'application tient la comptabilité au quotidien, et elle alimente votre logiciel comptable expert — via l'export Sage — pour les états financiers et la clôture. Je suis transparent : ce module est en cours de validation comptable, c'est celui qui demande le plus de rigueur avant la mise en production.");

// 11 — Gouvernance & sécurité
{
  const s = p.addSlide(); bgFill(s, C.navy);
  s.addShape(p.ShapeType.ellipse, { x: 9.5, y: -2, w: 6.5, h: 6.5, fill: { color: C.blue, transparency: 82 }, line: { type: "none" } });
  logo(s, true, 11.55, 0.45, 0.45);
  s.addText("NOUVEAU EN V2", { x: 0.8, y: 0.7, w: 8, h: 0.35, fontFace: FH, fontSize: 12, bold: true, color: C.blueLt, charSpacing: 2 });
  s.addText("Gouvernance & sécurité", { x: 0.8, y: 1.05, w: 11.7, h: 0.8, fontFace: FH, fontSize: 30, bold: true, color: C.white });
  const items = [
    { ic: "workflow", t: "Validation maker / checker", d: "Celui qui saisit n'est pas celui qui valide — contrôle interne" },
    { ic: "file-check", t: "Audit immuable", d: "Traçabilité complète : qui, quoi, quand — impossible à altérer" },
    { ic: "users", t: "RBAC granulaire", d: "Permissions fines par rôle et par module" },
    { ic: "lock", t: "Sécurité renforcée", d: "2FA + codes de secours, gestion des sessions, clés API" },
    { ic: "save", t: "Sauvegardes", d: "Sauvegardes des données pour la continuité d'activité" },
    { ic: "globe", t: "Liste blanche IP", d: "Restreindre l'accès aux adresses autorisées" },
  ];
  const cols = 2, cw = 5.85, ch = 1.45, gx = 0.3, gy = 0.25, x0 = 0.8, y0 = 2.1;
  items.forEach((it, i) => {
    const r = Math.floor(i / cols), col = i % cols;
    const x = x0 + col * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: C.navy2 }, line: { color: C.blue, width: 1 }, rectRadius: 0.1 });
    iconChip(s, x + 0.22, y + 0.28, 0.85, C.blue, it.ic, C.white);
    s.addText(it.t, { x: x + 1.25, y: y + 0.2, w: cw - 1.4, h: 0.4, fontFace: FH, fontSize: 15.5, bold: true, color: C.white, valign: "middle" });
    s.addText(it.d, { x: x + 1.25, y: y + 0.62, w: cw - 1.45, h: 0.7, fontFace: FB, fontSize: 11.5, color: C.ice, lineSpacingMultiple: 1.05 });
  });
  notes(s, "Au-delà des fonctions, la version 2 apporte de la confiance. Le maker-checker : la personne qui saisit une opération sensible n'est pas celle qui la valide — c'est du contrôle interne, une sécurité contre les erreurs et les fraudes. L'audit : tout ce qui se passe est tracé, de façon inaltérable. Le système de rôles : chacun n'a accès qu'à ce que son poste autorise. La sécurité des comptes : double authentification, gestion des sessions, clés d'API. Les sauvegardes des données. Et la liste blanche d'adresses IP, pour restreindre l'accès aux connexions autorisées.");
}

// 12 — Raccourcis
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "Productivité", "Des raccourcis qui changent tout");
  s.addText("Naviguer et créer sans jamais lâcher le clavier — pensé pour les utilisateurs intensifs.", { x: 0.6, y: 1.55, w: 11.5, h: 0.4, fontFace: FB, fontSize: 15, italic: true, color: C.muted });
  iconChip(s, 0.6, 2.2, 0.85, C.blue, "keyboard", C.white);
  s.addText("Actions rapides", { x: 1.6, y: 2.25, w: 4.6, h: 0.5, fontFace: FH, fontSize: 18, bold: true, color: C.navy, valign: "middle" });
  [["N", "Nouvelle facture"], ["P", "Nouvelle proforma"], ["C", "Nouveau client"], ["/", "Recherche globale"], ["?", "Aide / raccourcis"]].forEach(([k, lbl], i) => {
    const y = 3.05 + i * 0.62;
    s.addShape(p.ShapeType.roundRect, { x: 0.6, y, w: 0.55, h: 0.45, fill: { color: C.navy }, line: { type: "none" }, rectRadius: 0.06 });
    s.addText(k, { x: 0.6, y, w: 0.55, h: 0.45, align: "center", valign: "middle", fontFace: "Consolas", fontSize: 15, bold: true, color: C.white });
    s.addText(lbl, { x: 1.3, y, w: 4.6, h: 0.45, fontFace: FB, fontSize: 14, color: C.ink, valign: "middle" });
  });
  iconChip(s, 6.7, 2.2, 0.85, C.green, "command", C.white);
  s.addText("Navigation « G » + lettre", { x: 7.7, y: 2.25, w: 5.0, h: 0.5, fontFace: FH, fontSize: 18, bold: true, color: C.navy, valign: "middle" });
  [["G D", "Tableau de bord"], ["G F", "Factures"], ["G P", "Proformas"], ["G B", "Bons de commande"], ["G M", "Comptabilité"], ["G A", "Banque"], ["G R", "Rapports"]].forEach(([k, lbl], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 6.7 + col * 3.05, y = 3.05 + row * 0.62;
    s.addShape(p.ShapeType.roundRect, { x, y, w: 0.95, h: 0.45, fill: { color: C.green }, line: { type: "none" }, rectRadius: 0.06 });
    s.addText(k, { x, y, w: 0.95, h: 0.45, align: "center", valign: "middle", fontFace: "Consolas", fontSize: 13, bold: true, color: C.white });
    s.addText(lbl, { x: x + 1.05, y, w: 1.95, h: 0.45, fontFace: FB, fontSize: 12.5, color: C.ink, valign: "middle" });
  });
  s.addText("…et 6 autres destinations (dépenses, stock, notifications, utilisateurs, paramètres…).", { x: 6.7, y: 6.35, w: 6.0, h: 0.4, fontFace: FB, fontSize: 11.5, italic: true, color: C.muted });
  footer(s, 12);
  notes(s, "Un détail qui change la vie de ceux qui utilisent l'application toute la journée : les raccourcis clavier. À gauche, les actions rapides : je tape N et je crée une facture, P pour une proforma, la barre oblique pour lancer une recherche. À droite, un système de navigation à deux touches, comme dans Gmail : je tape G puis une lettre, et je vais directement où je veux — G puis F pour les factures, G puis M pour la comptabilité, G puis A pour la banque. Pour un comptable ou un commercial, c'est un gain de temps considérable : on ne touche presque plus la souris. Je vous le montrerai pendant la démonstration.");
}

// 13 — OHADA
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "Pourquoi c'est important", "Conçu pour la conformité OHADA");
  s.addText("Chaque brique de la v2 respecte les exigences du système comptable ouest-africain.", { x: 0.6, y: 1.55, w: 11.5, h: 0.4, fontFace: FB, fontSize: 15, italic: true, color: C.muted });
  const items = [
    { ic: "hash", t: "Numérotation normalisée", d: "Format SYSCOHADA atomique et sans trou :\nBTS/{bureau}/{année}/{mois}/{type}{n°}" },
    { ic: "scale", t: "Partie double", d: "Écritures équilibrées, journaux, exercices fiscaux et clôtures de période" },
    { ic: "percent", t: "TVA & taxes", d: "Taux paramétrables et synthèse de TVA prête pour la déclaration" },
    { ic: "shield-check", t: "Piste d'audit immuable", d: "Historique inaltérable de toutes les opérations sensibles" },
  ];
  const cols = 2, cw = 5.9, ch = 1.95, gx = 0.3, gy = 0.3, x0 = 0.6, y0 = 2.15;
  items.forEach((it, i) => {
    const r = Math.floor(i / cols), col = i % cols;
    const x = x0 + col * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.1 });
    iconChip(s, x + 0.3, y + 0.35, 1.0, C.navy, it.ic, C.white);
    s.addText(it.t, { x: x + 1.5, y: y + 0.32, w: cw - 1.7, h: 0.5, fontFace: FH, fontSize: 17, bold: true, color: C.navy });
    s.addText(it.d, { x: x + 1.5, y: y + 0.82, w: cw - 1.7, h: 1.0, fontFace: FB, fontSize: 12.5, color: C.muted, lineSpacingMultiple: 1.15 });
  });
  footer(s, 13);
  notes(s, "Pourquoi tout cela est-il important ? Parce qu'au Cameroun, la conformité OHADA n'est pas une option, c'est une obligation légale. Nos numéros de factures sont continus, sans trou, et infalsifiables — exactement ce que l'administration exige. La comptabilité est en partie double, la base de toute comptabilité reconnue. La TVA est paramétrable et prête à être déclarée. Et la piste d'audit est inaltérable : en cas de contrôle, tout est justifiable. InvoiceHub version 2 est pensé pour être en règle, pas bricolé.");
}

// 14 — Sous le capot
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "Sous le capot", "Une base technique moderne");
  const stack = [
    { ic: "server", t: "Backend", d: "NestJS · TypeScript · Prisma" },
    { ic: "database", t: "Base de données", d: "PostgreSQL 15+" },
    { ic: "monitor", t: "Frontend", d: "Next.js 15 · React · TanStack Query" },
    { ic: "zap", t: "Temps réel", d: "Socket.io · files de jobs (BullMQ)" },
    { ic: "lock", t: "Sécurité", d: "JWT + refresh · 2FA TOTP · RBAC" },
    { ic: "rocket", t: "Déploiement", d: "Serveur Windows · Nginx · PM2 · Redis" },
  ];
  const cols = 3, cw = 3.95, ch = 1.6, gx = 0.25, gy = 0.3, x0 = 0.6, y0 = 1.9;
  stack.forEach((it, i) => {
    const r = Math.floor(i / cols), col = i % cols;
    const x = x0 + col * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.1 });
    iconChip(s, x + 0.25, y + 0.35, 0.9, C.blue, it.ic, C.white);
    s.addText(it.t, { x: x + 1.3, y: y + 0.32, w: cw - 1.45, h: 0.45, fontFace: FH, fontSize: 16, bold: true, color: C.navy, valign: "middle" });
    s.addText(it.d, { x: x + 1.3, y: y + 0.78, w: cw - 1.45, h: 0.7, fontFace: FB, fontSize: 12, color: C.muted, lineSpacingMultiple: 1.1 });
  });
  s.addText("Architecture pensée pour la fiabilité, la sécurité et l'évolutivité.", { x: 0.6, y: 6.5, w: 11.5, h: 0.4, fontFace: FB, fontSize: 13, italic: true, color: C.muted, align: "center" });
  footer(s, 14);
  notes(s, "Quelques mots sur la technique, sans entrer dans les détails. La plateforme repose sur des technologies modernes et éprouvées, les mêmes que celles des grandes applications professionnelles : une base de données robuste, des notifications en temps réel, une sécurité de niveau professionnel, et un déploiement maîtrisé sur notre propre serveur. L'idée à retenir : c'est solide, sécurisé, et fait pour durer et évoluer.");
}

// 15 — État d'avancement
{
  const s = p.addSlide(); bgFill(s, C.bg);
  logo(s, false, 11.55, 0.45, 0.45);
  contentTitle(s, "En toute transparence", "Où en est-on aujourd'hui ?");
  const cols = [
    { t: "Opérationnel", c: C.green, ic: "circle-check", items: ["Ventes (proformas, factures, paiements)", "Stock & mouvements", "Utilisateurs, rôles & sécurité", "Notifications & tableau de bord"] },
    { t: "En validation", c: C.amber, ic: "clock", items: ["Achats & fournisseurs", "Banque & rapprochement", "Comptabilité SYSCOHADA", "Rapports & déclarations TVA", "Workflow maker / checker", "Factures récurrentes"] },
    { t: "À finaliser", c: C.gray, ic: "list-checks", items: ["Mise en production HTTPS", "Tests de bout en bout", "Documentation (guides, vidéos)", "Formation des équipes"] },
  ];
  cols.forEach((col, i) => {
    const x = 0.6 + i * 4.12;
    s.addShape(p.ShapeType.roundRect, { x, y: 1.75, w: 3.9, h: 4.9, fill: { color: C.card }, line: { color: C.line, width: 1 }, rectRadius: 0.1 });
    s.addShape(p.ShapeType.roundRect, { x, y: 1.75, w: 3.9, h: 0.85, fill: { color: col.c }, line: { type: "none" }, rectRadius: 0.1 });
    s.addShape(p.ShapeType.rect, { x, y: 2.2, w: 3.9, h: 0.4, fill: { color: col.c }, line: { type: "none" } });
    icon(s, col.ic, x + 0.32, 1.97, 0.4, C.white);
    s.addText(col.t, { x: x + 0.85, y: 1.75, w: 2.9, h: 0.85, fontFace: FH, fontSize: 17, bold: true, color: C.white, valign: "middle" });
    col.items.forEach((it, j) => {
      const y = 2.9 + j * 0.58;
      icon(s, "circle-dot", x + 0.28, y + 0.05, 0.2, col.c);
      s.addText(it, { x: x + 0.62, y, w: 3.1, h: 0.52, fontFace: FB, fontSize: 11.5, color: C.ink, valign: "middle", lineSpacingMultiple: 0.95 });
    });
  });
  footer(s, 15);
  notes(s, "Je veux être totalement transparent avec vous sur où nous en sommes. En vert, ce qui est opérationnel et utilisable dès maintenant : les ventes, le stock, les utilisateurs et la sécurité, les notifications et le tableau de bord. En orange, ce qui est développé mais encore en validation — on le teste et on le fiabilise avant de s'en servir vraiment : les achats, la banque, la comptabilité, les rapports et les factures récurrentes. Et en gris, ce qu'il reste à faire avant la mise en service complète : le passage en HTTPS, les tests de bout en bout, la documentation et la formation. Je ne vous vends pas un produit fini ; je vous montre une plateforme très avancée, et un cap clair pour la suite.");
}

// 16 — DÉMO
{
  const s = p.addSlide(); bgFill(s, C.navy);
  s.addShape(p.ShapeType.ellipse, { x: 8.5, y: 2.6, w: 8, h: 8, fill: { color: C.blue, transparency: 80 }, line: { type: "none" } });
  s.addShape(p.ShapeType.ellipse, { x: -2.5, y: -2.5, w: 6.5, h: 6.5, fill: { color: C.blue, transparency: 85 }, line: { type: "none" } });
  logo(s, true, 0.85, 0.7, 0.6);
  iconChip(s, 0.85, 2.5, 1.5, C.blue, "monitor", C.white);
  s.addText("DÉMONSTRATION", { x: 0.85, y: 4.3, w: 11, h: 0.45, fontFace: FH, fontSize: 14, bold: true, color: C.blueLt, charSpacing: 3 });
  s.addText("Place à la pratique", { x: 0.8, y: 4.7, w: 11.5, h: 1.0, fontFace: FH, fontSize: 52, bold: true, color: C.white });
  s.addText("InvoiceHub en conditions réelles : créer un client, un devis, le transformer en facture — avec la recherche et les raccourcis clavier.", { x: 0.85, y: 5.85, w: 9.5, h: 0.8, fontFace: FB, fontSize: 16, color: C.ice, lineSpacingMultiple: 1.2 });
  notes(s, "Assez de diapositives — le mieux, c'est de voir l'outil en vrai. Je vais vous montrer InvoiceHub en conditions réelles. On va créer un client, faire un devis, le transformer en facture, et je vous montrerai au passage la recherche globale et les fameux raccourcis clavier. Suivez-moi à l'écran. [Aide-mémoire démo : 1) ouvrir le tableau de bord ; 2) raccourci C pour créer un client ; 3) raccourci P pour un devis, ajouter deux lignes ; 4) convertir le devis en facture ; 5) montrer la recherche avec la touche barre oblique ; 6) montrer une notification en temps réel.] Ensuite, je reviendrai pour conclure.");
}

// 17 — Chiffres
{
  const s = p.addSlide(); bgFill(s, C.navy);
  s.addShape(p.ShapeType.ellipse, { x: -2, y: 3.5, w: 7, h: 7, fill: { color: C.blue, transparency: 84 }, line: { type: "none" } });
  logo(s, true, 11.55, 0.45, 0.45);
  s.addText("EN CHIFFRES", { x: 0.8, y: 0.75, w: 8, h: 0.4, fontFace: FH, fontSize: 13, bold: true, color: C.blueLt, charSpacing: 2 });
  s.addText("L'ampleur de la v2", { x: 0.8, y: 1.15, w: 11, h: 0.9, fontFace: FH, fontSize: 34, bold: true, color: C.white });
  const stats = [
    { n: "30+", l: "modules métier", c: C.blueLt },
    { n: "5×", l: "plus de périmètre\nqu'en v1", c: C.green },
    { n: "OHADA", l: "conçu pour la\nconformité SYSCOHADA", c: C.white },
    { n: "0", l: "trou dans la\nnumérotation légale", c: C.amber },
  ];
  stats.forEach((st, i) => {
    const x = 0.8 + i * 3.05;
    s.addShape(p.ShapeType.roundRect, { x, y: 2.55, w: 2.8, h: 3.4, fill: { color: C.navy2 }, line: { color: C.blue, width: 1 }, rectRadius: 0.12 });
    s.addText(st.n, { x, y: 2.9, w: 2.8, h: 1.5, align: "center", valign: "middle", fontFace: FH, fontSize: st.n.length > 3 ? 40 : 60, bold: true, color: st.c });
    s.addText(st.l, { x: x + 0.15, y: 4.45, w: 2.5, h: 1.1, align: "center", fontFace: FB, fontSize: 14, color: C.ice, lineSpacingMultiple: 1.15 });
  });
  s.addText("D'une application de vente à une plateforme de gestion d'entreprise complète.", { x: 0.8, y: 6.35, w: 11.5, h: 0.5, fontFace: FB, fontSize: 15, italic: true, color: C.blueLt, align: "center" });
  notes(s, "Pour résumer en quelques chiffres : plus de trente modules métier, un périmètre multiplié par cinq par rapport à la version 1, une plateforme pensée pour la conformité OHADA, et zéro trou dans la numérotation légale. On est vraiment passé d'une application de vente à une plateforme de gestion d'entreprise complète.");
}

// 18 — Suite / Merci
{
  const s = p.addSlide(); bgFill(s, C.navy);
  s.addShape(p.ShapeType.ellipse, { x: 8.8, y: 3.2, w: 7, h: 7, fill: { color: C.blue, transparency: 80 }, line: { type: "none" } });
  logo(s, true, 0.85, 0.7, 0.6);
  s.addText("LA SUITE", { x: 0.85, y: 1.5, w: 8, h: 0.4, fontFace: FH, fontSize: 13, bold: true, color: C.blueLt, charSpacing: 2 });
  s.addText("Et maintenant ?", { x: 0.85, y: 1.9, w: 11, h: 0.9, fontFace: FH, fontSize: 36, bold: true, color: C.white });
  const next = [
    { t: "Mise en production sécurisée", d: "Passage en HTTPS et stabilisation finale" },
    { t: "Validation & tests", d: "Recette de la comptabilité et des rapports" },
    { t: "Formation & accompagnement", d: "Prise en main des équipes sur les nouveaux modules" },
  ];
  next.forEach((it, i) => {
    const y = 3.0 + i * 1.0;
    s.addShape(p.ShapeType.roundRect, { x: 0.85, y, w: 7.3, h: 0.85, fill: { color: C.navy2 }, line: { color: C.blue, width: 1 }, rectRadius: 0.1 });
    icon(s, "arrow-right", 1.05, y + 0.27, 0.32, C.blueLt);
    s.addText([{ text: it.t + "\n", options: { fontFace: FH, fontSize: 15, bold: true, color: C.white } }, { text: it.d, options: { fontFace: FB, fontSize: 12, color: C.ice } }], { x: 1.6, y: y + 0.06, w: 6.4, h: 0.74, valign: "middle" });
  });
  s.addText("Merci.", { x: 0.85, y: 6.15, w: 6, h: 0.7, fontFace: FH, fontSize: 30, bold: true, color: C.white });
  s.addText("Bridge Technologies Solutions  ·  Douala, Cameroun", { x: 0.85, y: 6.8, w: 9, h: 0.4, fontFace: FB, fontSize: 13, color: C.blueLt });
  notes(s, "Pour conclure, voici les prochaines étapes. D'abord, sécuriser la mise en production, avec le passage en HTTPS et la stabilisation finale. Ensuite, valider et tester, en particulier la comptabilité et les rapports. Et enfin, former et accompagner les équipes sur les nouveaux modules. Voilà le chemin parcouru, d'une simple application de vente à une plateforme de gestion complète. Merci de votre attention — je suis maintenant disponible pour répondre à toutes vos questions.");
}

p.writeFile({ fileName: "InvoiceHub-v2-Presentation-NEW.pptx" }).then((f) => console.log("✅ Généré :", f));
