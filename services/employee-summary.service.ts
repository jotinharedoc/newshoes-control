import { findEmployeeMonthlySummary } from "@/repositories/employee-summary.repository";
import { addProductionCount, emptyProductionCounts } from "@/utils/production-counts";
import { AuthError } from "@/types/auth.types";

export function currentBrazilMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
}

export function summaryMonthPeriod(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 9998) {
    throw new AuthError("INVALID_INPUT", "Selecione um mês válido.", 400);
  }
  const [year, number] = month.split("-").map(Number);
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
  return { start: new Date(`${month}-01T00:00:00-03:00`), endExclusive: new Date(`${next}-01T00:00:00-03:00`) };
}

export async function getEmployeeMonthlySummary(employeeId: string, month = currentBrazilMonth()) {
  const { start, endExclusive } = summaryMonthPeriod(month);
  const { employee, productions, amount } = await findEmployeeMonthlySummary(employeeId, start, endExclusive);
  if (!employee) throw new AuthError("INVALID_INPUT", "Funcionário não encontrado.", 404);
  const counts = emptyProductionCounts();
  for (const production of productions) addProductionCount(counts, production.processType.name, production.unit);
  return { employee, month, hygienePairs: counts.hygienePairs, finalizationPairs: counts.finalizationPairs,
    finalizationFeet: counts.finalizationFeet, paintingPairs: counts.paintingPairs,
    // Actual historical ledger: changing an employee's role must never erase earned commission.
    earnedCommissionCents: Math.round(Number(amount?.toString() ?? 0) * 100) };
}
