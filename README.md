

# OriginCache
A caching proxy for EA's Origin

## About
OriginCache is a (transparent) proxy server for EAs Origin Downloader.
The Origin-Downloader uses byte range request so a normal caching proxy will not add the game file to it's cache.
This proxy extracts the download URL and downloads the whole file with one single request and, using NodeJS Streams,
forwards the download to the client and also stores it on the cache disk.
All feature requests for the file will be served by the local cache

## Usage

1. install Node.js
2. install the node modules serve-static and finalhandler (npm install serve-static finalhandler)
2. Configure OriginCache to suit your needs (see config.js.sample) 
3. On your proxy server of choice add a rewrite url to forward request to 'akamai.cdn.ea.com' to the OrginCache server

## ToDo

Support multiple clients during the download phase

### Tools

Created with [Nodeclipse](https://github.com/Nodeclipse/nodeclipse-1)
 ([Eclipse Marketplace](http://marketplace.eclipse.org/content/nodeclipse), [site](http://www.nodeclipse.org))   

Nodeclipse is free open-source project that grows with your contributions.

### License
Apache License, Version 2.0