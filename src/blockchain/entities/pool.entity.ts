import { Column, Entity, ObjectIdColumn, PrimaryColumn } from 'typeorm';
import { TokenPrice } from './token-price.type';
import { Winner } from './winners.type';

@Entity()
export class Pool {
  @ObjectIdColumn()
  _id: string;

  @PrimaryColumn()
  poolID: number;

  @Column()
  entryFees: number;

  @Column()
  tokenAddress: string;

  @Column()
  startTime: number;

  @Column()
  endTime: number;

  @Column()
  openPrice: TokenPrice[];

  @Column()
  closePrice: TokenPrice[];

  @Column()
  winners: Winner[];
}
