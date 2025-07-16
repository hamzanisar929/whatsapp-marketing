import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateChatsTable1751894354373 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
                            new Table({
                                name: "chats",
                                columns: [
                                {
                                    name: "id",
                                    type: "int",
                                    isPrimary: true,
                                    isGenerated: true,
                                    generationStrategy: "increment",
                                },
                                {
                                    name: "sender_id",
                                    type: "int",
                                },
                                {
                                    name: "receiver_id",
                                    type: "int",
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
        "chats",
        new TableForeignKey({
            columnNames: ["sender_id"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
        })
        );

      
        await queryRunner.createForeignKey(
        "chats",
        new TableForeignKey({
            columnNames: ["receiver_id"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
        })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("chats");
        if (table) {
            for (const fk of table.foreignKeys) {
                await queryRunner.dropForeignKey("chats", fk);
            }
        }
        await queryRunner.dropTable("chats");
    }

}
