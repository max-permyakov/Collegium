using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CollegePortal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDiaryIntegrationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DiaryCookieData",
                table: "StudentProfiles",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DiaryCookiesExpiresAt",
                table: "StudentProfiles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DiaryLastSyncedAt",
                table: "StudentProfiles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DiaryPasswordHash",
                table: "StudentProfiles",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DiaryCookieData",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "DiaryCookiesExpiresAt",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "DiaryLastSyncedAt",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "DiaryPasswordHash",
                table: "StudentProfiles");
        }
    }
}
