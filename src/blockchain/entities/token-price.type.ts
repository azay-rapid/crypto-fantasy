import { Column } from 'typeorm';

export class TokenPrice {
  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column()
  pair: string;

  @Column()
  address: string;

  @Column()
  price: string;

  @Column()
  decimal: number;
}
