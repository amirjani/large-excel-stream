// requirements 
const Fs = require('fs');
const CsvReadableStream = require('csv-reader');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const inquirer = require('inquirer')


// constants 
const blockCSVWriter = createCsvWriter({
    path: 'DailyBlock.csv',
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
    path: 'DailyBlockDetail.csv',
    header: [
        { id: 'Date', title: 'Date' },
        { id: 'BlockNumber', title: 'Block Number' },
        { id: 'OrderType', title: 'Order Type' },
        { id: 'TotalCollision', title: 'Total Collision' },
        { id: 'Price', title: 'Price' },
    ]
});

const questions = [
    {
        type: 'input',
        name: 'csvDirectory',
        message: "Please Provide Us Path Of CSV: (example: ./BTCUSDT.csv): "
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
    }
]

// global variables 
let enteredPath = ""; // path of csv file
let enteredRiskPercentage = 0;
let enteredRewardPercentage = 0;
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
    enteredPath = answers['csvDirectory'] || "BTCUSDT.csv";
    enteredRiskPercentage = answers['riskPercentage'] || 0.01;
    enteredRewardPercentage = answers['rewardPercentage'] || 0.01;
    let isDaily = answers['isDaily'] === 'y';

    main(enteredPath, enteredRiskPercentage, enteredRewardPercentage, isDaily);
})

// Write On Block CSV -> add Data to Block CSV
function writeBlockOnCSV(blockCount, data) {
    blockCSVWriter.writeRecords([
        {
            Date: data.date,
            BlockNumber: blockCount,
            EntryLong: data.entryPrice,
            EntryShort: data.stopLoss,
            LongTakeProfit: data.longTakeProfit,
            ShortTakeProfit: data.shortTakeProfit,
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
            Price: data.price,
        }
    ]).then(() => {
        // console.log('...Collision Detail Done');
    });
}

function isNewBlock() {
    return entryBlockPrice === 0;
}

function newBlockCalculation(ask, bid, riskPercentage, rewardPercentage) {
    entryBlockPrice = ask ? ask : bid;
    changeDealTypePrice = entryBlockPrice * (1 - riskPercentage);

    LONG_TAKE_PROFIT = entryBlockPrice * (1 + rewardPercentage);

    let priceChanger = entryBlockPrice * (1 - riskPercentage);
    SHORT_TAKE_PROFIT = priceChanger * (1 - rewardPercentage)
}

function impactDetector(lastDealType, ask, bid, changeDealTypePrice) {
    if (lastDealType === "Entry Long" || lastDealType === "Impact Long") {
        if (ask <= changeDealTypePrice && ask > 0) {
            return "Impact Short";
        }
        else if (ask >= LONG_TAKE_PROFIT) {
            return "Take Profit High";
        }
    } else if (lastDealType === "Entry Short" || lastDealType === "Impact Short") {
        if (bid >= changeDealTypePrice && bid > 0) {
            return "Impact Long";
        }
        else if (bid <= SHORT_TAKE_PROFIT && bid > 0) {
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
    csvPath = path || 'BTCUSDT.csv';
    let inputStream = Fs.createReadStream(csvPath, 'utf8');

    inputStream
        .pipe(new CsvReadableStream({ delimiter: '\t', trim: true, asObject: true, skipHeader: true }))
        .on('data', function (row) {

            // in every row we need to have ask and bid price for detecting impacts 
            let ask = Number(row['<ASK>']);
            let bid = Number(row['<BID>']);

            if (startDate === row['<DATE>']) {
                if (isNewBlock()) {
                    newBlockCalculation(ask, bid, riskPercentage, rewardPercentage);

                    WriteCollisionDetailOnCSV(blockCount, {
                        date: startDate,
                        blockNumber: blockCount,
                        orderType: lastDealType,
                        totalCollision: collisionCount,
                        price: entryBlockPrice,
                    });
                }

                tickCount++;

                let impactType = impactDetector(lastDealType, ask, bid, changeDealTypePrice);

                if (impactType) {
                    lastDealType = impactType;
                    collisionCount++;
                }

                // collision detection
                if (isDaily && dateBlockEncountered === false) {
                    if (impactType === "Impact Short") {
                        newChangeDealTypePrice(ask, riskPercentage);

                        WriteCollisionDetailOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            orderType: lastDealType,
                            totalCollision: collisionCount,
                            price: ask,
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
                            price: ask,
                        });

                        blockCount++;
                        dateBlockEncountered = true;
                    }

                    if (impactType === "Impact Long") {
                        newChangeDealTypePrice(bid, riskPercentage);

                        WriteCollisionDetailOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            orderType: lastDealType,
                            totalCollision: collisionCount,
                            price: bid,
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
                            price: bid,
                        });
                        blockCount++;
                        dateBlockEncountered = true;
                    }
                } else {
                    if (impactType === "Impact Short") {
                        newChangeDealTypePrice(ask, riskPercentage);

                        WriteCollisionDetailOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            orderType: lastDealType,
                            totalCollision: collisionCount,
                            price: ask,
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
                            price: ask,
                        });

                        blockCount++;
                        createNewBlock();
                    }

                    if (impactType === "Impact Long") {
                        newChangeDealTypePrice(bid, riskPercentage);

                        WriteCollisionDetailOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            orderType: lastDealType,
                            totalCollision: collisionCount,
                            price: bid,
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
                            price: bid,
                        });
                        blockCount++;
                        createNewBlock();
                    }
                }
            } else {
                if (startDate != '') {
                    console.log(`data of ${startDate} has been inserted`);
                }

                startDate = row['<DATE>'];
                createNewBlock();
            }
        })
        .on('end', function () {
            console.log('No more rows!');
        });
}
