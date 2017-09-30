const request = require('request');
const fs = require('fs');
const async = require('async');

require('dotenv').config()
const env = process.env;

function downloadImage(address) {
    var r = request(address);

    r.on('response', function (res) {
        var filepath = './dl/' + res.headers.date + '.' + res.headers['content-type'].split('/')[1];
        console.log(filepath);
        res.pipe(fs.createWriteStream(filepath));
    });
}

function getAllImages(filename) {
    request(`${env.BASE_URL}/command.cgi?op=100&DIR=/DCIM/${filename}`, function (error, response, body) {
        if (error) {
            return console.log('error:', error); // Print the error if one occurred
        }

        var lines = body.split('\r\n')
        var q = async.queue(function (task, done) {
            downloadImage(task.url);
        });
        for (var i = 0, len = lines.length; i < len; i++) {
            var line = lines[i];

            if (line !== 'WLANSD_FILELIST') {

                var splitLine = line.split(',');
                var directory = splitLine[0];
                var filename = splitLine[1];

                if (filename) {
                    console.log(`\nStarting download on ${directory}/${filename}`);
                    var fullPath = `${env.BASE_URL}${directory}/${filename}`;
                    console.log(fullPath);
                    q.push({
                        url: fullPath
                    }, function (err) {
                        if (err) {
                            console.log(`ERROR: ${err}`);
                        }
                        console.log(`Finished downloading ${fullPath}\n`);
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