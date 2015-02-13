var ws = require("nodejs-websocket");
var mysql = require("mysql");

var db_conn = mysql.createConnection({
    host: 'localhost',
    database: 'projekt',
    user: 'dominik',
    password: '123qwe',
})

db_conn.connect(function (err) {
    if (err) {
        console.log(err);
    }
})

var connections = [];

var server = ws.createServer(function (conn) {
    connections.push(conn);
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
        handle_authorization(conn, data);
    } else if (data.type == 'join-room') {
        handle_join_room(conn, data);
    } else {
        console.log('Wrong message!');
        console.log(data);
    }
}

function handle_authorization(conn, data) {
    db_conn.query(
        'SELECT * FROM session where ?',
        {session_id: data.content.session_id},
        function (err, rows, fields) {
            if (rows.length) {
                conn.username = rows[0].session_username;
                conn.sendText(JSON.stringify({
                    'type': 'auth-success',
                    'content': 'Authorization successful.',
                    }
                ));
            } else {
                conn.sendText(JSON.stringify({
                    'type': 'error',
                    'content': 'Authorization error.',
                    }
                ));
            }
        }
    )
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
    var index = connections.indexOf(conn);
    connections.splice(index, 1);
}

function handle_join_room(conn, data) {
    console.log(conn.username);
}
