import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true, type: "bigint" }) // user_id из Telegram лучше хранить в bigint
  user_id!: number;

  @Column()
  first_name!: string;

  @Column({ nullable: true })
  language_code!: string;

  @Column({ nullable: true })
  username!: string;

  @Column({ type: "jsonb", default: [] }) // Сразу ставим дефолт — пустой массив
  inventory!: any[];

  @Column({ type: "jsonb", default: [] })
  activeSkin!: any[];
}
