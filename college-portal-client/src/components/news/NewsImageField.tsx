const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

interface NewsImageFieldProps {
  imageUrl: string | null | undefined;
  uploading: boolean;
  error: string;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
  onUploadingChanged: (uploading: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Upload / preview / remove control for the news cover image.
 * The file is converted to base64 (data URL) and sent in the request body.
 */
export function NewsImageField({
  imageUrl,
  uploading,
  error,
  onUploaded,
  onRemoved,
  onUploadingChanged,
  onError,
}: NewsImageFieldProps) {
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    onError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      onError('Поддерживаются jpg, png, gif и webp');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      onError('Картинка больше 8 МБ');
      return;
    }
    onUploadingChanged(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        // Send as raw body with content-type: text/plain (base64)
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5221/api'}/news/image?fileName=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          credentials: 'include',
          body: dataUrl,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Не удалось загрузить картинку');
        }
        const data = await res.json();
        onUploaded(data.dataUrl);
      };
      reader.onerror = () => {
        onError('Не удалось прочитать файл');
        onUploadingChanged(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      onError(err.message || 'Не удалось загрузить картинку');
    } finally {
      onUploadingChanged(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-dark-text mb-1.5">Картинка (необязательно)</label>

      {imageUrl && (
        <div className="relative w-fit">
          <img src={imageUrl} alt="Картинка новости" className="h-32 rounded-xl object-cover border border-dark-border" />
          <button
            type="button"
            onClick={onRemoved}
            aria-label="Убрать картинку"
            title="Убрать картинку"
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center text-sm hover:bg-black/90 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      <label className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 cursor-pointer select-none">
        <input
          type="file"
          accept="image/png, image/jpeg, image/gif, image/webp"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void handleFile(file);
          }}
        />
        {uploading ? 'Загрузка...' : imageUrl ? 'Заменить картинку' : 'Прикрепить картинку'}
      </label>
      <p className="text-xs text-dark-textMuted">До 8 МБ, jpg/png/gif/webp</p>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
