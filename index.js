const request = require('request');
const fs = require('fs');
const async = require('async');
var JPEGDecoder = require('jpg-stream/decoder');

const axios = require('axios');
const moment = require('moment');

require('dotenv').config()
const env = process.env;

const basePath = env.BASE_PATH || './dl';

if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath);
}

function downloadImage(address, filename) {

    return new Promise(function (resolve, reject) {

        var r = request(address);
        var localFileName = generateTempFilename(filename);

        r.on('response', function (res) {
            console.log(`\nDownloading ${filename} to ${localFileName}`);


            var stream = res.pipe(fs.createWriteStream(localFileName));
            stream.on('finish', function () {
                console.log(`Finished downloading ${localFileName}\n`);

                //TODO
                var metaData = readImageMetaData(localFileName);
                var finalFileName = generateFilename(metaData);
                moveImage(localFileName, finalFileName);
                deleteImageFromCard(filename);


                resolve();
            });



        });

    });
}

function generateTempFilename(filename) {
    return `${basePath}/${filename}.xfer`;
}

function readImageMetaData(filename) {
    fs.createReadStream('in.jpg')
        .pipe(new JPEGDecoder)
        .on('meta', function (meta) {
            // meta contains an exif object as decoded by
            // https://github.com/devongovett/exif-reader
        })
        .pipe(concat(function (frames) {
            // frames is an array of frame objects (one for JPEGs)
            // each element has a `pixels` property containing
            // the raw RGB pixel data for that frame, as
            // well as the width, height, etc.
        }));
    //TODO
}

function generateFilename(metadata, filename) {
    const meta = {
        date: moment(metadata.exif.DateTimeOriginal).format('YYYY-MM-DD'),
        year: moment(metadata.exif.DateTimeOriginal).format('YYYY')
    }
    return `${meta.year}/${meta.date}/${filename}`;
}

function moveImage(sourceFilename, destinationFilename) {
    console.log(`Moving ${sourceFilename} to ${destinationFilename}`);
    fs.copyFile(sourceFilename, destinationFilename, (err) => {
        if (err) throw err;
        console.log(`${sourceFilename} was copied to ${destinationFilename}`);

        fs.unlink(sourceFilename, (err) => {
            if (err) throw err;
            console.log(`Deleted ${sourceFilename}`);
        });
    });
}

function deleteImageFromCard(filename) {
    //TODO
}



function getAllImages(filename) {
    request(`${env.BASE_URL}/command.cgi?op=100&DIR=/DCIM/${filename}`, function (error, response, body) {
        if (error) {
            return console.log('error:', error); // Print the error if one occurred
        }

        var lines = body.split('\r\n')
        var q = async.queue(function (task, done) {
            downloadImage(task.url, task.filename).then(function () {
                done();
            });
        });

        for (var i = 0, len = lines.length; i < len; i++) {
            var line = lines[i];

            if (line !== 'WLANSD_FILELIST') {

                var splitLine = line.split(',');
                var directory = splitLine[0];
                var filename = splitLine[1];

                if (filename) {
                    var fullPath = `${env.BASE_URL}${directory}/${filename}`;
                    console.log(fullPath);
                    q.push({
                        url: fullPath,
                        filename: filename
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