import { MigrationInterface, QueryRunner , Table , TableForeignKey } from "typeorm";

export class CreateTemplateVariablesTable1751878776049 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
                            new Table({
                                name: "variables",
                                columns: [
                                {
                                    name: "id",
                                    type: "int",
                                    isPrimary: true,
                                    isGenerated: true,
                                    generationStrategy: "increment",
                                },
                                {
                                    name: "template_id",
                                    type: "int",
                                },
                                {
                                    name: "name",
                                    type: "varchar",
                                },
                                {
                                    name: "default_value",
                                    type: "text",
                                    isNullable: true,
                                },
                                {
                                    name: "is_required",
                                    type: "boolean",
                                    default: false,
                                },
                                ],
                            })
                            );

        await queryRunner.createForeignKey(
                            "variables",
                            new TableForeignKey({
                                columnNames: ["template_id"],
                                referencedTableName: "templates",
                                referencedColumnNames: ["id"],
                                onDelete: "CASCADE",
                            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("variables");
        const fk = table?.foreignKeys.find(fk => fk.columnNames.includes("template_id"));
        if (fk) {
            await queryRunner.dropForeignKey("variables", fk);
        }
        await queryRunner.dropTable("variables");
    }

}
