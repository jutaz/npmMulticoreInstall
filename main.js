var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
try {
 var lockfile = require(process.cwd() + '/npm-shrinkwrap.json');
} catch(e) {
	console.error('This requires npm-shrinkwrap.json');
	process.exit(1);
}
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var emitter = new EventEmitter();
var traverse = require('traverse');

var modulesDir = './tmp/';
var modulesDirName = 'node_modules/';

var toDownload = [];
var gitClones = [];
var names = [];
var paths = {};

cluster.setupMaster({
  exec: __dirname + '/worker.js'
});

traverse(lockfile).paths().forEach(function (arr, i) {
  var joined = arr.join(',');
  if (joined.indexOf('resolved') === joined.length - 8) {
    var name = arr[arr.length-2];
    if (names.indexOf(name) === -1) {
      names.push(name);
    }
    var a = arr;

    var item = lockfile;
    var p = modulesDir;
    a.forEach(function (path, i) {
      if (i % 2 !== 0) {
        if (i > 1) {
          p += modulesDirName;
        }
        p += path + '/';
      }
      item = item[path];
    });

    if (item.indexOf('git+https') === 0) {
      item = item.replace('git+https://', 'ssh://git@');
      gitClones.push(item);
    } else if (item.indexOf('git+ssh') === 0) {
      item = item.replace('git+', '');
      gitClones.push(item);
    } else if (item.indexOf('git://') === 0) {
      item = item.replace('git://', 'ssh://');
      if (item.indexOf('@') === -1) {
        item = item.replace('://', '://git@');
      }
      gitClones.push(item);
    } else if (toDownload.indexOf(item) === -1) {
      toDownload.push(item);
    }
    if (!paths[item]) {
      paths[item] = [];
    }
    paths[item].push(p);
  }
});

for (var i = 0; i < numCPUs; i++) {
  cluster.fork();
}

cluster.on('exit', function(worker, code, signal) {
  console.log('worker ' + worker.process.pid + ' died');
});

emitter.on('--ready', function () {
  toDownload.shift();

  async.each(gitClones, function (url, cb) {
    var eventName = Math.random().toString();
    getWorker().send({
      url: url,
      paths: paths[url],
      event: eventName
    });
    emitter.on(eventName, function () {
      cb();
    });
  }, function () {
    async.each(toDownload, function (url, cb) {
      var eventName = Math.random().toString();
      getWorker().send({
        url: url,
        paths: paths[url],
        event: eventName
      });
      emitter.on(eventName, function () {
        cb();
      });
    }, function () {
      var len = names.length,
          out = [],
          i = 0;
      while (i < len) {
          var size = Math.ceil((len - i) / numCPUs--);
          out.push(names.slice(i, i += size));
      }
      async.each(out, function (name, cb) {
        var eventName = Math.random().toString();
        getWorker().send({
          name: name.join(' '),
          action: 'rebuild',
          event: eventName
        });
        emitter.on(eventName, function () {
          cb();
        });
      }, function () {
        console.log('Done.');
        process.exit(0);
      });
    });
  });
});

function getWorker() {
  var rand = Math.floor(Math.random() * numCPUs) + 1;
  var worker = cluster.workers[rand];
  if (!worker) {
    return getWorker();
  } else {
    return worker;
  }
}

var busy = numCPUs;

Object.keys(cluster.workers).forEach(function(id) {
  cluster.workers[id].on('online', function () {
    --busy;
    if (busy === 0) {
      emitter.emit('--ready');
    }
  });
  cluster.workers[id].on('message', function (res) {
    emitter.emit(res.event);
  });
});
