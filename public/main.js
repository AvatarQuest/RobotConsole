var editing = false;//this is true when you drag elements
var fullScreen=false;
var mask = document.getElementById('mask');
var configWindow = document.getElementById('configWindow');
var terminal = document.getElementById('terminal');
var configIsOpen = false,elementOpenInConfig, terminalIsOpen = false;
var driveMode = false, widgetHolderOpen = true;
var currentID, currentIndex;
var widgetArray = [],configSettings;
var snapWidgets = false;
var socket, connected = false;
var loadedElements = false;//flag to check if elements have been constructed from json sent from server
var madeThumbs = false;
var readGamepadInterval,currentGamepad,oldGamepad,lastChangedAxis;
var thisScreen = 1;
var keys = {};
var oldKeys = {};
var time = new Date();
var lastwidth = 0;
let sounds = ['bells.mp3','warning.mp3','message.mp3','info.mp3','xylo.mp3'];//change only this to add or remove sounds
const THUMBWIDTH = 150;
let mainImage = document.getElementById('mainImage');
let gamepadCount = 0;
//use same IP to connect to socket server as to connect to express
socket = io(window.location.hostname + ':' + window.location.port);

//get all config from server
socket.on('connection',function(){
	console.log('connect');
});
socket.on('settings',function(data){
	let p = document.getElementsByClassName('pbutton');
	for(let i = 0; i < p.length; i++) p[i].remove();
	if(!loadedElements){
		socket.emit('setScreen1');
		console.log(data);
		configSettings = data['config'];
		widgetArray = data['widgets'];
		let allDynamicElements = document.getElementsByClassName('panel dragable');
		for(let i = allDynamicElements.length-1; i>=0; i--){
			allDynamicElements[i].remove();
		}
		document.getElementById('consoleName').innerText = data.config['consoleName'];
		document.getElementById('title').innerText = data.config['consoleName'];
		body.style.backgroundColor = data.config.background;
		snapWidgets = data.config.snaptogrid;
		updateIndexMap();
		for (let a of widgetArray){
			//generate HTML element for each widget
			if(a.screen == thisScreen) widgetFromJson(a);
		}
		if(!data.config['loadInEditMode']) toggleDriveMode();
		else showWidgetHolder();
		
		loadedElements = true;
		connected = true;
		for(let i=0;i<configSettings.macros.length;i++) addMacro(configSettings.macros[i].name,configSettings.macros[i].cmd);
	}else{
		console.log('already loaded elements');
	}
	hideMessage();
});
socket.on('hardcoded_settings',function(data){
	if(data.show_terminal) document.getElementById('termButton').style.display = 'inline';
	if(data.show_config_settings) document.getElementById('confButton').style.display = 'inline';
	if(data.allow_edit_mode) document.getElementById('driveMode').style.display = 'inline';
});

//on video feed recieve
socket.on('image',function(data){mainImage.src=`data:image/jpeg;base64,${data}`;});
function refreshSelectPresets(){
	let selects = document.getElementsByClassName('cam_presets');
	for(let i = 0; i < selects.length; i++){
		let g = selects[i].value || 0;
		selects[i].innerHTML = '';
		for(let k = 0; k < configSettings.cams.presets.length; k++){
			selects[i].innerHTML += '<option value="'+k+'">'+configSettings.cams.presets[k].name+'</option>';
		}
		if(g < configSettings.cams.presets.length) selects[i].value = g;
		else selects[i].value = 0;
	}
}
function addMacro(name,cmd){
	if(name != undefined && name && cmd != undefined && cmd){
		let html = '<button class="macroButton"onmouseup="runMacro(\''+cmd+'\')">'+name+'</button>';
		document.getElementById('macroHolder').insertAdjacentHTML('beforeend', html);
	}
}
function runMacro(cmd){
	console.log('macro '+cmd);
	document.getElementById('cmdValue').value = cmd;
	runCmdFromInput();
}
//data is how many cameras, ind is current camera selected, cps is presets for each camera
socket.on('makeThumbs',function(data,ind,cps){
	if(data || ind || cps){
		if(madeThumbs){
			let all = document.getElementsByClassName('imageTile');
			for(let i = all.length-1; i >= 0; i--) all[i].remove();
			madeThumbs = false;
		}
		//use camSelect(number 0-max cams) to switch the camera
		let tiles = document.getElementsByClassName('imageTile');
		for(let i = 0; i < tiles.length; i++) tiles[i].remove();
		for(let i = 0; i < data; i++){
			let code = '<div style="border-color:'+(i==ind?'yellow':'#000')+'"onclick="camSelect('+i+');"class="imageTile">'+
			'<select id="camsel"style="margin-right:5px;"class="cam_presets"onchange="changePreset('+i+',this)"></select>'+
			'<h3 class="cam_names"style="padding:0px;display:inline">cam</h3>'+
			'</div>';
			body.insertAdjacentHTML('beforeend',code);
		}
		setTimeout(()=>{repositionThumbs()},600);//wait a bit so the main image can load in
		madeThumbs = true;
		refreshSelectPresets();
		let selects = document.getElementsByClassName('cam_presets');
		let camnames = document.getElementsByClassName('cam_names');
		for(let i = 0; i < selects.length; i++){
			if(configSettings.cams.camsettings[i]){
				selects[i].value=parseInt(cps[i]);
				camnames[i].innerText=configSettings.cams.camsettings[i].name;
			}else{
				selects[i].value=0;
				camnames[i].innerText='new';
			}
		}
	}
});
function changePreset(cam,me){
	socket.emit('setPreset',{c:cam,v:me.value});
}
socket.on('telem',function(data){
	for(let i = widgetArray.length-1; i >= 0; i--){
		if(widgetArray[i].topic == data.topic){
			let c = widgetArray[i];
			let we = document.getElementById(c.id);
			switch(c.type){
				case '_value':
					we.querySelector('#text_ap').innerText = c.prefix + formatNumber(data.msg.data,c) + c.postfix;
				break;
				case '_gauge':
					drawGauge(we.querySelector('#gauge_ap'),data.msg.data,c);
				break;
				case '_compass':
					we.querySelector('#yaw_ap').style.transform = 'rotateZ('+(data.msg.data*-1)+'deg)';
				break;
				case '_horizon':
					let pt = we.querySelector('#pitch_ap');
					let pitch = Math.min(parseFloat(pt.width),parseFloat(pt.height));
					we.querySelector('#roll_ap').style.transform='rotateZ('+(data.msg[0]*-1)+'deg)';
					we.querySelector('#bkg_ap').style.transform='rotateZ('+(data.msg[0]*-1)+'deg)';
					if(data.msg[1] > 30) data.msg[1] = 30;
					if(data.msg[1] < -30) data.msg[1] = -30;
					pt.style.transform='rotateZ('+(data.msg[0]*-1)+'deg) translateY('+(pitch*0.0067 * data.msg[1])+'px)';
				break;
				case '_rosImage':
					var blob = new Blob([new Uint8Array(data.msg)],{type:"image/jpeg"});
					var urlCreator = window.URL || window.webkitURL;
					var imageURL = urlCreator.createObjectURL(blob);
					we.querySelector('#img_ap').src=imageURL;
				break;
				case '_logger':
					let ele = we.querySelector('#textarea_ap');
					ele.value += data.msg.data;
					ele.scrollTop = ele.scrollHeight;
				break;
				case '_light':
					we.querySelector('#color_ap').style.backgroundColor = data.msg.data?c.textColor:c.textColor2;
					we.querySelector('#text_ap').innerText = data.msg.data?c.text:c.text2;
				case '_audio':
					playSound(data.msg.data);
				break;
			}
		}
  }
});
socket.on('fps',(fps)=>{
	document.getElementById('fps').innerText = 'FPS: '+parseInt(fps);
});
socket.on('instanceCount',function(data){
	if(document.getElementById('instanceCount')) document.getElementById('instanceCount').innerText = 'clients: ' + data;
});
socket.on('pong',function(ms){
	document.getElementById('ping').innerText = 'ping '+('000'+ms).slice(-4)+'ms';
	if(mainImage.width != lastwidth){
		repositionThumbs();
	}
	lastwidth = mainImage.width;
});
socket.on('closeSocket',function(data){
	connected = false;
	showMessage('Socket was closed. Reload page to reopen');
	console.log('manual disconnect');
	socket.disconnect(true);
});
function closeOtherSockets(){
	socket.emit('closeOtherSockets');
}
//initalize all graphical Widgets in source bar
var canvas = document.getElementById('_joystick').querySelector('#canvas_ap');
initJoystick(canvas, true);
drawJoystick(canvas,0,0);

