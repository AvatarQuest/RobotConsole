#! /usr/bin/env node
const SETTINGS_PATH = __dirname + '/settings.json';
const HARDCODED_SETTINGS_PATH = __dirname + '/hardcoded_settings.json';
const RESET_SOCKET_AFTER_MS = 900; //if the ping gets above this, the socket and cameras will reset
var PORT = 3000;
const SUPPORTED_PIXEL_FORMATS = ['JPEG','BGR3','BGR4','BGR','YUYV','GRAY8','NV12','YV12','I420'];

var express = require('express');
const rosnodejs = require('rosnodejs');
const cv = require('opencv4nodejs');
const cp = require('child_process');
var kill = require('tree-kill');
const fs = require('fs');

var app = express();
var server = app.listen(PORT);

var cameraExists = false;
var settingsObject,hardcoded;
var rosready = false;
var nh, rospublishers={}, rossubscribers={};
var socketsOpen = 0;
var camJSON={"presets": [{"width":"320","height":"240","quality":100,"name":"low res"}],"camsettings":[{"preset":0,"name":"pi cam"}]};
var camindex = 0;
app.use(express.static(__dirname + '/public'));
console.log("server running on port "+ PORT);
let cmds = {};
var cps = [];
var mainQuality = 90;
var mainRotation = 0;
var mainBrightness = 0; // -255 255
var mainContrast = 0; // -127 127
var hardcodedLoaded = false;
var resolutionStack = {};
var shutdownFlag = false;

console.log('FINDING ALL VIDEO PATHS...');
let validDevices=[];
let output = cp.execSync('v4l2-ctl --list-devices || true',{shell:true});
output = output.toString().split(/\r?\n/);
let nextIsName = true, namedDevices = {}, lastName = '';
for(let i = 0; i < output.length; i++){
	let r = output[i];
	if(r == ''){
		nextIsName = true;
	}
	else if(nextIsName){
		namedDevices[r] = [];
		lastName = r;
		nextIsName = false;
	}
	else{
		namedDevices[lastName].push(r.replace('\t',''));
	}
}
console.log(namedDevices);
console.log('CHECKING VALIDITY OF V4l2 DEVICES...');
let dkeys = Object.keys(namedDevices);
for(let i = 0; i < dkeys.length; i++){
	let devices = namedDevices[dkeys[i]];
	if(!dkeys[i].includes('bcm2835-codec')){	//make sure camera is real
		for(let d = 0; d < devices.length; d++){
			let output = cp.execSync('v4l2-ctl -d '+devices[d]+' --get-fmt-video || true',{shell:true}).toString().split(/\r?\n/);
			if(!output[0].includes('Invalid Argument')){ //make sure v4l pixel format is valid
				validDevices.push(devices[d]);
				break;
			}
		}
	}
}
console.log('(CONNECTING TO OPENCV) VALID DEVICES',validDevices);
let camArray = [], index = 0;
for(let i = 0; i < validDevices.length; i++){
	camArray[index] = new cv.VideoCapture(validDevices[i]);
	camArray[index].set(cv.CAP_PROP_FRAME_WIDTH,640);
	camArray[index].set(cv.CAP_PROP_FRAME_HEIGHT,480);
	camArray[index].set(cv.CAP_PROP_FPS,25);
	index++;
	console.log('camera found at index '+i);
	cps[index]=0;
	cameraExists = true;
}
console.log('total of ' + camArray.length + ' cameras found');

function requestResolutionSet(c,w,h,f){
	resolutionStack[c]=[w,h,f];
}

var socket = require('socket.io');
var io = socket(server, {pingInterval: 300, pingTimeout: RESET_SOCKET_AFTER_MS});
io.set('origins','*:*');

