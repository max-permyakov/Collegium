# syntax=docker/dockerfile:1
# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore layer (only project files -> better layer caching)
COPY CollegePortal.Api/CollegePortal.Api.csproj CollegePortal.Api/
COPY CollegePortal.Application/CollegePortal.Application.csproj CollegePortal.Application/
COPY CollegePortal.Domain/CollegePortal.Domain.csproj CollegePortal.Domain/
COPY CollegePortal.Infrastructure/CollegePortal.Infrastructure.csproj CollegePortal.Infrastructure/
RUN dotnet restore CollegePortal.Api/CollegePortal.Api.csproj

# Copy sources and publish
COPY CollegePortal.Api/ CollegePortal.Api/
COPY CollegePortal.Application/ CollegePortal.Application/
COPY CollegePortal.Domain/ CollegePortal.Domain/
COPY CollegePortal.Infrastructure/ CollegePortal.Infrastructure/
RUN dotnet publish CollegePortal.Api/CollegePortal.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    TZ=Europe/Moscow \
    DOTNET_EnableDiagnostics=0

EXPOSE 8080

COPY --from=build /app/publish ./

ENTRYPOINT ["dotnet", "CollegePortal.Api.dll"]
