namespace CollegePortal.Domain.Enums;

/// <summary>
/// Payload type of a direct-chat message.
/// </summary>
public enum ChatMessageKind
{
    Text = 0,
    File = 1,
    Voice = 2,
    VideoCircle = 3
}
