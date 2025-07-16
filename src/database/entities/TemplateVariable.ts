// src/entities/Variable.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Template } from './Template';

@Entity('variables')
export class Variable {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  template_id!: number;

  @ManyToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: Template;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  default_value?: string;

  @Column({ default: false })
  is_required!: boolean;
}
