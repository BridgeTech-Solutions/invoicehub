/**
 * Rafraîchit les templates email en base à partir de email-templates.data.ts.
 *
 * Contrairement au seed (update: {} → ne touche jamais l'existant), ce script
 * MET À JOUR les templates déjà présents en base — indispensable en production
 * où les anciens templates (trop colorés) sont déjà insérés.
 *
 * Usage :
 *   pnpm db:sync-emails      (ou: npx ts-node prisma/sync-email-templates.ts)
 *
 * Idempotent : réexécutable sans effet de bord.
 */
import { PrismaClient } from '@prisma/client';
import { EMAIL_TEMPLATES } from './email-templates.data';

const prisma = new PrismaClient();

async function main() {
  console.log(`Rafraîchissement de ${EMAIL_TEMPLATES.length} templates email (locale fr)…`);
  for (const tpl of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where:  { type_locale: { type: tpl.type, locale: 'fr' } },
      update: { name: tpl.name, subject: tpl.subject, bodyHtml: tpl.bodyHtml, variables: tpl.variables },
      create: {
        type: tpl.type, locale: 'fr', name: tpl.name, subject: tpl.subject,
        bodyHtml: tpl.bodyHtml, variables: tpl.variables, isActive: true,
      },
    });
    console.log(`  ✓ ${tpl.type}`);
  }
  console.log('Templates email rafraîchis.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