canvas = document.getElementById('_gauge').querySelector('#gauge_ap');
drawGauge(canvas,0);

//initalize javascript for all source elements:
var tempList = document.getElementsByClassName('source');
for (let a of tempList) {
  sourceElement(a);
}

//initalize javascript for all dragable elements:
initWidgetElements();

function initWidgetElements(){
  let tempList = document.getElementsByClassName('dragable');
  for (let a of tempList) {
    dragElement(a);
  }
}


//WIDGET BOX INTERACTION
function mouseEnterWidget(ele){
	ele.style.zIndex = 100;
}
function mouseLeaveWidget(ele){
	ele.style.zIndex = 10;
}

function dragElement(elmnt) {
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  var pos1S = 0, pos2S = 0, pos3S = 0, pos4S = 0;
  let WA;
  //use header as draggable hold if it exists, otherwise just use the whole div
  if (elmnt.querySelector("#header")) elmnt.querySelector("#header").onmousedown = dragMouseDown;
  if (elmnt.querySelector("#resize")) elmnt.querySelector("#resize").onmousedown = scaleMouseDown;
  // elmnt.onmousedown = dragMouseDown;
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    editing = true;
    WA = widgetArray[indexMap[elmnt.id]];
    
	get4position(elmnt);
	useSide(elmnt,true,true);
	set4style(elmnt);
    
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    
    if(elmnt.offsetTop - pos2 < 50) elmnt.style.top = '50px';
    else elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
	
	if(WA.childids) for(let i = 0; i < WA.childids.length; i++){
		let c = document.getElementById(WA.childids[i]);
		get4position(c);
		useSide(c,true,true);
		set4style(c);
		c.style.left = (parseInt(c.style.left) - pos1) + 'px';
		c.style.top = (parseInt(c.style.top) - pos2) + 'px';
	}
	
	pos3 = e.clientX;
    pos4 = e.clientY;
  }
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    editing = false;
    if(parseInt(elmnt.style.left,10) < 245 && widgetHolderOpen){
      removeWidgetFromScreen(elmnt);
    }
    else{
		elmnt.style.left = snapX(parseInt(elmnt.style.left)) + 'px';
		elmnt.style.top = snapY(parseInt(elmnt.style.top)) + 'px';
		
		if(WA.childids) for(let i = 0; i < WA.childids.length; i++){
			let c = document.getElementById(WA.childids[i]);
			c.style.left = snapX(parseInt(c.style.left) - pos1) + 'px';
			c.style.top = snapY(parseInt(c.style.top) - pos2) + 'px';
		}
		
		moveWidget({id:elmnt.id,x:elmnt.style.left,y:elmnt.style.top});
		get4position(elmnt);
		useClosest(elmnt);
		set4style(elmnt);
		updatePanels(elmnt);
    }
    sendWidgetsArray();
  }
  
  function scaleMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    
    WA = widgetArray[indexMap[elmnt.id]];
    pos3S = e.clientX-parseInt(elmnt.style.width);
    pos4S = e.clientY-parseInt(elmnt.style.height);
    
    get4position(elmnt);
	useSide(elmnt,true,true);
	set4style(elmnt);
	
    document.onmouseup = closeScaleElement;
    document.onmousemove = elementScale;
  }
  function elementScale(e) {
    e = e || window.event;
    e.preventDefault();
    pos1S = pos3S - e.clientX;
    pos2S = pos4S - e.clientY;
    
    if(pos1S > -76) pos1S = -76;
    if(pos2S > -61) pos2S = -61;
    
    let newHeight = snapY(-pos2S) + "px";
    let newWidth = snapX(-pos1S) + "px";
    
    if(elmnt.querySelector('#canvas_ap')){
      var canvas = elmnt.querySelector('#canvas_ap');
      canvas.height = -pos2S-20;
      canvas.width = -pos1S;
      canvas.dispatchEvent(redrawEvent);
    }else if(elmnt.querySelector('#gauge_ap')){
      var canvas = elmnt.querySelector('#gauge_ap');
      canvas.height = -pos2S-20;
      canvas.width = -pos1S;
      drawGauge(canvas);
    }
    else if(elmnt.querySelector('#slider_ap')){
      var slider = elmnt.querySelector('#slider_ap');
      if(slider.className.includes('vertical')){
		  slider.style.width = (-pos2S-27) + 'px';
		  newWidth = '35px';
	  }
	  else{
		  newHeight = '49px';
	  }
    }
    else if(elmnt.querySelector('.fsImage')){
      var eleclass = elmnt.querySelectorAll('.fsImage');
      for(let i = 0; i < eleclass.length; i++){
		if(-pos2S-20 > -pos1S){
			eleclass[i].style.width = '100%';
			eleclass[i].style.height = '';
		}else{
			eleclass[i].style.height = 'calc(100% - 20px)';
			eleclass[i].style.width = '';
		}
	  }
    }
    
    elmnt.style.height = newHeight;
    elmnt.style.width = newWidth;
  }
  function closeScaleElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    resizeWidget({id:elmnt.id,x:elmnt.style.width,y:elmnt.style.height});
    get4position(elmnt);
	useClosest(elmnt);
	set4style(elmnt);
	updatePanels(elmnt);
	sendWidgetsArray();
  }
}
function removeWidgetFromScreen(elmnt){
	let deleteList = [];
	let WA = widgetArray[indexMap[elmnt.id]];
	socket.emit('shutROS',WA.topic);
	if(WA.type == '_box' && WA.childids){
		deleteList = WA.childids;
	}
	elmnt.remove();
	deleteWidget(elmnt.id);
	deleteFromPanel(elmnt.id);
	
	for(let i = 0;i < deleteList.length; i++){
		elmnt = document.getElementById(deleteList[i]);
		let WA = widgetArray[indexMap[elmnt.id]];
		socket.emit('shutROS',WA.topic);
		elmnt.remove();
		deleteWidget(elmnt.id);
		deleteFromPanel(elmnt.id);
	}
}
//turn element into source:
//the _type convention is used to determime
//what dragable item to create
function sourceElement(elmnt) {
  var newElement;
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  //use header as draggable hold if it exists, otherwise just use the whole div
  //if (elmnt.querySelector("#header")) elmnt.querySelector("#header").onmousedown = dragMouseDown;
  //else elmnt.onmousedown = dragMouseDown;
  elmnt.onmousedown = dragMouseDown;
  function dragMouseDown(e) {
    newElement = widgetFromId(elmnt.id);
    e = e || window.event;
    e.preventDefault();
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    var scroll = document.getElementById('widgetHolder').scrollTop;
    newElement.style.top = (elmnt.offsetTop-scroll-pos2+50) + "px";
    newElement.style.left = (elmnt.offsetLeft - pos1) + "px";
    editing = true;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    if(newElement.offsetTop - pos2 < 50) newElement.style.top = '50px';
    else newElement.style.top = (newElement.offsetTop - pos2) + "px";
    newElement.style.left = (newElement.offsetLeft - pos1) + "px";
  }
  function closeDragElement(e) {
    //delete element if it's over the widget bar
    document.onmouseup = null;
    document.onmousemove = null;
    if(parseInt(newElement.style.left,10) < 245 && widgetHolderOpen){
		newElement.remove();
		editing = false;
	}
    else{
      //generate json, and give widget id
      //it should be noted that elmnt.id is the type, the actual id is assigned by makeUnique()
      addWidget(makeUnique(elmnt.id,newElement));
      editing = false;
      newElement.style.left = snapX(parseInt(newElement.style.left)) + 'px';
      newElement.style.top = snapY(parseInt(newElement.style.top)) + 'px';
      get4position(newElement);
      useClosest(newElement);
      set4style(newElement);
      
      updatePanels(newElement);
    }
    sendWidgetsArray();
  }
}
//returns closest grid value
function snapX(v){
	if(snapWidgets) return Math.round(v/17.5)*17.5;
	return v;
}
function snapY(v){
	if(snapWidgets) return Math.round(v/17.5)*17.5;
	return v;
}
//elmnt is the widget your finished dragging or scaling
function updatePanels(elmnt){
	let index = indexMap[elmnt.id];
	let b = widgetArray[index];
	for(let i = 0; i < widgetArray.length; i++){
		if(widgetArray[i].type == '_box' && i != index){//if widget is a panel
			//add/remove widgets from panels
			let a = widgetArray[i];
			if(overlaps(a.left,a.top,a.w,a.h,  b.left,b.top,b.w,b.h)){
				if(!a.childids) a.childids = [];
				if(!a.childids.includes(elmnt.id)) a.childids.push(elmnt.id);
				
				get4position(elmnt);
				useSide(elmnt,a.useLeft,a.useTop);
				set4style(elmnt);
				
				break;
			}else{
				if(a.childids && a.childids.includes(elmnt.id)){
					a.childids.splice(a.childids.indexOf(elmnt.id),1);
				}
			}
		}
		else{
			if(i == index){
				let a = widgetArray[i];
				if(a.childids) for(let k = 0; k < a.childids.length; k++){
					let c = document.getElementById(a.childids[k]);
					get4position(c);
					useSide(c,a.useLeft,a.useTop);
					set4style(c);
				}
			}
		}
	}
}
function deleteFromPanel(elmntid){
	let index = indexMap[elmntid];
	let b = widgetArray[index];
	for(let i = 0; i < widgetArray.length; i++){
	if(widgetArray[i].type == '_box' && i != index){
		let a = widgetArray[i];
			if(a.childids && a.childids.includes(elmntid)){
				a.childids.splice(a.childids.indexOf(elmntid),1);
			}
		}
	}
}
//from topleft overlap check rectangle
function overlaps(x,y,w,h,  x2,y2,w2,h2){
	x=parseInt(x);
	x2=parseInt(x2);
	y=parseInt(y);
	y2=parseInt(y2);
	w=parseInt(w);
	w2=parseInt(w2);
	h=parseInt(h);
	h2=parseInt(h2);
	if(x+w>x2 && x<x2+w2   &&    y+h>y2 && y<y2+h2) return true;
	return false;
}

