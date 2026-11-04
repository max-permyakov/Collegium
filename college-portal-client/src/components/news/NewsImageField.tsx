import { newsApi } from '../../services/api';

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
 * The file goes straight to POST /news/image as a raw body (8 МБ max,
 * jpg/png/gif/webp) and the returned URL is stored in the announcement.
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
      const res = await newsApi.uploadImage(file, file.name);
      onUploaded(res.data.url);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      onError(e.response?.data?.message || 'Не удалось загрузить картинку');
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
