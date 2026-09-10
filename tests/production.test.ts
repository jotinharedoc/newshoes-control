import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  Prisma,
  ProductionKind,
  ProductionStatus,
  SessionEndReason,
  SessionKind,
  WorkUnit,
} from "../lib/generated/prisma/client";
import { prisma } from "./fake-prisma";
import {
  changeHygieneProductionState,
  startHygieneProduction,
} from "../services/production.service";

const hygieneAccess = {
  processType: {
    id: "hygiene",
    name: "Higienização",
    rules: [{ commissionAmount: new Prisma.Decimal("0.50") }],
  },
};

type TestSession = {
  startedAt: Date;
  endedAt: Date | null;
  kind: SessionKind;
  endReason: SessionEndReason | null;
};

type TestProduction = {
  id: string;
  shoeId: string;
  processTypeId: string;
  employeeId: string;
  unit: WorkUnit;
  kind: ProductionKind;
  status: ProductionStatus;
  sourceProductionId: null;
  returnReason: null;
  commissionAmountSnapshot: Prisma.Decimal;
  version: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  shoe: { code: string };
  processType: { name: string };
  sessions: TestSession[];
};

function productionRecord(): TestProduction {
  const now = new Date("2026-09-09T10:00:00.000Z");

  return {
    id: "production-1",
    shoeId: "shoe-1",
    processTypeId: "hygiene",
    employeeId: "employee-1",
    unit: WorkUnit.PAIR,
    kind: ProductionKind.STANDARD,
    status: ProductionStatus.IN_PROGRESS,
    sourceProductionId: null,
    returnReason: null,
    commissionAmountSnapshot: new Prisma.Decimal("0.50"),
    version: 0,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    shoe: { code: "1234" },
    processType: { name: "Higienização" },
    sessions: [
      {
        startedAt: now,
        endedAt: null,
        kind: SessionKind.INITIAL,
        endReason: null,
      },
    ],
  };
}

afterEach(() => mock.restoreAll());

test("início valida autorização e salva comissão e sessão inicial", async () => {
  const record = productionRecord();

  mock.method(
    prisma.employeeProcess,
    "findFirst",
    async () => hygieneAccess,
  );
  mock.method(prisma.production, "findFirst", async () => null);
  mock.method(
    prisma.shoe,
    "upsert",
    async () => ({ id: "shoe-1" }),
  );

  const create = mock.method(
    prisma.production,
    "create",
    async () => record,
  );

  mock.method(
    prisma.production,
    "findMany",
    async () => [record],
  );

  const result = await startHygieneProduction(
    "employee-1",
    "1234",
  );

  assert.equal(result.current?.code, "1234");

  const data = create.mock.calls[0].arguments[0]?.data;

  assert.equal(data?.kind, ProductionKind.STANDARD);
  assert.equal(data?.unit, WorkUnit.PAIR);
  assert.equal(
    data?.commissionAmountSnapshot?.toString(),
    "0.5",
  );

  const initialSession = data?.sessions?.create;

  assert.ok(initialSession && !Array.isArray(initialSession));
  assert.equal(initialSession.kind, SessionKind.INITIAL);
});

test("funcionário sem autorização não inicia Higienização", async () => {
  mock.method(
    prisma.employeeProcess,
    "findFirst",
    async () => null,
  );
  mock.method(
    prisma.production,
    "findFirst",
    async () => null,
  );

  await assert.rejects(
    startHygieneProduction("employee-1", "1234"),
    {
      code: "PROCESS_NOT_AUTHORIZED",
      status: 403,
    },
  );
});

