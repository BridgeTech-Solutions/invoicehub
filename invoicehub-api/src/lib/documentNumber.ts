import { DocumentType, PrismaClient } from '@prisma/client';

export async function generateDocumentNumber(
  prisma: PrismaClient,
  officeId: string,
  documentType: DocumentType,
): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ fn_next_document_number: string }>>`
    SELECT fn_next_document_number(
      ${officeId}::uuid,
      ${documentType}::"document_type"
    ) AS fn_next_document_number
  `;

  const number = result[0]?.fn_next_document_number;
  if (!number) {
    throw new Error('Impossible de générer le numéro de document');
  }

  return number;
}

export async function getDefaultOfficeId(prisma: PrismaClient): Promise<string> {
  const office = await prisma.agencyOffice.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
  });

  if (!office) {
    throw new Error('Aucune agence par défaut configurée');
  }

  return office.id;
}