function joinRosTopics(){
	fs.readFile(SETTINGS_PATH, (err, data) => {
		if (err) throw err;
		let settingsObject;
		try{
			settingsObject = JSON.parse(data);
		}catch(e){console.log(e);}
		if(settingsObject){
			let widgets = settingsObject['widgets'];
			
			//attatch ROS publishers and listeners
			for(let i = 0; i < widgets.length; i++){
				let topic = widgets[i].topic;
				if(topic != '' && topic != '/' && nh){
					console.log(widgets[i].type + ' connecting to   '+widgets[i].topic);
					
					let latch;
					if(widgets[i].latching) latch = widgets[i].latching;
					else latch = false;
					switch(widgets[i].type){
						case '_button':
						case '_checkbox':
							rospublishers[topic] = nh.advertise(topic, 'std_msgs/Bool',{latching:latch});
						break;
						case '_joystick':
							rospublishers[topic] = nh.advertise(topic, 'geometry_msgs/Vector3');
						break;
						case '_slider':
							rospublishers[topic] = nh.advertise(topic, 'std_msgs/Float64',{latching:latch});
						break;
						case '_inputbox':
							let msgType = widgets[i]['msgType'];
							if(msgType == undefined) msgType = 'std_msgs/String';
							if(rospublishers[topic]) rospublishers[topic].shutdown();
							rospublishers[topic] = nh.advertise(topic, msgType);
						break;
						case '_logger':
						case '_value':
							if(widgets[i]['msgType'] == undefined) widgets[i]['msgType'] = 'std_msgs/String';
							if(rossubscribers[topic]) rossubscribers[topic].shutdown();
							rossubscribers[topic] = nh.subscribe(topic, widgets[i]['msgType'], (msg) => {
								io.emit('telem',{topic:topic,id:i,msg:msg});
							});
						break;
						case '_compass':
							if(widgets[i]['msgType'] == undefined) widgets[i]['msgType'] = 'std_msgs/Int16';
							if(rossubscribers[topic]) rossubscribers[topic].shutdown();
							rossubscribers[topic] = nh.subscribe(topic, widgets[i]['msgType'], (msg) => {
								io.emit('telem',{topic:topic,id:i,msg:msg});
								console.log(msg);
							});
						break;
						case '_horizon':
							if(widgets[i]['msgType'] == undefined) widgets[i]['msgType'] = 'std_msgs/Float64Array';
							if(rossubscribers[topic]) rossubscribers[topic].shutdown();
							rossubscribers[topic] = nh.subscribe(topic, widgets[i]['msgType'], (msg) => {
								io.emit('telem',{topic:topic,id:i,msg:msg.data});
							});
						break;
						case '_rosImage':
							if(rossubscribers[topic]) rossubscribers[topic].shutdown();
							rossubscribers[topic] = nh.subscribe(topic, 'sensor_msgs/CompressedImage', (msg) => {
								io.emit('telem',{topic:topic,id:i,msg:msg.data});
							});
						break;
						case '_light':
							if(rossubscribers[topic]) rossubscribers[topic].shutdown();
							rossubscribers[topic] = nh.subscribe(topic, 'std_msgs/Bool', (msg) => {
								io.emit('telem',{topic:topic,id:i,msg:msg});
							});
						break;
						case '_audio':
							if(rossubscribers[topic]) rossubscribers[topic].shutdown();
							rossubscribers[topic] = nh.subscribe(topic, 'std_msgs/Int16', (msg) => {
								io.emit('telem',{topic:topic,id:i,msg:msg});
							});
						break;
						case '_gauge':
							if(widgets[i]['msgType'] == undefined) widgets[i]['msgType'] = 'std_msgs/Float64';
							if(rossubscribers[topic]) rossubscribers[topic].shutdown();
							rossubscribers[topic] = nh.subscribe(topic, widgets[i]['msgType'], (msg) => {
								io.emit('telem',{topic:topic,id:i,msg:msg});
							});
						break;
					}
				}
			}
			rosready = true;
		}
	});
}
  
rosnodejs.initNode('/webserver').then(() => {
	nh = rosnodejs.nh;
	joinRosTopics();
}).catch((e) => {
	console.log('Error connecting to ROS: ' + e);
});


