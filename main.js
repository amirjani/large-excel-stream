// requirements 
const Fs = require('fs');
const CsvReadableStream = require('csv-reader');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const inquirer = require('inquirer')


// constants 
const blockCSVWriter = createCsvWriter({
    path: 'Block.csv',
    header: [
        { id: 'Date', title: 'Date' },
        { id: 'BlockNumber', title: 'Block Number' },
        { id: 'EntryLong', title: 'Entry Long' },
        { id: 'EntryShort', title: 'Entry Short' },
        { id: 'LongTakeProfit', title: 'Long Take Profit' },
        { id: 'ShortTakeProfit', title: 'Short Take Profit' },
        { id: 'CollisionCount', title: 'Collision Count' },
        { id: 'TickCount', title: 'Tick Count' },
    ]
});

const collisionsCSVWriter = createCsvWriter({
    path: 'BlockDetail.csv',
    header: [
        { id: 'Date', title: 'Date' },
        { id: 'BlockNumber', title: 'Block Number' },
        { id: 'OrderType', title: 'Order Type' },
        { id: 'TotalCollision', title: 'Total Collision' },
        { id: 'Price', title: 'Price' },
    ]
});

const wantedBlockTicks = createCsvWriter({
    path: 'TickBlock.csv',
    header: [
        { id: 'Ask', title: 'Ask' },
        { id: 'Bid', title: 'Bid' }
    ]
});


const questions = [
    {
        type: 'input',
        name: 'csvDirectory',
        message: "Please Provide Us Path Of CSV: (example: ./BTCUSDT1.csv): "
    },
    {
        type: 'input',
        name: 'riskPercentage',
        message: "Please Enter Risk Percentage: (example: 0.01): "
    },
    {
        type: 'input',
        name: 'rewardPercentage',
        message: "Please Enter Reward Percentage: (example: 0.01): "
    },
    {
        type: 'input',
        name: 'isDaily',
        message: "Is This Daily Data? (y/n): "
    },
    {
        type: 'input',
        name: 'floatingPrecision',
        message: "Please Enter Floating Precision: (example: 2, It will show 2000.04): "
    }
]

// global variables 
let enteredPath = ""; // path of csv file
let enteredRiskPercentage = 0;
let enteredRewardPercentage = 0;
let floatingPrecision = 0;
let lastBidPrice = 0;
let lastAskPrice = 0;

// Block Default 
let lastDealType = "Entry Long";
let entryBlockPrice = 0;
let changeDealTypePrice = 0;
let LONG_TAKE_PROFIT = 0;
let SHORT_TAKE_PROFIT = 0;
let collisionCount = 1;
let blockCount = 1;
let tickCount = 0;
let startDate = '';
let dateBlockEncountered = false;


// ask for user inputs 
inquirer.prompt(questions).then(answers => {
    enteredPath = answers['csvDirectory'] || "BTCUSDT1.csv";
    enteredRiskPercentage = answers['riskPercentage'] || 0.01;
    enteredRewardPercentage = answers['rewardPercentage'] || 0.01;
    let isDaily = answers['isDaily'] === 'y';
    floatingPrecision = answers['floatingPrecision'];

    main(enteredPath, enteredRiskPercentage, enteredRewardPercentage, isDaily);
})

function strip(number) {
    var factor = Math.pow(10, floatingPrecision);
    return Math.round(number * factor) / factor;
}

// Write On Block CSV -> add Data to Block CSV
function writeBlockOnCSV(blockCount, data) {
    blockCSVWriter.writeRecords([
        {
            Date: data.date,
            BlockNumber: blockCount,
            EntryLong: strip(data.entryPrice),
            EntryShort: strip(data.stopLoss),
            LongTakeProfit: strip(data.longTakeProfit),
            ShortTakeProfit: strip(data.shortTakeProfit),
            CollisionCount: data.collisionCount,
            TickCount: data.tickCount,
        }
    ]).then(() => {
    });
}

