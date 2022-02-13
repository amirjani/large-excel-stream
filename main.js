const Fs = require('fs');
const CsvReadableStream = require('csv-reader');

let inputStream = Fs.createReadStream('BTCUSDT.csv', 'utf8');


const RISK_PERCENTAGE = 0.01;
const REWARD_PERCENTAGE = 0.02;

var writeStream = Fs.createWriteStream("file3.xls");
let header = "Block Number" + "\t" + "Entry Price" + "\t" + "Stop Loss" + "\t" + "Long Take Profit" + "\t" + "Short Take Profit" + "\t" + "Collision Count";
writeStream.write(header + "\n");

function writeBlockOnCSV(blockCount, data) {
    writeStream.write(blockCount + "\t" + data.entryPrice + "\t" + data.stopLoss + "\t" + data.longTakeProfit + "\t" + data.shortTakeProfit + "\t" + data.collisionCount + "\n");
}

let dealType = "Long";

let entryBlockPrice = 0;
let changeDealTypePrice = 0;

let LONG_TAKE_PROFIT = 0;
let SHORT_TAKE_PROFIT = 0;

let collisionCount = 1;
let blockCount = 1;

inputStream
    .pipe(new CsvReadableStream({ delimiter: '\t', trim: true, asObject: true, skipHeader: true }))
    .on('data', function (row) {
        // console.log('=================================');
        // * ASK long 
        // * BID SHORT 
        let ask = Number(row['<ASK>']);
        let bid = Number(row['<BID>']);

        // we assume first deal is long so we can calculate the start price
        if (entryBlockPrice === 0) {
            entryBlockPrice = ask ? ask : bid;
            changeDealTypePrice = entryBlockPrice * (1 - RISK_PERCENTAGE);
            LONG_TAKE_PROFIT = entryBlockPrice * (1 + REWARD_PERCENTAGE);
            SHORT_TAKE_PROFIT = entryBlockPrice * (1 - REWARD_PERCENTAGE + RISK_PERCENTAGE);
        }

        // collision detection
        if (dealType === "Long") {
            if ((ask < changeDealTypePrice || bid < changeDealTypePrice) && ask > 0) {
                collisionCount++;
                dealType = "Short";
                console.log("ask: ", ask);
                console.log("ask * (1 + RISK_PERCENTAGE): ", ask * (1 + RISK_PERCENTAGE));
                changeDealTypePrice = ask * (1 + RISK_PERCENTAGE);
            } else if (ask >= LONG_TAKE_PROFIT && ask > 0) {
                collisionCount++;
                blockCount++;

                console.log("changeDealTypePrice: ", changeDealTypePrice);
                writeBlockOnCSV(blockCount, {
                    entryPrice: entryBlockPrice,
                    stopLoss: changeDealTypePrice,
                    longTakeProfit: LONG_TAKE_PROFIT,
                    shortTakeProfit: SHORT_TAKE_PROFIT,
                    collisionCount: collisionCount
                });
                // start a new block and write on csv
                dealType = "Long";

                entryBlockPrice = 0;
                changeDealTypePrice = 0;
                collisionCount = 0;
                LONG_TAKE_PROFIT = 0;
                SHORT_TAKE_PROFIT = 0;
            }
        } else {
            if ((ask > changeDealTypePrice || bid > changeDealTypePrice) && bid > 0) {
                collisionCount++;
                dealType = "Long";

                console.log("bid: ", bid);
                console.log("bid * (1 - RISK_PERCENTAGE): ", bid * (1 - RISK_PERCENTAGE));

                changeDealTypePrice = bid * (1 - RISK_PERCENTAGE);
            } else if (bid <= SHORT_TAKE_PROFIT && bid > 0) {
                collisionCount++;
                blockCount++;

                writeBlockOnCSV(blockCount, {
                    entryPrice: entryBlockPrice,
                    stopLoss: changeDealTypePrice,
                    longTakeProfit: LONG_TAKE_PROFIT,
                    shortTakeProfit: SHORT_TAKE_PROFIT,
                    collisionCount: collisionCount
                });
                // start a new block and write on csv
                dealType = "Long";

                entryBlockPrice = 0;
                changeDealTypePrice = 0;
                collisionCount = 0;
                LONG_TAKE_PROFIT = 0;
                SHORT_TAKE_PROFIT = 0;
            }
        }
        // console.log('=================================');
    })
    .on('end', function () {
        console.log('No more rows!');
    });