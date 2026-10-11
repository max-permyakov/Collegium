using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IAssignmentService
{
    Task<AssignmentListDto[]> GetForStudentAsync(Guid userId, CancellationToken ct = default);
    Task<AssignmentDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<AssignmentDto> CreateAsync(Guid createdById, CreateAssignmentDto dto, CancellationToken ct = default);
    Task<AssignmentDto?> UpdateAsync(Guid id, Guid createdById, UpdateAssignmentDto dto, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, Guid createdById, CancellationToken ct = default);
}