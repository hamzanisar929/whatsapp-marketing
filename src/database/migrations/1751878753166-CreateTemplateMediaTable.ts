import { MigrationInterface, QueryRunner , Table , TableForeignKey } from "typeorm";

export class CreateTemplateMediaTable1751878753166 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
         await queryRunner.createTable(
                new Table({
                    name: "template_media",
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
                        name: "filename",
                        type: "varchar",
                    }
                    ],
                })
            );

        
        await queryRunner.createForeignKey(
            "template_media",
                new TableForeignKey({
                    columnNames: ["template_id"],
                    referencedTableName: "templates",
                    referencedColumnNames: ["id"],
                    onDelete: "CASCADE",
                })
            );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("template_media");
        const fk = table?.foreignKeys.find(fk => fk.columnNames.includes("template_id"));
        if (fk) {
            await queryRunner.dropForeignKey("template_media", fk);
        }
        await queryRunner.dropTable("template_media");
    }

}
