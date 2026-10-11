using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class CollegeMapService : ICollegeMapService
{
    // Shared territory map dimensions (coordinate space of assets/college-map.png).
    public const int MapWidth = 1024;
    public const int MapHeight = 2048;

    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<CollegeMapService> _logger;

    public CollegeMapService(CollegePortalDbContext dbContext, ILogger<CollegeMapService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<CollegeMapDto> GetMapAsync(CancellationToken ct = default)
    {
        var buildings = await _dbContext.Buildings.AsNoTracking()
            .OrderBy(b => b.SortOrder).ThenBy(b => b.Name)
            .Select(b => new
            {
                b.Id,
                b.Name,
                b.Description,
                b.SortOrder,
                AuditoriumCount = b.Auditoriums.Count
            })
            .ToListAsync(ct);

        var auditoriums = await _dbContext.Auditoriums.AsNoTracking()
            .Include(a => a.Building)
            .Include(a => a.Disciplines)
            .Include(a => a.Teachers)
            .OrderBy(a => a.Building.SortOrder).ThenBy(a => a.Number)
            .ToListAsync(ct);

        return new CollegeMapDto(
            MapWidth,
            MapHeight,
            buildings.Select(b => new BuildingDto(b.Id, b.Name, b.Description, b.SortOrder, b.AuditoriumCount)).ToArray(),
            auditoriums.Select(ToDto).ToArray()
        );
    }

    public async Task<BuildingDto[]> GetBuildingsAsync(CancellationToken ct = default)
    {
        return await _dbContext.Buildings.AsNoTracking()
            .OrderBy(b => b.SortOrder).ThenBy(b => b.Name)
            .Select(b => new BuildingDto(b.Id, b.Name, b.Description, b.SortOrder, b.Auditoriums.Count))
            .ToArrayAsync(ct);
    }

    public async Task<DisciplineDto[]> GetDisciplinesAsync(CancellationToken ct = default)
    {
        return await _dbContext.Disciplines.AsNoTracking()
            .OrderBy(d => d.Name)
            .Select(d => new DisciplineDto(d.Id, d.Name, d.Auditoriums.Count))
            .ToArrayAsync(ct);
    }

    public async Task<MapSearchResultDto> SearchAsync(string query, CancellationToken ct = default)
    {
        var q = (query ?? string.Empty).Trim();
        if (q.Length == 0)
            return new MapSearchResultDto(q, Array.Empty<AuditoriumRefDto>());

        var like = $"%{q}%";
        var results = await _dbContext.Auditoriums.AsNoTracking()
            .Where(a =>
                EF.Functions.Like(a.Number, like) ||
                (a.DisplayName != null && EF.Functions.Like(a.DisplayName, like)) ||
                (a.LocationHint != null && EF.Functions.Like(a.LocationHint, like)) ||
                EF.Functions.Like(a.Building.Name, like) ||
                a.Disciplines.Any(d => EF.Functions.Like(d.Name, like)) ||
                a.Teachers.Any(t => EF.Functions.Like(t.FullName, like)))
            .OrderBy(a => a.Building.Name).ThenBy(a => a.Number)
            .Select(a => new AuditoriumRefDto(a.Id, a.BuildingId, a.Building.Name, a.Number, a.DisplayName))
            .Take(100)
            .ToArrayAsync(ct);

        return new MapSearchResultDto(q, results);
    }

    public async Task<BuildingDto> CreateBuildingAsync(Guid adminUserId, CreateBuildingDto dto, CancellationToken ct = default)
    {
        var name = (dto.Name ?? string.Empty).Trim();
        if (name.Length == 0)
            throw new ArgumentException("Название корпуса обязательно");

        if (await _dbContext.Buildings.AnyAsync(b => b.Name == name, ct))
            throw new ArgumentException("Корпус с таким названием уже существует");

        var building = new Building
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim(),
            SortOrder = dto.SortOrder,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Buildings.Add(building);
        await _dbContext.SaveChangesAsync(ct);
        await WriteAuditAsync(adminUserId, "Создать корпус (карта)", building.Name, ct);

        return new BuildingDto(building.Id, building.Name, building.Description, building.SortOrder, 0);
    }

    public async Task<MapActionResult> UpdateBuildingAsync(Guid id, Guid adminUserId, UpdateBuildingDto dto, CancellationToken ct = default)
    {
        var building = await _dbContext.Buildings.FirstOrDefaultAsync(b => b.Id == id, ct);
        if (building == null)
            return new MapActionResult(false, "Корпус не найден");

        var name = (dto.Name ?? string.Empty).Trim();
        if (name.Length == 0)
            return new MapActionResult(false, "Название корпуса обязательно");

        if (await _dbContext.Buildings.AnyAsync(b => b.Name == name && b.Id != id, ct))
            return new MapActionResult(false, "Корпус с таким названием уже существует");

        building.Name = name;
        building.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        building.SortOrder = dto.SortOrder;
        building.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        await WriteAuditAsync(adminUserId, "Изменить корпус (карта)", building.Name, ct);

        return new MapActionResult(true);
    }

    public async Task<MapActionResult> DeleteBuildingAsync(Guid id, Guid adminUserId, CancellationToken ct = default)
    {
        var building = await _dbContext.Buildings.FirstOrDefaultAsync(b => b.Id == id, ct);
        if (building == null)
            return new MapActionResult(false, "Корпус не найден");

        _dbContext.Buildings.Remove(building);
        await _dbContext.SaveChangesAsync(ct);
        await WriteAuditAsync(adminUserId, "Удалить корпус (карта)", building.Name, ct);

        return new MapActionResult(true);
    }

    public async Task<AuditoriumDto> CreateAuditoriumAsync(Guid adminUserId, CreateAuditoriumDto dto, CancellationToken ct = default)
    {
        Validate(dto.Number, dto.BuildingId);
        if (!await _dbContext.Buildings.AnyAsync(b => b.Id == dto.BuildingId, ct))
            throw new ArgumentException("Корпус не найден");

        var auditorium = new Auditorium
        {
            Id = Guid.NewGuid(),
            BuildingId = dto.BuildingId,
            Number = dto.Number.Trim(),
            DisplayName = Trimmed(dto.DisplayName),
            Floor = dto.Floor,
            LocationHint = Trimmed(dto.LocationHint),
            HasComputers = dto.HasComputers,
            X = dto.X,
            Y = dto.Y,
            Width = dto.Width,
            Height = dto.Height,
            CreatedAt = DateTime.UtcNow
        };

        await ApplyDisciplinesAsync(auditorium, dto.DisciplineIds, dto.DisciplineNames, ct);
        await ApplyTeachersAsync(auditorium, dto.TeacherIds, ct);

        _dbContext.Auditoriums.Add(auditorium);
        await _dbContext.SaveChangesAsync(ct);
        await WriteAuditAsync(adminUserId, "Создать аудиторию (карта)", $"{auditorium.Number}", ct);

        return await ReloadDtoAsync(auditorium.Id, ct);
    }

    public async Task<MapActionResult> UpdateAuditoriumAsync(Guid id, Guid adminUserId, UpdateAuditoriumDto dto, CancellationToken ct = default)
    {
        try
        {
            Validate(dto.Number, dto.BuildingId);
        }
        catch (ArgumentException ex)
        {
            return new MapActionResult(false, ex.Message);
        }

        var auditorium = await _dbContext.Auditoriums
            .Include(a => a.Disciplines)
            .Include(a => a.Teachers)
            .FirstOrDefaultAsync(a => a.Id == id, ct);
        if (auditorium == null)
            return new MapActionResult(false, "Аудитория не найдена");

        if (!await _dbContext.Buildings.AnyAsync(b => b.Id == dto.BuildingId, ct))
            return new MapActionResult(false, "Корпус не найден");

        if (await _dbContext.Auditoriums.AnyAsync(a => a.BuildingId == dto.BuildingId && a.Number == dto.Number.Trim() && a.Id != id, ct))
            return new MapActionResult(false, "Аудитория с таким номером уже есть в этом корпусе");

        auditorium.BuildingId = dto.BuildingId;
        auditorium.Number = dto.Number.Trim();
        auditorium.DisplayName = Trimmed(dto.DisplayName);
        auditorium.Floor = dto.Floor;
        auditorium.LocationHint = Trimmed(dto.LocationHint);
        auditorium.HasComputers = dto.HasComputers;
        auditorium.X = dto.X;
        auditorium.Y = dto.Y;
        auditorium.Width = dto.Width;
        auditorium.Height = dto.Height;
        auditorium.UpdatedAt = DateTime.UtcNow;

        auditorium.Disciplines.Clear();
        auditorium.Teachers.Clear();
        await ApplyDisciplinesAsync(auditorium, dto.DisciplineIds, dto.DisciplineNames, ct);
        await ApplyTeachersAsync(auditorium, dto.TeacherIds, ct);

        await _dbContext.SaveChangesAsync(ct);
        await WriteAuditAsync(adminUserId, "Изменить аудиторию (карта)", $"{auditorium.Number}", ct);

        return new MapActionResult(true);
    }

    public async Task<MapActionResult> DeleteAuditoriumAsync(Guid id, Guid adminUserId, CancellationToken ct = default)
    {
        var auditorium = await _dbContext.Auditoriums.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (auditorium == null)
            return new MapActionResult(false, "Аудитория не найдена");

        _dbContext.Auditoriums.Remove(auditorium);
        await _dbContext.SaveChangesAsync(ct);
        await WriteAuditAsync(adminUserId, "Удалить аудиторию (карта)", auditorium.Number, ct);

        return new MapActionResult(true);
    }

    private static void Validate(string? number, Guid buildingId)
    {
        if (buildingId == Guid.Empty)
            throw new ArgumentException("Корпус обязателен");
        if (string.IsNullOrWhiteSpace(number))
            throw new ArgumentException("Номер аудитории обязателен");
    }

    private static string? Trimmed(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task ApplyDisciplinesAsync(Auditorium auditorium, Guid[]? ids, string[]? names, CancellationToken ct)
    {
        var resolved = new List<Discipline>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var idList = ids?.Where(i => i != Guid.Empty).Distinct().ToArray() ?? Array.Empty<Guid>();
        if (idList.Length > 0)
        {
            var byId = await _dbContext.Disciplines.Where(d => idList.Contains(d.Id)).ToListAsync(ct);
            foreach (var d in byId)
            {
                if (seen.Add(d.Name)) resolved.Add(d);
            }
        }

        var nameList = names?
            .Select(n => n.Trim())
            .Where(n => n.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? Array.Empty<string>();

        foreach (var name in nameList)
        {
            if (!seen.Add(name)) continue;
            var trimmed = name.Trim();
            var existing = await _dbContext.Disciplines.FirstOrDefaultAsync(d => d.Name == trimmed, ct);
            if (existing == null)
            {
                existing = new Discipline { Id = Guid.NewGuid(), Name = trimmed, CreatedAt = DateTime.UtcNow };
                _dbContext.Disciplines.Add(existing);
            }
            resolved.Add(existing);
        }

        foreach (var d in resolved)
            auditorium.Disciplines.Add(d);
    }

    private async Task ApplyTeachersAsync(Auditorium auditorium, Guid[]? ids, CancellationToken ct)
    {
        var idList = ids?.Where(i => i != Guid.Empty).Distinct().ToArray() ?? Array.Empty<Guid>();
        if (idList.Length == 0) return;

        var teachers = await _dbContext.CollegeTeachers.Where(t => idList.Contains(t.Id)).ToListAsync(ct);
        foreach (var t in teachers)
            auditorium.Teachers.Add(t);
    }

    private async Task<AuditoriumDto> ReloadDtoAsync(Guid id, CancellationToken ct)
    {
        var auditorium = await _dbContext.Auditoriums.AsNoTracking()
            .Include(a => a.Building)
            .Include(a => a.Disciplines)
            .Include(a => a.Teachers)
            .FirstAsync(a => a.Id == id, ct);
        return ToDto(auditorium);
    }

    private static AuditoriumDto ToDto(Auditorium a) => new(
        a.Id,
        a.BuildingId,
        a.Building.Name,
        a.Number,
        a.DisplayName,
        a.Floor,
        a.LocationHint,
        a.HasComputers,
        a.X,
        a.Y,
        a.Width,
        a.Height,
        a.Disciplines.OrderBy(d => d.Name).Select(d => d.Name).ToArray(),
        a.Teachers.OrderBy(t => t.FullName).Select(t => new TeacherRefDto(t.Id, t.FullName, t.Position)).ToArray()
    );

    private async Task WriteAuditAsync(Guid adminUserId, string action, string details, CancellationToken ct)
    {
        if (adminUserId == Guid.Empty) return;

        _dbContext.AdminAuditLogs.Add(new AdminAuditLog
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminUserId,
            Action = action,
            Details = details,
            CreatedAt = DateTime.UtcNow
        });
        await _dbContext.SaveChangesAsync(ct);
    }
}
