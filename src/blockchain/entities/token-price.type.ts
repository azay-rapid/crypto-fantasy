import { Column } from 'typeorm';

export class TokenPrice {
  @Column()
  address: string;

  @Column()
  price: number;
}
