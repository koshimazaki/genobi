import { mkdir, open, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Preserve the source/recipe lineage of every capture sharing this directory. */
export async function reserveCaptureDirectory(directory) {
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length)
    throw new Error(
      "Capture output directory must be absent or empty; choose a new directory.",
    );
  // Exclusive creation also protects two operators racing on the same empty root.
  let reservation;
  try {
    reservation = await open(
      join(directory, "capture-reservation.json"),
      "wx",
      0o600,
    );
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Capture output directory is already reserved; choose a new directory.",
        { cause: error },
      );
    throw error;
  }
  try {
    await reservation.writeFile(
      JSON.stringify({
        version: 1,
        status: "reserved",
        createdAt: new Date().toISOString(),
      }),
    );
    await reservation.sync();
  } finally {
    await reservation.close();
  }
}
