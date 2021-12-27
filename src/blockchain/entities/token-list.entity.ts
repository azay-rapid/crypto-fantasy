import { Column, Entity, ObjectIdColumn, PrimaryColumn } from 'typeorm';

@Entity()
export class TokenList {
  @ObjectIdColumn()
  _id: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column()
  pair: string;

  @Column()
  decimal: number;

  @PrimaryColumn()
  address: string;

  @Column()
  type: TokenType;
}

export enum TokenType {
  AGGR = 'AGGR',
  CUST = 'CUST',
}
