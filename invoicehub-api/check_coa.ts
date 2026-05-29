import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Comptes achats (601x, 607x)
  const ach = await prisma.chartOfAccount.findMany({
    where: { OR: [{ accountNumber: { startsWith: '601' } }, { accountNumber: { startsWith: '607' } }] },
    select: { accountNumber: true, name: true, isDetailAccount: true },
    orderBy: { accountNumber: 'asc' },
  });
  console.log('Comptes achats :');
  ach.forEach(a => console.log(`  ${a.accountNumber} — ${a.name} (détail=${a.isDetailAccount})`));
  await prisma.$disconnect();
}
main();
