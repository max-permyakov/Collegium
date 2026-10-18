// User display names are stored as "Фамилия Имя Отчество" (composed at diary
// login). Everywhere except the profile pages only the short form
// "Фамилия Имя" is shown, so the patronymic is kept for profiles only.
export function shortName(name?: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/).slice(0, 2).join(' ');
}
