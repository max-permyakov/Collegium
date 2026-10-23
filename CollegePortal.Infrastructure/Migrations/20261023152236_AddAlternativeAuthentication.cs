using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CollegePortal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAlternativeAuthentication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "ExternalStudentId",
                table: "StudentProfiles",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<DateTime>(
                name: "DiaryLinkedAt",
                table: "StudentProfiles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DiaryLogin",
                table: "StudentProfiles",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastGroupChangedAt",
                table: "StudentProfiles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastAuthAt",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LastAuthMethod",
                table: "AspNetUsers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RegistrationSource",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "EmailLoginCodes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    CodeHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ConsumedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RegistrationTokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RegistrationTokenExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OAuthProvider = table.Column<int>(type: "integer", nullable: true),
                    OAuthProviderUserId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    OAuthDisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailLoginCodes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserAuthProviders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<int>(type: "integer", nullable: false),
                    ProviderUserId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ProviderEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserAuthProviders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserAuthProviders_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EmailLoginCodes_Email_CreatedAt",
                table: "EmailLoginCodes",
                columns: new[] { "Email", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EmailLoginCodes_RegistrationTokenHash",
                table: "EmailLoginCodes",
                column: "RegistrationTokenHash");

            migrationBuilder.CreateIndex(
                name: "IX_UserAuthProviders_Provider_ProviderUserId",
                table: "UserAuthProviders",
                columns: new[] { "Provider", "ProviderUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserAuthProviders_UserId_Provider",
                table: "UserAuthProviders",
                columns: new[] { "UserId", "Provider" },
                unique: true);

            // Backfill existing diary accounts so they keep a working provider
            // record and a login fallback after the nullable diary link change.
            migrationBuilder.Sql("""
                UPDATE "StudentProfiles" sp
                SET "DiaryLogin" = u."UserName",
                    "DiaryLinkedAt" = COALESCE(sp."DiaryLinkedAt", NOW())
                FROM "AspNetUsers" u
                WHERE sp."UserId" = u."Id"
                  AND sp."ExternalStudentId" IS NOT NULL
                  AND (sp."DiaryLogin" IS NULL OR sp."DiaryLogin" = '');
                """);

            migrationBuilder.Sql("""
                INSERT INTO "UserAuthProviders"
                    ("Id", "UserId", "Provider", "ProviderUserId", "ProviderEmail", "CreatedAt", "LastLoginAt")
                SELECT gen_random_uuid(), sp."UserId", 0,
                       COALESCE(NULLIF(sp."DiaryLogin", ''), u."UserName", sp."ExternalStudentId"::text),
                       NULLIF(u."Email", ''),
                       NOW(),
                       u."LastLoginAt"
                FROM "StudentProfiles" sp
                JOIN "AspNetUsers" u ON u."Id" = sp."UserId"
                WHERE sp."ExternalStudentId" IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM "UserAuthProviders" p
                      WHERE p."UserId" = sp."UserId" AND p."Provider" = 0
                  );
                """);

            migrationBuilder.Sql("""
                UPDATE "AspNetUsers" u
                SET "RegistrationSource" = 0,
                    "LastAuthMethod" = COALESCE(u."LastAuthMethod", 0)
                WHERE EXISTS (
                    SELECT 1 FROM "StudentProfiles" sp
                    WHERE sp."UserId" = u."Id" AND sp."ExternalStudentId" IS NOT NULL
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmailLoginCodes");

            migrationBuilder.DropTable(
                name: "UserAuthProviders");

            migrationBuilder.DropColumn(
                name: "DiaryLinkedAt",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "DiaryLogin",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "LastGroupChangedAt",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "LastAuthAt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "LastAuthMethod",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "RegistrationSource",
                table: "AspNetUsers");

            migrationBuilder.Sql("DELETE FROM \"StudentProfiles\" WHERE \"ExternalStudentId\" IS NULL;");

            migrationBuilder.AlterColumn<int>(
                name: "ExternalStudentId",
                table: "StudentProfiles",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }
    }
}
