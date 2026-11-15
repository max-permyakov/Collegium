using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CollegePortal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCosmeticsSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AvatarFrameColor",
                table: "AspNetUsers",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowAvatarFrame",
                table: "AspNetUsers",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowBadges",
                table: "AspNetUsers",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarFrameColor",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "ShowAvatarFrame",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "ShowBadges",
                table: "AspNetUsers");
        }
    }
}
