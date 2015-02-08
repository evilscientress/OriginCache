/**
 * OriginCache
 * 
 * Author: Peter Danzmayr aka. masterbase
 * Fork Me: https://github.com/masterbase/OriginCache
 * Version: 0.1
 * 
 */

var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var serveStatic = require('serve-static');
var finalhandler = require('finalhandler');
var util = require('util');

//STATIC
var version = 'OriginCache 0.1';

/* config */
var config = require('./config');
config.cachedir = path.normalize(config.cachedir);


var serve = serveStatic(config.cachedir);
var srv = http.createServer(function(client_req, client_res) {
	var requrl = url.parse(client_req.url);
	var localpath = path.normalize(config.cachedir + requrl.pathname);
	util.debug('URL: ' + requrl.pathname + ' localpath: ' + localpath);
	
	if (localpath.indexOf(config.cachedir) !== 0) {
		//invalid path, ignore request
		client_res.writeHead(404, {
			'Content-Type': 'text/plain',
		});
		client_res.end('Nice Try ...');
		util.log('ALERT - Client ' + client_res.socket.remoteAddress + ' tried to escape cachedir (' + requrl.pathname + ')');
	} else { 
	
		fs.exists(localpath, function(localCopyExists) {
			if (localCopyExists) {
				util.log('HIT ' + client_res.socket.remoteAddress + ' ' + requrl.pathname);
				var done = finalhandler(client_req, client_res); 
				serve(client_req, client_res, done);
			} else {
				//new file download to cache ...
				util.log('MISS ' + client_res.socket.remoteAddress + ' ' + requrl.pathname);
				
				var downloadOptions = {
						host: config.eaServer ? config.eaServer : client_req.hostname,
						path: client_req.url,
				};
				if ('localAddress' in config) {
					downloadOptions.localAddress = config.localAddress;
				}
				var fetch_req = http.request(downloadOptions, function(res2) {
					util.debug('Fetch Request Status: ' + res2.statusCode);
					client_res.writeHead(res2.statusCode, {
						'Content-Type': res2.headers['content-type'],
						'Content-Length': res2.headers['content-length'],
					});
					
					if (res2.statusCode == 200) {
						//TODO: Do this async
						if (!fs.existsSync(path.dirname(localpath))) {
							var dirpath = path.dirname(localpath);
							var createDirs = [];
							while(!fs.existsSync(dirpath)) {
								createDirs.push(dirpath);
								dirpath = path.dirname(dirpath);
							}
							while (i = createDirs.pop()) {
								fs.mkdir(i);
							}
						}
						cacheWriter = fs.createWriteStream(localpath);
						cacheWriter.on('open', function(fd) {
							res2.on('data', function(chunk) {
								client_res.write(chunk);
								cacheWriter.write(chunk);
							});
							res2.on('end', function() {
								client_res.end();
								cacheWriter.end();
								util.log('caching complete ' + localpath);
							});
						});
					} else {
						res2.pipe(client_res, {
							end: true
						});
					}
					
					
				}).on('error', function(e) {
					client_res.setHeader('Content-Type', 'text/plain' );
					client_res.end('ERROR fetching file');
					util.error('ERROR fetching file:');
					util.error(e);
				}).end();
			}
		});
	}
});

srv.listen(config.wwwPort);
util.log(version + ' started, listening at ' + config.wwwPort);