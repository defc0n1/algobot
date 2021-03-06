var client = require('../../db/util').client();
var fs = require('fs');
var Promise = require('promise');
var iSet = require('../../db/indexed_set');

var util = exports;

util.fastBacktest = function(pair, startTime, diff){
  client.sismember('backtests',pair,function(err,res){
    if(res){
      return 'Simulation not started; a simulation for that ticker is already running.  Stop the previous simulation before starting another.';
    }else{
      client.sadd('backtests',pair);
      fs.readFile('/home/ubuntu/bot/tick_data/' + pair.toUpperCase() + '/index.csv', {encoding: 'utf8'}, 'r', function(err,data){
        result = [];
        var indexData = data.split('\n');
        for(var i=1;i<indexData.length;i++){
          if(indexData[i].length > 3){
            result.push(indexData[i].split(','));
          }
        }
        for(var i=0;i<result.length;i++){
          if(parseFloat(result[i][2]) > startTime){
            var chunk = parseFloat(result[i][0]);
            break;
          }
        }
        var chunkFile = util.readTickDataFile(pair, chunk, function(err, data){
          chunkResult = [];
          var chunkData = data.split('\n');
          for(var i=1;i<chunkData.length;i++){
            if(chunkData[i].length > 3){
              chunkResult.push(chunkData[i].split(','));
            }
          }
          for(var i=0;i<chunkResult.length;i++){
            if(parseFloat(chunkResult[i][0]) > startTime){
              var curIndex = i-1;
              break;
            }
          }
          util.fastSend(chunk, chunkResult, curIndex, diff, startTime, pair); //chunk, chunkResult, curIndex, diff, oldTime, socket
        });
      });
      return 'Simulation started successfully for symbol ' + pair;
    }
  });
}

util.liveBacktest = function(pair, startTime, server){
  client.sismember('backtests',pair,function(err,res){
    if(res){
      return 'Simulation not started; a simulation for that ticker is already running.  Stop the previous simulation before starting another.';
    }else{
      client.sadd('backtests', pair,function(res){
        fs.readFile('/home/ubuntu/bot/tick_data/' + pair.toUpperCase() + '/index.csv', {encoding: 'utf8'}, 'r', function(err,data){
          var result = [];
          var indexData = data.split('\n');
          for(var i=1;i<indexData.length;i++){
            if(indexData[i].length > 3){
              result.push(indexData[i].split(','));
            }
          }
          for(var i=0;i<result.length;i++){
            if(parseFloat(result[i][2]) > startTime){
              var chunk = parseFloat(result[i][0]);
              break;
            }
          }
          var chunkFile =  util.readTickDataFile(pair, chunk, function(err, data){
            var chunkResult = [];
            var chunkData = data.split('\n');
            for(var i=1;i<chunkData.length;i++){
              if(chunkData[i].length > 3){
                chunkResult.push(chunkData[i].split(','));
              }
            }
            for(var i=0;i<chunkResult.length;i++){
              if(parseFloat(chunkResult[i][0]) > startTime){
                var curIndex = i-1;
                break;
              }
            }
            util.liveSend(chunk, chunkResult, curIndex, 0, parseFloat(chunkResult[curIndex][0]), pair);
          });
        });
      });
    }
  });
}

util.liveSend = function(chunk, chunkResult, curIndex, diff, oldTime, pair){
  util.checkRunning(pair).then(function(res){
    if(res){
      if(curIndex > chunkResult.length){
        curIndex = 1
        chunk++;
        chunkResult = [];
        var chunkData = data.split('\n');
        var chunkFile = util.readTickDataFile(pair, chunk, function(err, data){
          for(var i=1;i<chunkData.length;i++){
            if(chunkData[i].length > 3){
              chunkResult.push(chunkData[i].split(','));
            }
          }
        });
        diff = parseFloat(chunkResult[1][0]) - oldTime;
      }else{
        diff = (parseFloat(chunkResult[curIndex+1][0]) - parseFloat(chunkResult[curIndex][0]))*1000;
      }
      util.publishToClient(pair, chunk, chunkResult, curIndex, diff, util.liveSend);
    }else{
      console.log('Backtest cancelled.');
    }
  })
}

util.publishToClient = function(pair, chunk, chunkResult, curIndex, diff, callback) {
  pair = pair;
  iSet.append('ticks_'+pair, 'timestamps', chunkResult[curIndex][0],function(index){
    iSet.add('ticks_'+pair, 'asks', index, chunkResult[curIndex][1], function(){
      iSet.add('ticks_'+pair, 'bids', index, chunkResult[curIndex][2], function(){
        client.publish('live_ticks', JSON.stringify({
          type: 'new_tick',
          data: {
            symbol:    pair,
            timestamp: chunkResult[curIndex][0],
            ask:       chunkResult[curIndex][1],
            bid:       chunkResult[curIndex][2]
          }
        }));
        setTimeout(function(){
          callback(chunk, chunkResult, curIndex + 1, diff, chunkResult[curIndex][0], pair);
        }, diff);
      });
    });
  });
};

util.fastSend = function(chunk, chunkResult, curIndex, diff, oldTime, pair){
  util.checkRunning(pair).then(function(res){
    if(res){
      if(curIndex > chunkResult.length){
        curIndex = 1;
        chunk++;
        chunkResult = [];
        var chunkData = data.split('\n');
        var chunkFile = util.readTickDataFile(pair, chunk, function(err, data){
          for(var i=1;i<chunkData.length;i++){
            if(chunkData[i].length > 3){
              chunkResult.push(chunkData[i].split(','));
            }
          }
        });
      }
      util.publishToClient(pair, chunk, chunkResult, curIndex, diff, util.fastSend);
    }else{
      console.log('Backtest cancelled.');
    }
  })
}

util.checkRunning = function(pair){
  return new Promise(function(fufill,reject){
    client.sismember('backtests',pair,function(err,res){
      fufill(res == 1);
    });
  });
}

util.readTickDataFile = function(pair, chunk, callback) {
  return fs.readFile(
    '/home/ubuntu/bot/tick_data/' + pair.toUpperCase() + '/' + pair.toUpperCase() + '_' + chunk + '.csv',
    {encoding: 'utf8'}, 'r', callback
  );
};

util.stopBacktest = function(ticker){
  if(ticker.toLowerCase() == 'all'){
    client.del('backtests');
  }
  client.srem('backtests',ticker.toLowerCase());
}
