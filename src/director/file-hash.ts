/** Content identity shared by project imports, archives and other browser media. */
export async function digest(bytes: Uint8Array<ArrayBuffer>) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