test(
  "pausa, retomada, continuação e finalização preservam a produção e geram uma comissão",
  async () => {
    const record = productionRecord();
    const commissionCreates: unknown[] = [];

    mock.method(
      prisma.employeeProcess,
      "findFirst",
      async () => hygieneAccess,
    );

    mock.method(
      prisma.production,
      "findFirst",
      async (args: Prisma.ProductionFindFirstArgs) => {
        const statuses = args?.where?.status;

        if (
          statuses &&
          typeof statuses === "object" &&
          "in" in statuses
        ) {
          const blockingStatuses: ProductionStatus[] = [
            ProductionStatus.IN_PROGRESS,
            ProductionStatus.PAUSED,
          ];

          return blockingStatuses.includes(record.status)
            ? { id: record.id }
            : null;
        }

        return record;
      },
    );

    mock.method(
      prisma.production,
      "findMany",
      async () => {
        const visibleStatuses: ProductionStatus[] = [
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.PAUSED,
          ProductionStatus.DEFERRED,
        ];

        return visibleStatuses.includes(record.status)
          ? [record]
          : [];
      },
    );

    mock.method(
      prisma.workSession,
      "updateMany",
      async (args: Prisma.WorkSessionUpdateManyArgs) => {
        const session = record.sessions.find(
          (item) => item.endedAt === null,
        );

        if (!session) {
          return { count: 0 };
        }

        session.endedAt = args?.data?.endedAt as Date;
        session.endReason =
          args?.data?.endReason as SessionEndReason;

        return { count: 1 };
      },
    );

    mock.method(
      prisma.production,
      "updateMany",
      async (args: Prisma.ProductionUpdateManyArgs) => {
        if (args?.where?.version !== record.version) {
          return { count: 0 };
        }

        record.status =
          args?.data?.status as ProductionStatus;
        record.version += 1;

        if (args?.data?.completedAt) {
          record.completedAt =
            args.data.completedAt as Date;
        }

        return { count: 1 };
      },
    );

    mock.method(
      prisma.workSession,
      "create",
      async (args: Prisma.WorkSessionCreateArgs) => {
        record.sessions.push({
          startedAt: args?.data?.startedAt as Date,
          endedAt: null,
          kind: args?.data?.kind as SessionKind,
          endReason: null,
        });

        return {
          id: `session-${record.sessions.length}`,
        };
      },
    );

    mock.method(
      prisma.commissionEntry,
      "create",
      async (args: Prisma.CommissionEntryCreateArgs) => {
        commissionCreates.push(args);

        return {
          id: "commission-1",
        };
      },
    );

    await changeHygieneProductionState(
      "employee-1",
      record.id,
      0,
      "pause",
    );

    assert.equal(
      record.status,
      ProductionStatus.PAUSED,
    );

    await changeHygieneProductionState(
      "employee-1",
      record.id,
      1,
      "resume",
    );

    assert.equal(
      record.sessions.at(-1)?.kind,
      SessionKind.RESUME,
    );

    await changeHygieneProductionState(
      "employee-1",
      record.id,
      2,
      "defer",
    );

    assert.equal(
      record.status,
      ProductionStatus.DEFERRED,
    );

    await changeHygieneProductionState(
      "employee-1",
      record.id,
      3,
      "continue",
    );

    assert.equal(
      record.sessions.at(-1)?.kind,
      SessionKind.CONTINUATION,
    );

    const overview =
      await changeHygieneProductionState(
        "employee-1",
        record.id,
        4,
        "finish",
      );

    assert.equal(
      record.status,
      ProductionStatus.COMPLETED,
    );
    assert.equal(overview.current, null);
    assert.equal(commissionCreates.length, 1);
  },
);

test("versão desatualizada não altera a produção", async () => {
  const record = productionRecord();
  record.version = 2;

  mock.method(
    prisma.employeeProcess,
    "findFirst",
    async () => hygieneAccess,
  );
  mock.method(
    prisma.production,
    "findFirst",
    async () => record,
  );

  await assert.rejects(
    changeHygieneProductionState(
      "employee-1",
      record.id,
      1,
      "pause",
    ),
    {
      code: "PRODUCTION_CONFLICT",
      status: 409,
    },
  );
});