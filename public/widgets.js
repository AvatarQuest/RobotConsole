//parses json into widgets
//contains functionality for all Widgets
//a hashtable like array that stores indexes at different id's
var indexMap, topicMapIndex;
// TODO: add details for all types of widgets
function widgetFromJson(json){
  var type = json['type'];
  console.log('creating widget: '+type)
  var tile = widgetFromId(type);
  tile.id = json['id'];
  tile.style.zIndex = 20;
  if(type == '_box') tile.style.zIndex = 5;
  
  set4style(tile,json);
	
	tile.style.width = json['w'];
	tile.style.height = json['h'];
  
  switch (type) {
    case '_button':
      tile.querySelector('#button_ap').innerText = json['label'];
      if(json['fontsize']) tile.querySelector('#button_ap').style.fontSize = Number(json['fontsize'])+'px';
    break;
    case '_checkbox':
      tile.querySelector('#checkbox_text_ap').innerText = json['label'];
      tile.querySelector('#checkbox_ap').checked = json['initial'];
      tile.querySelector('#checkbox_text_ap').style.color = json['textColor'];
      if(json['latching']) sendToRos(json['topic'],{pressed:json['initial']},'_checkbox');
    break;
    case '_joystick':
      var canvas = tile.querySelector('#canvas_ap');
      canvas.height = parseInt(json['h'])-20;
      canvas.width = parseInt(json['w']);
      drawJoystick(canvas,0,0);
    break;
    case '_slider':
      tile.querySelector('#slider_ap').min = json['min'];
      tile.querySelector('#slider_ap').max = json['max'];
      tile.querySelector('#slider_ap').value= (parseInt(json['min']) + parseInt(json['max'])
      )/2;
      tile.querySelector('#slider_ap').step = json['step'];
    break;
    case '_value':
		tile.querySelector('#text_ap').innerText='Waiting for ROS...';
		tile.querySelector('#text_ap').style.color = json['textColor'];
	break;
	case '_light':
		tile.querySelector('#text_ap').innerText=json['text'];
	break;
	case '_audio':
		tile.querySelector('#speaker_ap').className = json['hideondrive']?'':'showOnDrive';
	break;
	case '_gauge':
      var canvas = tile.querySelector('#gauge_ap');
      canvas.height = parseInt(json['h'])-20;
      canvas.width = parseInt(json['w']);
      canvas.setAttribute("data-config",JSON.stringify({min:json.min,max:json.max,bigtick:json.bigtick,smalltick:json.smalltick, title:json.label}));
      drawGauge(canvas,json.min,json);
    break;
    case '_text':
		tile.querySelector('#text_ap').innerText=json['text'];
		tile.querySelector('#text_ap').style.color = json['textColor'];
	break;
	case '_box':
		tile.querySelector('#panel_ap').style.backgroundColor = json['bkColor'];
	break;
  }

  initFunctionality(json['type'],tile,tile.id);
}
//json is the widget array for the tile widget
function set4style(tile,json){
	if(!json) json=widgetArray[indexMap[tile.id]];
	if(json['useTop']){
		 tile.style.top = json['top'];
		 tile.style.bottom = '';
	}else{
		tile.style.top = '';
		tile.style.bottom = json['bottom'];
	}
	if(json['useLeft']){
		tile.style.right = '';
		tile.style.left = json['left'];
	}else{
		tile.style.left = '';
		tile.style.right = json['right'];
	}
}
function get4position(tile){
	let index = indexMap[tile.id];
	if(widgetArray[index]['useTop']){
		 widgetArray[index].top = parseInt(tile.style.top) + 'px';
		 widgetArray[index].bottom = (window.innerHeight - parseInt(tile.style.height) - parseInt(tile.style.top)) + 'px';
	}else{
		widgetArray[index].bottom = parseInt(tile.style.bottom) + 'px';
		widgetArray[index].top = (window.innerHeight - parseInt(tile.style.height) - parseInt(tile.style.bottom)) + 'px';
	}
	if(widgetArray[index]['useLeft']){
		 widgetArray[index].left = parseInt(tile.style.left) + 'px';
		 widgetArray[index].right = (window.innerWidth - parseInt(tile.style.width) - parseInt(tile.style.left)) + 'px';
	}else{
		widgetArray[index].right = parseInt(tile.style.right) + 'px';
		widgetArray[index].left = (window.innerWidth - parseInt(tile.style.width) - parseInt(tile.style.right)) + 'px';
	}
}
function useClosest(tile){
	let index = indexMap[tile.id];
	if(parseInt(widgetArray[index].left) < parseInt(widgetArray[index].right)) widgetArray[index].useLeft = true;
	else widgetArray[index].useLeft = false;
	if(parseInt(widgetArray[index].top) < parseInt(widgetArray[index].bottom)) widgetArray[index].useTop = true;
	else widgetArray[index].useTop = false;
}
function useSide(tile,uleft,utop){
	let index = indexMap[tile.id];
	if(uleft) widgetArray[index].useLeft = true;
	else widgetArray[index].useLeft = false;
	if(utop) widgetArray[index].useTop = true;
	else widgetArray[index].useTop = false;
}
//returns json from widget
//assigns the newWidget an id and functionality
function makeUnique(type,newWidget){
  console.log('creating widget clone: ' + type);
  let thisWidget = JSON.parse('{}');
  thisWidget['type'] = type;
  var thisID = generateUniqueId(widgetArray.length);//this will be the index of newWidget because it hasn't been pushed to the widget array yet
  thisWidget['id'] = thisID;
  newWidget.id = thisID;
  newWidget.style.zIndex = 30;
  if(type == '_box') newWidget.style.zIndex = 5;
  thisWidget['left'] = newWidget.style.left;
  thisWidget['top'] = newWidget.style.top;
  thisWidget['useLeft'] = true;
  thisWidget['useTop'] = true;
  thisWidget['right'] = '';
  thisWidget['bottom'] = '';
  thisWidget['w'] = newWidget.style.width;
  thisWidget['h'] = newWidget.style.height;
  thisWidget['topic'] = newWidget.querySelector('#header').childNodes[0].data;
  thisWidget['screen'] = 1;
  thisWidget['useROS'] = true;

  switch (type) {
    case '_button':
      thisWidget['label'] = newWidget.querySelector('#button_ap').innerText;
      thisWidget['useGamepad'] = true;
      thisWidget["useButton"] = -1;
    break;
    case '_checkbox':
      thisWidget['label'] = newWidget.querySelector('#checkbox_text_ap').innerText;
      thisWidget['useGamepad'] = true;
      thisWidget["useButton"] = -1;
    break;
    case '_joystick':
      thisWidget['useGamepad'] = true;
      thisWidget['useKeys'] = false;
      thisWidget["useAxis"] = -1;
      thisWidget["usekey_up"] = "w";
      thisWidget["usekey_left"] = "a";
      thisWidget["usekey_down"] = "s";
      thisWidget["usekey_right"] = "d";
    break;
    case '_value':
		thisWidget['msgType'] = 'std_msgs/String';
	break;
	case '_light':
		thisWidget['msgType'] = 'std_msgs/Bool';
		thisWidget['text'] = 'label';
	break;
	case '_gauge':
      thisWidget['label'] = 'Example';
      thisWidget['min'] = 0;
      thisWidget["max"] = 100;
      thisWidget["bigtick"] = 20;
      thisWidget["smalltick"] = 4;
    break;
    case '_box':
		thisWidget['useTop'] = true;
		thisWidget['useLeft'] = true;
    case '_text':
		thisWidget['useROS'] = false;
    break;
    case '_logger':
		thisWidget['msgType'] = 'std_msgs/String';
    break;
    default:

  }
  initFunctionality(type,newWidget,thisID);
  return thisWidget;
}
function initFunctionality(type, newWidget,thisID){
  switch(type){
    //update thiswidget['<custom field>'] with newWidget.childnodes
    case '_button':
      //setup brodcast functionality for element
      newWidget.querySelector('#button_ap').onmousedown = function(){
        let jsw = widgetArray[indexMap[thisID]];
        sendToRos(jsw['topic'],{pressed:true},jsw['type']);
      };
      newWidget.querySelector('#button_ap').onmouseup = function(){
		let jsw = widgetArray[indexMap[thisID]];
        sendToRos(jsw['topic'],{pressed:false},jsw['type']);
      };
    break;
    case '_checkbox':
      //setup brodcast functionality for element
      newWidget.querySelector('#checkbox_ap').onchange = function(e){
        let jsw = widgetArray[indexMap[thisID]];
        sendToRos(jsw['topic'],{pressed:e.target.checked},jsw['type']);
      };
    break;
    case '_slider':
      //setup brodcast functionality for element
       let jsw = widgetArray[indexMap[thisID]];
       if(jsw){
		   if(jsw['vertical']){
				newWidget.querySelector('#slider_ap').className += ' vertical';
				newWidget.querySelector('#slider_ap').style.width =(parseInt(jsw['h'])-27) + 'px';
			}
			newWidget.querySelector('#slider_ap').value = parseFloat(setSliderDirection(jsw['default'],jsw));
			sendToRos(jsw['topic'],{value:parseFloat(jsw['default'])},jsw['type']);
			newWidget.querySelector('#slider_ap').oninput = function(e){
				sendToRos(jsw['topic'],{
					value:setSliderDirection(e.target.value,jsw)
				},jsw['type']);
			};
		}
    break;
    case '_inputbox':
      //setup brodcast functionality for element
      newWidget.querySelector('#inputboxbutton').onmousedown = function(e){
        let jsw = widgetArray[indexMap[thisID]];
        sendToRos(jsw['topic'],{value:newWidget.querySelector('#input_ap').value},jsw['type']);
      };
    break;
  }
}
//returns the widget-clone as a dragable object
function widgetFromId(id){
  let itm = document.getElementById(id);
  let cln = itm.cloneNode(true);
  cln.className = 'panel dragable';
  cln.style.zIndex=60;
  if(id == '_box') cln.style.zIndex = 5;
  cln.querySelector('#header').style ='padding:11px;';
  cln.querySelector('#header').childNodes[0].data = '';
  cln.id='';
  //show the gear icon to allow for configuration of that widget
  cln.querySelector('#configButton').style.display = 'inline-block';
  //add initalize canvases on widget
  let canvas = cln.querySelector('#canvas_ap');
  if(canvas){
    initJoystick(canvas);
    drawJoystick(canvas,0,0,false);
  }
  canvas = cln.querySelector('#gauge_ap');
  if(canvas){
    drawGauge(canvas,0);
  }
  dragElement(cln);
  document.getElementById("body").appendChild(cln);
  return cln;
}
function updateIndexMap(){
  indexMap=[];
  for(let i = 0; i < widgetArray.length; i++){
    indexMap[widgetArray[i].id] = i;
  }
}
function updateTopicMapIndex(){
  topicMapIndex=[];
  for(let i = 0; i < widgetArray.length; i++){
    topicMapIndex[widgetArray[i].topic] = widgetArray[i].id;
  }
}
function generateUniqueId(index){
  for(let i = 0; i < 500; i++){
    if(typeof indexMap[i] === "undefined"){
      indexMap[i] == index;
      console.log('empty id found: ' + i);
      return i;
      break;
    }
  }
}

