/**
 * Created by Sercan on 26.10.2016.
 */
import {WebApp} from "meteor/webapp";
import {Meteor} from "meteor/meteor";
import {Papa} from "meteor/harrison:papa-parse";
import {Settings} from "/lib/imports/collections/settings";
import {Connections} from "/lib/imports/collections/connections";
import {databasesBySessionId} from "/server/imports/mongodb/methods_common";
import LOGGER from "/server/imports/internal/logger";

const mongodbApi = require('mongodb');

WebApp.connectHandlers.use('/exportMongoclient', function (req, res) {
    let fileContent = {};
    fileContent.settings = Settings.findOne();
    fileContent.connections = Connections.find().fetch();
    let fileName = "backup_" + moment().format('DD_MM_YYYY_HH_mm_ss') + ".json";

    LOGGER.info('[exportMongoclient]', fileContent, fileName);

    const headers = {
        'Content-type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename=' + fileName
    };
    res.writeHead(200, headers);
    res.end(JSON.stringify(fileContent));
});

WebApp.connectHandlers.use('/export', function (req, res) {
    const urlParts = decodeURI(req.url).split('&');
    const format = urlParts[0].substr(urlParts[0].indexOf('=') + 1);
    const selectedCollection = urlParts[1].substr(urlParts[1].indexOf('=') + 1);
    const selector = urlParts[2].substr(urlParts[2].indexOf('=') + 1);
    const cursorOptions = urlParts[3].substr(urlParts[3].indexOf('=') + 1);
    const sessionId = urlParts[4].substr(urlParts[4].indexOf('=') + 1);

    LOGGER.info('[export]', format, selectedCollection, selector, cursorOptions, sessionId);

    Meteor.call("find", selectedCollection, JSON.parse(selector), JSON.parse(cursorOptions), false, sessionId, function (err, result) {
        if (err || result.error) {
            LOGGER.error('[export]', err, result.error);
            res.writeHead(400);
            res.end('Query error: ' + JSON.stringify(err) + " " + JSON.stringify(result.error));
        } else {
            const headers = {
                'Content-type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename=export_result.' + format
            };
            if (format === 'JSON') {
                res.writeHead(200, headers);
                res.end(JSON.stringify(result.result));
            } else if (format === 'CSV') {
                res.writeHead(200, headers);
                res.end(Papa.unparse(result.result, {delimiter: ";", newLine: "\n"}));
            } else {
                res.writeHead(400);
                res.end('Unsupported format: ' + format);
            }
        }
    });
});


WebApp.connectHandlers.use('/healthcheck', function (req, res) {
    res.writeHead(200);
    res.end('Server is up and running !');
});

WebApp.connectHandlers.use("/download", function (req, res) {
    const urlParts = decodeURI(req.url).split('&');
    let fileId = urlParts[0].substr(urlParts[0].indexOf('=') + 1);
    let bucketName = urlParts[1].substr(urlParts[1].indexOf('=') + 1);
    let sessionId = urlParts[2].substr(urlParts[2].indexOf('=') + 1);

    LOGGER.info('[downloadFile]', fileId, bucketName, sessionId);

    res.charset = 'UTF-8';
    if (!bucketName || !fileId) {
        LOGGER.info('[downloadFile]', 'file not found !');
        res.writeHead(400);
        res.end('File not found !');
        return;
    }

    try {
        let filesCollection = databasesBySessionId[sessionId].collection(bucketName + '.files');
        filesCollection.find({_id: new mongodbApi.ObjectId(fileId)}).limit(1).next(function (err, doc) {
            if (doc) {
                const bucket = new mongodbApi.GridFSBucket(databasesBySessionId[sessionId], {bucketName: bucketName});
                const headers = {
                    'Content-type': 'application/octet-stream',
                    'Content-Disposition': 'attachment; filename=' + encodeURIComponent(doc.filename)
                };
                LOGGER.info('[downloadFile]', 'file found and started downloading...', headers);
                const downloadStream = bucket.openDownloadStream(new mongodbApi.ObjectID(fileId));
                res.writeHead(200, headers);
                const pipeStream = downloadStream.pipe(res);
                pipeStream.on('finish', function () {
                    LOGGER.info('[downloadFile]', 'file has been downloaded successfully');
                });

            } else {
                LOGGER.info('[downloadFile]', 'file not found !');
                res.writeHead(400);
                res.end('File not found !');
            }
        });
    }
    catch (ex) {
        LOGGER.error('[downloadFile]', ex);
        res.writeHead(500);
        res.end('Unexpected error: ' + ex.message);
    }

});