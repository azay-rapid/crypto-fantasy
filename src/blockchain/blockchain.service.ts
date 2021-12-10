import { Injectable } from '@nestjs/common';
import { ABI, AggregatorV3InterfaceABI } from './blockchain.abi';
import { CronJob } from 'cron';
import { TokensData } from './tokens-list.data';
const Web3 = require('web3');

@Injectable()
export class BlockchainService {
  private web3;
  private subscription;
  private CONTRACT_ADDRESS;
  private myContract;
  constructor() {
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
      .on('data', (event) => {
        //start time
        const startTime = this.cronDateFormatter(
          new Date(parseInt(event.returnValues.startTime) * 1000),
        );
        console.log(startTime);
        //end time
        const endTime = this.cronDateFormatter(
          new Date(parseInt(event.returnValues.endTime) * 1000),
        );
        console.log(endTime);
        const startJob = new CronJob(
          startTime,
          startCallback,
          null,
          true,
          'Asia/Kolkata',
        );

        const endJob = new CronJob(
          endTime,
          endCallback,
          null,
          true,
          'Asia/Kolkata',
        );

        function startCallback() {
          console.log('start');
          getCurrentTokenPrices();
          startJob.stop();
        }

        function endCallback() {
          console.log('end');
          getCurrentTokenPrices();
          endJob.stop();
        }

        async function getCurrentTokenPrices() {
          const web3 = new Web3(
            'https://data-seed-prebsc-1-s1.binance.org:8545/',
          );
          const prices = [];
          for (let i = 0; i < TokensData.Aggregator.length; i++) {
            const priceFeed = new web3.eth.Contract(
              AggregatorV3InterfaceABI,
              TokensData.Aggregator[i]['address'],
            );

            await priceFeed.methods
              .latestRoundData()
              .call()
              .then((priceData) => {
                prices.push(priceData[1]);
              });
          }

          console.log(prices);
        }

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
      .on('data', (event) => console.log('entered pool', event))
      .on('changed', (changed) => console.log('changed', changed))
      .on('error', (err) => {
        throw err;
      });

    //rewardsDistributed
    this.myContract.events
      .rewardsDistributed(options)
      .on('data', (event) => console.log(event))
      .on('changed', (changed) => console.log(changed))
      .on('error', (err) => {
        throw err;
      });
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
}
