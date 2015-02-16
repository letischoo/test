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
var rooms = {};

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
    console.log(data);  // Debug
    content = data.content
    if (data.type == 'global-message') {
        handle_global_message(conn, content);
    } else if (data.type == 'authentication') {
        handle_authorization(conn, content);
    } else if (data.type == 'join-room') {
        handle_join_room(conn, content);
    } else if (data.type == 'game-data') {
        handle_game_data(conn, content);
    } else {
        console.log('Wrong message!');
        console.log(data);
    }
}

function handle_authorization(conn, content) {
    db_conn.query(
        'SELECT * FROM session where ?',
        {session_id: content.session_id},
        function (err, rows, fields) {
            if (rows.length) {
                conn.username = rows[0].session_username;
                conn.sendText(JSON.stringify({
                    'type': 'auth-success',
                    'content': 'Authorization successful.',
                    }
                ));
            } else {
                return not_authorized_error(conn);
            }
        }
    )
}

function handle_global_message(conn, content) {
    for (var i = 0; i < connections.length; i++) {
        connections[i].sendText(JSON.stringify({
            'type': 'global-message',
            'content': {
                'name': connections.indexOf(conn),
                'message': content.toLowerCase()+"."}
            }
        ));
    }
}

function not_authorized_error(conn) {
    conn.sendText(JSON.stringify({
        'type': 'error',
        'content': 'Authorization error.',
        }
    ));
}

function handle_close(conn, code, reason) {
    var index = connections.indexOf(conn);
    connections.splice(index, 1);
}

function handle_join_room(conn, content) {
    if (!conn.username) {
        return not_authorized_error(conn);
    }

    callback = function(room) {
        if (!room) {
            conn.sendText(JSON.stringify({
                'type': 'error',
                'content': 'No such error.',
                }
            ));
        }
        result = room.game.add_guest(conn);
        if (result) {
            conn.sendText(JSON.stringify({
                'type': 'joined-room',
                'content': {
                    'room_id': room.id,
                    'gametype': room.gametype,
                }
            }));
        } else {
            conn.sendText(JSON.stringify({
                'type': 'error',
                'content': "Can't join room.",
            }));
        }
    }

    err_callback = function(err) {
        conn.sendText(JSON.stringify({
            'type': 'error',
            'content': "Room doesn't exist.",
        }));
    }

    get_room(content.room_id, callback, err_callback);
}

function handle_game_data(conn, content) {
    if (!conn.username) {
        return not_authorized_error(conn);
    }

    callback = function(room) {
        room.game.handle_signal(conn, content);
    }

    err_callback = function(err) {
        conn.sendText(JSON.stringify({
            'type': 'error',
            'content': "Room doesn't exist.",
        }));
    }

    get_room(content.room_id, callback, err_callback);
}

function get_room(id, callback, err_callback) {
    if (rooms[id]) {
        return callback(rooms[id]);
    }

    db_conn.query(
        'SELECT * FROM rooms where ?',
        {id: id},
        function (err, rows, fields) {
            if (rows.length) {
                var roomid = rows[0].id;
                rooms[roomid] = new Room(roomid, rows[0].gametype);
                callback(rooms[id]);
            } else {
                err_callback("No such room.");
            }
        }
    )
}

function Room(id, gametype) {
    this.id = id;
    this.gametype = gametype;
    this.game = new gametype_game_map[gametype](this)
}

function NoughtsAndCrosses(room) {
    this._limit = 2;

    this.room = room;
    this.guests = {};

    this.add_guest = function(conn) {
        var key = conn.username;
        if (this.guests[key]) {
            this.guests[key].push(conn);
            return true;
        }

        if (!(this.guests_amount() < this._limit)) {
            return false;
        }

        this.guests[key] = [conn];
        return true;
    }

    this.guests_amount = function () {
        return Object.keys(this.guests).length;
    }

    this.handle_signal = function (conn, content) {
        if (content.msg == 'client-ready') {
            conn.sendText(JSON.stringify({
                'type': 'game-data',
                'content': {
                    'room_id': this.room.id,
                    'msg': 'ready-ack',
                }
            }));
        } else if (content.msg == 'refresh-user-list') {
            this.refresh_user_list_for(conn);
        }
        console.log(content);
    }

    this.refresh_user_list_for = function (conn) {
        conn.sendText(JSON.stringify({
            'type': 'game-data',
            'content': {
                'msg': 'user-list',
                'room_id': this.room.id,
                'guests': Object.keys(this.guests),
            }
        }));
    }
}

var gametype_game_map = {
    'noughsandcrosses': NoughtsAndCrosses,
}

function handle_force_user_list_refresh(conn, content) {
    if (!conn.username) {
        return not_authorized_error(conn);
    }

    var room_id = content.room_id;
    if (rooms[room_id]) {
        rooms[room_id].game.refresh_user_list_for(conn);
    }
}
