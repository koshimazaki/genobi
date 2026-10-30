import { expect, it } from "vitest";
import { supervisorSnapshot } from "../shared/supervisor";
import { supervisorOrigin } from "../src/supervisor/origin";

it("only permits a loopback origin without credentials, paths or query data", () => {
  expect(supervisorOrigin("http://127.0.0.1:4329/")).toBe(
    "http://127.0.0.1:4329",
  );
  expect(supervisorOrigin("http://localhost:4329")).toBe(
    "http://localhost:4329",
  );
  for (const value of [
    "https://example.com",
    "http://127.0.0.1.example.com",
    "http://127.0.0.1@evil.test",
    "http://user:secret@127.0.0.1:4329",
    "http://127.0.0.1:4329/private",
    "http://127.0.0.1:4329/?token=secret",
    "http://127.0.0.1:4329/#secret",
    "javascript:alert(1)",
  ])
    expect(supervisorOrigin(value)).toBeUndefined();
});

it("accepts bounded presence but refuses control claims and extra payload fields", () => {
  const actor = {
    id: "local-session",
    role: "Creative",
    runtime: "Hermes",
    model: "DeepSeek",
    state: "connected",
    summary: "",
  };
  const packet = {
    type: "genobi.supervisor.snapshot",
    channel: "9a82e75f-a5bf-452c-8197-2584e5753042",
    actors: [actor],
  };
  expect(supervisorSnapshot.safeParse(packet).success).toBe(true);
  for (const patch of [
    { state: "in-control" },
    { summary: "x".repeat(601) },
    { role: "Creative\nforged" },
    { permissions: ["submit"] },
  ])
    expect(
      supervisorSnapshot.safeParse({
        ...packet,
        actors: [{ ...actor, ...patch }],
      }).success,
    ).toBe(false);
  expect(
    supervisorSnapshot.safeParse({ ...packet, actors: Array(9).fill(actor) })
      .success,
  ).toBe(false);
  expect(
    supervisorSnapshot.safeParse({ ...packet, channel: "not-a-channel" })
      .success,
  ).toBe(false);
  expect(
    supervisorSnapshot.safeParse({ ...packet, command: "approve" }).success,
  ).toBe(false);
});
