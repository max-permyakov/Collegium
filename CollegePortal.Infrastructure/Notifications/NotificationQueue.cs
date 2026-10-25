using System.Threading.Channels;

namespace CollegePortal.Infrastructure.Notifications;

/// <summary>
/// In-memory queue of notification ids waiting for push delivery. Works for a
/// single API instance; the outbox sweeper in <see cref="PushDeliveryWorker"/>
/// recovers notifications if the process dies before an id is processed.
/// </summary>
public sealed class NotificationQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>(
        new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });

    public void Enqueue(Guid notificationId) => _channel.Writer.TryWrite(notificationId);

    public IAsyncEnumerable<Guid> ReadAllAsync(CancellationToken ct) =>
        _channel.Reader.ReadAllAsync(ct);
}
