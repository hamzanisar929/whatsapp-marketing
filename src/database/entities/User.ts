// src/entities/User.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  BLOCKED = "blocked",
}

export enum UserRole {
  USER = "user",
  ADMIN = "admin",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  first_name: string;

  @Column({ nullable: true })
  last_name?: string;

  @Column({ unique: true })
  email: string;

  @Column()
  phone: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  photo?: string;

  @Column({ default: false })
  is_favourite: boolean;

  @Column({ nullable: true })
  whatsapp_api_token?: string;

  @Column({ nullable: true })
  whatsapp_business_phone?: string;

  @Column({ default: false })
  facebook_business_verified: boolean;

  @Column({ nullable: true })
  last_contacted?: Date;

  @Column({ default: true })
  opt_in: boolean;

  @Column({
    type: "enum",
    enum: UserStatus,
  })
  status: UserStatus;

  @Column({ nullable: true })
  type?: string;

  @Column({
    type: "enum",
    enum: UserRole,
  })
  role: UserRole;

  @CreateDateColumn({ name: "created_at" })
  created_at: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at: Date;
}
