import { MigrationInterface, QueryRunner, Table , TableForeignKey } from "typeorm";

export class CreateTemplatesTable1751878753160 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
                        new Table({
                            name: "templates",
                            columns: [
                            {
                                name: "id",
                                type: "int",
                                isPrimary: true,
                                isGenerated: true,
                                generationStrategy: "increment",
                            },
                            {
                                name: "name",
                                type: "varchar",
                            },
                            {
                                name: "language",
                                type: "varchar",
                            },
                            {
                                name: "category_id",
                                type: "int",
                            },
                            {
                                name: "message",
                                type: "text",
                            },
                            {
                                name: "is_active",
                                type: "boolean",
                                default: false,
                            },
                            {
                                name: "is_drafted",
                                type: "boolean",
                                default: true,
                            },
                            {
                                name: "is_approved",
                                type: "boolean",
                                default: false,
                            },
                            {
                                name: "status",
                                type: "enum",
                                enum: ["Approved" , "Rejected" , "Pending"],
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
            "templates",
            new TableForeignKey({
                columnNames: ["category_id"],
                referencedTableName: "categories",
                referencedColumnNames: ["id"],
                onDelete: "CASCADE",
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("templates");
        const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.includes("category_id"));
        if (foreignKey) {
        await queryRunner.dropForeignKey("templates", foreignKey);
        }

        await queryRunner.dropTable("templates");
    }

}
