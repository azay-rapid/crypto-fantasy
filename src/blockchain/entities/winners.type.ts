import { Column } from 'typeorm';

export class Winner {
  @Column()
  user: string;
  @Column()
  score: number;
  @Column()
  amount: number;
}