//ONBOARD TERMINAL
const outputele = document.getElementById('cmdOutput');
socket.on('cmdOut',function(data){
	outputele.value = outputele.value + data;
	outputele.scrollTop = outputele.scrollHeight;
});
socket.on('removeCmd',function(data){
	let p = document.getElementsByClassName('pbutton');
	for(let i = 0; i < p.length; i++){
		if(p[i].value == data) p[i].remove();
	}
});
function openTerminal(){
	terminalIsOpen = true;
	mask.style.display = 'inline';
	terminal.style.display = 'inline';
}
function closeTerminal(){
	terminalIsOpen = false;
	mask.style.display = 'none';
	terminal.style.display = 'none';
}
function runCmdFromInput(){
	let v = document.getElementById('cmdValue').value;
	if(v){
		socket.emit('cmd',v);
		createStopButton(v);
		document.getElementById('cmdValue').placeholder = document.getElementById('cmdValue').value;
		document.getElementById('cmdValue').value = '';
	}
}
function clearTerminal(){
	document.getElementById('cmdOutput').value = '';
	document.getElementById('cmdValue').placeholder = '';
}
function createStopButton(name){
	let code = 
	'<button class="pbutton"style="width:90%;height:40px;display:block;margin-left:5%;margin-top:5px;"onclick="stopCmd(this)"value="'+name+'">'+
	name+'</button>';
	document.getElementById('processes').insertAdjacentHTML('beforeend',code);
}
function stopCmd(e){
	if(e.value) socket.emit('stopcmd',e.value);
	e.remove();
}
socket.on('cmdStopButtons',function(data){
	console.log('creating buttons');
	for(let i = 0; i < data.length; i++){
		createStopButton(data[i]);
	}
});

