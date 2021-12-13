import { Injectable } from '@nestjs/common';
import { ABI, AggregatorV3InterfaceABI } from './blockchain.abi';
import { CronJob } from 'cron';
import { TokensData } from './tokens-list.data';
import { InjectRepository } from '@nestjs/typeorm';
import { Pool } from './entities/pool.entity';
import { Repository } from 'typeorm';
import { EnteredPool } from './entities/entered-pool.entity';
import { TokenPrice } from './entities/token-price.type';
const Web3 = require('web3');

@Injectable()
export class BlockchainService {
  private web3;
  private subscription;
  private CONTRACT_ADDRESS;
  private myContract;
  constructor(
    @InjectRepository(Pool) private poolRepository: Repository<Pool>,
    @InjectRepository(EnteredPool)
    private enteredPoolRepository: Repository<EnteredPool>,
  ) {
    this.web3 = new Web3(
      'wss://speedy-nodes-nyc.moralis.io/593cb6b743abad211497ad94/bsc/testnet/ws',
    );
    this.CONTRACT_ADDRESS = '0x8360165c5076Ee1F8f0834c43B31D1096c7B9597';
    this.myContract = new this.web3.eth.Contract(ABI, this.CONTRACT_ADDRESS);
    const options = {
      filter: {
        value: [],
      },
      fromBlock: 'latest',
    };

    //PoolCreated Event
    this.myContract.events
      .poolCreated(options)
      .on('data', async (event) => {
        //save the event to db
        const {
          poolID,
          tierCount,
          entryFees,
          startTime,
          endTime,
          tokenAddress,
        } = event.returnValues;

        const pool = this.poolRepository.create({
          poolID,
          tierCount,
          entryFees,
          startTime,
          endTime,
          tokenAddress,
          openPrice: [],
          closePrice: [],
          winners: [],
        });

        await this.poolRepository.save(pool);

        //start time
        const start = this.cronDateFormatter(
          new Date(parseInt(event.returnValues.startTime) * 1000),
        );
        //end time
        const end = this.cronDateFormatter(
          new Date(parseInt(event.returnValues.endTime) * 1000),
        );

        const startJob = new CronJob(
          start,
          () => {
            this.startCallback(startJob, pool);
          },
          null,
          true,
          'Asia/Kolkata',
        );

        const endJob = new CronJob(
          end,
          async () => {
            await this.endCallback(endJob, pool);
            // await this.computeWinners(pool.poolID);
          },
          null,
          true,
          'Asia/Kolkata',
        );

        startJob.start();
        endJob.start();
      })
      .on('changed', (changed) => console.log('changed', changed))
      .on('error', (err) => {
        throw err;
      });

    //Entered Pool
    this.myContract.events
      .enteredPool(options)
      .on('data', async (event) => {
        const { user, aggregatorAddress, poolID, tier } = event.returnValues;

        const enteredPool = this.enteredPoolRepository.create({
          user,
          aggregatorAddress,
          poolID,
          tier,
        });

        // await this.enteredPoolRepository.save(enteredPool);
      })
      .on('changed', (changed) => console.log('changed', changed))
      .on('error', (err) => {
        throw err;
      });

    //rewardsDistributed
    // this.myContract.events
    //   .rewardsDistributed(options)
    //   .on('data', (event) => console.log(event))
    //   .on('changed', (changed) => console.log(changed))
    //   .on('error', (err) => {
    //     throw err;
    //   });
  }

  cronDateFormatter(date: Date) {
    const seconds = date.getSeconds();
    const minutes = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth();
    const temp =
      seconds +
      ' ' +
      minutes +
      ' ' +
      hour +
      ' ' +
      day +
      ' ' +
      month +
      ' ' +
      '*';
    return temp;
  }

  async startCallback(startJob, pool) {
    const openPrice = await this.getCurrentTokenPrices();
    this.poolRepository.update({ poolID: pool.poolID }, { openPrice });
    startJob.stop();
  }

  async endCallback(endJob, pool) {
    const closePrice = await this.getCurrentTokenPrices();
    this.poolRepository.update({ poolID: pool.poolID }, { closePrice });
    endJob.stop();
  }

  async getCurrentTokenPrices() {
    const web3 = new Web3('https://data-seed-prebsc-1-s1.binance.org:8545/');
    const prices: TokenPrice[] = [];
    for (let i = 0; i < TokensData.Aggregator.length; i++) {
      const priceFeed = new web3.eth.Contract(
        AggregatorV3InterfaceABI,
        TokensData.Aggregator[i]['address'],
      );

      await priceFeed.methods
        .latestRoundData()
        .call()
        .then((priceData) => {
          prices.push({
            address: TokensData.Aggregator[i].address,
            price: priceData[1],
          });
        });
    }

    return prices;
  }

  async computeWinners(poolID) {
    const pool = await this.poolRepository.findOne({ poolID });

    const { openPrice, closePrice } = pool;
    const all = await this.enteredPoolRepository.find({ poolID });

    const participants = all.map((participant) => {
      return {
        user: participant.user,
        score: this.calculateScore(
          participant.aggregatorAddress,
          openPrice,
          closePrice,
        ),
      };
    });

    participants.sort((a, b) => b.score - a.score);

    const winners = this.distributePrice(
      participants,
      participants.length * pool.entryFees[0],
    );
    this.poolRepository.update({ poolID }, { winners });
  }

  calculateScore(tokens, poolOpenPrice, poolClosePrice) {
    let score = 0;

    tokens.array.forEach((token) => {
      score += poolOpenPrice[token] - poolClosePrice[token];
    });

    return score;
  }

  distributePrice(participants, totalPoolAmount) {
    const priceShare = [
      [70, 30],
      [50, 30, 20],
      [40, 24, 16, 12, 8],
      [30, 20, 12, 10, 8, 6, 5, 4, 3, 2],
      [30, 20, 10, 7.5, 6, 5, 4, 3, 2.5, 2, 1],
      [28, 18, 10, 7.5, 6, 5, 4, 3, 2, 1.5, 1, 0.5],
      [25, 15, 9, 7.5, 6, 5, 4, 3, 2, 1.5, 1, 0.7, 0.5],
      [25, 15, 8, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.7, 0.6, 0.5],
      [23, 14, 7, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.7, 0.6, 0.5, 0.4],
      [22, 12, 7, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.7, 0.6, 0.5, 0.4, 0.3],
    ];

    const distribute = (prices) => {
      const winners = [];
      for (let i = 0; i < prices.length || i < 10; ++i) {
        winners.push({
          user: participants[i].user,
          amount: totalPoolAmount * prices[i],
        });
      }
      let j = 10;
      for (let i = 10; i < prices.length; ++i) {
        for (let k = 0; k < 10; ++k) {
          winners.push({
            user: participants[j].user,
            amount: totalPoolAmount * prices[i],
          });
          ++j;
        }
      }

      return winners;
    };

    return distribute(priceShare[1]);
  }
}
