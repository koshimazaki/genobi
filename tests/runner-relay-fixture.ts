import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { RunnerStore, type RelayStatement } from "../worker/runner-store";
import { runnerRoute } from "../worker/runner-routes";
import { AppError } from "../server/errors";

/** Real SQLite queries and all migrations, without opening a network listener. */
export function relayFixture() {
  const db = new DatabaseSync(":memory:");
  for (const name of readdirSync("migrations").sort())
    db.exec(readFileSync(`migrations/${name}`, "utf8"));
  const prepare = (sql: string): RelayStatement => {
    let bindings: SQLInputValue[] = [];
    const statement: RelayStatement = {
      bind(...values) {
        bindings = values as SQLInputValue[];
        return statement;
      },
      async first<T>() {
        return (db.prepare(sql).get(...bindings) as T) ?? null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...bindings) as T[] };
      },
      async run() {
        return db.prepare(sql).run(...bindings);
      },
    };
    return statement;
  };
  let time = Date.now();
  const store = new RunnerStore({ prepare }, () => time);
  const fetcher: typeof fetch = async (input, init) => {
    try {
      return Response.json(
        await runnerRoute(
          new Request(String(input), init),
          store,
          "host-owner",
          async () => {},
          "test-ip",
        ),
      );
    } catch (error) {
      return Response.json(
        {
          error: error instanceof AppError ? error.message : "Invalid request",
        },
        { status: error instanceof AppError ? error.status : 400 },
      );
    }
  };
  return {
    binding: { prepare },
    store,
    db,
    fetcher,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
