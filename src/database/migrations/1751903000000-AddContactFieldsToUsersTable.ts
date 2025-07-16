import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddContactFieldsToUsersTable1751903000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("users", [
      new TableColumn({
        name: "last_contacted",
        type: "datetime",
        isNullable: true,
      }),
      new TableColumn({
        name: "opt_in",
        type: "boolean",
        default: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "opt_in");
    await queryRunner.dropColumn("users", "last_contacted");
  }
} 