//WIDGET CONFIGURATION PANEL
//open configuration settings panel for each widget
function openConfig(e){
  //load field values with JSON settingss
  elementOpenInConfig = e.parentElement.parentElement;
  currentID = e.parentElement.parentElement.id;
  currentIndex = indexMap[currentID];
  let WCI = widgetArray[currentIndex];
  lastChangedAxis = -1;
  lastChangedButton = -1;
  var type = WCI.type;
  //pull generic data from widget array into the settings
  //non ros elements are exempt
  let topicInput = document.getElementById('topicTitle');
  if(WCI.useROS) {
	  topicInput.style.display = 'inline-block';
	  document.getElementById('topiclabel').style.display = 'block';
  }
  else{
	  topicInput.style.display = 'none';
	  document.getElementById('topiclabel').style.display = 'none';
  }
  topicInput.value = WCI['topic'];
  //delete all the auto generated elements
  var paras = document.getElementsByClassName('specific')
  while(paras[0]) paras[0].parentNode.removeChild(paras[0]);
  switch(type){
    case '_button':
      createconfigInput('Button Label', '_button-labelText', WCI['label']);
      createText('std_msgs/Bool');
      createText('Copy and paste icons: ⬆️➡️⬇️⬅️️ ');
      createLittleInput('Font Size (px)', 'fontsize', WCI['fontsize'],16);
      createconfiglinkGamepadButton(WCI);
      createconfiglinkKeys(WCI);
    break;
    case '_joystick':
	  createText('geometry_msgs/Vector3');
      createconfiglinkGamepadAxis(WCI);
      createconfiglinkKeys(WCI,['up','left','down','right']);
    break;
    case '_checkbox':
      createconfigInput('Label', 'label', WCI['label']);
      createText('std_msgs/Bool');
      createCheckbox('Initial State', 'initialState', WCI['initial']);
      createCheckbox('ROS Latching', 'latching', WCI['latching']);
      createconfiglinkGamepadButton(WCI);
      createconfiglinkKeys(WCI,['hotkey']);
      createColorSelect('Text Color','textColor',WCI.textColor);
    break;
    case '_slider':
	  createconfigInput('Widget Name', 'name', WCI['name']);
	  createText('std_msgs/Float64');
	  createRange(WCI);
	  createCheckbox('Orient Vertical', 'vertical', WCI['vertical']);
	  createCheckbox('ROS Latching', 'latching', WCI['latching']);
	  createCheckbox('Flip Direction', 'reverse', WCI['reverse']);
	  createconfigInput('Default/initial value', 'default', WCI['default']);
	  createconfiglinkKeys(WCI,['Decrease','Increase']);
	  createconfiglinkGamepadButton(WCI,['Decrease','Increase']);
	  createLittleInput('Repeat Delay (ms)', 'repeatdelay', WCI['repeatdelay'],100);
    break;
    case '_inputbox':
	  createSelect('Message type', 'msgType', WCI['msgType'] ,['std_msgs/String','std_msgs/Float32','std_msgs/Float64','std_msgs/Int16','std_msgs/Int32','std_msgs/Int64']);
    break;
    case '_value':
      createconfigDataWrapper(WCI);
      createSelect('Subscribe to message type', 'msgType', WCI['msgType'] ,['std_msgs/String','std_msgs/Float32','std_msgs/Float64','std_msgs/Int16','std_msgs/Int32','std_msgs/Int64','std_msgs/Bool']);
	  createColorSelect('Text Color','textColor',WCI.textColor);
	  createFormat(WCI);
    break;
    case '_light':
    	createconfigInput('True label', 'text', WCI['text']);
		createColorSelect('True color','textColor',WCI.textColor==undefined?'#75FF75':WCI.textColor);
		createBreak();
		createBreak();
		createBreak();
		createconfigInput('False label', 'text2', (WCI['text2']==undefined || WCI['text2']=='')?WCI['text']:WCI['text2']);
		createColorSelect('False color','textColor2',WCI.textColor2==undefined?'#FF6666':WCI.textColor2);
		createText('std_msgs/Bool');
    break;
    case '_gauge':
		createconfigInput('Label', 'label', WCI['label']);
		createSelect('Subscribe to message type', 'msgType', WCI['msgType'] ,['std_msgs/Float64','std_msgs/Float32','std_msgs/Int16','std_msgs/Int32','std_msgs/Int64']);
		createGraph(WCI);
		createFormat(WCI);
    break;
    case '_compass':
		createconfigInput('Label', 'label', WCI['label']);
		createText('0 is north, increasing clockwise in degrees.');
		createSelect('Subscribe to message type', 'msgType', WCI['msgType'] ,['std_msgs/Float64','std_msgs/Float32','std_msgs/Int16']);
    break;
    case '_horizon':
		createconfigInput('Label', 'label', WCI['label']);
		createText('[0]=Roll,[1]=Pitch in degrees');
		createSelect('Subscribe to message type', 'msgType', WCI['msgType'] ,['std_msgs/Float64MultiArray','std_msgs/Float32MultiArray']);
    break;
    case '_rosImage':
		createconfigInput('Label', 'label', WCI['label']);
		createText('This widget subscribes to sensor_msgs/CompressedImage and displays a JPEG.');
	break;
	case '_logger':
		createText('std_msgs/String');
		createCheckbox('ROS Latching', 'latching', WCI['latching']);
	break;
    case '_audio':
		createText('Subscribes to an Int16');
    	createCheckbox('Hide this widget in drive mode', 'hideondrive', WCI['hideondrive']);
    	createSoundsList();
    break;
    case '_text':
		createconfigInput('Text', 'text', WCI['text']);
		createColorSelect('Text Color','textColor',WCI.textColor);
    break;
    case '_box':
		createColorSelect('Background Color','bkColor',WCI.bkColor);
    break;
  }
  mask.style.display='inline';
  configWindow.style.display='inline';
  configIsOpen = true;
}
function applyConfigChanges(){
  //the widget were applying settings on
  var localWidget = document.getElementById(currentID);
  var topic = document.getElementById('topicTitle').value;
  widgetArray[currentIndex].topic = topic;
  var WA = widgetArray[currentIndex];
  var type = WA.type;
  var oldlatching = false;
  switch(type){
    case '_button':
      WA['label'] = document.getElementById('_button-labelText').value;
      localWidget.querySelector('#button_ap').innerText = WA['label'];
      WA['useGamepad'] = document.getElementById('useGamepad').checked;
      WA['useKeys'] = document.getElementById('useKeys').checked;
      WA['usekey_hotkey'] = document.getElementById('usekey_hotkey').value;
      WA['fontsize'] = document.getElementById('fontsize').value;
      localWidget.querySelector('#button_ap').style.fontSize = (Number(WA['fontsize'])<4?4:Number(WA['fontsize']))+'px';
      if(lastChangedButton != -1) WA['useButton'] = lastChangedButton;
    break;
    case '_checkbox':
      WA['label'] = document.getElementById('label').value;
      WA['initial'] = document.getElementById('initialState').checked;
      oldlatching = WA['latching'];
      WA['latching'] = document.getElementById('latching').checked;
      WA['textColor'] = document.getElementById('textColor').value;
      localWidget.querySelector('#checkbox_text_ap').innerText = WA['label'];
      WA['useGamepad'] = document.getElementById('useGamepad').checked;
      WA['useKeys'] = document.getElementById('useKeys').checked;
      WA['usekey_hotkey'] = document.getElementById('usekey_hotkey').value;
      if(lastChangedButton != -1) WA['useButton'] = lastChangedButton;
      localWidget.querySelector('#checkbox_text_ap').style.color = WA['textColor'];
    break;
    case '_joystick':
      WA['useGamepad'] = document.getElementById('useGamepad').checked;
      WA['useKeys'] = document.getElementById('useKeys').checked;
      WA['usekey_up'] = document.getElementById('usekey_up').value;
      WA['usekey_left'] = document.getElementById('usekey_left').value;
      WA['usekey_down'] = document.getElementById('usekey_down').value;
      WA['usekey_right'] = document.getElementById('usekey_right').value;
      if(lastChangedAxis != -1) WA['useAxis'] = lastChangedAxis;
    break;
    case '_slider':
      WA['min'] = document.getElementById('min').value;
      WA['max'] = document.getElementById('max').value;
      WA['step'] = document.getElementById('step').value;
      WA['name'] = document.getElementById('name').value;
      oldlatching = WA['latching'];
      WA['latching'] = document.getElementById('latching').checked;
	  WA['reverse'] = document.getElementById('reverse').checked;
      let oldVertical = WA['vertical'];
      WA['vertical'] = document.getElementById('vertical').checked;
      WA['default'] = document.getElementById('default').value;
      localWidget.querySelector('#slider_ap').min = WA['min'];
      localWidget.querySelector('#slider_ap').max = WA['max'];
      localWidget.querySelector('#slider_ap').step = WA['step'];
      if(oldVertical != WA['vertical']){
		if(WA['vertical'] == true){
			localWidget.style.width = '35px';
			localWidget.style.height = '200px';
			WA['w'] = localWidget.style.width;
			WA['h'] = localWidget.style.height;
			localWidget.querySelector('#slider_ap').className += ' vertical';
			localWidget.querySelector('#slider_ap').style.width =(parseInt(WA['h'])-27) + 'px';
		}else{
			localWidget.style.height = '50px';
			localWidget.style.width = '200px';
			WA['h'] = localWidget.style.height;
			WA['w'] = localWidget.style.width;
			localWidget.querySelector('#slider_ap').className = localWidget.querySelector('#slider_ap').className.replace(/ vertical/g,'');
			localWidget.querySelector('#slider_ap').style.width = 'calc(100% - 5px)';
		}
	   }
	  WA['useGamepad'] = document.getElementById('useGamepad').checked;
      WA['useKeys'] = document.getElementById('useKeys').checked;
      WA['usekey_Increase'] = document.getElementById('usekey_Increase').value;
      WA['usekey_Decrease'] = document.getElementById('usekey_Decrease').value;
      WA['gp_Increase'] = document.getElementById('gp_Increase').value;
      WA['gp_Decrease'] = document.getElementById('gp_Decrease').value;
      WA['repeatdelay'] = document.getElementById('repeatdelay').value;
    break;
    case '_inputbox':
      WA['msgType'] = document.getElementById('msgType').value;
    break;
    case '_value':
      WA['prefix'] = document.getElementById('textInput1').value;
      WA['postfix'] = document.getElementById('textInput2').value;
      WA['msgType'] = document.getElementById('msgType').value;
      WA['textColor'] = document.getElementById('textColor').value;
      WA['formatmode'] = document.getElementById('formatmode').value;
      WA['formatvalue'] = document.getElementById('formatvalue').value;
      localWidget.querySelector('#text_ap').style.color = WA['textColor'];
    break;
    case '_light':
      WA['text'] = document.getElementById('text').value;
      WA['textColor'] = document.getElementById('textColor').value;
	  WA['text2'] = document.getElementById('text2').value
	  WA['textColor2'] = document.getElementById('textColor2').value;
      localWidget.querySelector('#text_ap').innerText = WA['text'];
    break;
    case '_audio':
		WA['hideondrive'] = document.getElementById('hideondrive').checked;
		if(WA['hideondrive']){
			localWidget.querySelector('#speaker_ap').className = '';
		}
		else{
			localWidget.querySelector('#speaker_ap').className = 'showOnDrive';
		}
    break;
    case '_gauge':
      WA['min'] = document.getElementById('min').value;
      WA['max'] = document.getElementById('max').value;
      if(Number(WA.max) < Number(WA.min)){
		  WA['max'] = document.getElementById('min').value;
		  WA['min'] = document.getElementById('max').value;
	  }
      WA['bigtick'] = document.getElementById('bigtick').value;
      if(Number(WA.bigtick) > Number(WA.max) - Number(WA.min)) WA['bigtick'] = Number(WA.max) - Number(WA.min);
      if(Number(WA.bigtick) < 1) WA['bigtick'] = 1;
      WA['smalltick'] = document.getElementById('smalltick').value;
      if(Number(WA.smalltick) > 100) WA['smalltick'] = 100;
      if(Number(WA.smalltick) < 0) WA['smalltick'] = 0;
      WA['label'] = document.getElementById('label').value;
      WA['msgType'] = document.getElementById('msgType').value;
      WA['formatmode'] = document.getElementById('formatmode').value;
      WA['formatvalue'] = document.getElementById('formatvalue').value;
      let obj = JSON.stringify({min:WA.min,max:WA.max,bigtick:WA.bigtick,smalltick:WA.smalltick, title:WA.label});
      localWidget.querySelector('#gauge_ap').setAttribute("data-config",obj);
      drawGauge(localWidget.querySelector('#gauge_ap'),WA.min,WA);
    break;
    case '_compass':
      WA['msgType'] = document.getElementById('msgType').value;
      WA['label'] = document.getElementById('label').value;
    break;
    case '_horizon':
      WA['msgType'] = document.getElementById('msgType').value;
      WA['label'] = document.getElementById('label').value;
    break;
    case '_rosImage':
		WA['label'] = document.getElementById('label').value;
    break;
    case '_logger':
		WA['latching'] = document.getElementById('latching').checked;
    break;
    case '_text':
      WA['text'] = document.getElementById('text').value;
      WA['textColor'] = document.getElementById('textColor').value;
      localWidget.querySelector('#text_ap').style.color = WA['textColor'];
      localWidget.querySelector('#text_ap').innerText = WA['text'];
    break;
    case '_box':
      WA['bkColor'] = document.getElementById('bkColor').value;
      localWidget.querySelector('#panel_ap').style.backgroundColor = WA['bkColor'];
    break;
  }
  mask.style.display='none';
  configWindow.style.display='none';
  configIsOpen = false;
  updateTopicMapIndex();
  sendWidgetsArray();
  
  //now send initial state if latching:
  if(oldlatching != WA['latching'] && WA['latching']){
	  console.log('update latch status');
	switch(type){
		case '_checkbox':
			sendToRos(WA['topic'],{pressed:WA['initial']},'_checkbox');
			localWidget.querySelector('#checkbox_ap').checked = WA['initial'];
		break;
		case '_slider':
			sendToRos(WA['topic'],{value:WA['default']},'_slider');
		break;
	}
  }
}
function guardTopicName(ele){
	let fstr = ele.value.trim();
	str='';
	for(let i = 0; i < fstr.length; i++){
		if(i==0)str = str+fstr.charAt(i).replace(/[^a-zA-Z~/]/g,'');
		else str=str+fstr.charAt(i).replace(/[^a-zA-Z0-9_/]/g,'')
	}
	ele.value = str;
}
//dynamically creates custom config settings. input is the content id ex _button.labelText
function createSoundsList(){
	let code = '';
	for(let i = 0; i < sounds.length; i++){
		code += ('<button class="specific soundbutton" onclick="playSound('+i+')">preview sound '+i+': "'+sounds[i]+'"</button>');
	}
	configWindow.insertAdjacentHTML('beforeend',code);
}
function createText(text){
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific selectable';
  label.style.margin.top = '5px';
  label.innerText = text;
  configWindow.appendChild(label);
}
function createBreak(){
	configWindow.insertAdjacentHTML('beforeend','<br class="specific">');
}
function createconfigInput(labelText, inputID, inputvalue){
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific';
  label.style.margin.top = '20px';
  label.innerText = labelText;
  var content = document.createElement("input");
  content.className = 'settingInput specific';
  content.id=inputID;
  content.value = (inputvalue==undefined?'':inputvalue);
  configWindow.appendChild(label);
  configWindow.appendChild(content);
}
function createLittleInput(labelText, inputID, inputvalue,defaultvalue){
	if(!defaultvalue) defaultvalue = '';
  configWindow.insertAdjacentHTML('beforeend','<br class="specific"><p class="specific" style="margin:10px 0px;display:inline-block"><b>'+labelText+'</p> <input value="'+(inputvalue==undefined?defaultvalue:inputvalue)+'"class="specific" id='+inputID+' style="margin:0px; width:50px"></input>');
}
function createCheckbox(labelText, inputID, inputvalue){
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific';
  label.style.margin.top = '20px';
  label.innerHTML = labelText + " <input id='"+inputID+"'class='specific' type='checkbox'></input>";
  var content = document.createElement("input");
  configWindow.appendChild(label);
  document.getElementById(inputID).checked = inputvalue;
}
//inputvalue is currently selected value from opts
function createSelect(labelText, inputID, inputvalue, opts){
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific';
  label.innerHTML = labelText;
  configWindow.appendChild(label);
  var content = document.createElement("select");
  content.className = 'specific';
  content.id=inputID;
  for(let i = 0; i < opts.length; i++){
	content.innerHTML += "<option value='"+opts[i]+"'>"+opts[i]+"</option>";
  }
  content.style.marginBottom = '20px';
  configWindow.appendChild(content);
  if(inputvalue != undefined && inputvalue != '') document.getElementById(inputID).value = inputvalue;
}
function createColorSelect(labelText, inputID, inputvalue){
	if(inputvalue == undefined) inputValue = '#000';
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific';
  label.style.margin.top = '20px';
  label.innerHTML = labelText;
  configWindow.appendChild(label);
  var content = document.createElement("input");
  content.type = 'color';
  content.className = 'specific';
  content.id=inputID;
  content.value = inputvalue;
  configWindow.appendChild(content);
}
function createconfiglinkGamepadAxis(array){
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific';
  label.style.margin = '20px 0px 0px 0px';
  label.innerHTML = 'Use gamepad input <input id="useGamepad" type="checkbox"></input>';
  label.style.margin.bottom = '0px';
  var axisText = document.createElement("p");
  axisText.className = 'specific';
  axisText.id='replaceWithCAxis';
  axisText.style.margin = '0px';
  if(array["useAxis"] == -1) axisText.innerHTML = 'Wiggle a joystick on the gamepad to link...';
  else axisText.innerHTML = 'Paired to axis: '+array['useAxis'];
  configWindow.appendChild(label);
  configWindow.appendChild(axisText);
  document.getElementById('useGamepad').checked = array["useGamepad"];
}
function createconfiglinkGamepadButton(array, opts){
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific';
  label.style.margin = '20px 0px 0px 0px';
  label.innerHTML = 'Use gamepad input <input id="useGamepad" type="checkbox"></input>';
  label.style.margin.bottom = '0px';
  configWindow.appendChild(label);
  if(!opts){
	var buttonText = document.createElement("p");
	buttonText.className = 'specific';
	buttonText.id='replaceWithCButton';
	buttonText.style.margin = '0px';
	if(array["useButton"] == -1) buttonText.innerHTML = 'Press a button on the gamepad to link...';
	else buttonText.innerHTML = 'Paired to button: '+array['useButton'];
	configWindow.appendChild(buttonText);
  }else{
	var buttonText = document.createElement("p");
	buttonText.className = 'specific';
	buttonText.id='replaceWithCButton';
	buttonText.style.margin = '0px';
	buttonText.style.display = 'none';
	if(array["useButton"] == -1) buttonText.innerHTML = 'Press a button on the gamepad...';
	else buttonText.innerHTML = 'Paired to button: '+array['useButton'];
	configWindow.appendChild(buttonText);
	configWindow.insertAdjacentHTML('beforeend','<p class="specific" style="margin:0px">click on input box below and press gamepad button</p>');
	for(let i = 0; i <opts.length; i++){
		 configWindow.insertAdjacentHTML('beforeend',' <p class="specific" style="margin:0px;display:inline-block">'+opts[i]+'</p> <input class="specific gamepad" id=gp_'+opts[i]+' style="margin:0px; width:50px"></input>');
		 if(array['gp_'+opts[i]] != undefined) document.getElementById('gp_'+opts[i]).value = array['gp_'+opts[i]];
	 }
  }
  document.getElementById('useGamepad').checked = array["useGamepad"];
}
function createconfiglinkKeys(array,keylabels=['hotkey']){
  var label = document.createElement("h1");
  label.className = 'settingsLabel specific';
  label.style.margin = '20px 0px 0px 0px';
  label.innerHTML = 'Use keyboard input <input id="useKeys" type="checkbox"></input>';
  label.style.margin.bottom = '0px';
  configWindow.appendChild(label);
  var label2 = document.createElement("p");
  label2.className = 'specific';
  label2.style.margin = '0px';
  let innerhtml='';
  for(let i = 0; i < keylabels.length; i++){
    let value = array['usekey_'+keylabels[i]];
    if(value == undefined) value = '';
    innerhtml += keylabels[i]+' <input class="hotkeys" style="width:50px;margin-right:5px;" id="usekey_'+keylabels[i]+'" value="'+value+'"></input>';
  }
  label2.innerHTML = innerhtml;
  label2.style.margin.bottom = '0px';
  configWindow.appendChild(label2);
  document.getElementById('useKeys').checked = array["useKeys"];
  let allHotkeys = document.getElementsByClassName('hotkeys');
  for(let i = 0; i < keylabels.length; i++){
	  allHotkeys[i].addEventListener("keyup",event=>{
		  allHotkeys[i].value= event.key;
	  });
  }
}
function createconfigDataWrapper(array){
  let prefix = array.prefix;
  let postfix = array.postfix;
  if(prefix == undefined) prefix = '';
  if(postfix == undefined) postfix = '';
  let p = document.createElement('p');
  p.style.marginBottom = '20px';
  p.className = 'specific settingsLabel';
  p.innerHTML = "Prefix: <input id='textInput1'value='"+prefix+"'></input> Postfix: <input id='textInput2'value='"+postfix+"'></input>";
  configWindow.appendChild(p);
}
function createFormat(array){
	let formatmode = array.formatmode;
	let formatvalue = array.formatvalue;
  if(formatmode == undefined) formatmode = 0;
  if(formatvalue == undefined) formatvalue = 2;
  let code = 
  '<h3 class="specific" style="margin:20px 0px 5px 0px">Number Formatting</h1><select id="formatmode" class="specific">'+
  '<option value="0">Fixed decimal points</option>'+
  '<option value="1">Precision (digits)</option>'+
  '</select><input id="formatvalue" class="specific" style="width:50px; margin-left:5px"></input>';
  configWindow.insertAdjacentHTML('beforeend',code);
  document.getElementById('formatmode').value=formatmode;
  document.getElementById('formatvalue').value=formatvalue;
}
function createGraph(array){
  let label = array.label;
  let min = array.min;
  let max = array.max;
  let bigtick = array.bigtick;
  let smalltick = array.smalltick;
  if(min == undefined) min = 0;
  if(max == undefined) max = 100;
  if(bigtick == undefined) bigtick = 20;
  if(smalltick == undefined) smalltick = 4;
  if(label == undefined) label = '';
  let p = document.createElement('p');
  p.style.marginBottom = '20px';
  p.className = 'specific';
  p.innerHTML = "Min: <input class='miniInput' id='min'value='"+min+"'></input><br> Max: <input class='miniInput' id='max'value='"+max+"'></input><br> Big Tick Interval: <input class='miniInput' id='bigtick'value='"+bigtick+"'></input><br> Subdivisions: <input class='miniInput' id='smalltick'value='"+smalltick+"'></input>";
  configWindow.appendChild(p);
}
function createRange(array){
  let min = array.min;
  let max = array.max;
  let step = array.step;
  if(min == undefined) min = '0';
  if(max == undefined) max = '100';
  if(step == undefined) step = '1';
  let p = document.createElement('p');
  p.style.marginBottom = '20px';
  p.className = 'specific';
  p.innerHTML = "Min: <input id='min'value='"+min+"'></input> Max: <input id='max'value='"+max+"'></input> Step: <input id='step'value='"+step+"'></input>";
  configWindow.appendChild(p);
}

