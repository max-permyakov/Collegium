# Codemaps

Navigation and orientation maps for the College Portal codebase. They describe
the current implementation (including in-progress activity tracking) rather
than the aspirational design in `docs/architecture.md`.

| Map | Use it when |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | You need the big picture: layers, request pipeline, auth, data flows, data model, deployment. |
| [MODULES.md](MODULES.md) | You need a module's purpose, key files, dependencies and public exports. |
| [FILES.md](FILES.md) | You need to find where a specific file lives or what a file does. |

Related documents:

- [../architecture.md](../architecture.md) — narrative clean-architecture notes.
- [../api-research.md](../api-research.md) — external diary/schedule API research.
- [../deployment.md](../deployment.md) — Docker, Caddy and Cloudflare Tunnel setup.
- [../security.md](../security.md) — security decisions and threat notes.
- [../../README.md](../../README.md) — install, run and endpoint overview.

## Quick orientation

| I want to... | Start here |
|---|---|
| Add or change an HTTP endpoint | `CollegePortal.Api/Controllers/` then the matching `I*Service` in `CollegePortal.Application/Services/` |
| Add business logic | Implement the interface in `CollegePortal.Infrastructure/Services/` |
| Change the schema | `CollegePortal.Domain/Entities/` → `CollegePortal.Infrastructure/Data/CollegePortalDbContext.cs` → new migration |
| Change auth, cookies or permissions | `ServiceCollectionExtensions.cs`, `AuthService.cs`, `Authorization/`, `AuthController.cs` |
| Change the request pipeline or seeding | `CollegePortal.Api/Program.cs` |
| Add an external integration | `CollegePortal.Infrastructure/ExternalApis/` plus an `I*Client` contract in Application |
| Add a screen | `college-portal-client/src/pages/`, register the route in `src/App.tsx` |
| Call the API from the SPA | Add a typed group in `college-portal-client/src/services/api.ts` |
| Change navigation | `college-portal-client/src/components/layout/RightSidebar.tsx` |
| Change admin permissions | `CollegePortal.Domain/Enums/Permission.cs`, authorization setup, `types/index.ts`, admin tabs |
| Deploy or configure secrets | `docker-compose.yml`, `.env.example`, `deploy/` |

## Maintenance

Regenerate the relevant map when:

1. A project, top-level directory or module is added/removed/renamed.
2. A controller route prefix, authorization policy or middleware changes.
3. A service interface or major implementation changes.
4. An EF Core migration changes the data model.
5. A frontend page, route, API group or permission is added.
6. A new external integration or deployment service appears.

Checklist:

- [ ] `ARCHITECTURE.md` pipeline/endpoint/data-model sections match the code.
- [ ] `MODULES.md` key files and exports match the actual types.
- [ ] `FILES.md` lists every tracked source/config file (excluding `bin/`,
      `obj/`, `node_modules/`, `dist/`).
- [ ] Relative links resolve.
- [ ] No secrets or captured personal data are copied into the maps.

_Last reviewed: 2026-10-20 (activity tracking / `LastActivityAt` migration)._
