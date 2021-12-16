import { Column, Entity, ObjectIdColumn, PrimaryColumn } from 'typeorm';

@Entity()
export class EnteredPool {
  @ObjectIdColumn()
  _id: string;

  @PrimaryColumn()
  user: string;

  @Column()
  poolID: number;

  @Column()
  aggregatorAddress: string[];
}
