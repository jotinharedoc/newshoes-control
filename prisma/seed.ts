import { prisma } from "../lib/prisma";
import { WorkUnit } from "../lib/generated/prisma/client";
import { hash } from "bcryptjs";

async function findOrCreateEmployee(
  name: string,
  roleId: string,
  initialPinHash?: string,
) {
  const existingEmployee = await prisma.employee.findFirst({
    where: { name },
  });

  if (existingEmployee) {
    return prisma.employee.update({
      where: { id: existingEmployee.id },
      data: {
        roleId,
        active: true,
        ...(initialPinHash && !existingEmployee.pinHash
          ? {
              pinHash: initialPinHash,
              mustChangePin: true,
            }
          : {}),
      },
    });
  }

  return prisma.employee.create({
    data: {
      name,
      roleId,
      pinHash: initialPinHash,
      mustChangePin: Boolean(initialPinHash),
    },
  });
}



async function allowProcess(employeeId: string, processTypeId: string) {
  return prisma.employeeProcess.upsert({
    where: {
      employeeId_processTypeId: {
        employeeId,
        processTypeId,
      },
    },
    update: {},
    create: {
      employeeId,
      processTypeId,
    },
  });
}

async function main() {
  const employeeRole = await prisma.role.upsert({
    where: { name: "Funcionário" },
    update: { active: true },
    create: { name: "Funcionário" },
  });

  const managementRole = await prisma.role.upsert({
    where: { name: "Gerência" },
    update: { active: true },
    create: { name: "Gerência" },
  });

  const managementAccess = await prisma.permission.upsert({
  where: {
    code: "management.access",
  },
  update: {
    name: "Acessar gerência",
  },
  create: {
    code: "management.access",
    name: "Acessar gerência",
  },
});

await prisma.rolePermission.upsert({
  where: {
    roleId_permissionId: {
      roleId: managementRole.id,
      permissionId: managementAccess.id,
    },
  },
  update: {},
  create: {
    roleId: managementRole.id,
    permissionId: managementAccess.id,
  },
});

  const hygiene = await prisma.processType.upsert({
    where: { name: "Higienização" },
    update: { active: true },
    create: { name: "Higienização" },
  });

  const finishing = await prisma.processType.upsert({
    where: { name: "Finalização" },
    update: { active: true },
    create: { name: "Finalização" },
  });

  const painting = await prisma.processType.upsert({
    where: { name: "Pintura" },
    update: { active: true },
    create: { name: "Pintura" },
  });

  await prisma.processRule.upsert({
    where: {
      processTypeId_unit: {
        processTypeId: hygiene.id,
        unit: WorkUnit.PAIR,
      },
    },
    update: {
      commissionAmount: "0.50",
      active: true,
    },
    create: {
      processTypeId: hygiene.id,
      unit: WorkUnit.PAIR,
      commissionAmount: "0.50",
    },
  });

  await prisma.processRule.upsert({
    where: {
      processTypeId_unit: {
        processTypeId: finishing.id,
        unit: WorkUnit.PAIR,
      },
    },
    update: {
      commissionAmount: "0.50",
      active: true,
    },
    create: {
      processTypeId: finishing.id,
      unit: WorkUnit.PAIR,
      commissionAmount: "0.50",
    },
  });

  await prisma.processRule.upsert({
    where: {
      processTypeId_unit: {
        processTypeId: finishing.id,
        unit: WorkUnit.LEFT_FOOT,
      },
    },
    update: {
      commissionAmount: "0.25",
      active: true,
    },
    create: {
      processTypeId: finishing.id,
      unit: WorkUnit.LEFT_FOOT,
      commissionAmount: "0.25",
    },
  });

  await prisma.processRule.upsert({
    where: {
      processTypeId_unit: {
        processTypeId: finishing.id,
        unit: WorkUnit.RIGHT_FOOT,
      },
    },
    update: {
      commissionAmount: "0.25",
      active: true,
    },
    create: {
      processTypeId: finishing.id,
      unit: WorkUnit.RIGHT_FOOT,
      commissionAmount: "0.25",
    },
  });

  await prisma.processRule.upsert({
    where: {
      processTypeId_unit: {
        processTypeId: painting.id,
        unit: WorkUnit.PAIR,
      },
    },
    update: {
      commissionAmount: "1.00",
      active: true,
    },
    create: {
      processTypeId: painting.id,
      unit: WorkUnit.PAIR,
      commissionAmount: "1.00",
    },
  });

  const temporaryPinHash = await hash("0000", 12);

const joao = await findOrCreateEmployee(
  "João",
  employeeRole.id,
  temporaryPinHash,
);

const julia = await findOrCreateEmployee(
  "Julia",
  employeeRole.id,
  temporaryPinHash,
);

const paola = await findOrCreateEmployee(
  "Paola",
  employeeRole.id,
  temporaryPinHash,
);

await findOrCreateEmployee(
  "Maria Eduarda",
  managementRole.id,
  temporaryPinHash,
);

await findOrCreateEmployee(
  "Murilo",
  managementRole.id,
  temporaryPinHash,
);

  await Promise.all([
    allowProcess(joao.id, hygiene.id),
    allowProcess(joao.id, finishing.id),

    allowProcess(julia.id, hygiene.id),
    allowProcess(julia.id, finishing.id),

    allowProcess(paola.id, finishing.id),
    allowProcess(paola.id, painting.id),
  ]);

  console.log("Seed concluído com sucesso.");
  console.log("5 funcionários cadastrados.");
  console.log("3 processos cadastrados.");
  console.log("5 regras de comissão cadastradas.");
}

main()
  .catch((error) => {
    console.error("Erro ao executar o seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });