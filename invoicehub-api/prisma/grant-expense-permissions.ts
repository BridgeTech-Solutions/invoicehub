/**
 * Migration de permissions — dépenses (2026-09-22).
 *
 * Le module Dépenses exigeait `expenses:write`/`expenses:pay`, permissions ABSENTES du
 * catalogue → seul l'admin (`*`) pouvait agir. Le contrôleur passe à `expenses:create`/
 * `update`/`pay`, et le rôle système **comptable** doit désormais détenir `expenses:pay`
 * et `expenses:delete` pour gérer les dépenses de bout en bout.
 *
 * Idempotent : n'ajoute que ce qui manque. À lancer UNE fois en prod :
 *   npx ts-node prisma/grant-expense-permissions.ts
 *
 * ⚠️ Rôles PERSONNALISÉS gérant les dépenses : leur accorder à la main `expenses:pay`
 * (et `expenses:delete` si suppression attendue) via Paramètres → Rôles.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GRANTS: Record<string, string[]> = {
  comptable: ['expenses:pay', 'expenses:delete'],
};

async function main() {
  for (const [name, toAdd] of Object.entries(GRANTS)) {
    const role = await prisma.role.findUnique({ where: { name }, select: { id: true, permissions: true } });
    if (!role) { console.log(`  ↩  rôle « ${name} » absent — ignoré`); continue; }

    const missing = toAdd.filter((p) => !role.permissions.includes(p));
    if (missing.length === 0) { console.log(`  ✓ rôle « ${name} » déjà à jour`); continue; }

    await prisma.role.update({
      where: { id: role.id },
      data:  { permissions: [...role.permissions, ...missing] },
    });
    console.log(`  ✓ rôle « ${name} » : +${missing.join(', ')}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
