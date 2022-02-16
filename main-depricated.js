const Fs = require('fs');
const CsvReadableStream = require('csv-reader');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
})
const inquirer = require('inquirer')


var questions = [
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
    }
]

let enteredPath = "";
let enteredRiskPercentage = 0;
let enteredRewardPercentage = 0;

inquirer.prompt(questions).then(answers => {
    enteredPath = answers['csvDirectory'];
    enteredRiskPercentage = answers['riskPercentage'];
    enteredRewardPercentage = answers['rewardPercentage'];
    main(enteredPath, enteredRiskPercentage, enteredRewardPercentage);
})

function main(path, riskPercentage, rewardPercentage) {
    csvPath = path || 'BTCUSDT.csv';
    let inputStream = Fs.createReadStream(csvPath, 'utf8');
    const RISK_PERCENTAGE = riskPercentage || 0.01;
    const REWARD_PERCENTAGE = rewardPercentage || 0.01;

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
            { id: 'BlockNumber', title: 'Block Number' },
            { id: 'DealType', title: 'Deal Type' },
            { id: 'TotalCollision', title: 'Total Collision' },
            { id: 'Price', title: 'Price' },
        ]
    });

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
            // console.log('...Block Done');
        });
    }

    // Write Collision CSV -> add Data to Collision CSV
    function WriteCollisionDetailOnCSV(blockCount, data) {
        collisionsCSVWriter.writeRecords([
            {
                BlockNumber: blockCount,
                DealType: data.dealType,
                TotalCollision: data.totalCollision,
                Price: data.price,
            }
        ]).then(() => {
            // console.log('...Collision Detail Done');
        });
    }

    // Block Default 
    let dealType = "Entry Long";
    let entryBlockPrice = 0;
    let changeDealTypePrice = 0;
    let LONG_TAKE_PROFIT = 0;
    let SHORT_TAKE_PROFIT = 0;
    let collisionCount = 1;
    let blockCount = 1;
    let tickCount = 0;

    function createNewBlock() {
        dealType = "Entry Long";
        entryBlockPrice = 0;
        changeDealTypePrice = 0;
        collisionCount = 1;
        LONG_TAKE_PROFIT = 0;
        SHORT_TAKE_PROFIT = 0;
        tickCount = 0;
    }

    inputStream
        .pipe(new CsvReadableStream({ delimiter: '\t', trim: true, asObject: true, skipHeader: true }))
        .on('data', function (row) {
            // * ASK long 
            // * BID SHORT 
            let ask = Number(row['<ASK>']);
            let bid = Number(row['<BID>']);
            let date = row['<DATE>'];
            let time = row['<TIME>'];
            let [year, month, day] = date.split('.');
            let dateFormat = `${year}-${month}-${day}:${time}`;

            // we assume first deal is long so we can calculate the start price
            if (entryBlockPrice === 0) {
                console.log("=================================")
                entryBlockPrice = ask ? ask : bid;
                changeDealTypePrice = entryBlockPrice * (1 - RISK_PERCENTAGE);
                console.log(`${dateFormat} - Entry Price: ${entryBlockPrice}`);
                console.log(`${dateFormat} - Change Price: ${changeDealTypePrice}`);

                LONG_TAKE_PROFIT = entryBlockPrice * (1 + REWARD_PERCENTAGE);

                let priceChanger = entryBlockPrice * (1 - RISK_PERCENTAGE);
                SHORT_TAKE_PROFIT = priceChanger * (1 - REWARD_PERCENTAGE);

                console.log(`${dateFormat} - Long Take Profit: ${LONG_TAKE_PROFIT}`);
                console.log(`${dateFormat} - Short Take Profit: ${SHORT_TAKE_PROFIT}`);

                WriteCollisionDetailOnCSV(blockCount, {
                    blockNumber: blockCount,
                    dealType: dealType,
                    totalCollision: collisionCount,
                    price: entryBlockPrice,
                });
                console.log(`${dateFormat} - Collision Count: ${collisionCount}`);
            }

            // console.log(`tick Price: ask -> ${ask}`,);
            // console.log(`tick Price: bid -> ${bid}`,);

            tickCount++;
            // collision detection
            if (dealType === "Entry Long" || dealType === "Impact Long") {
                if (ask <= changeDealTypePrice && ask > 0) {
                    collisionCount++;
                    dealType = "Impact Short";
                    changeDealTypePrice = ask * (1 + RISK_PERCENTAGE);

                    WriteCollisionDetailOnCSV(blockCount, {
                        blockNumber: blockCount,
                        dealType: dealType,
                        totalCollision: collisionCount,
                        price: ask,
                    });
                    console.log("collision detected", collisionCount);
                    console.log("Price On Collision: " + ask);
                    console.log("new change deal price: ", changeDealTypePrice);
                } else if (ask >= LONG_TAKE_PROFIT) {
                    collisionCount++;
                    console.log("collision Detected On Take Profit Low", collisionCount);

                    writeBlockOnCSV(blockCount, {
                        date: dateFormat,
                        blockNumber: blockCount,
                        entryPrice: entryBlockPrice,
                        stopLoss: changeDealTypePrice,
                        longTakeProfit: LONG_TAKE_PROFIT,
                        shortTakeProfit: SHORT_TAKE_PROFIT,
                        collisionCount: collisionCount,
                        tickCount: tickCount,
                    });

                    WriteCollisionDetailOnCSV(blockCount, {
                        blockNumber: blockCount,
                        dealType: "Take Profit High",
                        totalCollision: collisionCount,
                        price: ask,
                    });
                    console.log("Price On Take Profit High: " + ask);

                    blockCount++;
                    createNewBlock();
                }
            } else if (dealType === "Entry Short" || dealType === "Impact Short") {
                if (bid >= changeDealTypePrice && bid > 0) {
                    collisionCount++;
                    dealType = "Impact Long";
                    changeDealTypePrice = bid * (1 - RISK_PERCENTAGE);

                    WriteCollisionDetailOnCSV(blockCount, {
                        blockNumber: blockCount,
                        dealType: dealType,
                        totalCollision: collisionCount,
                        price: bid,
                    });

                    console.log("collision detected", collisionCount);
                    console.log("Price On Collision: " + bid);
                    console.log("new change deal price: ", changeDealTypePrice);
                } else if (bid <= SHORT_TAKE_PROFIT && bid > 0) {
                    collisionCount++;
                    console.log("collision Detected On Take Profit Low", collisionCount);
                    writeBlockOnCSV(blockCount, {
                        date: dateFormat,
                        blockNumber: blockCount,
                        entryPrice: entryBlockPrice,
                        stopLoss: changeDealTypePrice,
                        longTakeProfit: LONG_TAKE_PROFIT,
                        shortTakeProfit: SHORT_TAKE_PROFIT,
                        collisionCount: collisionCount,
                        tickCount: tickCount,
                    });
                    console.log("Price On Take Profit Low: " + bid);

                    WriteCollisionDetailOnCSV(blockCount, {
                        blockNumber: blockCount,
                        dealType: "Take Profit Low",
                        totalCollision: collisionCount,
                        price: bid,
                    });
                    console.log("=================================")

                    blockCount++;
                    // start a new block and write on csv
                    createNewBlock();
                }
            }
        })
        .on('end', function () {
            console.log('No more rows!');
        });
}
