
import { PrismaClient, ApprovalDocumentType, ApprovalTriggerOperator } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage Seed V3.3 (Clean & Simple)...');

  // 1. RBAC minimal
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', displayName: 'Administrateur', permissions: ['*'] }
  });

  // 2. Admin user
  const passwordHash = await bcrypt.hash('Admin@BTS2026!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@bts.cm' },
    update: {},
    create: { email: 'admin@bts.cm', firstName: 'Admin', lastName: 'BTS', roleId: adminRole.id, passwordHash }
  });

  // 3. Workflow
  await prisma.approvalWorkflow.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Workflow Standard Dépenses',
      steps: { create: [{ order: 1, name: 'Approbation Direction', approverUserId: admin.id }] },
      triggers: { create: [{ documentType: ApprovalDocumentType.expense, field: 'amountTtc', operator: ApprovalTriggerOperator.gte, value: '500000' }] }
    }
  });

  // 4. Client simple (Pas de bankName ni bankAccount)
  await prisma.client.upsert({
    where: { name: 'ACCESS BANK CAMEROON PLC' },
    update: {},
    create: { 
      name: 'ACCESS BANK CAMEROON PLC', 
      type: 'company', 
      createdById: admin.id 
    }
  });

  console.log('✅ Seed terminé avec succès.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
