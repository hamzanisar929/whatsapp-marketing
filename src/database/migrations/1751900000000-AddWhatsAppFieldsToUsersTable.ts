import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddWhatsAppFieldsToUsersTable1751900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("users", [
      new TableColumn({
        name: "whatsapp_api_token",
        type: "varchar",
        isNullable: true,
      }),
      new TableColumn({
        name: "whatsapp_business_phone",
        type: "varchar",
        isNullable: true,
      }),
      new TableColumn({
        name: "facebook_business_verified",
        type: "boolean",
        default: false,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "facebook_business_verified");
    await queryRunner.dropColumn("users", "whatsapp_business_phone");
    await queryRunner.dropColumn("users", "whatsapp_api_token");
  }
} 