import { prisma } from "@/lib/prisma";
import { Prisma, WorkUnit } from "@/lib/generated/prisma/client";
import { normalizeShoeCode } from "@/utils/shoe-code";
import { ProductionError } from "@/types/production-error.types";

export type OccurrenceChoice = { occurrenceId?: string; newOccurrence?: boolean; expectedLatestId?: string | null };

export function readOccurrenceChoice(body: Record<string, unknown>): OccurrenceChoice {
  if ((body.occurrenceId !== undefined && (typeof body.occurrenceId !== "string" || !body.occurrenceId)) ||
    (body.newOccurrence !== undefined && typeof body.newOccurrence !== "boolean") ||
    (body.expectedLatestId !== undefined && body.expectedLatestId !== null && typeof body.expectedLatestId !== "string")) {
    throw new ProductionError("INVALID_INPUT", "Selecione o tênis novamente.", 400);
  }
  return { occurrenceId: body.occurrenceId as string | undefined, newOccurrence: body.newOccurrence as boolean | undefined,
    expectedLatestId: body.expectedLatestId as string | null | undefined };
}

export async function listCodeOccurrences(code: string) {
  return prisma.shoeOccurrence.findMany({ where: { shoe: { code: normalizeShoeCode(code) } }, orderBy: { sequence: "desc" }, take: 50,
    select: { id: true, sequence: true, createdAt: true, productions: { where: { kind: "STANDARD" },
      select: { processType: { select: { name: true } }, unit: true, status: true } } } });
}

// All normal processes share this decision. Resume/continue/reopen use production IDs
// directly and never call it. Caller runs in a Serializable transaction.
export async function resolveShoeOccurrence(db: Prisma.TransactionClient, code: string, processTypeId: string,
  unit: WorkUnit, choice: OccurrenceChoice = {}) {
  if (choice.newOccurrence && choice.expectedLatestId === undefined) {
    throw new ProductionError("INVALID_INPUT", "Consulte os usos deste código antes de iniciar um novo tênis.", 400);
  }
  const shoe = await db.shoe.upsert({ where: { code }, update: {}, create: { code }, select: { id: true } });
  await db.$queryRaw`SELECT "id" FROM "Shoe" WHERE "id" = ${shoe.id} FOR UPDATE`;
  const latest = await db.shoeOccurrence.findFirst({ where: { shoeId: shoe.id }, orderBy: { sequence: "desc" },
    include: { productions: { where: { kind: "STANDARD", status: { not: "CANCELLED" } },
      select: { processTypeId: true, unit: true, status: true } } } });
  if (choice.occurrenceId) {
    if (choice.newOccurrence) throw new ProductionError("INVALID_INPUT", "Selecione apenas um tênis.", 400);
    const selected = await db.shoeOccurrence.findFirst({ where: { id: choice.occurrenceId, shoeId: shoe.id } });
    if (!selected) throw new ProductionError("INVALID_INPUT", "O tênis selecionado não pertence a este código.", 400);
    return { shoeId: shoe.id, occurrenceId: selected.id };
  }
  const conflicts = latest?.productions.filter(p => p.processTypeId === processTypeId &&
    (unit === "PAIR" || p.unit === "PAIR" || p.unit === unit)) ?? [];
  const createNew = choice.newOccurrence || !latest || (conflicts.length > 0 && conflicts.every(p => p.status === "COMPLETED"));
  if (!createNew && latest) return { shoeId: shoe.id, occurrenceId: latest.id };
  if (choice.expectedLatestId !== undefined && choice.expectedLatestId !== (latest?.id ?? null)) {
    throw new ProductionError("PRODUCTION_CONFLICT", "Outro celular iniciou um tênis com este código. Selecione o tênis novamente.", 409);
  }
  if (!choice.newOccurrence && latest?.productions.some(p => ["IN_PROGRESS", "PAUSED", "DEFERRED"].includes(p.status))) {
    throw new ProductionError("PRODUCTION_CONFLICT", "Este código tem um trabalho pendente. Retome o trabalho ou confira a ocorrência com a Gerência.", 409);
  }
  const occurrence = await db.shoeOccurrence.create({ data: { shoeId: shoe.id, sequence: (latest?.sequence ?? 0) + 1 } });
  return { shoeId: shoe.id, occurrenceId: occurrence.id };
}