// Write Collision CSV -> add Data to Collision CSV
function WriteCollisionDetailOnCSV(blockCount, data) {
    collisionsCSVWriter.writeRecords([
        {
            Date: data.date,
            BlockNumber: blockCount,
            OrderType: data.orderType,
            TotalCollision: data.totalCollision,
            Price: strip(data.price),
        }
    ]).then(() => {
        // console.log('...Collision Detail Done');
    });
}

function wantedBlockTicksCSV(ask, bid) {
    wantedBlockTicks.writeRecords([
        {
            Ask: strip(ask),
            Bid: strip(bid)
        }
    ]).then(() => {
        // console.log('...Wanted Block Ticks Done');
    });
}

function isNewBlock(lastAsk, lastBid) {
    // entryBlockPrice === 0 start new block 
    // @KambizGuity => told me to start new price when having valid bid and ask together
    return entryBlockPrice === 0 && (lastAsk > 0 && lastBid > 0) && lastAskPrice > 0 && lastBidPrice > 0;

}

function newBlockCalculation(lastAsk, lastBid, riskPercentage, rewardPercentage) {

    //         --------------------
    // ASK ---/ 
    // BID ------------------------
    if (lastAsk > 0 && lastBid > 0) {
        entryBlockPrice = lastBid;
        changeDealTypePrice = entryBlockPrice * (1 - riskPercentage);
        LONG_TAKE_PROFIT = entryBlockPrice * (1 + rewardPercentage);
        SHORT_TAKE_PROFIT = changeDealTypePrice * (1 - rewardPercentage)
    }
}

function impactDetector(lastDealType, lastAsk, lastBid, changeDealTypePrice) {
    if ((lastDealType === "Entry Long" || lastDealType === "Impact Long") && lastAsk > 0) {
        if (lastAsk <= changeDealTypePrice) {
            return "Impact Short";
        }

        else if (lastAsk >= LONG_TAKE_PROFIT) {
            return "Take Profit High";
        }
    } else if ((lastDealType === "Entry Short" || lastDealType === "Impact Short") && lastBid > 0) {
        if (lastBid >= changeDealTypePrice) {
            return "Impact Long";
        }
        else if (lastBid <= SHORT_TAKE_PROFIT) {
            return "Take Profit Low"
        }
    }
}

function newChangeDealTypePrice(price, riskPercentage) {
    changeDealTypePrice = price * (1 + riskPercentage);
}

// set block to the default 
function createNewBlock() {
    lastDealType = "Entry Long";
    entryBlockPrice = 0;
    changeDealTypePrice = 0;
    collisionCount = 1;
    LONG_TAKE_PROFIT = 0;
    SHORT_TAKE_PROFIT = 0;
    tickCount = 0;
    dateBlockEncountered = false;
}

