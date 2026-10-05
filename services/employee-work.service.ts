import { Prisma } from "@/lib/generated/prisma/client";
import { auditWorkReopen, findEmployeeDayWorks, findOwnWork, findWorkAccess } from "@/repositories/employee-work.repository";
import { createWorkSession, runProductionTransaction, transitionProduction } from "@/repositories/production.repository";
import { prepareWorkSwitch } from "@/services/work-switch.service";
import { ProductionError } from "@/types/production-error.types";
import { productionDay, sessionActiveToday } from "@/utils/production-day";

export async function getEmployeeDayWorks(employeeId: string, now = new Date()) {
  const { day, start } = productionDay(now);
  const records = await findEmployeeDayWorks(employeeId, start, now);
  const works = records.map(record => ({
    id: record.id, code: record.shoe.code, processName: record.processType.name,
    kind: record.kind, unit: record.unit, status: record.status, version: record.version,
    activityAt: new Date(Math.max(...record.sessions.map(session => Math.max(start.getTime(), session.startedAt.getTime())))).toISOString(),
  })).sort((a, b) => b.activityAt.localeCompare(a.activityAt) || a.id.localeCompare(b.id));
  return { day, works };
}

export type EmployeeDayWorks = Awaited<ReturnType<typeof getEmployeeDayWorks>>;

export async function reopenEmployeeWork(employeeId: string, productionId: string, version: number) {
  if (!productionId || !Number.isInteger(version) || version < 0) {
    throw new ProductionError("INVALID_INPUT", "Atualize a página e selecione um trabalho válido.", 400);
  }
  try {
    return await runProductionTransaction(async db => {
      const production = await findOwnWork(db, employeeId, productionId);
      if (!production) throw new ProductionError("PRODUCTION_NOT_FOUND", "Trabalho não encontrado.", 404);
      if (!await findWorkAccess(db, employeeId, production.processTypeId)) {
        throw new ProductionError("PROCESS_NOT_AUTHORIZED", "Você não está autorizado a realizar este processo.", 403);
      }
      if (production.version !== version || production.status !== "COMPLETED") {
        throw new ProductionError("PRODUCTION_CONFLICT", "O trabalho foi alterado. Atualize a página e tente novamente.", 409);
      }
      const now = new Date();
      const { start, endExclusive } = productionDay(now);
      const completedToday = production.completedAt && production.completedAt >= start && production.completedAt < endExclusive && production.completedAt <= now;
      if (production.kind !== "STANDARD" || (!completedToday && !production.sessions.some(s => sessionActiveToday(s, now)))) {
        throw new ProductionError("INVALID_PRODUCTION_STATE", "Só é possível retomar um trabalho padrão com atividade hoje. Para registros anteriores, procure a Gerência.", 409);
      }
      if (!production.sessions.length || production.sessions.some(s => s.endedAt === null || s.endedAt > now)) {
        throw new ProductionError("PRODUCTION_CONFLICT", "As sessões deste trabalho precisam ser conferidas pela Gerência.", 409);
      }
      await prepareWorkSwitch({ employeeId, targetProductionId: production.id, now }, db);
      const changed = await transitionProduction({ productionId, employeeId, version, from: ["COMPLETED"], status: "IN_PROGRESS", completedAt: null }, db);
      if (changed.count !== 1) throw new ProductionError("PRODUCTION_CONFLICT", "O trabalho foi alterado em outra tela. Atualize e tente novamente.", 409);
      await createWorkSession(productionId, "RESUME", now, db);
      await auditWorkReopen(db, employeeId, production, now);
      return { id: productionId, version: version + 1 };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new ProductionError("PRODUCTION_CONFLICT", "O trabalho foi alterado em outra tela. Atualize e tente novamente.", 409);
    }
    throw error;
  }
}
