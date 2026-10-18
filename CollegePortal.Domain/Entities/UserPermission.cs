namespace CollegePortal.Domain.Entities;

public class UserPermission
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public CollegePortal.Domain.Enums.Permission Permission { get; set; }
}
