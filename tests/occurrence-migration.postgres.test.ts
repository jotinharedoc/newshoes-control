import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { test } from "node:test";
import "dotenv/config";

test("migration preserva histórico, backfill e escrita da versão anterior", { skip: process.env.SHOE_CODE_POSTGRES_TESTS !== "1" }, async () => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname));
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const schema = `qa_occurrence_${randomUUID().replaceAll("-", "")}`;
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    const migrations = (await readdir("prisma/migrations")).filter(name => /^\d/.test(name)).sort();
    for (const name of migrations.slice(0, -1)) await db.query(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
    await db.query(`INSERT INTO "Role" (id,name,"updatedAt") VALUES ('role','QA migration',now());
      INSERT INTO "Employee" (id,name,"roleId","updatedAt") VALUES ('employee','QA migration','role',now());
      INSERT INTO "ProcessType" (id,name,"updatedAt") VALUES ('process','QA process',now());
      INSERT INTO "Shoe" (id,code,"updatedAt") VALUES ('shoe','000123',now());
      INSERT INTO "Production" (id,"shoeId","processTypeId","employeeId",unit,kind,status,"commissionAmountSnapshot","updatedAt","sourceProductionId","returnReason")
        VALUES ('original','shoe','process','employee','PAIR','STANDARD','COMPLETED',0.37,now(),null,null),
        ('return','shoe','process','employee','PAIR','RETURN','DEFERRED',0,now(),'original','QA return');
      UPDATE "Production" SET "sourceProductionId"='original' WHERE id='return';
      INSERT INTO "WorkSession" (id,"productionId",kind,"endedAt") VALUES ('session','original','INITIAL',now());
      INSERT INTO "CommissionEntry" (id,"productionId",amount) VALUES ('ledger','original',0.37);`);
    const snapshot = async (table: string, after = false) => (await db.query(`SELECT ${after && table === "Production" ? 'to_jsonb(t) - \'occurrenceId\' - \'cancelledAt\' - \'cancelledFromStatus\'' : 'to_jsonb(t)'} AS row FROM "${table}" t ORDER BY id`)).rows;
    const tables = ["Shoe", "Production", "WorkSession", "CommissionEntry"];
    const before = [];
    for (const table of tables) before.push(await snapshot(table));
    await db.query(await readFile(`prisma/migrations/${migrations.at(-1)}/migration.sql`, "utf8"));
    for (let index = 0; index < tables.length; index++) assert.deepEqual(await snapshot(tables[index], true), before[index]);
    assert.deepEqual((await db.query('SELECT DISTINCT "occurrenceId" FROM "Production"')).rows, [{ occurrenceId: "legacy-shoe" }]);
    await db.query(`INSERT INTO "Production" (id,"shoeId","processTypeId","employeeId",unit,kind,status,"commissionAmountSnapshot","updatedAt","sourceProductionId","returnReason") VALUES ('legacy-return','shoe','process','employee','PAIR','RETURN','DEFERRED',0,now(),'original','QA return')`);
    assert.equal((await db.query('SELECT "occurrenceId" FROM "Production" WHERE id=\'legacy-return\'')).rows[0].occurrenceId, "legacy-shoe");
    await assert.rejects(db.query(`UPDATE "Production" SET "occurrenceId"=null WHERE id='original'`));
  } finally {
    await db.query("ROLLBACK");
    await db.query('SET search_path TO public');
    // Only the randomly named test-owned schema on an explicitly local connection.
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
});
