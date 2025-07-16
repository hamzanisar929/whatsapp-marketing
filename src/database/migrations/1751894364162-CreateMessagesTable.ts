import { MigrationInterface, QueryRunner , Table , TableForeignKey } from "typeorm";

export class CreateMessagesTable1751894364162 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
                            new Table({
                                name: "messages",
                                columns: [
                                {
                                    name: "id",
                                    type: "int",
                                    isPrimary: true,
                                    isGenerated: true,
                                    generationStrategy: "increment",
                                },
                                {
                                    name: "status",
                                    type: "varchar",
                                },
                                {
                                    name: "messageable_type",
                                    type: "varchar",
                                },
                                {
                                    name: "messageable_id",
                                    type: "int",
                                },
                                {
                                    name: "user_id",
                                    type: "int",
                                    isNullable: true,
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
                                    "messages",
                                    new TableForeignKey({
                                        columnNames: ["user_id"],
                                        referencedTableName: "users",
                                        referencedColumnNames: ["id"],
                                        onDelete: "CASCADE",
                                    })
                                );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("messages");
        const fk = table?.foreignKeys.find((fk) => fk.columnNames.includes("user_id"));
        if (fk) {
        await queryRunner.dropForeignKey("messages", fk);
        }

        await queryRunner.dropTable("messages");
    }

}
