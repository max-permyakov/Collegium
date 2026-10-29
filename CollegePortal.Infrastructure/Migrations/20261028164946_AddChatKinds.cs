using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CollegePortal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChatKinds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Chats_User1Id_User2Id",
                table: "Chats");

            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "Chats",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Chats_User1Id_User2Id_Kind",
                table: "Chats",
                columns: new[] { "User1Id", "User2Id", "Kind" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Chats_User1Id_User2Id_Kind",
                table: "Chats");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Chats");

            migrationBuilder.CreateIndex(
                name: "IX_Chats_User1Id_User2Id",
                table: "Chats",
                columns: new[] { "User1Id", "User2Id" },
                unique: true);
        }
    }
}
