// src/entities/TemplateMedia.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Template } from './Template';

@Entity('template_media')
export class TemplateMedia {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  template_id!: number;

  @ManyToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: Template;

  @Column()
  filename!: string;
}
