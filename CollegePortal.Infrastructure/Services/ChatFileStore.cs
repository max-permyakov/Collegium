using System.Security.Cryptography;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CollegePortal.Infrastructure.Services;

public class ChatStorageOptions
{
    /// <summary>
    /// Root folder for chat attachments. A relative path is resolved against
    /// the content root; deployments point this at a persistent volume
    /// (docker-compose sets Chat__FilesRoot=/data/chat-files).
    /// </summary>
    public string FilesRoot { get; set; } = "Storage/chat-files";
}

/// <summary>Descriptor of a freshly stored attachment.</summary>
public record ChatStoredFile(string StorageKey);

/// <summary>On-disk storage for chat attachments streamed by the caller.</summary>
public interface IChatFileStore
{
    /// <summary>Copies the stream to a random-name file and returns the relative key.</summary>
    Task<ChatStoredFile> SaveAsync(Stream content, CancellationToken ct = default);

    /// <summary>Deletes a stored file (best effort, does not throw).</summary>
    void Delete(string storageKey);

    /// <summary>Physical path of a relative storage key.</summary>
    string GetPath(string storageKey);
}

public class ChatFileStore : IChatFileStore
{
    private readonly string _root;
    private readonly ILogger<ChatFileStore> _logger;

    public ChatFileStore(IOptions<ChatStorageOptions> options, IHostEnvironment environment, ILogger<ChatFileStore> logger)
    {
        var configured = options.Value.FilesRoot;
        if (string.IsNullOrWhiteSpace(configured))
            configured = "Storage/chat-files";

        _root = Path.IsPathRooted(configured)
            ? configured
            : Path.GetFullPath(Path.Combine(environment.ContentRootPath, configured));

        _logger = logger;
    }

    public async Task<ChatStoredFile> SaveAsync(Stream content, CancellationToken ct = default)
    {
        // Storing everything in one folder keeps cleanup simple; the id part is
        // a random hex string, so incoming file names never touch the path.
        var storageKey = $"{DateTime.UtcNow:yyyy}/{DateTime.UtcNow:MM}/{Guid.NewGuid():N}";
        var path = GetPath(storageKey);

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        await using (var target = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        {
            await content.CopyToAsync(target, 128 * 1024, ct);
        }

        return new ChatStoredFile(storageKey);
    }

    public void Delete(string storageKey)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(storageKey))
                return;

            var path = GetPath(storageKey);
            if (File.Exists(path))
                File.Delete(path);

            TryCleanEmptyDirs(Path.GetDirectoryName(path));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete chat file {StorageKey}", storageKey);
        }
    }

    public string GetPath(string storageKey)
    {
        // Defense in depth: reject any traversal attempt before combining.
        if (storageKey.Contains("..") || storageKey.StartsWith('/') || storageKey.Contains('\\'))
            throw new ArgumentException("Invalid storage key", nameof(storageKey));

        return Path.Combine(_root, storageKey.Replace('/', Path.DirectorySeparatorChar));
    }

    private void TryCleanEmptyDirs(string? directory)
    {
        try
        {
            while (!string.IsNullOrEmpty(directory))
            {
                var root = Path.GetFullPath(_root).TrimEnd(Path.DirectorySeparatorChar);
                if (!directory.StartsWith(root, StringComparison.OrdinalIgnoreCase) ||
                    directory.TrimEnd(Path.DirectorySeparatorChar).Equals(root, StringComparison.OrdinalIgnoreCase))
                    break;

                var info = new DirectoryInfo(directory);
                if (!info.Exists || info.EnumerateFileSystemInfos().Any())
                    break;

                info.Delete();
                directory = info.Parent?.FullName;
            }
        }
        catch
        {
            // Cosmetic cleanup only.
        }
    }
}