io.sockets.on('connection', function(socket){
	socketsOpen++;
	io.emit('instanceCount',socketsOpen);
    console.log('made connection');
  
  //get settings from json and send to client
  fs.readFile(SETTINGS_PATH, (err, data) => {
    if (err) throw err;
    settingsObject = JSON.parse(data);
    camJSON = settingsObject.config.cams;
    socket.emit('settings',settingsObject);
    //set initial resolutions for cameras
    if(cameraExists){
		for(let i = 0; i < Math.min(camArray.length,camJSON.camsettings.length); i++){
			requestResolutionSet(i,parseInt(camSettings(camJSON,i).width),parseInt(camSettings(camJSON,i).height),parseInt(camSettings(camJSON,i).fps));
			cps[i] = camJSON.camsettings[i].preset;
			if(camJSON.camsettings[i].rotation == undefined) camJSON.camsettings[i].rotation = 0;
			if(camJSON.camsettings[i].contrast == undefined) camJSON.camsettings[i].contrast = 0;
			if(camJSON.camsettings[i].brightness == undefined) camJSON.camsettings[i].brightness = 0;
		}
		mainQuality = parseInt(camSettings(camJSON,camindex).quality);
		mainRotation = parseInt(camJSON.camsettings[camindex].rotation);
		mainContrast = parseInt(camJSON.camsettings[camindex].contrast);
		mainBrightness = parseInt(camJSON.camsettings[camindex].brightness);
    	console.log('main quality is ' + mainQuality);
    	socket.emit('makeThumbs',camArray.length,camindex,cps);
	}else{
		socket.emit('makeThumbs');
	}
    
    io.emit('cmdStopButtons',Object.keys(cmds));
    console.log('number of widgets: ' + settingsObject.widgets.length);
  });
  //get settings from json and send to client
  fs.readFile(HARDCODED_SETTINGS_PATH, (err, data) => {
    if (err) throw err;
    hardcoded = JSON.parse(data);
    console.log(JSON.stringify(hardcoded));
    socket.emit('hardcoded_settings',hardcoded);
    hardcodedLoaded=true;
  });

  //widgets client to server
  socket.on('WCTS', function(data){
    try{
		if(settingsObject.config.saveWidgets){
			settingsObject['widgets'] = data;
			joinRosTopics();
			fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settingsObject));
			console.log('recieved updated widget settings from client');
		}
    }
    catch(e){
      console.log(e);
    }
  });
  //config settings client to server
  socket.on('configSettings', function(data){
	if(data){
	    try{
	      settingsObject['config'] = data;
	      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settingsObject));
		  console.log('recieved updated config settings from client');
		  //do stuff with your new settings here (camera resolution, running cmds etc.)
		  if(cameraExists){
			  camJSON = data.cams;
			  for(let i = 0; i < camArray.length; i++){
				requestResolutionSet(i,parseInt(camSettings(camJSON,i).width),parseInt(camSettings(camJSON,i).height),parseInt(camSettings(camJSON,i).fps));
				cps[i] = camJSON.camsettings[i].preset;
			  }
		  }
	    }
	    catch(e){
	      console.log(e);
	    }
	}
  });
  //start a child process
  socket.on('cmd', function(data){
	if(hardcodedLoaded && hardcoded.show_terminal){
		cmds[data] = cp.spawn(data,[],{shell:true});
		cmds[data].stdout.on('data', stdout => {
			socket.emit('cmdOut',stdout.toString());
			console.log(stdout.toString());
		});
		cmds[data].stderr.on('data', stderr => {
			socket.emit('cmdOut',stderr.toString());
			console.log(stderr.toString());
		});
		cmds[data].on('close', code => {
			socket.emit('cmdOut','exit code: '+code+'\n');
			socket.emit('removeCmd',data);
			console.log(code);
			if(cmds[data]) delete cmds[data];
		});
	}else{
		console.log('terminal has been disabled');
	}
  });
  socket.on('stopcmd', function(data){
	  if(hardcodedLoaded && hardcoded.show_terminal && cmds[data]){
		console.log('stopping '+data);
		kill(cmds[data].pid);
		delete cmds[data];
	  }
	});
  socket.on('exit', function(data){
	  console.log('closing server...');
	  if(cameraExists) shutdownFlag = true;
	  else process.exit(1);
	});
  
  //ROS client to server
  socket.on('ROSCTS', function(data){
	    var topic = data.topic;
	    switch(data.type){
			case '_button':
			case '_checkbox':
				if(rospublishers[topic]) rospublishers[topic].publish({ data:data.pressed});
			break;
			case '_inputbox':
			case '_slider':
				if(rospublishers[topic]) rospublishers[topic].publish({ data:data.value});
			break;
			case '_joystick':
				if(rospublishers[topic]) rospublishers[topic].publish({x:data.x,y:data.y,z:0});
			break;
		}
	    console.log('Publish Ros ' + JSON.stringify(data));
  });
  //remove all subscribers/publishers from topic
  socket.on('shutROS', function(data){
	  if(rossubscribers[data]) rossubscribers[data].shutdown();
	  if(rospublishers[data]) rospublishers[data].shutdown();
  });
  //change resolution of camera. c is camera, v is preset value (index)
  socket.on('setPreset', function(data){
	if(cameraExists){
		console.log(data.c,data.v);
		console.log(camJSON.presets[data.v].name);
		if(camArray[data.c]){
			requestResolutionSet(data.c,parseInt(camJSON.presets[data.v].width),parseInt(camJSON.presets[data.v].height),parseInt(camJSON.presets[data.v].fps));
			cps[data.c] = data.v;
			if(data.c == camindex){
				mainQuality = parseInt(camJSON.presets[data.v].quality);
				mainRotation = parseInt(camJSON.camsettings[data.c].rotation);
				mainContrast = parseInt(camJSON.camsettings[data.c].contrast);
				mainBrightness = parseInt(camJSON.camsettings[data.c].brightness);
			}
		}
	}
  });
  socket.on('setCam', function(data){
	if(cameraExists){
		camindex = data;
		mainQuality = parseInt(camJSON.presets[cps[data]].quality);
		mainRotation = parseInt(camJSON.camsettings[data].rotation);
		mainContrast = parseInt(camJSON.camsettings[data].contrast);
		mainBrightness = parseInt(camJSON.camsettings[data].brightness);
		rotation = mainRotation;
		contrast = mainContrast;
		brightness = mainBrightness;
		console.log(`Change Camera to ${data} rotation ${mainRotation} contrast ${mainContrast} brightness ${mainBrightness}`);
	}
  });
  socket.on('closeOtherSockets', function(data){
    socket.broadcast.emit('closeSocket','');
  });
  socket.on('disconnect', function(data){
	socket.disconnect();
    socketsOpen--;
    io.emit('instanceCount',socketsOpen);
  });
});


