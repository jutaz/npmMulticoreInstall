var async = require('async');
var exec = require('child_process').exec;
var request = require('request');
var tar = require('tar');
var zlib = require('zlib');

function cloneRepo (path, url, ref, callback) {
	exec('rm -Rf ' + path + ' && mkdir -p ' + path + ' && git clone ' + url + ' ' + path + ' && cd ' + path + ' && git reset --hard ' + ref, function (error, stdout, stderr) {
			console.log(stdout);
			console.error(stderr);
			if (error) {
				console.log('Retrying....')
				return cloneRepo(path, url, ref, callback);	
			}
			callback();
		});
}

function download(url, paths, callback) {
	var r;
	if (url.indexOf('ssh') === 0) {
		var ref = url.substr(url.lastIndexOf('#') + 1);
		var repoUrl = url.slice(0, url.lastIndexOf('#')).replace('ssh://', '').replace('/', ':');
		cloneRepo(paths[0], repoUrl, ref, callback);
		return;
	} else {
		r = request(url).pipe(zlib.Unzip());
	}
	r.on('error', function (err) {
		download(url, paths, callback);
	});
	r.setMaxListeners(Infinity);
	async.map(paths, function (path, cb) {
		var extractor = tar.Extract({
			path: path,
			strip: 1
		}).on('error', function (err) {
			console.log('here', err);
		}).on('end', function () {
			cb();
		});
		r.pipe(extractor);
	}, function () {
		callback();
	});
}

process.on('message', function(obj) {
	if (obj.action === 'rebuild') {
		exec('npm rebuild ' + obj.name, function () {
			process.send({
				event: obj.event
			});
		});
		return;
	}
	download(obj.url, obj.paths, function () {
		process.send({
			event: obj.event
		});
	});
});
process.send('online');
