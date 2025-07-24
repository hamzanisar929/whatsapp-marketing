// src/entities/Message.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";

@Entity("messages")
export class Message {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  status!: string;

  @Column()
  messageable_type!: string;

  @Column()
  messageable_id!: number;

  @Column({ nullable: true })
  user_id!: number;

  @Column({ nullable: true })
  scheduled_at?: Date;

  @Column({ default: false })
  is_scheduled: boolean;

  @Column({ type: "text", nullable: true })
  content?: string;

  // ✅ New columns for media
  @Column({ type: "text", nullable: true })
  media_url?: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  media_type?: "image" | "video" | "document";

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;
}
