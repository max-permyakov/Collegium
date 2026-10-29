namespace CollegePortal.Domain.Enums;

/// <summary>
/// Purpose of a chat row. Direct chats connect two real users; Saved is a
/// personal notes thread and Support is a per-user support thread. The last two
/// are self-paired (User1Id == User2Id) and never send partner notifications.
/// </summary>
public enum ChatKind
{
    Direct = 0,
    Saved = 1,
    Support = 2
}
