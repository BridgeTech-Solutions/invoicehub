/**
 * Enveloppe HTML SOBRE pour les emails envoyés aux CLIENTS (facture, devis).
 * Ton professionnel et retenu : Arial, fond blanc, texte gris foncé, nom de
 * l'entreprise en en-tête avec un filet fin. AUCUNE image, AUCUN dégradé, AUCUN
 * emoji, pas de couleur superflue. Cohérent avec le shell des notifications internes.
 */
const NAVY = '#0f2d4a';

export function clientEmailShell(params: {
  companyName: string;
  bodyHtml:    string;   // contenu déjà en HTML léger (<p>…</p>)
  footer?:     string;   // ligne de pied optionnelle (coordonnées, mentions)
}): string {
  const footer = params.footer
    ? `<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #eef0f2;font-size:12px;color:#9ca3af;line-height:1.5;">${params.footer}</p>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1f2937;line-height:1.55;">
  <div style="padding:20px 28px 16px;border-bottom:2px solid ${NAVY};">
    <div style="font-size:15px;font-weight:700;color:${NAVY};">${params.companyName}</div>
  </div>
  <div style="padding:22px 28px;font-size:14px;color:#374151;">
    ${params.bodyHtml}
    ${footer}
  </div>
</div>`;
}
