var async = require('async');
var exec = require('child_process').exec;
var request = require('request');
var tar = require('tar');
var zlib = require('zlib');

function cloneRepo (paths, url, ref, callback) {
	var tmpDir = '/tmp/npmMulticoreInstall/' + (Math.random() * Math.random() * 1000).toString().replace(/\./, '');
	console.log('Cloning ' + url);
	exec('rm -Rf ' + tmpDir + ' && mkdir -p ' + tmpDir + ' && git clone ' + url + ' ' + tmpDir + ' && cd ' + tmpDir + ' && git reset --hard ' + ref, function (error, stdout, stderr) {
		console.log(stdout);
		console.error(stderr);
		if (error) {
			console.log('Retrying....');
			console.error(error);
			return cloneRepo(path, url, ref, callback);
		}
		async.map(paths, function (path, cb) {
			console.log('Copying ' + tmpDir + ' to ' + path);
			exec('cp -R ' + tmpDir + '/ ' + path, cb);
		}, callback);
	});
}

function download(url, paths, callback) {
	var r;
	if (url.indexOf('ssh') === 0) {
		var ref = url.substr(url.lastIndexOf('#') + 1);
		var repoUrl = url.slice(0, url.lastIndexOf('#')).replace('ssh://', '').replace('/', ':');
		cloneRepo(paths, repoUrl, ref, callback);
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
	console.log('Installing: ' + obj.url);
	download(obj.url, obj.paths, function () {
		process.send({
			event: obj.event
		});
		console.log('Done installing: ' + obj.url);
	});
});
process.send('online');
