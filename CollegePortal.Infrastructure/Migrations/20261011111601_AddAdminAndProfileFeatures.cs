using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CollegePortal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminAndProfileFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AvatarDataUrl",
                table: "StudentProfiles",
                type: "nvarchar(max)",
                maxLength: 700000,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AverageMark",
                table: "StudentProfiles",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Bio",
                table: "StudentProfiles",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "GradesCachedAt",
                table: "StudentProfiles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HeadmanRole",
                table: "StudentProfiles",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsProtected",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "AdminAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TargetUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Details = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminAuditLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AdminAuditLogs_AspNetUsers_AdminUserId",
                        column: x => x.AdminUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdminAuditLogs_AdminUserId",
                table: "AdminAuditLogs",
                column: "AdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AdminAuditLogs_CreatedAt",
                table: "AdminAuditLogs",
                column: "CreatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdminAuditLogs");

            migrationBuilder.DropColumn(
                name: "AvatarDataUrl",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "AverageMark",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "Bio",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "GradesCachedAt",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "HeadmanRole",
                table: "StudentProfiles");

            migrationBuilder.DropColumn(
                name: "IsProtected",
                table: "AspNetUsers");
        }
    }
}
