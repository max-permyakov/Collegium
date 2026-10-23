using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CollegePortal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGameScores : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameScores",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Mode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Score = table.Column<int>(type: "integer", nullable: false),
                    BestAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameScores", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameScores_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameScores_GameId_Mode_Score",
                table: "GameScores",
                columns: new[] { "GameId", "Mode", "Score" });

            migrationBuilder.CreateIndex(
                name: "IX_GameScores_GameId_Mode_UserId",
                table: "GameScores",
                columns: new[] { "GameId", "Mode", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameScores_UserId",
                table: "GameScores",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameScores");
        }
    }
}
