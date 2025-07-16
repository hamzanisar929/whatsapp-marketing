// src/entities/Template.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Category } from './Category';
import { TemplateMedia } from './TemplateMedia';
import { Variable } from './TemplateVariable';

export enum TemplateStatus {
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  PENDING = 'Pending',
}

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  language!: string;

  @Column()
  category_id!: number;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column('text')
  message!: string;

  @Column({ default: false })
  is_active!: boolean;

  @Column({ default: true })
  is_drafted!: boolean;

  @Column({ default: false })
  is_approved!: boolean;

  @Column({
    type: 'enum',
    enum: TemplateStatus,
  })
  status!: TemplateStatus;

  @OneToMany(() => TemplateMedia, (media) => media.template, { cascade: true })
  media!: TemplateMedia[];

  @OneToMany(() => Variable, (variable) => variable.template, { cascade: true })
  variables!: Variable[];

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;
}
