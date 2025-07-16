import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { Chat } from "../entities/Chat";
import { LogActivity } from "../entities/LogActivity";
import { Message } from "../entities/Message";
import { Tag } from "../entities/Tag";
import { Template } from "../entities/Template";
import { TemplateMedia } from "../entities/TemplateMedia";
import { Variable } from "../entities/TemplateVariable";

export const AppDataSource = new DataSource({
  type: "mysql",
  host: "127.0.0.1",
  port: 3308,
  username: "root",
  password: "",
  database: "whats_app",
  synchronize: true,
  entities: [
    User,
    Category,
    Chat,
    LogActivity,
    Message,
    Tag,
    Template,
    TemplateMedia,
    Variable,
  ],
  migrations: ["./src/database/migrations/*.ts"],
});
