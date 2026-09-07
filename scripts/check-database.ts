import { prisma } from "../lib/prisma";

async function main() {
  const [employees, processes, rules] = await Promise.all([
    prisma.employee.findMany({
      include: {
        role: true,
        processes: {
          include: {
            processType: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),

    prisma.processType.findMany({
      orderBy: {
        name: "asc",
      },
    }),

    prisma.processRule.findMany({
      include: {
        processType: true,
      },
      orderBy: {
        processType: {
          name: "asc",
        },
      },
    }),
  ]);

  console.log("\nFUNCIONÁRIOS");

  console.table(
    employees.map((employee) => ({
      nome: employee.name,
      cargo: employee.role.name,
      processos: employee.processes
        .map((permission) => permission.processType.name)
        .join(", "),
    })),
  );

  console.log("\nPROCESSOS");

  console.table(
    processes.map((process) => ({
      nome: process.name,
      ativo: process.active,
    })),
  );

  console.log("\nREGRAS DE COMISSÃO");

  console.table(
    rules.map((rule) => ({
      processo: rule.processType.name,
      unidade: rule.unit,
      valor: `R$ ${rule.commissionAmount.toString()}`,
    })),
  );

  console.log("\nRESUMO");

  console.table({
    funcionários: employees.length,
    processos: processes.length,
    regras: rules.length,
  });
}

main()
  .catch((error) => {
    console.error("Falha ao consultar o banco:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });