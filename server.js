
/*

    AUTHOR:  Andrew Hodel with additional functionality by Peter van der Walt

    RepRapWeb - A Web Based 3d Printer Controller
    Copyright (C) 2015 Andrew Hodel

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

var config = require('./config');
var serialport = require("serialport");
var SerialPort = serialport.SerialPort; // localize object constructor
var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs');
var static = require('node-static');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var qs = require('querystring');
var util = require('util');
var http = require('http');
var chalk = require('chalk');
var slBaseOpts = require('./slBaseOpts');
var currentSocketPort = {};

// Debug Parameters in command line
args = process.argv.slice(2);
if (args[0]) {
  if (args[0].indexOf('--debug') == 0) { // add --debug <firmwarestring>
      console.log(chalk.yellow('WARN:'), chalk.blue('Forcing debug testing with specific Firmware String: '), chalk.yellow(args[1]));
      var debugfirmware = args[1];
  };
};

console.log(chalk.green('***************************************************************'));
console.log(chalk.green('*                        Notice:                              *'));
console.log(chalk.green('***************************************************************'));
console.log(chalk.green('*'),chalk.white('    Remember to update (: !!!                              '), chalk.green('*'));
console.log(chalk.green('* 1.  Run ./update.sh or git pull                             *'));
console.log(chalk.green('* 2.  or check the commit log on                              *'));
console.log(chalk.green('*'), chalk.yellow('https://github.com/openhardwarecoza/LaserWeb/commits/master'), chalk.green('*'));
console.log(chalk.green('***************************************************************'));


// Lets add a message so users know where to point their browser
require('dns').lookup(require('os').hostname(), function (err, add, fam) {
    console.log(chalk.green('*'),chalk.white('Access the LaserWeb User Interface:                        '), chalk.green('*'));
    console.log(chalk.green('* 1. Open Chrome                                              *'));
    console.log(chalk.green('* 2. Go to :                                                  *'));
    console.log(chalk.green('*'), chalk.yellow('   http://'+add+':'+config.webPort+'/                                  '), chalk.green('*'));
    console.log(chalk.green('***************************************************************'));
    console.log(chalk.green(' '));
    console.log(chalk.green(' '));
})

// test for webcam
config.showWebCam = false;

http.get('http://127.0.0.1:8080', function(res) {
	// valid response, enable webcam
	console.log(chalk.green('INFO:'),
  chalk.yellow(' Enabling webcam Widget'));
	config.showWebCam = true;
}).on('socket', function(socket) {
	// 2 second timeout on this socket
	socket.setTimeout(2000);
	socket.on('timeout', function() {
		//this.abort();
	});
}).on('error', function(e) {
	console.error(
    chalk.red('ERROR:'),
		chalk.yellow('Error connecting to webcam:'),
		chalk.blue(e.message),
    chalk.red('- Disabling Webcam Widget')
	);
});


app.listen(4200);
var fileServer = new static.Server('./i');

function handler (req, res) {
console.log('inside function handler');
	//console.log(chalk.gray('url request: '+req.url));

  if (req.url.indexOf('/api/upload') == 0 && req.method == 'POST') {
		// this is a gcode upload, probably from jscut
		console.log(chalk.green('INFO:'), chalk.yellow(' API - New GCODE via POST'));
		var b = '';
		req.on('data', function (data) {
			b += data;
			if (b.length > 1e6) {
				req.connection.destroy();
			}
		});
		req.on('end', function() {
			var post = qs.parse(b);
			//console.log(post);
			io.sockets.emit('gcodeFromAPI', {'val':post.val});
			//res.writeHead(200, {"Content-Type": "application/json"});
			//res.end(JSON.stringify({'data':'ok'}));
		});
	} else {
  	fileServer.serve(req, res, function (err, result) {
  		if (err) {
  			console.error(chalk.red('ERROR:'), chalk.yellow(' fileServer error:'+req.url+' : '), err.message);
  		}
  	});
  }
}

function ConvChar( str ) {
  c = {'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#039;',
       '#':'&#035;' };
  return str.replace( /[<&>'"#]/g, function(s) { return c[s]; } );
}

var sp = [];
var allPorts = [];

serialport.list(function (err, ports) {

 // if (fs.existsSync('/dev/ttyAMA0')) {
  //		(ports = ports || []).push({comName:'/dev/ttyAMA0',manufacturer: undefined,pnpId: 'raspberryPi__GPIO'});
  //		console.log(chalk.green('INFO:'), chalk.yellow('adding /dev/ttyAMA0 because it is enabled in config.js, you may need to enable it in the os - http://www.hobbytronics.co.uk/raspberry-pi-serial-port'));
  //	}
console.log('inside port list all ports '+ ports);

	allPorts = ports;

console.log("ports[1] "+ports[1].comName);
console.log("ports[0] "+ports[0].comName);

console.log("allports " +allPorts);
	for (var i=0; i<ports.length; i++) {
	(function (i){
 		console.log("inside iife")
		sp[i] = {};
		sp[i].port = ports[i].comName;
    sp[i].manufacturer = ports[i].manufacturer;
    sp[i].firmware = "";
  		
		sp[i].q = [];
		sp[i].qCurrentMax = 0;
		sp[i].lastSerialWrite = [];
		sp[i].lastSerialReadLine = '';
		sp[i].handle = new SerialPort(ports[i].comName, 
                         {
			autoOpen : true,
			parser: serialport.parsers.readline("\n"),
			baudRate: config.serialBaudRate});
console.log("serial port handle "+ sp[i].handle);
	sp[i].sockets = [];
console.log('inside outer fun');

		sp[i].handle.on('open', function() {
 
console.log('inside handle on');	 		
console.log(
				chalk.green('Connecting to'),
				chalk.blue(sp[i].port),
		  	chalk.green('at'),
				chalk.blue(config.serialBaudRate)
			);
			sp[i].handle.write("?\n"); // Lets check if its LasaurGrbl?
			sp[i].handle.write("M115\n"); // Lets check if its Marlin?
			sp[i].handle.write("version\n"); // Lets check if its Smoothieware?
      sp[i].handle.write("$fb\n"); // Lets check if its TinyG

			// line from serial port
			sp[i].handle.on("data", function (data) {
			console.log(ports[i].comName+ " data in handlefor serial read "+ data);

	serialData(data, i);
			});
		});

		sp[i].handle.on('error', function (error) {
			var errMsg = 'Cannot open';
      var errMsg2 = 'Error Input/output';
			if (error.message.slice(0, errMsg.length) === errMsg) {
				console.error(
					chalk.red('ERROR:'), chalk.yellow(' Could not connect to device:'),
					chalk.blue(sp[i].port)
				);
      } else if (error.message.slice(0, errMsg2.length) === errMsg2 ) {
				//console.error(
				//	chalk.red('Skipped:'), // Most likely /dev/ttyS* on ubuntu (;
				//	chalk.blue(sp[i].port),
        //  chalk.green(' - No response from port')
				//);
      } else {
        console.error(
          chalk.red('ERROR:'), chalk.yellow(' SerialPort Failure:'),
          chalk.blue(sp[i].port));
        throw error
			}
		});
console.log(i +"sp val "+sp[i]);

	})(i)
	}

});

function emitToPortSockets(  port, evt, obj) {
	
io.sockets.on('connections', function (socket){
console.log("emit to port "+port + evt + obj);

	//for (var i=0; i<sp[port].sockets.length; i++) {
		//sp[port].sockets[i].emit(evt, obj);

socket.emit(evt, obj)
	})
}

function serialData(data, port) {console.log("inside serial data");
	// new line of data terminated with \n
	//console.log('Port '+port+' got newline from serial: '+data);
  if (data.match(/^\{/)) {

     jsondata = JSON.parse(data);
     //console.log('Got JSON response: ' + jsondata);

      if (jsondata.r) {
           sendFirstQ(port);

           // ok is green
           emitToPortSockets(port, 'serialRead', {c:0,l:data});

           // remove first
           sp[port].lastSerialWrite.shift();
         };
      };



	// Try to determine Firmware in use and set up queryloop
	if (data.indexOf('#') == 0) { // Found LasaurGrbl
		setInterval(function() {
			sp[port].handle.write("?\n"); //for LasaurGrbl
		}, 1000);
		var firmwareVersion = data.split(/(\s+)/);
		var lasaurGrblVersion = firmwareVersion[2]+' '+firmwareVersion[4];
		var firmware = lasaurGrblVersion;
		//	console.log(chalk.green('Firmware Detected:  '+firmware));
    console.log(chalk.green('INFO:'), chalk.yellow(' Found device: '),
      chalk.yellow(sp[port].manufacturer),
      chalk.blue(sp[port].port),
      chalk.yellow('Firmware Detected:'),
      chalk.blue(firmware),
      chalk.yellow('  Port ID No: '),
      chalk.blue(port)
      );
		sp[port].firmware = firmware;
	}

	if (data.indexOf('Grbl') == 0) { // Found Grbl
		setInterval(function() {
			sp[port].handle.write("?\n"); //for Grbl
		}, 1000);
		var firmwareVersion = data.split(/(\s+)/);
		var lasaurGrblVersion = firmwareVersion[0]+' '+firmwareVersion[2];
		var firmware = lasaurGrblVersion;
    console.log(chalk.green('INFO:'), chalk.yellow(' Found device: '),
      chalk.yellow(sp[port].manufacturer),
      chalk.blue(sp[port].port),
      chalk.yellow('Firmware Detected:'),
      chalk.blue(firmware),
      chalk.yellow('  Port ID No: '),
      chalk.blue(port)
      );
		sp[port].firmware = firmware;
	}

	if (data.indexOf('Marlin') != -1) { // Found Marlin
		setInterval(function() {
			sp[port].handle.write("M114\n"); //for Marlin
		}, 1000);
		var firmwareVersion = data.split(/(:+)/);
		var firmware = firmwareVersion[2];
    console.log(chalk.green('INFO:'), chalk.yellow(' Found device: '),
      chalk.yellow(sp[port].manufacturer),
      chalk.blue(sp[port].port),
      chalk.yellow('Firmware Detected:'),
      chalk.blue(firmware),
      chalk.yellow('  Port ID No: '),
      chalk.blue(port)
      );
		sp[port].firmware = firmware;
	}

	if (data.indexOf('Repetier') != -1) { //found Repetier
		//setInterval(function() {
		//	sp[port].handle.write("M114\n"); //for Repetier
		//}, 1000);
    //setInterval(function() {
    //  sp[port].handle.write("M105\n"); //for Repetier
    //}, 1001);

    data = data.replace(/_/g,' ');
		data = data.replace(/:/g,' ');
		var firmwareVersion = data.split(/(\s+)/);
		var firmware = firmwareVersion[4]+' '+firmwareVersion[6];
    console.log(chalk.green('INFO:'), chalk.yellow(' Found device: '),
      chalk.yellow(sp[port].manufacturer),
      chalk.blue(sp[port].port),
      chalk.yellow('Firmware Detected:'),
      chalk.blue(firmware),
      chalk.yellow('  Port ID No: '),
      chalk.blue(port)
      );
		sp[port].firmware = firmware;
	}

	if (data.indexOf('LPC1769') != -1 || data.indexOf('LPC1768') != -1) { //  found a Smoothie or AZSMZ type Board
		setInterval(function() {
			sp[port].handle.write("M114\n"); //for Smoothieware
		}, 1000);
		data = data.replace(/:/g,',');
		var firmwareVersion = data.split(/(,+)/);
		var smoothieVersion = 'Smoothie'+firmwareVersion[14]+''+firmwareVersion[2];
		var firmware = smoothieVersion;
    console.log(chalk.green('INFO:'), chalk.yellow(' Found device: '),
      chalk.yellow(sp[port].manufacturer),
      chalk.blue(sp[port].port),
      chalk.yellow('Firmware Detected:'),
      chalk.blue(firmware),
      chalk.yellow('  Port ID No: '),
      chalk.blue(port)
      );
		sp[port].firmware = firmware;
	}

  if (data.indexOf('firmware build') != -1 ) { //  found a TinyG
		// setInterval(function() {
		// 	sp[port].handle.write("M114\n"); //for Smoothieware
		// }, 1000);
		//data = data.replace(/:/g,',');
    //data = data.replace(/ /g,',');
    data = data.replace( /(?!\s+$)\s+/g, "," );
    //console.log('Data' + data);
		var firmwareVersion = data.split(',');
		var tinyGVersion = 'TinyG '+firmwareVersion[3];
		var firmware = tinyGVersion;
    console.log(chalk.green('INFO:'), chalk.yellow(' Found device: '),
      chalk.yellow(sp[port].manufacturer),
      chalk.blue(sp[port].port),
      chalk.yellow('Firmware Detected:'),
      chalk.blue(firmware),
      chalk.yellow('  Port ID No: '),
      chalk.blue(port)
      );
		sp[port].firmware = firmware;
    // INIT  COMMANDS
    sp[port].handle.write("{sv:2}\n"); //for Smoothieware


	}

	// End of Queryloop

	// handle M105
	if (data.indexOf('ok T:') == 0 || data.indexOf('T:') == 0) {
		emitToPortSockets(port, 'tempStatus', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

	// handle M114 (Marlin)
	if (data.indexOf('X:') == 0 || data.indexOf('ok X:') == 0) {
		emitToPortSockets(port, 'posStatusM', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

	// handle M114 (Smoothie)
	if (data.indexOf('ok C: X:') == 0 || data.indexOf('C: X:') == 0) {
		emitToPortSockets(port, 'posStatusS', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

	// handle ? (LasaurGrbl)  (like M114 but also contains feedback data on chiller, endstops, etc in one line. See http://www.lasersaur.com/manual/gcode
	if (data.indexOf('V') !=-1 && data.indexOf('X') !=-1) {
		emitToPortSockets(port, 'posStatusL', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

  // handle Always On Feedback (TinyG)
  if (data.indexOf('pos') != -1 || data.indexOf('ok pos') != -1) {
    emitToPortSockets(port, 'posStatusT', data);
    sp[port].lastSerialReadLine = data;
    return;
  }

	if (sp[port].firmware) {
		if (sp[port].firmware.indexOf('Lasaur') == 0) {
		       if (data.indexOf('N') !=-1 || data.indexOf('E') !=-1 || data.indexOf('U') !=-1 || data.indexOf('B') !=-1 || data.indexOf('B') !=-1 || data.indexOf('T') !=-1 || data.indexOf('P') !=-1 || data.indexOf('L') !=-1 || data.indexOf('R') !=-1  || data.indexOf('D') !=-1 || data.indexOf('C') !=-1 || data.indexOf('V') !=-1   ) {
			emitToPortSockets(port, 'posStatusL', data);
			sp[port].lastSerialReadLine = data;
			return;
			}
		}
	}

	// Handle Grbl Feedback

	if (data.indexOf('<') == 0) {
		// https://github.com/grbl/grbl/wiki/Configuring-Grbl-v0.8#---current-status

		// remove first <
		var t = data.substr(1);

		// remove last >
		t = t.substr(0,t.length-2);

		// split on , and :
		t = t.split(/,|:/);

		emitToPortSockets(port, 'machineStatus', {'status':t[0], 'mpos':[t[2], t[3], t[4]], 'wpos':[t[6], t[7], t[8]]});

		return;
	}



	// handle Endstop Alarm
	if (data.indexOf('echo:endstops hit:') == 0) {
	emitToPortSockets(port, 'endstopAlarm', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

	// handle unknown GCode
	if (data.indexOf('echo:Unknown command:') == 0) {
	emitToPortSockets(port, 'unknownGcode', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

	if (queuePause == 1) {
		// pause queue
		return;
	}

	data = ConvChar(data);

	if (data.indexOf('ok') == 0 || data.indexOf('{"qr":32}') == 0 || data == "" )  { // data == "" relates to supporting LaserSaur - monitor if it causes bugs on other firmwares.  Refer to https://groups.google.com/forum/#!topic/lasersaur/_6wTYNJgGyI
  console.log('Got OK');
		// run another line from the q
		sendFirstQ(port);

		// ok is green
		emitToPortSockets(port, 'serialRead', {c:0,l:data});

		// remove first
		sp[port].lastSerialWrite.shift();

	} else if (data.indexOf('rs') == 0) { //Marlin
		// handle resend
		// resend last
		sp[port].handle.write(sp[port].lastSerialWrite[-1]);

		console.log(chalk.red('ERROR:'), chalk.yellow(' rs (resend) from printer, resending'));

  } else if (data.indexOf('Resend') == 0) {  // Repetier
 	  // handle resend
		// resend last
    if (sp[port].lastSerialWrite[-1]) {
		    sp[port].handle.write(sp[port].lastSerialWrite[-1]);
        console.log(chalk.red('ERROR:'), chalk.yellow(' (resend) from printer, resending: '), chalk.blue(+sp[port].lastSerialWrite[-1]));
    } else {
        console.log(chalk.red('ERROR:'), chalk.yellow(' (resend) from printer  Queue Empty.  '));
    }
    ;


	} else if (data.indexOf('!!') == 0) {

		// error is red
		emitToPortSockets(port, 'serialRead', {c:1,l:data});

		// remove first
		sp[port].lastSerialWrite.shift();

		console.log(chalk.red('ERROR:'), chalk.yellow(' !! alarm) from machine'));

	} else if (data.indexOf('error') == 0) { //Marlin / Grbl

		// error is red
		emitToPortSockets(port, 'serialRead', {c:1,l:data});
    console.log(chalk.red('ERROR:'), chalk.yellow(' Error from machine:'), chalk.blue(data));
		// run another line from the q

    // Commenting out the "lets continue" based on discussions with firmware devs Sonny Jeon and Arthur Wolf
    /*if (sp[port].q.length > 0) {
			// there are remaining lines in the q
			// write one
			sendFirstQ(port);
		}*/
    sp[port].q = [];
    sp[port].qCurrentMax = 0;
    console.log(chalk.red('Aborted Job - safety first!'));
    emitToPortSockets(port, 'serialRead', {c:1,l:"Aborted Job!  Safety First!"});


  } else if (data.indexOf('Error') == 0) {  //Repetier
    // error is red
    emitToPortSockets(port, 'serialRead', {c:1,l:data});
    console.log(chalk.red('ERROR:'), chalk.yellow(' Error from machine:'), chalk.blue(data));
    // run another line from the q

    // Commenting out the "lets continue" based on discussions with firmware devs Sonny Jeon and Arthur Wolf
    /*if (sp[port].q.length > 0) {
      // there are remaining lines in the q
      // write one
      sendFirstQ(port);
    }*/
    // and instead, flushing the queue:  Safer to stop a machine after an 'error'
    sp[port].q = [];
    sp[port].qCurrentMax = 0;
    console.log(chalk.red('Aborted Job - safety first!'));
    emitToPortSockets(port, 'serialRead', {c:1,l:"Aborted Job!  Safety First!"});

		// remove first
		sp[port].lastSerialWrite.shift();

	} else if (data.indexOf('wait') == 0) {
		// wait is grey
		emitToPortSockets(port, 'serialRead', {c:2,l:data});
	}

  else {
   // other is grey
   emitToPortSockets(port, 'serialRead', {c:2,l:data});
  //  console.log(chalk.yellow('WARN:'),
  //  chalk.gray('Ignored:'), chalk.yellow(' Port'),
   //
  //  chalk.blue(sp[port].port),
  //  chalk.yellow('said: '),
  //  chalk.blue(data));
 }

	if (sp[port].q.length == 0) {
		// reset max once queue is done
		sp[port].qCurrentMax = 0;
	}

	// update q status
	emitToPortSockets(port, 'qStatus', {'currentLength':sp[port].q.length, 'currentMax':sp[port].qCurrentMax});
	sp[port].lastSerialReadLine = data;
}



function sendFirstQ(port) {

console.log("inside sendFisrtQ ");
  console.log('Queue Length: ' + sp[port].q.length);
	if (sp[port].q.length < 1) {
		// nothing to send
		return;
	}
	var t = sp[port].q.shift();

	// remove any comments after the command
	tt = t.split(';');
	t = tt[0];

	// trim it because we create the \n
	t = t.trim();
	if (t == '' || t.indexOf(';') == 0) {
		// this is a comment or blank line, go to next
		sendFirstQ(port);
		return;
	}
	//console.log(chalk.green('sending '+t+' ### '+sp[port].q.length+' current q length'));
	// loop through all registered port clients
	//for (var i=0; i<sp[port].sockets.length; i++) {
	//	sp[port].sockets[i].emit('serialRead', {c:3,l:'SEND: '+t});
  	//}

	io.sockets.on('connections', function(socket){


socket.emit('serialRead', {c:3,1:'SEND: '+t});
})
	sp[port].handle.write(t+"\n");
  console.log('Sent' + t);
  sp[port].lastSerialWrite.push(t);
}

var queuePause = 0;
io.sockets.on('connection', function (socket) {
console.log("inide connection "+allPorts);
	// emit all ports to ui
	socket.emit('ports', allPorts);
console.log("after emit "+allPorts);
 console.log("value of sp" +sp);
  socket.on('firstLoad', function(data) {
   console.log("first slOPts load "+slBaseOpts);
 socket.emit('slOpts', slBaseOpts);
		socket.emit('config', config);
console.log("args "+args);   
 if (args[0]) {
      if (args[0].indexOf('--debug') == 0) {
        socket.emit('firmware', debugfirmware);
        console.log(chalk.yellow('WARN:'), chalk.blue('Forcing debug testing with specific Firmware String: '), chalk.yellow(args[1]));
      };
    };
	});

  // Save Machine Settings to JSON and re-use
	fs.readFile('machines', function(err, cSettings) {
    if (err) {
			console.log('problem reading Machine Profiles, using none');
			cSettings = {machines:[]};
		} else {
			cSettings = JSON.parse(cSettings);
      console.log(cSettings);
console.log(chalk.green('INFO:'), chalk.yellow('Machine Profiles read from file'));
		}
		socket.emit('machinesettings', {exists:-1,machines:cSettings});
  });


  socket.on('savePreset', function(data) {
  		// save presets
  		// format:
  		// {slicerName:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}],slicer2Name:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}]}

  		fs.readFile('machines', function(err, cSettings) {
  			if (err) {
  				console.log('problem reading presets, using none');
  				cSettings = {machines:[]};
  			} else {
  				cSettings = JSON.parse(cSettings);
  			}

  			// check the cPresets[slicer] array to see if this named preset already exists
  			var exists = -1;
  			for (c in cSettings[data.default]) {
  				if (cSettings[data.default][c].name == data.name) {
  					if (data.isNew) {
  						// return error because that already exists
  						socket.emit('serverError', 'that preset name is already used');
  						return;
  					} else {
  						// found a match, update it
  						cSettings[data.default][c].opts = data.opts;
  						exists = c;
  					}
  				}
  			}

  			if (exists == -1) {
  				// add as a new preset
  				cSettings[data.default].push({name:data.name,opts:data.opts});
  				// set for return value of new
  				exists = -2;
  			}

  			fs.writeFile('machines', JSON.stringify(cSettings), function(err) {
  				if (err) {
  					// return error
  					socket.emit('serverError', 'error writing to presets');
  				} else {
  					socket.emit('machinesettings', {exists:exists,machines:cSettings});
  				}
  			});

  		});

  	});

  socket.on('deletePreset', function(data) {
    //console.log('DATA: '+util.inspect(data, {showHidden: false, depth: null}))
  		// delete preset
  		// format:
  		// {slicerName:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}],slicer2Name:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}]}
  	 //console.log('Deleting');
  		fs.readFile('machines', function(err, cSettings) {
  			if (err) {
  				console.log('problem reading presets, using none');
  			} else {
  				cSettings = JSON.parse(cSettings);
          //console.log('CSettings:  '+util.inspect(cSettings[data.default], {showHidden: false, depth: null}));
  			}

  			// check the cPresets[slicer] array to see if this named preset already exists
  			for (c in cSettings[data.default]) {

  				if (cSettings[data.default][c].name == data.name) {
  					// found a match, delete it
            console.log(chalk.yellow('WARN: '), chalk.white('Deleting Machine Profile'), chalk.blue(cSettings[data.default][c].name));
  					cSettings[data.default].splice(c,1);
            socket.emit('machinesettings', {exists:-1,machines:cSettings});
  				}
  			}

  			fs.writeFile('machines', JSON.stringify(cSettings), function(err) {
  				if (err) {
  					// return error
  					socket.emit('serverError', 'error writing to presets');
  				} else {
  					socket.emit('machinesettings', {exists:-1,machines:cSettings});
  				}
  			});

  		});

  	});

	socket.on('doReset', function (data) {
		// soft reset for grbl, send ctrl-x ascii \030
		sp[currentSocketPort[socket.id]].handle.write("\030");
		// reset vars
		sp[currentSocketPort[socket.id]].q = [];
		sp[currentSocketPort[socket.id]].qCurrentMax = 0;
		sp[currentSocketPort[socket.id]].lastSerialWrite = [];
		sp[currentSocketPort[socket.id]].lastSerialRealLine = '';
	});



	socket.on('clearQ', function(data) {
		// clear the command queue
		sp[currentSocketPort[socket.id]].q = [];
		// update the status
		
		emitToPortSockets(currentSocketPort[socket.id],'qStatus', {'currentLength':0, 'currentMax':0});
	});

	socket.on('pause', function(data) {
		// pause queue
		if (data == 1) {
			console.log(chalk.yellow('pausing queue'));
			queuePause = 1;
		} else {
			console.log(chalk.yellow('unpausing queue'));
			queuePause = 0;
			sendFirstQ(currentSocketPort[socket.id]);
		}
	});

	// gcode print
	socket.on('printGcode', function (data) {
    console.log(chalk.yellow('Job Started'));
		if (typeof currentSocketPort[socket.id] != 'undefined') {
			// split newlines
			var nl = data.line.split("\n");
			// add to queue
			sp[currentSocketPort[socket.id]].q = sp[currentSocketPort[socket.id]].q.concat(nl);
			// set qCurrentMax
			sp[currentSocketPort[socket.id]].qCurrentMax = nl.length;
			if (sp[currentSocketPort[socket.id]].q.length == nl.length) {
				// there was no previous q so write a line
				sendFirstQ(currentSocketPort[socket.id]);
			}

		} else {
			socket.emit('serverError', 'you must select a serial port');
		}

	});

	// lines fromweb ui
	socket.on('gcodeLine', function (data) {
    console.log(chalk.yellow('Command Sent from Console: '));
		if (typeof currentSocketPort[socket.id] != 'undefined') {
			// valid serial port, safe to send
			// split newlines
			var nl = data.line.split("\n");
      console.log('Line: '+ nl);
			// add to queue
			sp[currentSocketPort[socket.id]].q = sp[currentSocketPort[socket.id]].q.concat(nl);
			// add to qCurrentMax
			sp[currentSocketPort[socket.id]].qCurrentMax += nl.length;
			if (sp[currentSocketPort[socket.id]].q.length == nl.length) {
				// there was no previous q so write a line
        // Debug for Issue #70 https://github.com/openhardwarecoza/LaserWeb/issues/70

      	sendFirstQ(currentSocketPort[socket.id]);
        console.log(chalk.yellow('first command'));

        if (sp[currentSocketPort[socket.id]].firmware.indexOf('Lasaur') === 0) {
          if (nl[0] === '~' && nl.length > 1) {
            sendFirstQ(currentSocketPort[socket.id]);

          }
        }
			}

		} else {
			socket.emit('serverError', 'you must select a serial port');
		}

	});

	socket.on('disconnect', function() {

		if (typeof currentSocketPort[socket.id] != 'undefined') {
			for (var c=0; c<sp[currentSocketPort[socket.id]].sockets.length; c++) {
				if (sp[currentSocketPort[socket.id]].sockets[c].id == socket.id) {
					// remove old
					sp[currentSocketPort[socket.id]].sockets.splice(c,1);
				}
			}
		}

	});

	socket.on('usePort', function (data) {

		console.log(
      //chalk.yellow('switching from '),
      //chalk.blue(currentSocketPort[socket.id]),
      chalk.green('INFO:'),
      chalk.yellow(' Now interacting with '),
      //chalk.blue(data),
      chalk.blue(sp[data].port),
		  chalk.yellow(' running '),
      chalk.blue(sp[data].firmware)
    );
console.log("socket id "+ socket.id);
console.log(" currentSocketPort[socket.id] " + currentSocketPort[socket.id]);
  	socket.emit('firmware', sp[data].firmware);

		if (typeof currentSocketPort[socket.id] != 'undefined') {
			for (var c=0; c<sp[currentSocketPort[socket.id]].sockets.length; c++) {
				if (sp[currentSocketPort[socket.id]].sockets[c].id == socket.id) {
					// remove old
					sp[currentSocketPort[socket.id]].sockets.splice(c,1);
				}
			}
		}

		if (typeof sp[data] != 'undefined') {
		//var tmp1= socket.id;
	//		console.log("tmp 1 " + tmp1)
			currentSocketPort[socket.id] = data;
//console.log(sp[data].sockets);

			sp[currentSocketPort[socket.id]].sockets.push(socket.id);
			//console.log(sp[currentSocketPort].socket.id)
		} else {
			socket.emit('serverError', 'that serial port does not exist');
		}

	});

  socket.on('updateGit', function(data) {
    console.log(chalk.yellow('\nChecking for Updates'));

    var child = require('child_process').exec('git remote update; git status');
      // use event hooks to provide a callback to execute when data are available:
      child.stdout.on('data', function(data) {
      //console.log(data);
      socket.emit('updateStatus', data);
      console.log(chalk.green('INFO:'), chalk.yellow('Git Refresh'), chalk.blue(data));
    });
  });

  socket.on('upgradeGit', function(data) {
    console.log(chalk.yellow('\nExecuting Updates'));

    var child = require('child_process').exec('git pull');
      // use event hooks to provide a callback to execute when data are available:
      child.stdout.on('data', function(data) {
      //console.log(data);
      socket.emit('updateStatus', data);
      console.log(chalk.green('INFO:'), chalk.yellow('Git Update'), chalk.blue(data));
    });
  });


});
