import { MigrationInterface, QueryRunner, Table , TableForeignKey } from "typeorm";

export class CreateLogActivtiesTable1751878851714 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: "log_activity",
                columns: [
                {
                    name: "id",
                    type: "int",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment",
                },
                {
                    name: "user_id",
                    type: "int",
                },
                {
                    name: "action",
                    type: "varchar",
                },
                {
                    name: "created_at",
                    type: "timestamp",
                    default: "now()",
                },
                {
                    name: "updated_at",
                    type: "timestamp",
                    default: "now()",
                },
                ],
            })
        );

        await queryRunner.createForeignKey(
            "log_activity",
            new TableForeignKey({
                columnNames: ["user_id"],
                referencedTableName: "users",
                referencedColumnNames: ["id"],
                onDelete: "CASCADE",
            })
            );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("log_activity");
        const fk = table?.foreignKeys.find(fk => fk.columnNames.includes("user_id"));
        if (fk) {
        await queryRunner.dropForeignKey("log_activity", fk);
        }

        await queryRunner.dropTable("log_activity");
    }

}
