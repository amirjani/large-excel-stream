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
let dateFormat = '';

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
        });
    }

    // Write Collision CSV -> add Data to Collision CSV
    function WriteCollisionDetailOnCSV(blockCount, data) {
        collisionsCSVWriter.writeRecords([
            {
                Date: data.date,
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
    let startDate = '';
    let dateBlockEncountered = false;

    function createNewBlock() {
        dealType = "Entry Long";
        entryBlockPrice = 0;
        changeDealTypePrice = 0;
        collisionCount = 1;
        LONG_TAKE_PROFIT = 0;
        SHORT_TAKE_PROFIT = 0;
        tickCount = 0;
        dateBlockEncountered = false;
    }

    inputStream
        .pipe(new CsvReadableStream({ delimiter: '\t', trim: true, asObject: true, skipHeader: true }))
        .on('data', function (row) {
            // * ASK long 
            // * BID SHORT 
            // console.log("startDate: ", startDate);
            // console.log("row.Date: ", row['<DATE>']);

            let ask = Number(row['<ASK>']);
            let bid = Number(row['<BID>']);

            if (startDate === row['<DATE>']) {
                let date = row['<DATE>'];
                let time = row['<TIME>'];

                let [year, month, day] = date.split('.');
                dateFormat = `${year}-${month}-${day}:${time}`;

                // we assume first deal is long so we can calculate the start price
                if (entryBlockPrice === 0) {
                    entryBlockPrice = ask ? ask : bid;
                    changeDealTypePrice = entryBlockPrice * (1 - RISK_PERCENTAGE);

                    LONG_TAKE_PROFIT = entryBlockPrice * (1 + REWARD_PERCENTAGE);

                    let priceChanger = entryBlockPrice * (1 - RISK_PERCENTAGE);
                    SHORT_TAKE_PROFIT = priceChanger * (1 - REWARD_PERCENTAGE);

                    WriteCollisionDetailOnCSV(blockCount, {
                        date: startDate,
                        blockNumber: blockCount,
                        dealType: dealType,
                        totalCollision: collisionCount,
                        price: entryBlockPrice,
                    });
                }

                tickCount++;
                // collision detection
                if ((dealType === "Entry Long" || dealType === "Impact Long") && dateBlockEncountered === false) {
                    if (ask <= changeDealTypePrice && ask > 0) {
                        collisionCount++;
                        dealType = "Impact Short";
                        changeDealTypePrice = ask * (1 + RISK_PERCENTAGE);

                        WriteCollisionDetailOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            dealType: dealType,
                            totalCollision: collisionCount,
                            price: ask,
                        });
                    } else if (ask >= LONG_TAKE_PROFIT) {
                        collisionCount++;

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
                            dealType: "Take Profit High",
                            totalCollision: collisionCount,
                            price: ask,
                        });

                        blockCount++;
                        dateBlockEncountered = true;
                        console.log("date block encountered: ", dateBlockEncountered);
                    }
                } else if ((dealType === "Entry Short" || dealType === "Impact Short") && dateBlockEncountered === false) {
                    if (bid >= changeDealTypePrice && bid > 0) {
                        collisionCount++;
                        dealType = "Impact Long";
                        changeDealTypePrice = bid * (1 - RISK_PERCENTAGE);

                        WriteCollisionDetailOnCSV(blockCount, {
                            date: startDate,
                            blockNumber: blockCount,
                            dealType: dealType,
                            totalCollision: collisionCount,
                            price: bid,
                        });
                    } else if (bid <= SHORT_TAKE_PROFIT && bid > 0) {
                        collisionCount++;
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
                            dealType: "Take Profit Low",
                            totalCollision: collisionCount,
                            price: bid,
                        });
                        blockCount++;
                        dateBlockEncountered = true;
                        console.log("date block encountered: ", dateBlockEncountered);
                    }
                }
            } else {
                startDate = row['<DATE>'];

                console.log("new date encountered: ", startDate);
                createNewBlock();
            }
        })
        .on('end', function () {
            console.log('No more rows!');
        });
}
