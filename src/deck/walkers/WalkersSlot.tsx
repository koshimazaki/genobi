import type { ReactNode } from "react";
import type { useWalkers } from "./konami";
import WalkersGame from "./WalkersGame";

/**
 * The deck's one mount point for the walkers game: while it is open the game
 * takes the visualiser's place, and the visualiser stays mounted but hidden,
 * so its mode, pause and metaball game come back exactly as they were.
 */
export default function WalkersSlot({
  walkers,
  children,
}: {
  walkers: ReturnType<typeof useWalkers>;
  children: ReactNode;
}) {
  return (
    <>
      {walkers.on && (
        <WalkersGame audio={walkers.audio} onExit={walkers.exit} />
      )}
      <div className="deck-walkers-hold" hidden={walkers.on}>
        {children}
      </div>
    </>
  );
}
