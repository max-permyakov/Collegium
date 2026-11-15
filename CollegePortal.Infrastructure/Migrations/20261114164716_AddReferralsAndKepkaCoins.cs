using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CollegePortal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReferralsAndKepkaCoins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "KepkaCoins",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "NicknameColor",
                table: "AspNetUsers",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReferralCode",
                table: "AspNetUsers",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReferredAt",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReferredByUserId",
                table: "AspNetUsers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CoinTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CounterpartyUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoinTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoinTransactions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Referrals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InviterUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    InviteeUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoinsAwarded = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Referrals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Referrals_AspNetUsers_InviteeUserId",
                        column: x => x.InviteeUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Referrals_AspNetUsers_InviterUserId",
                        column: x => x.InviterUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserPurchases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PricePaid = table.Column<int>(type: "integer", nullable: false),
                    PurchasedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPurchases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserPurchases_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_ReferralCode",
                table: "AspNetUsers",
                column: "ReferralCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_ReferredByUserId",
                table: "AspNetUsers",
                column: "ReferredByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CoinTransactions_UserId_CreatedAt",
                table: "CoinTransactions",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Referrals_InviteeUserId",
                table: "Referrals",
                column: "InviteeUserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Referrals_InviterUserId_CreatedAt",
                table: "Referrals",
                columns: new[] { "InviterUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_UserPurchases_UserId_ItemCode",
                table: "UserPurchases",
                columns: new[] { "UserId", "ItemCode" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUsers_AspNetUsers_ReferredByUserId",
                table: "AspNetUsers",
                column: "ReferredByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUsers_AspNetUsers_ReferredByUserId",
                table: "AspNetUsers");

            migrationBuilder.DropTable(
                name: "CoinTransactions");

            migrationBuilder.DropTable(
                name: "Referrals");

            migrationBuilder.DropTable(
                name: "UserPurchases");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_ReferralCode",
                table: "AspNetUsers");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_ReferredByUserId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "KepkaCoins",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "NicknameColor",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "ReferralCode",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "ReferredAt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "ReferredByUserId",
                table: "AspNetUsers");
        }
    }
}
