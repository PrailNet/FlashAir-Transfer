const request = require('request');
const fs = require('fs');
const async = require('async');

require('dotenv').config()
const env = process.env;

function downloadImage(address, filename) {
    return new Promise(function (resolve, reject) {

        var r = request(address);

        r.on('response', function (res) {
            var filepath = `./dl/${filename}`;
            console.log(`\nDownloading ${filename} to ${filepath}`);

            var stream = res.pipe(fs.createWriteStream(filepath));
            stream.on('finish', function () {
                console.log(`Finished downloading ${filepath}\n`);
                resolve();
            });
        

        });

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