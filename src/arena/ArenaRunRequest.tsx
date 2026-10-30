import type { Arena } from "../../shared/arena";
import { arenaRequest } from "./client";

/**
 * An agent's request to run approaches (`genobi_arena action=request_run`).
 * The agent cannot spend: Review and run quotes and asks for confirmation
 * exactly as the person's own Run does.
 */
export function ArenaRunRequest({
  arena,
  busy,
  onRun,
  act,
  adopt,
}: {
  arena: Arena;
  busy: boolean;
  onRun: (slots: string[]) => void;
  act: (task: () => Promise<void>) => Promise<void>;
  adopt: (arena: Arena) => void;
}) {
  const request = arena.runRequest;
  if (!request) return null;
  const labels = request.slots
    .map((id) => arena.slots.find((s) => s.id === id)?.label)
    .filter(Boolean);
  return (
    <div className="arena-request" role="status">
      <span>
        An agent asked to run {labels.length}{" "}
        {labels.length === 1 ? "approach" : "approaches"}: {labels.join(", ")}.
      </span>
      <button
        className="primary-button"
        disabled={busy}
        onClick={() => onRun(request.slots)}
      >
        Review and run
      </button>
      <button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            const route = `/${arena.id}/run-request`;
            adopt(
              (
                await arenaRequest<{ arena: Arena }>(route, {
                  method: "DELETE",
                })
              ).arena,
            );
          })
        }
      >
        Dismiss
      </button>
    </div>
  );
}
