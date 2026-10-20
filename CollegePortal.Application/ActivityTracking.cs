namespace CollegePortal.Application;

// Shared thresholds for the user-activity tracker. The middleware (Api) uses
// the write interval to debounce LastActivityAt updates; statistics and the
// admin UI use the online window to decide who counts as "online now".
public static class ActivityTracking
{
    public static readonly TimeSpan ActivityWriteInterval = TimeSpan.FromMinutes(1);
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan ActiveWindow = TimeSpan.FromDays(7);
}
