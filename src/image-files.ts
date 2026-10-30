export async function readReference(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose PNG, JPEG or WebP images.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Each reference must be 5 MB or smaller.");
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This image could not be decoded."));
    image.src = url;
  });
  if (
    image.width < 256 ||
    image.height < 256 ||
    image.width * image.height > 16_777_216
  )
    throw new Error(
      "References need both sides at least 256 px and no more than 16 megapixels.",
    );
  return url;
}
