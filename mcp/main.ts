import { main } from "./server";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
