import { Column } from 'typeorm';

export class Winner {
  @Column()
  user: string;
  @Column()
  amount: number;
}
