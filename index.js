const request = require('request');
const fs = require('fs');
const fse = require('fs-extra');
const async = require('async');

const axios = require('axios');
const moment = require('moment');

require('dotenv').config()
const env = process.env;

const basePath = env.BASE_PATH || './dl';
const destPath = env.DEST_PATH || './dest'

if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath);
}

const prefilightCheck = () => {
    return new Promise((resolve, reject) => {

        request(`${env.BASE_URL}/command.cgi?op=102`, (err, res, body) => {
            if (err) reject(err);
            resolve(body);
        })
    })
}

function downloadImage(address, filename, timestamp) {

    return new Promise(function (resolve, reject) {

        var r = request(address);
        var localFileName = generateTempFilename(filename);

        r.on('response', function (res) {
            console.log(`\nDownloading ${filename} to ${localFileName}`);


            var stream = res.pipe(fs.createWriteStream(localFileName));
            stream.on('finish', function () {
                console.log(`Finished downloading ${localFileName}\n`);

                var finalFileName = generateFilename(timestamp, filename);
                moveImage(localFileName, finalFileName)
                    .then(() => { resolve() })
                    .catch((ex) => { });

                //resolve();
            });



        });

    });
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
                    deleteImageFromCard(sourceFilename)
                        .then(() => { resolve(); })
                        .catch(err => { throw err; });
                })
                .catch(err => {
                    throw err;
                })
        })
        .catch(err => {
            throw err;
        })
}

function deleteImageFromCard(filename) {
    return new Promise(function (resolve, reject) {
        console.log(`Deleting ${filename} from card...`)
        request(`${env.BASE_URL}/upload.cgi?DEL=/DCIM/${filename}`, (err, res, body) => {
            if (err) reject(err);
            if (body === 'ERROR') reject(body);
            console.log(body)
            resolve();
        });
    });
}

function dateFromCardInfo(date, time) {
    var day = date & 0b11111;
    var month = (date >> 5) & 0b1111;
    var year = ((date >> 9) & 0b1111111) + 1980;

    return new Date(year, month - 1, day);
}

function getAllImages(filename) {
    request(`${env.BASE_URL}/command.cgi?op=100&DIR=/DCIM/${filename}`, function (error, response, body) {
        if (error) {
            return console.log('error:', error); // Print the error if one occurred
        }

        console.info(body);

        var lines = body.split('\r\n')
        var q = async.queue(function (task, done) {
            downloadImage(task.url, task.filename, task.timestamp).then(function () {
                done();
            });
        });

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
                    q.push({
                        url: fullPath,
                        filename: filename,
                        timestamp: timestamp
                    }, function (err) {
                        if (err) {
                            console.log(`ERROR: ${err}`);
                        }
                    });
                }
            }

        }
    })
}


const runAll = () => {
    prefilightCheck().then((status) => {
        if (status === '1') {
            console.log('Updates')
            request(`${env.BASE_URL}/command.cgi?op=100&DIR=/DCIM`, function (error, response, body) {
                if (error) {
                    return console.log('error:', error); // Print the error if one occurred
                }

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
                            getAllImages(filename);
                        }
                    }
                }
            });
        } else {
            console.log('No updates')
        }
    })
        .catch((err) => {
            console.log('Card seems to be unavailable')
        })
}

runAll();
const schedule = setInterval(runAll, 15000);