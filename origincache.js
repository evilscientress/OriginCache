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
var parseRange = require('range-parser');
var send = require('send');
var crypto = require('crypto');

//STATIC
var version = 'OriginCache 0.1';

/* config */
var config = require('./config');
config.cachedir = path.normalize(config.cachedir);


var inprogress = {};

var serve = serveStatic(config.cachedir);
var srv = http.createServer(function(client_req, client_res) {
	var requrl = url.parse(client_req.url);
	var ranges = client_req.headers.range;
	var localpath = path.normalize(config.cachedir + requrl.pathname);
	var localpathSha = shasum(localpath);
	util.debug('URL: ' + requrl.pathname + ' localpath: ' + localpath);
	
	if (localpath.indexOf(config.cachedir) !== 0) {
		//invalid path, ignore request
		client_res.writeHead(404, {
			'Content-Type': 'text/plain',
		});
		client_res.end('Nice Try ...');
		util.log('ALERT - Client ' + client_res.socket.remoteAddress + ' tried to escape cachedir (' + requrl.pathname + ')');
	} else { 
		var isInprogress = localpathSha in inprogress;
		fs.exists(localpath, function(localCopyExists) {
			if (localCopyExists && !isInprogress) {
				util.log('HIT ' + client_req.method + ' ' + client_res.socket.remoteAddress + ' ' + requrl.pathname);
				var done = finalhandler(client_req, client_res); 
				serve(client_req, client_res, done);
			} else {
				//new file download to cache ...
				
				var downloadOptions = {
						host: config.eaServer ? config.eaServer : client_req.hostname,
						path: client_req.url,
						method: client_req.method,
				};
				if ('localAddress' in config) {
					downloadOptions.localAddress = config.localAddress;
				}
				
				if (isInprogress && downloadOptions.method == 'GET') {
					util.debug('inporgress download');
					if (ranges) {
						util.debug('Range Request (' + ranges + ')');
						ranges = parseRange(inprogress[localpathSha].progress, ranges);
						if (-1 == ranges) {
							util.log('MISS-PROG ' + client_req.method + ' ' + client_res.socket.remoteAddress + ' ' + requrl.pathname);
							util.debug('can\'t satisfy client ' + client_res.socket.remoteAddress + ' - OUT OF RANAGE (' + inprogress[localpathSha].progress + ')');
							//client_res.setHeader('Content-Range', 'bytes */' + inprogress[localpathSha].progress);
							//client_res.statusCode = 416;
							//client_res.end(http.STATUS_CODES[416]);
							
							downloadOptions.headers = {
									Range: client_req.headers.range,
									'user-agent': client_req.headers['user-agent'],
							};
							var fetch_req = http.request(downloadOptions, function(res2) {
								util.debug('Range Proxy Request Status: ' + res2.statusCode);
								client_res.writeHead(res2.statusCode, res2.headers);
								res2.pipe(client_res, {
									end: true
								});
							}).on('error', function(e) {
								client_res.statusCode = 500;
								client_res.end(http.STATUS_CODES[500]);;
								util.error('ERROR proxing range:');
								util.error(e);
							}).end();
						} else if(-2 != ranges && ranges.length === 1) {
							util.log('HIT-PROG ' + client_req.method + ' ' + client_res.socket.remoteAddress + ' ' + requrl.pathname);
							send(client_req, requrl.pathname, {root: config.cachedir})
							.on('headers', function (res, path, stat) {
								res.setHeader('Content-Length', inprogress[localpathSha].len);
							}).pipe(client_res, {
								end: true
							});
						} else {
							util.error('RANGE ERROR');
							util.debug('Range: ' + client_req.headers.range);
							util.debug(ranges);
							client_res.statusCode = 500;
							client_res.end(http.STATUS_CODES[500]);;
						}
					} else {
						util.log('HIT-PROG ' + client_req.method + ' ' + client_res.socket.remoteAddress + ' ' + requrl.pathname);
						send(client_req, requrl.pathname, {root: config.cachedir})
						.on('headers', function (res, path, stat) {
							res.setHeader('Content-Length', stat.len);
							res.setHeader('Content-Range', 'bytes 0-' + stat.len + '/' + inprogress[localpathSha].len);
						}).pipe(client_res, {
							end: true
						});
					}
				} else {
					util.log('MISS ' + client_req.method + ' ' + client_res.socket.remoteAddress + ' ' + requrl.pathname);
					var fetch_req = http.request(downloadOptions, function(res2) {
						util.debug('Fetch Request Status: ' + res2.statusCode);
						
						
						if (downloadOptions.method == 'GET' && res2.statusCode == 200) {
							util.log('Starting download ID ' + localpathSha);
							isInprogress = localpathSha in inprogress;
							if (isInprogress) {
								//todo
								util.error('dowload start multiple times - TO FIX')
								client_res.setHeader('Content-Range', 'bytes */' + inprogress[localpathSha].progress);
								client_res.statusCode = 500;
								client_res.end(http.STATUS_CODES[500]);
							} else {
								inprogress[localpathSha] = {
										localpath: localpath,
										len: res2.headers['content-length'],
										contentType: res2.headers['content-type'],
										progress: 0,
								};
								
								//TODO: Do this async
								if (!fs.existsSync(path.dirname(localpath))) {
									var dirpath = path.dirname(localpath);
									var createDirs = [];
									while(!fs.existsSync(dirpath)) {
										createDirs.push(dirpath);
										dirpath = path.dirname(dirpath);
									}
									while (i = createDirs.pop()) {
										fs.mkdirSync(i);
									}
								}
								
								var initRange = false
								if (ranges && ranges == 'Range: bytes=0-0') {
									initRange = true;
									client_res.writeHead(206, {
										'Server': version,
										'Accept-Ranges': 'bytes',
										'Content-Type': res2.headers['content-type'],
										'Last-Modified': res2.headers['last-modified'],
										'Content-Range': 'bytes 0-0/' + res2.headers['content-length'],
										'Content-Length': 1,
										'Content-MD5': res2.headers['content-md5'],
									});
									console.dir(res2.headers);
								} else {
									client_res.writeHead(res2.statusCode, {
										'Content-Type': res2.headers['content-type'],
										'Content-Length': res2.headers['content-length'],
										'Last-Modified': res2.headers['last-modified'],
									});
								}
								
								cacheWriter = fs.createWriteStream(localpath);
								cacheWriter.on('open', function(fd) {
									res2.on('data', function(chunk) {
										if (initRange) {
											client_res.write(chunk[0]);
											client_res.end();
										} else {
											client_res.write(chunk);
										}
										cacheWriter.write(chunk);
										inprogress[localpathSha].progress += chunk.length;
									});
									res2.on('end', function() {
										if(!initRange)client_res.end();
										cacheWriter.end();
										util.log('caching complete ' + localpath);
									});
								});
							}
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
			}
		});
	}
});

srv.listen(config.wwwPort, config.wwwAddress);
util.log(version + ' started, listening at ' + config.wwwAddress + ' port '+ config.wwwPort);

setInterval(function() {
	util.debug('PROGRESS REPORT');
	for (var i in inprogress) {
		if (typeof inprogress[i] === 'object') {
			var d = inprogress[i]
			util.debug('PROGRESS ' + path.basename(d.localpath) + ' ' + d.progress + '/' + d.len + ' (' + (d.progress/d.len) + '%)');
		}
	}
}, 10000);
function shasum(data) {
	var sum = crypto.createHash('sha1');
	sum.update(data);
	return sum.digest('hex');
}