import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateUsersTable1751878642581 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name : "users",
                columns : [
                    {
                        name : "id",
                        type : "int",
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: "increment"
                    },
                    {
                        name : "first_name",
                        type : "varchar",
                    },
                    {
                        name : "last_name",
                        type : "varchar",
                        isNullable: true,
                    },
                    {
                        name : "email",
                        type : "varchar",
                        isUnique: true,
                    },
                    {
                        name : "phone",
                        type : "varchar",
                    },
                    {
                        name : "photo",
                        type : "varchar",
                        isNullable: true,
                    },
                    {
                        name : "is_favourite",
                        type : "boolean",
                        default: 0
                    },
                    {
                        name: "whatsapp_api_token",
                        type: "varchar",
                        isNullable: true
                    },
                    {
                        name: "whatsapp_business_phone",
                        type: "varchar",
                        isNullable: true
                    },
                    {
                        name: "facebook_business_verified",
                        type: "boolean",
                        default: false
                    },
                    {
                        name : "status",
                        type : "enum",
                        enum: ["active" , "inactive" , "blocked"]
                    },
                    {
                        name : "type",
                        type : "varchar",
                        isNullable: true
                    },
                    {
                        name : "role",
                        type : "enum",
                        enum : ["user" , "admin"]
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
                ]
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("users");
    }

}
