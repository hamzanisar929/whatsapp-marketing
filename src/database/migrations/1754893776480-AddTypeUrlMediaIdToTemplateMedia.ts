import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTypeUrlMediaIdToTemplateMedia1754893776480 implements MigrationInterface {
    name = 'AddTypeUrlMediaIdToTemplateMedia1754893776480'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`template_media\` ADD \`type\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`template_media\` ADD \`url\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`template_media\` ADD \`wa_media_id\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`last_name\` \`last_name\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`photo\` \`photo\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`whatsapp_api_token\` \`whatsapp_api_token\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`whatsapp_business_phone\` \`whatsapp_business_phone\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`last_contacted\` \`last_contacted\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`type\` \`type\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_830a3c1d92614d1495418c46736\``);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`user_id\` \`user_id\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`scheduled_at\` \`scheduled_at\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`content\` \`content\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`media_url\` \`media_url\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`media_type\` \`media_type\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`variables\` CHANGE \`default_value\` \`default_value\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_830a3c1d92614d1495418c46736\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_830a3c1d92614d1495418c46736\``);
        await queryRunner.query(`ALTER TABLE \`variables\` CHANGE \`default_value\` \`default_value\` text NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`media_type\` \`media_type\` varchar(20) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`media_url\` \`media_url\` text NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`content\` \`content\` text NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`scheduled_at\` \`scheduled_at\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`messages\` CHANGE \`user_id\` \`user_id\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_830a3c1d92614d1495418c46736\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`type\` \`type\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`last_contacted\` \`last_contacted\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`whatsapp_business_phone\` \`whatsapp_business_phone\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`whatsapp_api_token\` \`whatsapp_api_token\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`photo\` \`photo\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`last_name\` \`last_name\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`template_media\` DROP COLUMN \`wa_media_id\``);
        await queryRunner.query(`ALTER TABLE \`template_media\` DROP COLUMN \`url\``);
        await queryRunner.query(`ALTER TABLE \`template_media\` DROP COLUMN \`type\``);
    }

}
