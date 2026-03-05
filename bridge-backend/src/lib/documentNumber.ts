import { DocumentType } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Génère un numéro de document SYSCOHADA via la fonction PostgreSQL fn_next_document_number().
 * Appel en $queryRaw pour garantir l'atomicité — jamais en JavaScript.
 *
 * Format : BTS/{BUREAU}/{AAAA}/{MM}/{pfm|fac}{XXX}
 * Exemple : BTS/DC/2026/01/fac001
 */
export async function generateDocumentNumber(
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

/** Récupère l'agence par défaut (utilisée si aucun officeId fourni) */
export async function getDefaultOfficeId(): Promise<string> {
  const office = await prisma.agencyOffice.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
  });

  if (!office) {
    throw new Error('Aucune agence par défaut configurée');
  }

  return office.id;
}
