const fs = require('fs');
const fse = require('fs-extra');
const async = require('async');
const moment = require('moment');
const axios = require('axios');

require('dotenv').config()
const env = process.env;

const basePath = env.BASE_PATH || './dl';
const destPath = env.DEST_PATH || './dest'

if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath);
}

const prefilightCheck = () => {
    return axios.get(`${env.BASE_URL}/command.cgi?op=102`)
        .then(res => {
            return res.data;
        })
        .catch(err => {
            return err;
        })
}

function downloadImage(address, filename, timestamp) {

    return axios({
        method: 'get',
        url: address,
        responseType: 'stream'
    })
        .then(res => {
            const localFileName = generateTempFilename(filename);

            console.log(`\nDownloading ${filename} to ${localFileName}`);

            const stream = res.data.pipe(fs.createWriteStream(localFileName));
            stream.on('finish', () => {
                console.log(`Finished downloading ${localFileName}\n`);

                const finalFileName = generateFilename(timestamp, filename);
                moveImage(localFileName, finalFileName)
                    .then(() => resolve())
                    .catch((ex) => { });

                //resolve();
            });
        })
    //         .catch(err => {
    //             reject(err);
    //         });
    // });
}

function generateTempFilename(filename) {
    return `${basePath}/${filename}.xfer`;
}

function generateFilename(timestamp, filename) {
    const meta = {
        date: moment(timestamp).format('YYYY-MM-DD'),
        year: moment(timestamp).format('YYYY')
    }
    let path = `${destPath}/${meta.year}/${meta.date}`;
    return {
        fullname: `${path}/${filename}`,
        fullpath: path
    };
}

function moveImage(sourceFilename, destination) {
    return fse.ensureDir(destination.fullpath)
        .then(() => {
            console.log('Created file structure...')

            fse.move(sourceFilename, destination.fullname)
                .then(() => {
                    console.log(`Moved ${sourceFilename} to ${destination.fullname}`);
                    deleteImageFromCard(sourceFilename).then(() => {
                        resolve();
                    }).catch(err => {
                        throw err;
                    });
                })
                .catch(err => {
                    if (err.code !== "EEXIST") {
                        throw err;
                    }
                })
        })
        .catch(err => {
            throw err;
        })
}

function deleteImageFromCard(filename) {
    console.log(`Deleting ${filename} from card...`)

    return axios.get(`${env.BASE_URL}/upload.cgi?DEL=/DCIM/${filename}`)
        .then(res => {
            if (res.data === 'ERROR') throw new Error('ERROR')
            return res.data
        })
        .catch(err => {
            throw err;
        })
}

function dateFromCardInfo(date, time) {
    var day = date & 0b11111;
    var month = (date >> 5) & 0b1111;
    var year = ((date >> 9) & 0b1111111) + 1980;

    return new Date(year, month - 1, day);
}

function timestampFromCardInfo(date, time) {
    return (date << 16) | time;
}

function readLastItemTransferTimestamp() { }

function writeLastItemTransferTimestamp(ts) { }

function processImagesFromFolderOnCard(filename, taskList) {

    return axios.get(`${env.BASE_URL}/command.cgi?op=100&DIR=/DCIM/${filename}`)
        .then(res => {
            const body = res.data;
            //console.info(body);

            var lines = body.split('\r\n')

            for (var i = 0, len = lines.length; i < len; i++) {
                var line = lines[i];

                if (line !== 'WLANSD_FILELIST') {

                    var splitLine = line.split(',');
                    var directory = splitLine[0];
                    var filename = splitLine[1];

                    var date = splitLine[4];
                    var time = splitLine[5];

                    var timestamp = dateFromCardInfo(date, time);

                    if (filename) {
                        var fullPath = `${env.BASE_URL}${directory}/${filename}`;
                        console.log(fullPath);
                        taskList.push({
                            url: fullPath,
                            filename: filename,
                            timestamp: timestamp
                        });
                    }
                }

            }
        })
    // .catch(err => {
    //     throw err;
    // });
}

const processFoldersOnCard = () => {

    var taskList = [];

    var folderQueue = async.queue((task, done) => {
        processImagesFromFolderOnCard(task.filename, taskList)
            .then(() => { done(); })
            .catch(err => { throw err });
    });

    axios.get(`${env.BASE_URL}/command.cgi?op=100&DIR=/DCIM`)
        .then(res => {
            const body = res.data;
            var lines = body.split('\r\n')

            for (var i = 0, len = lines.length; i < len; i++) {
                var line = lines[i].trim();
                if (line !== 'WLANSD_FILELIST') {

                    var splitLine = line.split(',');
                    var directory = splitLine[0];
                    var filename = splitLine[1];
                    var size = splitLine[2];
                    var attribute = splitLine[3];
                    var date = splitLine[4];
                    var time = splitLine[5];

                    if (attribute === '16' && filename !== 'EOSMISC') {
                        console.log(`Folder ${filename}`);
                        folderQueue.push({ filename: filename });
                    }
                }
            }

        })
        .catch(err => {
            throw err;
        });

    folderQueue.drain = () => {
        console.log("drained")
        startDownloads(taskList);
    };
    folderQueue.empty = () => {
        console.log("empty")
    };
    folderQueue.started = () => {
        console.log("started")
    };
}

function startDownloads(taskList) {
    console.log("starting download process");

    var q = async.queue(function (task, done) {
        downloadImage(task.url, task.filename, task.timestamp)
            .then(function () {
                done();
            })
            .catch(err => {
                console.error(err);
            });
    });

    q.push(taskList);

    // listed for drain event - signal downloads completed
}

const runAll = () => {
    prefilightCheck()
        .then((status) => {
            if (status === '1') {
                console.log('Updates\n')
                processFoldersOnCard();
            } else {
                console.log('No updates\n')
                processFoldersOnCard();
            }
        })
        .catch((err) => {
            console.log('Card seems to be unavailable')
        })
}

runAll();
//const schedule = setInterval(runAll, 15000);