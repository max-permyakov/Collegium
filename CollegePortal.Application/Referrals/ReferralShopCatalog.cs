namespace CollegePortal.Application.Referrals;

/// <summary>One purchasable reward in the KepkaCoin shop.</summary>
public record ReferralShopItemDefinition(
    string Code,
    string Title,
    string Description,
    string Icon,
    int Price
);

/// <summary>Nickname color unlocked by the "nickname-color" shop item.</summary>
public record NicknameColorOption(
    string Code,
    string Title,
    string Hex
);

/// <summary>
/// Code-defined reward catalog. Prices and codes are stable API contracts;
/// the database only stores which user owns which code.
/// </summary>
public static class ReferralShopCatalog
{
    public const string ReportFormatter = "report-formatter";
    public const string AmbassadorBadge = "ambassador-badge";
    public const string AvatarFrame = "avatar-frame";
    public const string NicknameColor = "nickname-color";
    public const string GoldBadge = "gold-badge";

    public static readonly ReferralShopItemDefinition[] Items =
    [
        new(
            ReportFormatter,
            "Программа для оформления отчётов",
            "Автоматически приводит отчёт к требованиям колледжа: титульный лист, шрифты, отступы и содержание.",
            "📄",
            1),
        new(
            AmbassadorBadge,
            "Значок амбассадора",
            "Особый значок рядом с именем в профиле — видно всем, кто открывает вашу страницу.",
            "🎖️",
            2),
        new(
            AvatarFrame,
            "Золотая рамка аватара",
            "Живая рамка из настоящего золота: металлический блеск, медленное переливание и солнечные блики.",
            "🖼️",
            3),
        new(
            NicknameColor,
            "Цвет никнейма",
            "Палитра из 20 цветов: 16 спокойных и 4 переливающихся — RGB, жидкое золото, северное сияние и голограмма.",
            "🎨",
            2),
        new(
            GoldBadge,
            "Золотой значок",
            "Золотой значок с металлическим блеском — самый заметный статус в портале.",
            "🏅",
            5)
    ];

    /// <summary>
    /// Nickname palette. Ordered: the first 16 are flat colours, the last four
    /// are animated gradients rendered by the client (`nick-{Code}` CSS class).
    /// Codes are stored in <c>ApplicationUser.NicknameColor</c>, so they are
    /// stable API values and must not be renamed.
    /// </summary>
    public static readonly NicknameColorOption[] NicknameColors =
    [
        new("violet", "Фиолетовый", "#a78bfa"),
        new("indigo", "Индиго", "#818cf8"),
        new("blue", "Синий", "#60a5fa"),
        new("sky", "Небесный", "#38bdf8"),
        new("cyan", "Голубой", "#22d3ee"),
        new("teal", "Бирюзовый", "#2dd4bf"),
        new("emerald", "Изумрудный", "#34d399"),
        new("lime", "Лаймовый", "#a3e635"),
        new("amber", "Янтарный", "#fbbf24"),
        new("orange", "Оранжевый", "#fb923c"),
        new("rose", "Розовый", "#fb7185"),
        new("pink", "Розовый закат", "#f472b6"),
        new("fuchsia", "Фуксия", "#e879f9"),
        new("red", "Алый", "#f87171"),
        new("pearl", "Жемчужный", "#f8fafc"),
        new("slate", "Стальной", "#cbd5e1"),
        new("rgb", "RGB-переливание", "#ff4d4d"),
        new("gold", "Жидкое золото", "#f7d774"),
        new("aurora", "Северное сияние", "#5eead4"),
        new("holo", "Голограмма", "#c084fc")
    ];

    public static ReferralShopItemDefinition? Find(string? code) =>
        Items.FirstOrDefault(item => string.Equals(item.Code, code, StringComparison.OrdinalIgnoreCase));

    public static bool IsKnownColor(string? code) =>
        NicknameColors.Any(color => string.Equals(color.Code, code, StringComparison.OrdinalIgnoreCase));

    public static NicknameColorOption? FindColor(string? code) =>
        NicknameColors.FirstOrDefault(color =>
            string.Equals(color.Code, code, StringComparison.OrdinalIgnoreCase));
}