function main(path, riskPercentage, rewardPercentage, isDaily) {
    csvPath = path || 'BTCUSDT1.csv';
    let inputStream = Fs.createReadStream(csvPath, 'utf8');

    inputStream
        .pipe(new CsvReadableStream({ delimiter: '\t', trim: true, asObject: true, skipHeader: true }))
        .on('data', function (row) {
            // in every row we need to have ask and bid price for detecting impacts 

            let ask = Number(row['<ASK>']);
            let bid = Number(row['<BID>']);

            // first phase of having last ask and bid price -> both of bid and ask must be greater than 0
            if (lastAskPrice === 0 && lastBidPrice === 0 && ask > 0 && bid > 0) {
                lastAskPrice = ask;
                lastBidPrice = bid;
            } else {
                // change lastAskPrice if ask price is greater than lastAskPrice
                if (ask != lastAskPrice && ask > 0) {
                    lastAskPrice = ask;
                }

                // change lastBidPrice if bid price is greater than lastBidPrice
                if (bid != lastBidPrice && bid > 0) {
                    lastBidPrice = bid;
                }

                if (startDate === row['<DATE>']) {
                    if (startDate === "2017.09.14") {
                        wantedBlockTicksCSV(lastAskPrice, lastBidPrice);
                    }

                    if (isNewBlock(lastAskPrice, lastBidPrice)) {
                        newBlockCalculation(lastAskPrice, lastBidPrice, riskPercentage, rewardPercentage);
                        WriteCollisionDetailOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            orderType: lastDealType,
                            totalCollision: collisionCount,
                            price: entryBlockPrice,
                        });
                    }

                    tickCount++;

                    let impactType = undefined;
                    if (lastAskPrice != 0 && lastBidPrice != 0) {
                        impactType = impactDetector(lastDealType, lastAskPrice, lastBidPrice, changeDealTypePrice);
                    }

                    if (impactType) {
                        lastDealType = impactType;
                        collisionCount++;
                    }

                    // collision detection
                    if (isDaily && dateBlockEncountered === false) {
                        if (impactType === "Impact Short") {
                            newChangeDealTypePrice(lastAskPrice, riskPercentage);

                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastAskPrice,
                            });
                        }

                        if (impactType === "Take Profit High") {
                            writeBlockOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                entryPrice: entryBlockPrice,
                                stopLoss: changeDealTypePrice,
                                longTakeProfit: LONG_TAKE_PROFIT,
                                shortTakeProfit: SHORT_TAKE_PROFIT,
                                collisionCount: collisionCount,
                                tickCount: tickCount,
                            });

                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastAskPrice,
                            });

                            blockCount++;
                            dateBlockEncountered = true;
                        }

                        if (impactType === "Impact Long") {
                            newChangeDealTypePrice(lastBidPrice, riskPercentage);
                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastBidPrice,
                            });
                        }

                        if (impactType === "Take Profit Low") {
                            writeBlockOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                entryPrice: entryBlockPrice,
                                stopLoss: changeDealTypePrice,
                                longTakeProfit: LONG_TAKE_PROFIT,
                                shortTakeProfit: SHORT_TAKE_PROFIT,
                                collisionCount: collisionCount,
                                tickCount: tickCount,
                            });

                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastBidPrice,
                            });
                            blockCount++;
                            dateBlockEncountered = true;
                        }
                    } else {
                        if (impactType === "Impact Short") {
                            newChangeDealTypePrice(lastAskPrice, riskPercentage);

                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastAskPrice,
                            });
                        }

                        if (impactType === "Take Profit High") {
                            writeBlockOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                entryPrice: entryBlockPrice,
                                stopLoss: changeDealTypePrice,
                                longTakeProfit: LONG_TAKE_PROFIT,
                                shortTakeProfit: SHORT_TAKE_PROFIT,
                                collisionCount: collisionCount,
                                tickCount: tickCount,
                            });

                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastAskPrice,
                            });

                            blockCount++;
                            createNewBlock();
                        }

                        if (impactType === "Impact Long") {
                            newChangeDealTypePrice(lastBidPrice, riskPercentage);

                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastBidPrice,
                            });
                        }

                        if (impactType === "Take Profit Low") {
                            writeBlockOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                entryPrice: entryBlockPrice,
                                stopLoss: changeDealTypePrice,
                                longTakeProfit: LONG_TAKE_PROFIT,
                                shortTakeProfit: SHORT_TAKE_PROFIT,
                                collisionCount: collisionCount,
                                tickCount: tickCount,
                            });

                            WriteCollisionDetailOnCSV(blockCount, {
                                date: startDate,
                                blockNumber: blockCount,
                                orderType: lastDealType,
                                totalCollision: collisionCount,
                                price: lastBidPrice,
                            });
                            blockCount++;
                            createNewBlock();
                        }
                    }
                } else {
                    if (startDate != '') {
                        console.log(`data of ${startDate} has been inserted`);
                    }

                    if (startDate != '' && isDaily && dateBlockEncountered === false) {
                        writeBlockOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            entryPrice: entryBlockPrice,
                            stopLoss: changeDealTypePrice,
                            longTakeProfit: LONG_TAKE_PROFIT,
                            shortTakeProfit: SHORT_TAKE_PROFIT,
                            collisionCount: collisionCount,
                            tickCount: tickCount,
                        });
                        blockCount++;
                    }

                    startDate = row['<DATE>'];
                    createNewBlock();
                }
            }
        })
        .on('end', function () {
            console.log('No more rows!');
        });
}