//cams is the entire cam json from config
//cam index is the camera number in the camArray
function camSettings(cams, camindex){
	return cams.presets[cams.camsettings[camindex].preset];
}

let oldtime = 0;
let rotation = mainRotation;
let contrast = mainContrast;
let brightness = mainBrightness;
let retrieveCam = function(){
	time = new Date().getTime();
	let c = camindex;
	camArray[c].readAsync().then(function(result){
		if(!result.empty){
			if(rotation != 0) result = result.rotate(rotation-1);
			
			let shadow = 0, highlight = 0, alpha_b = 0, gamma_b = 0,alpha_c = 0, gamma_c = 0, buf;
			if(brightness != 0){
				if(brightness > 0){
					shadow = brightness;
					highlight = 255;
				}
				else{
					shadow = 0;
					highlight = 255 + brightness;
				}
				alpha_b = (highlight - shadow) / 255;
				gamma_b = shadow;
				
				buf = result.addWeighted(alpha_b,result,0,gamma_b);
			}
			else{
				buf = result.copy();
			}
			if(contrast != 0){
				let f = (131 * (contrast + 127)) / (127 * (131 - contrast));
				alpha_c = f;
				gamma_c = 127*(1-f);
				
				buf = buf.addWeighted(alpha_c, buf, 0, gamma_c);
			}
			
			result = buf;
			
			cv.imencodeAsync('.jpg',result,[cv.IMWRITE_JPEG_QUALITY,mainQuality]).then(function(result){
				io.emit('image',result.toString('base64'));
			}).catch((e)=>{console.log(e)});
		}
		
		//update resolutions
		let keys = Object.keys(resolutionStack);
		if(keys.length > 0){
			rotation = mainRotation;
			contrast = mainContrast;
			brightness = mainBrightness;
			for(let i = 0; i < keys.length; i++){
				camArray[keys[i]].set(cv.CAP_PROP_FRAME_WIDTH,resolutionStack[keys[i]][0]);
				camArray[keys[i]].set(cv.CAP_PROP_FRAME_HEIGHT,resolutionStack[keys[i]][1]);
				camArray[keys[i]].set(cv.CAP_PROP_FPS,resolutionStack[keys[i]][2]);
			}
			resolutionStack = {};
		}
		
		if(shutdownFlag){
			releaseCameras();
			process.exit(1);
		}
		setTimeout(retrieveCam,0);
		
	}).catch((e)=>{console.log("can't read camera " + e);});
	io.emit('fps',1000/(time-oldtime));
	oldtime = time;
}
if(cameraExists) setTimeout(retrieveCam,0);

function releaseCameras(){
	for(let i = 0; i < camArray.length; i++){
		camArray[i].release();
		camArray[i].read();
		console.log('released cam',i);
	}
}

process.on('SIGINT',()=>{
	releaseCameras();
});

