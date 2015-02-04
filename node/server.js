var ws = require("nodejs-websocket");
var mysql = require("mysql");

var db_conn = mysql.createConnection({
    host: 'localhost',
    database: 'projekt',
    user: 'dominik',
    password: '123qwe',
})

db_conn.connect(function (err) {
    console.log(err);
})

var connections = [];

var server = ws.createServer(function (conn) {
    connections.push(conn);
    console.log("New connection")
    console.log("Sum of clients: ", connections.length);
    conn.on("text", function (msg) {
        data = JSON.parse(msg);
        handle_message(conn, data);
    })
    conn.on("close", function (code, reason) {
        handle_close(conn, code, reason);
    })
}).listen(8001);

function handle_message(conn, data) {
    if (data.type == 'global-message') {
        handle_global_message(conn, data);
    } else if (data.type == 'authentication') {
        db_conn.query(
            'SELECT * FROM session where ?',
            {session_id: data.content.session_id},
            function (err, rows, fields) {
                if (rows.length) {
                    console.log(rows[0].session_username)
                }
            }
        )
    } else {
        console.log('Wrong message!');
        console.log(data);
    }
}

function handle_global_message(conn, data) {
    for (var i = 0; i < connections.length; i++) {
        connections[i].sendText(JSON.stringify({
            'type': 'global-message',
            'content': {
                'name': connections.indexOf(conn),
                'message': data.content.toLowerCase()+"."}
            }
        ));
    }
}

function handle_close(conn, code, reason) {
    console.log("Connection closed")
    console.log(reason);
    var index = connections.indexOf(conn);
    console.log(index);
    connections.splice(index, 1);
    console.log("Sum of clients: ", connections.length);
}
