import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddScheduleFieldsToMessagesTable1751901000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("messages", [
      new TableColumn({
        name: "scheduled_at",
        type: "datetime",
        isNullable: true,
      }),
      new TableColumn({
        name: "is_scheduled",
        type: "boolean",
        default: false,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("messages", "is_scheduled");
    await queryRunner.dropColumn("messages", "scheduled_at");
  }
} 