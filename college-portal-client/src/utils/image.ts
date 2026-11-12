/**
 * Avatar uploads are stored as base64 data URLs. Sending a raw phone photo
 * (up to the 2 MB limit) produced multi-megabyte payloads that slowed down
 * every profile/chat/club load, so images are downscaled before upload.
 */
const AVATAR_MAX_SIDE = 320;
const AVATAR_QUALITY = 0.85;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось открыть изображение'));
    image.src = src;
  });

/**
 * Returns a downscaled WebP (or JPEG) data URL, keeping the original when the
 * browser cannot decode the file or the result would not be smaller.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const raw = await readAsDataUrl(file);
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return raw;

  try {
    const image = await loadImage(raw);
    if (!image.width || !image.height) return raw;

    const scale = Math.min(1, AVATAR_MAX_SIDE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;

    ctx.drawImage(image, 0, 0, width, height);

    const webp = canvas.toDataURL('image/webp', AVATAR_QUALITY);
    if (webp.startsWith('data:image/webp') && webp.length < raw.length) return webp;

    const jpeg = canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
    return jpeg.length < raw.length ? jpeg : raw;
  } catch {
    return raw;
  }
}