//KEYBOARD INTERFACING
var inc; //interval id. also used in gamepad loop
document.addEventListener('keydown', (e) => {
	if(!configIsOpen && !terminalIsOpen){
		oldKeys = {...keys};
		keys[e.key] = true;
		getKeyboardUpdates();
	}
});
document.addEventListener('keyup', (e) => {
	if(!configIsOpen && !terminalIsOpen){
		oldKeys = {...keys};
		keys[e.key] = false;
		getKeyboardUpdates();
	}
	if(e.key == 'Enter'){
		if(terminalIsOpen)runCmdFromInput();
		if(configIsOpen)applyConfigChanges();
	}
});
function keysChanged(k){
  for(let i = 0; i < k.length; i++){
    if(oldKeys[k[i]] != keys[k[i]]) return true;
  }
  return false;
}
function getKeyboardUpdates(){
  for(let w = 0; w < widgetArray.length; w++){
    if(widgetArray[w].type == '_joystick' && widgetArray[w].useKeys){
      let ck = [widgetArray[w].usekey_up,widgetArray[w].usekey_left,widgetArray[w].usekey_down,widgetArray[w].usekey_right];
      if(keysChanged(ck)){
        let dat = {x:0,y:0};
        if(keys[ck[0]]) dat.y += -1;
        if(keys[ck[1]]) dat.x += -1;
        if(keys[ck[2]]) dat.y += 1;
        if(keys[ck[3]]) dat.x += 1;
        drawJoystick(document.getElementById(widgetArray[w].id).querySelector('#canvas_ap'),dat.x,dat.y,false);
      }
    }
    if(widgetArray[w].type == '_button' && widgetArray[w].useKeys){
      let ck = [widgetArray[w].usekey_hotkey];
      if(keysChanged(ck)){
        let ele = document.getElementById(widgetArray[w].id).querySelector('#button_ap');
        if(keys[ck[0]]){
          triggerMouseEvent(ele,'mousedown');
          ele.className += " button_apPressed";
        }
        else{
          triggerMouseEvent(ele,'mouseup');
          ele.className = ele.className.replace(" button_apPressed", "");
        }
      }
    }
    if(widgetArray[w].type == '_checkbox' && widgetArray[w].useKeys){
      let ck = [widgetArray[w].usekey_hotkey];
      if(keysChanged(ck)){
        let ele = document.getElementById(widgetArray[w].id).querySelector('#checkbox_ap');
        if(keys[ck[0]]){
          ele.checked = !ele.checked;
          sendToRos(widgetArray[w].topic,{pressed:ele.checked},widgetArray[w].type);
        }
      }
    }
    if(widgetArray[w].type == '_slider' && widgetArray[w].useKeys){
      let ck = [widgetArray[w].usekey_Increase,widgetArray[w].usekey_Decrease];
      if(keysChanged(ck)){
        let dat = 0;
        //if(keys[ck[0]]) inc = setInterval(()=>{dat.v = -Number(widgetArray[w].step); updateSlider()},10);
        //else if(keys[ck[1]]) inc = setInterval(()=>{dat.v = Number(widgetArray[w].step); updateSlider()},10);
        //else inc = null;
        if(keys[ck[0]]){
			if(inc)clearInterval(inc);
			inc = setInterval(move,parseInt(widgetArray[w].repeatdelay));
			dat=Number(widgetArray[w].step);
			move();
		}
        else if(keys[ck[1]]){
			if(inc)clearInterval(inc);
			inc = setInterval(move,parseInt(widgetArray[w].repeatdelay));
			dat=-Number(widgetArray[w].step);
			move();
		}
		else if(inc)clearInterval(inc);
		function move(){
			let v = Number(document.getElementById(widgetArray[w].id).querySelector('#slider_ap').value);
			v += dat;
			document.getElementById(widgetArray[w].id).querySelector('#slider_ap').value = v;
			sendToRos(widgetArray[w]['topic'],{
				value:setSliderDirection(v>widgetArray[w].max?widgetArray[w].max:(v<widgetArray[w].min?widgetArray[w].min:v),widgetArray[w])
			},widgetArray[w]['type']);
		}
      }
    }
  }
}

