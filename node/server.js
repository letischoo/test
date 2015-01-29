var ws = require("nodejs-websocket")
var connections = [];

var server = ws.createServer(function (conn) {
	connections.push(conn);
    console.log("New connection")
	console.log("Sum of clients: ", connections.length);
    conn.on("text", function (str) {
		data = JSON.parse(str);
		console.log(data.type);
		str = data.content;
		for (var i = 0; i < connections.length; i++) {
			connections[i].sendText(JSON.stringify({
				'type': 'global-message',
				'content': {
					'name': connections.indexOf(conn),
					'message': str.toLowerCase()+"."}
				}
			));
		}
    })
    conn.on("close", function (code, reason) {
        console.log("Connection closed")
		var index = connections.indexOf(conn);
		console.log(index);
		connections.splice(index, 1);
		console.log("Sum of clients: ", connections.length);
    })
}).listen(8001)