function sendToRos(topic,data,type){
	//console.log('ros out',topic,data,type);
  if(topic != undefined && topic != '/' && topic != ''){
    data.topic = topic;
    data.type = type;
    socket.emit('ROSCTS',data);//ros client to server
  }
}

//widgetArray methods
function addWidget(data){
  widgetArray.push(data);
  updateIndexMap();
  updateTopicMapIndex();
  sendWidgetsArray();
};
function moveWidget(data){
  //data is an object of the element's position
  for(let i = 0; i < widgetArray.length; i++){
    if(widgetArray[i]['id'] == data.id){
      widgetArray[i]['left'] = data.x;
      widgetArray[i]['top'] = data.y;
      break;
    }
  }
  //sendWidgetsArray();
}
function resizeWidget(data){
  //data is an object of the element's position
  for(let i = 0; i < widgetArray.length; i++){
    if(widgetArray[i]['id'] == data.id){
      widgetArray[i]['w'] = data.x;
      widgetArray[i]['h'] = data.y;
      break;
    }
  }
  sendWidgetsArray();
}
function deleteWidget(data){
  //data is the json object of the new widget
  for(let i = 0; i < widgetArray.length; i++){
    if(widgetArray[i]['id'] == data){
      widgetArray.splice(i,1);
      break;
    }
  }
  updateIndexMap();
  updateTopicMapIndex();
  sendWidgetsArray();
}
function sendWidgetsArray(){
  socket.emit('WCTS',widgetArray);//widgets client to server
}
