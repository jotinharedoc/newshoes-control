import { Prisma } from "@/lib/generated/prisma/client";
import { findAdministrationActor } from "@/repositories/administration.repository";
import { listAdministrativeProductions, lockAdministrativeProduction } from "@/repositories/production-administration.repository";
import { runProductionTransaction } from "@/repositories/production.repository";
import { AuthError } from "@/types/auth.types";
export async function correctProduction(actorId: string, id: string, version: number, action: string, reason: string) {
  if (!id || !Number.isInteger(version) || version < 0 || !["cancel", "restore"].includes(action) ||
    typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000) {
    throw new AuthError("INVALID_INPUT", "Selecione o registro e informe um motivo de até 1.000 caracteres.", 400);
  }
  try {
    return await runProductionTransaction(async db => {
      if (!await findAdministrationActor(db, actorId)) throw new AuthError("FORBIDDEN", "Acesso exclusivo da Gerência.", 403);
      const production = await lockAdministrativeProduction(db, id);
      if (!production) throw new AuthError("INVALID_INPUT", "Registro não encontrado.", 404);
      if (production.version !== version) throw new AuthError("INVALID_INPUT", "O registro mudou. Atualize antes de corrigir.", 409);
      const restore = action === "restore";
      if (restore ? production.status !== "CANCELLED" || production.cancelledFromStatus !== "COMPLETED" : production.status === "CANCELLED") {
        throw new AuthError("INVALID_INPUT", "Só é possível restaurar registros que estavam concluídos antes da anulação.", 409);
      }
      if (production.pausedByBreaks.length) throw new AuthError("INVALID_INPUT", "Encerre o intervalo vinculado antes de anular este trabalho.", 409);
      const now = new Date();
      if (!restore) await db.workSession.updateMany({ where: { productionId: id, endedAt: null }, data: { endedAt: now, endReason: "CANCELLED" } });
      const after = await db.production.update({ where: { id }, data: { status: restore ? "COMPLETED" : "CANCELLED",
        cancelledFromStatus: restore ? null : production.status, cancelledAt: restore ? null : now, version: { increment: 1 } } });
      const context = { code: production.shoe.code, occurrenceId: production.occurrenceId, sequence: production.occurrence?.sequence ?? null,
        employeeId: production.employeeId, employeeName: production.employee.name, processTypeId: production.processTypeId,
        processName: production.processType.name, unit: production.unit, kind: production.kind };
      await db.managementCorrection.create({ data: { actorEmployeeId: actorId, productionId: id, reason: reason.trim(),
        action: restore ? "PRODUCTION_RESTORED" : "PRODUCTION_CANCELLED", targetType: "Production", targetId: id,
        beforeData: { ...context, status: production.status, version: production.version },
        afterData: { ...context, status: after.status, version: after.version } } });
      return { id, status: after.status, version: after.version };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new AuthError("INVALID_INPUT", "Existe conflito com outro registro desta ocorrência. Atualize e confira antes de restaurar.", 409);
    }
    throw error;
  }
}

export async function listProductionRecords(code?: string) { return listAdministrativeProductions(code); }
