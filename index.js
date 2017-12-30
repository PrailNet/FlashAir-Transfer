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

                readImageMetaData(localFileName).then(function (metaData) {
                    console.info(metaData);
                    var finalFileName = generateFilename(metaData, filename);
                    moveImage(localFileName, finalFileName);
                    deleteImageFromCard(filename);
                });


                resolve();
            });



        });

    });
}

function generateTempFilename(filename) {
    return `${basePath}/${filename}.xfer`;
}

function readImageMetaData(filename) {
    return new Promise(function (resolve, reject) {

        if (filename.match(/\.jpg\.xfer$/i)) {
            // for JPEG files:
            fs.createReadStream(filename)
                .pipe(new JPEGDecoder)
                .on('meta', function (meta) {
                    resolve(meta);
                    // meta contains an exif object as decoded by
                    // https://github.com/devongovett/exif-reader
                });
            return;
        }


        // for video:
        if (filename.match(/\.mov\.xfer$/i)) {
            //TODO
            return;
        }

        // for raw:
        if (filename.match(/\.raw\.xfer$/i)) {
            //TODO
            return;
        }
    });

}

function generateFilename(metadata, filename) {
    const meta = {
        date: moment(metadata.exif.DateTimeOriginal).format('YYYY-MM-DD'),
        year: moment(metadata.exif.DateTimeOriginal).format('YYYY')
    }
    return `${meta.year}/${meta.date}/${filename}`;
}

function moveImage(sourceFilename, destinationFilename) {
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
    request(`${env.BASE_URL}/upload.cgi?DEL=/DCIM/${filename}`, (err, res, body) => {
        if (err) throw err;
        if (body === 'ERROR') throw body;
        console.log(body)
    });
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