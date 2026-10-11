export interface BuildingDto {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  auditoriumCount: number;
}

export interface TeacherRefDto {
  id: string;
  fullName: string;
  position?: string | null;
}

export interface DisciplineDto {
  id: string;
  name: string;
  auditoriumCount: number;
}

export interface AuditoriumDto {
  id: string;
  buildingId: string;
  buildingName: string;
  number: string;
  displayName?: string | null;
  floor?: number | null;
  locationHint?: string | null;
  hasComputers: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  disciplines: string[];
  teachers: TeacherRefDto[];
}

export interface AuditoriumRefDto {
  id: string;
  buildingId: string;
  buildingName: string;
  number: string;
  displayName?: string | null;
}

export interface CollegeMapDto {
  mapWidth: number;
  mapHeight: number;
  buildings: BuildingDto[];
  auditoriums: AuditoriumDto[];
}

export interface MapSearchResultDto {
  query: string;
  auditoriums: AuditoriumRefDto[];
}

export interface CreateBuildingDto {
  name: string;
  description?: string | null;
  sortOrder: number;
}

export type UpdateBuildingDto = CreateBuildingDto;

export interface CreateAuditoriumDto {
  buildingId: string;
  number: string;
  displayName?: string | null;
  floor?: number | null;
  locationHint?: string | null;
  hasComputers: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  disciplineIds: string[];
  disciplineNames: string[];
  teacherIds: string[];
}

export type UpdateAuditoriumDto = CreateAuditoriumDto;