//arr max=slider max
//min = slider min
//reverse = bool flip or not
function setSliderDirection(value,arr){
	if(arr['reverse']){
		return parseFloat(arr['max'])+parseFloat(arr['min'])-parseFloat(value);
	}
	else{
		return value;
	}
}

let gamepad_index = 0;
//GAMEPAD INTERFACING
window.addEventListener("gamepadconnected", function(e) {
	if(gamepadCount == 0) document.getElementById('gpselect').innerHTML = '';
	gamepadCount++;
	console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",e.gamepad.index, e.gamepad.id,e.gamepad.buttons.length, e.gamepad.axes.length);
	addGamepadToSelect(e.gamepad.index,e.gamepad.id);
	currentGamepad = e.gamepad;
	oldGamepad = currentGamepad;
	if(readGamepadInterval) clearInterval(readGamepadInterval);
	readGamepadInterval = setInterval(readGamepadLoop,30);
});

window.addEventListener("gamepaddisconnected", function(e) {
	clearInterval(readGamepadInterval);
	gamepadCount--;
    console.log("Gamepad disconnected from index %d: %s",e.gamepad.index, e.gamepad.id);
    removeGamepadFromSelect(e.gamepad.index);
    if(gamepadCount == 0){
		document.getElementById('gpselect').innerHTML = '<option>No Gamepad Connected</option>';
	}else{
		readGamepadInterval = setInterval(readGamepadLoop,30);
	}
});
function addGamepadToSelect(index,id){
	document.getElementById('gpselect').innerHTML += '<option value='+index+'>'+id.substring(0,15)+'...</option>';
	document.getElementById('gpselect').value = index;
	gamepad_index = index;
	console.log('gamepad_index CON',gamepad_index);
}
function removeGamepadFromSelect(index){
	let ele = document.getElementById('gpselect').options;
	for(let i = 0; i < ele.length; i++){
		if(ele[i].value == index) ele[i].remove();
	}
	if(ele.length >= 1){
		 document.getElementById('gpselect').value = ele[ele.length-1].value;
		 gamepad_index = ele[ele.length-1].value;
	}
	console.log('gamepad_index DIS',gamepad_index);
}
document.getElementById('gpselect').addEventListener('change',()=>{
	if(document.getElementById('gpselect').value) gamepad_index = document.getElementById('gpselect').value;
	console.log('gamepad_index CNG',gamepad_index);
});
function readGamepadLoop(){
  currentGamepad = navigator.getGamepads()[gamepad_index];
  for(let i = 0; i < currentGamepad.axes.length; i++){
    if(Math.abs(currentGamepad.axes[i] - oldGamepad.axes[i]) > 0.002){
      if(configIsOpen){
        try{
          document.getElementById('replaceWithCAxis').innerText = `Paired to axis: ${lastChangedAxis}`;
        }
        catch{}
        lastChangedAxis = Math.floor(i/2);
      }
      for(let w = 0; w < widgetArray.length; w++){
        if(widgetArray[w].screen == thisScreen && widgetArray[w].type == '_joystick' && widgetArray[w].useGamepad && 'useAxis' in widgetArray[w] && widgetArray[w].useAxis == Math.floor(i/2))
        drawJoystick(document.getElementById(widgetArray[w].id).querySelector('#canvas_ap'),currentGamepad.axes[widgetArray[w].useAxis*2],currentGamepad.axes[widgetArray[w].useAxis*2+1],false);
      }
    }
  }
  for(let i = 0; i < currentGamepad.buttons.length; i++){
    if(currentGamepad.buttons[i].pressed != oldGamepad.buttons[i].pressed){
      if(configIsOpen){
        lastChangedButton = i;
        if(document.activeElement.className.includes('gamepad')) document.activeElement.value = lastChangedButton;
        if(document.getElementById('replaceWithCButton')) document.getElementById('replaceWithCButton').innerText = `Paired to button: ${lastChangedButton}`;
      }
      for(let w = 0; w < widgetArray.length; w++){
        if(widgetArray[w].screen == thisScreen && widgetArray[w].type == '_button' && widgetArray[w].useGamepad && 'useButton' in widgetArray[w] && widgetArray[w]['useButton'] == i){
          var ele = document.getElementById(widgetArray[w].id).querySelector('#button_ap');
          if(currentGamepad.buttons[i].pressed){
            triggerMouseEvent(ele,'mousedown');
            ele.className += " button_apPressed";
          }
          else{
            triggerMouseEvent(ele,'mouseup');
            ele.className = ele.className.replace(" button_apPressed", "");
          }
        }
        if(widgetArray[w].screen == thisScreen && widgetArray[w].type == '_checkbox' && widgetArray[w].useGamepad && 'useButton' in widgetArray[w] && widgetArray[w]['useButton'] == i){
          var ele = document.getElementById(widgetArray[w].id).querySelector('#checkbox_ap');
          if(currentGamepad.buttons[i].pressed){
            ele.checked = !ele.checked;
            sendToRos(widgetArray[w].topic,{pressed:ele.checked},widgetArray[w].type);
          }
        }
        let dat = 0;
        if(widgetArray[w].screen == thisScreen && widgetArray[w].type == '_slider' && widgetArray[w].useGamepad && 'gp_Increase' in widgetArray[w] && widgetArray[w]['gp_Increase'] == i){
          var ele = document.getElementById(widgetArray[w].id).querySelector('#slider_ap');
          //check if the 'increase slider' button is pressed
          if(currentGamepad.buttons[i].pressed){
            if(inc)clearInterval(inc);
			inc = setInterval(move,parseInt(widgetArray[w].repeatdelay));
			dat=Number(widgetArray[w].step);
			move();
          }
          else{
            if(inc)clearInterval(inc);
          } 
        }
        else if(widgetArray[w].screen == thisScreen && widgetArray[w].type == '_slider' && widgetArray[w].useGamepad && 'gp_Decrease' in widgetArray[w] && widgetArray[w]['gp_Decrease'] == i){
          var ele = document.getElementById(widgetArray[w].id).querySelector('#slider_ap');
          //check if the 'decrease slider' button is pressed
          if(currentGamepad.buttons[i].pressed){
            if(inc)clearInterval(inc);
			inc = setInterval(move,parseInt(widgetArray[w].repeatdelay));
			dat=-Number(widgetArray[w].step);
			move();
          }
          else{
            if(inc)clearInterval(inc);
          }
        }
        function move(){
			let v = Number(document.getElementById(widgetArray[w].id).querySelector('#slider_ap').value);
			v += dat;
			document.getElementById(widgetArray[w].id).querySelector('#slider_ap').value = v;
			sendToRos(widgetArray[w]['topic'],{
				value:setSliderDirection((v>widgetArray[w].max?widgetArray[w].max:(v<widgetArray[w].min?widgetArray[w].min:v)),widgetArray[w])
			},widgetArray[w]['type']);
		}
      }
    }
  }
  oldGamepad = currentGamepad;
}
function triggerMouseEvent(node, eventType) {
    var clickEvent = document.createEvent ('MouseEvents');
    clickEvent.initEvent (eventType, true, true);
    node.dispatchEvent (clickEvent);
}

