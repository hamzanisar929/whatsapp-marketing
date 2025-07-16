import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddContentToMessagesTable1751902000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "messages",
      new TableColumn({
        name: "content",
        type: "text",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("messages", "content");
  }
} 