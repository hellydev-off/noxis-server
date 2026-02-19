import { Entity, PrimaryColumn, Column, BeforeInsert } from "typeorm";
import { randomBytes } from "crypto";

@Entity()
export class Market {
  // 1. Делаем ID обычной колонкой, но первичным ключом
  @PrimaryColumn({ type: "varchar", length: 6 })
  id!: string;

  @Column({ unique: true })
  title!: string;

  @Column({ nullable: true })
  imageUrl!: string;

  @Column()
  type!: string;

  @Column()
  rarity!: string;

  @Column()
  price!: number;

  @Column({ type: "jsonb", nullable: true })
  data!: any;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = randomBytes(3).toString("hex").toLowerCase();
    }
  }
}