//DRIVE MODE
function toggleDriveMode(){
  if(driveMode){
    driveMode = false;
    let dm = document.getElementById('driveMode');
    dm.innerText = 'Drive';

    for(let i = 0; i < widgetArray.length; i++){
      if(widgetArray[i].screen == thisScreen){
        let ele = document.getElementById(widgetArray[i].id);
        ele.style.visibility='visible';
      }
    }
    document.getElementsByClassName('toggleWidgetHolder')[0].style.visibility='visible';
  }else{
    driveMode = true;
    let dm = document.getElementById('driveMode');
    dm.innerText = 'Edit';
    hideWidgetHolder();

    for(let i = 0; i < widgetArray.length; i++){
      if(widgetArray[i].screen == thisScreen){
        let ele = document.getElementById(widgetArray[i].id);
        ele.style.visibility='hidden';
      }
    }
    document.getElementsByClassName('toggleWidgetHolder')[0].style.visibility='hidden';
  }
}

function showMessage(text){
	mask.style.display = 'inline';
	document.getElementById('messagePanel').style.display = 'flex';
	document.getElementById('messagePanelText').innerText = text;
}
function hideMessage(){
	mask.style.display = 'none';
	document.getElementById('messagePanel').style.display = 'none';
}

function hideWidgetHolder(){
  let me = document.getElementsByClassName('toggleWidgetHolder')[0];
  document.getElementById('widgetHolder').style.left = '-260px';
  widgetHolderOpen = false;
  me.style.left = '5px';
  me.innerText = 'Show';
}
function showWidgetHolder(){
  let me = document.getElementsByClassName('toggleWidgetHolder')[0];
  document.getElementById('widgetHolder').style.left = '0px';
  widgetHolderOpen = true;
  me.style.left = '192px';
  me.innerText = 'Hide';
}
function toggleWidgetHolder(){
  if(!driveMode){
    if(widgetHolderOpen){
      hideWidgetHolder();
    }
    else{
      showWidgetHolder();
    }
  }
}
function camSelect(me){
  let cams = document.getElementsByClassName('imageTile');
  for(let i = 0; i < cams.length; i++){
	  if(i == me){
		  cams[i].style.borderColor = 'yellow';
	  }
	  else cams[i].style.borderColor = '#000';
  }
  socket.emit('setCam',me);
}
//align small previews of image to left side of main image
function repositionThumbs(){
	let tileArray = document.getElementsByClassName('imageTile');
	let x = document.getElementById('mainImage').getBoundingClientRect().x;
	if(x < 0) x = 0;
	for(let i =0; i< tileArray.length; i++){
		tileArray[i].style.left = parseInt(x + i*(THUMBWIDTH+15)+5) + 'px';
	}
}
window.onresize = function(){
	repositionThumbs();
}

function playSound(s){
	if(sounds[s]) new Audio('sounds/'+sounds[s]).play();
}
//opts = bool mode, value
function formatNumber(data,opts){
	if(opts.formatmode==0) return Number(data).toFixed(parseInt(opts.formatvalue));
	if(opts.formatmode==1) return Number(data).toPrecision(parseInt(opts.formatvalue));
	return data;
}

var elem = document.documentElement;
/* View in fullscreen */
function openFullscreen() {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) { /* Safari */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE11 */
    elem.msRequestFullscreen();
  }
}

/* Close fullscreen */
function closeFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) { /* Safari */
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) { /* IE11 */
    document.msExitFullscreen();
  }
}

function toggleFullscreen(){
	if(fullScreen) closeFullscreen();
	else openFullscreen();
	fullScreen = !fullScreen; 
}
function exitServer(d){
	console.log('exiting server...');
	socket.emit('exit',d);
	//uncomment below to reset the web page too
	showMessage('Restarting Server...');
	//location.reload();
}
//mobile view support
function preventBehavior(e) {
    e.preventDefault(); 
};
body.addEventListener("touchmove", preventBehavior, {passive: false});
//body.addEventListener("touchstart", preventBehavior, {passive: false});
