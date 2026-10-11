namespace CollegePortal.Application.DTOs;

public record SubjectGradeResponseDto(
    int Id,
    string Name,
    double AverageMark
);

public record GradesResponseDto(
    SubjectGradeResponseDto[] Subjects
);