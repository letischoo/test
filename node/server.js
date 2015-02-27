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
        try {
            handle_message(conn, data);
        } catch (err) {
            var msg = {
                'type': 'error',
                'content': 'Unexpected error!',
            };
            send(conn, msg);
            console.log('Error has occured!');
            console.log(err);
        }
    })
    conn.on("close", function (code, reason) {
        handle_close(conn, code, reason);
    })
}).listen(8001);

function handle_message(conn, data) {
    content = data.content
    switch (data.type) {
        case 'global-message':
            handle_global_message(conn, content);
            break;

        case 'authentication':
            handle_authorization(conn, content);
            break;

        case 'join-room':
            handle_join_room(conn, content);
            break;

        case 'game-data':
            handle_game_data(conn, content);
            break;

        default:
            console.log('Wrong message!');
            console.log(data);
    }
}

function is_true(value, index, array) {
    return !!value;
}

function send(socket, content) {
    socket.sendText(JSON.stringify(content))
}

function handle_authorization(conn, content) {
    db_conn.query(
        'SELECT * FROM session where ?',
        {session_id: content.session_id},
        function (err, rows, fields) {
            if (rows.length) {
                conn.username = rows[0].session_username;
                var msg = {
                    'type': 'auth-success',
                    'content': 'Authorization successful.',
                };
                send(conn, msg);
            } else {
                return not_authorized_error(conn);
            }
        }
    )
}

function handle_global_message(conn, content) {
    for (var i = 0; i < connections.length; i++) {
        var msg = {
            'type': 'global-message',
            'content': {
                'name': connections.indexOf(conn),
                'message': content.toLowerCase()+".",
            }
        };
        send(connections[i], msg);
    }
}

function not_authorized_error(conn) {
    var msg = {
        'type': 'error',
        'content': 'Authorization error.',
    };
    send(conn, msg);
}

function handle_close(conn, code, reason) {
    var index = connections.indexOf(conn);
    connections.splice(index, 1);

    for (var key in rooms) {
        rooms[key].disconnect(conn);
    }
}

function handle_join_room(conn, content) {
    if (!conn.username) {
        return not_authorized_error(conn);
    }

    callback = function(room) {
        if (!room) {
            var msg = {
                'type': 'error',
                'content': 'No such room.',
            };
            return send(conn, msg);
        }
        result = room.add_guest(conn);
        if (result) {
            var msg = {
                'type': 'joined-room',
                'content': {
                    'room_id': room.id,
                    'gametype': room.gametype,
                }
            };
        } else {
            var msg = {
                'type': 'error',
                'content': "Can't join room.",
            };
        }
        send(conn, msg);
    }

    err_callback = function(err) {
        var msg = {
            'type': 'error',
            'content': "Room doesn't exist.",
        };
        send(conn, msg);
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
        var msg = {
            'type': 'error',
            'content': "Room doesn't exist.",
        };
        send(conn, msg);
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
    this.guests = {};

    this.add_guest = function(conn) {
        var key = conn.username;
        if (this.guests[key]) {
            this.guests[key].push(conn);
            return true;
        }

        if (!(this.game.can_add_guest(conn))) {
            return false;
        }

        this.guests[key] = [conn];
        this.guests[key].state = 'waiting';
        this.game.refresh();
        return true;
    }

    this.guests_amount = function () {
        return Object.keys(this.guests).length;
    }

    this.are_all_ready = function() {
        return this.are_all('ready');
    }

    this.are_all = function (state) {
        for (var key in this.guests) {
            if (this.guests[key].state != state) {
                return false;
            }
        }
        return true;
    }

    this.get_guest_list = function (active_player) {
        var list = {};
        for (var key in this.guests) {
            list[key] = {
                'state': this.guests[key].state,
                'active': key == active_player,
            };
        }
        return list;
    }

    this.disconnect = function (conn) {
        if (this.guests[conn.username]) {
            var conns = this.guests[conn.username];
            var index = conns.indexOf(conn);
            if (index > -1) {
                conns.splice(index, 1);
            }

            this.refresh_connections();
        }
    }

    this.refresh_connections = function () {
        if (this.game.is_guests_list_frozen()) {
            return;
        }

        for (var key in this.guests) {
            var conns = this.guests[key];
            if (conns.length == 0) {
                delete this.guests[key];
            }
        }

        this.game.refresh();
    }

    this.send_to_all = function (msg) {
        for (var key in this.guests) {
            var guest_conn = this.guests[key];
            for (var i = 0; i < guest_conn.length; i++) {
                send(guest_conn[i], msg);
            }
        }
    }

    this.reset_connections = function () {
        for (key in this.guests) {
            this.guests[key].state = 'waiting';
        }
    }

    this.game_seppuku = function () {
        this.reset_connections();
        this.game = new gametype_game_map[gametype](this);
        this.game.refresh();
        this.game.refresh_board();
    }
}

function NoughtsAndCrosses(room) {
    this._limit = 2;
    this.state = 'init';

    this.room = room;

    this.player1 = null;
    this.player2 = null;
    this.actual_player = null;
    this.signs = {};

    this.board = [[null, null, null], [null, null, null], [null, null, null]]

    this.refresh = function () {
        this.refresh_all_user_lists();
        this.refresh_state()
    }

    this.can_add_guest = function (conn) {
        return this.room.guests_amount() < this._limit;
    }

    this.handle_signal = function (conn, content) {
        switch (content.msg) {
            case 'client-ready':
                this.handle_ready(conn, content);
                break;

            case 'refresh-user-list':
                this.refresh_user_list_for(conn);
                break;

            case 'move':
                this.handle_move(conn, content);
                break;

            case 'get-my-state':
                this.handle_get_state(conn);
                this.refresh_board();
                break;

            case 'retry':
                this.maybe_retry(conn);
                break;

            case 'room-msg':
                this.handle_room_msg(conn, content);
                break;

            default:
                console.log(content);
        }
    }

    this.handle_room_msg = function (conn, content) {
        var msg = {
            'type': 'game-data',
            'content': {
                'room_id': this.room.id,
                'msg': 'room-msg',
                'message': content.message,
                'user': conn.username,
            }
        }
        this.room.send_to_all(msg);
    }

    this.maybe_retry = function (conn) {
        this.room.guests[conn.username].state = 'retry';
        if (!this.room.are_all('retry')) {
            this.refresh();
        } else {
            this.retry();
        }
    }

    this.retry = function () {
        if (this.state == 'finished') {
            this.room.game_seppuku()
        }
    }

    this.handle_ready = function (conn, content) {
        var msg = {
            'type': 'game-data',
            'content': {
                'room_id': this.room.id,
                'msg': 'ready-ack',
            }
        };
        send(conn, msg);
        this.room.guests[conn.username].state = 'ready';
        this.refresh_all_user_lists();
        this.maybe_start();
    }

    this.handle_get_state = function (conn) {
        var msg = {
            'type': 'game-data',
            'content': {
                'msg': 'your-state',
                'room_id': this.room.id,
                'state': this.room.guests[conn.username].state,
            }
        }
        send(conn, msg);
    }

    this.handle_move = function (conn, content) {
        if (this.state != 'running') {
            return;
        }

        if (conn.username != this.actual_player) {
            return;
        }

        var sign = this.signs[conn.username];

        var row = content['row'];
        var column = content['column'];
        if (this.board[row][column]) {
            return;
        }

        this.board[row][column] = sign;
        this.refresh_board();
        this.maybe_end();
        this.switch_players();
        this.refresh_all_user_lists();
    }

    this.maybe_end = function () {
        var players = [this.player1, this.player2];
        for (var i = 0; i < players.length; i++) {
            var player = players[i];
            var sign = this.signs[player];
            if (this.sign_wins(sign)) {
                return this.set_winner(player);
            }
        }
        if (this.board_is_full()) {
            this.set_draw();
        }
    }

    this.board_is_full = function () {
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                if (this.board[i][j] === null) {
                    return false;
                }
            }
        }
        return true;
    }

    this.set_draw = function () {
        this.stop();

        var msg = {
            'type': 'game-data',
            'content': {
                'msg': 'draw',
                'room_id': this.room.id,
            }
        }

        this.room.send_to_all(msg);

        var msg = {
            'type': 'game-data',
            'content': {
                'msg': 'log',
                'room_id': this.room.id,
                'message': 'remis',
            }
        }
        this.room.send_to_all(msg);
    }

    this.stop = function () {
        this.state = 'finished';
        this.actual_player = null;
        this.set_states_to(this.state);
        this.refresh_state();
        this.refresh_all_user_lists();
    }

    this.set_states_to = function (state) {
        for (key in this.room.guests) {
            this.room.guests[key].state = state;
        }
    }

    this.refresh_state = function () {
        for (key in this.room.guests) {
            var guest_conn = this.room.guests[key];
            for (var i = 0; i < guest_conn.length; i++) {
                this.handle_get_state(guest_conn[i]);
            }
        }
    }

    this.set_winner = function (player) {
        this.stop();

        for (key in this.room.guests) {
            var guest_conn = this.room.guests[key];
            if (key == player) {
                var result = 'won';

                var msg = {
                    'type': 'game-data',
                    'content': {
                        'msg': 'log',
                        'room_id': this.room.id,
                        'message': key + ' wygrał',
                    }
                }
                this.room.send_to_all(msg);
            } else {
                var result = 'lost';
                var log_msg = key + ' przegrał';
            }

            for (var i = 0; i < guest_conn.length; i++) {
                var msg = {
                    'type': 'game-data',
                    'content': {
                        'msg': result,
                        'room_id': this.room.id,
                    }
                };
                send(guest_conn[i], msg);
            }
        }
    }

    this.sign_wins = function (sign) {
        var conditions = [
            this.match_columns(sign),
            this.match_rows(sign),
            this.match_slants(sign),
        ]
        return conditions.some(is_true);
    }

    this.match_columns = function (sign) {
        for (var i = 0; i < 3; i++) {
            var col = [sign];
            for (var j = 0; j < 3; j++) {
                col.push(this.board[j][i]);
            }
            if (all_the_same(col)) {
                return true;
            }
        }
        return false;
    }

    this.match_rows = function (sign) {
        for (var i = 0; i < 3; i++) {
            var row = [sign];
            for (var j = 0; j < 3; j++) {
                row.push(this.board[i][j]);
            }
            if (all_the_same(row)) {
                return true;
            }
        }
        return false;
    }

    this.match_slants = function (sign) {
        board = this.board;
        var left = [sign, board[0][0], board[1][1], board[2][2]];
        var right = [sign, board[0][2], board[1][1], board[2][0]];
        var conditions = [
            all_the_same(left),
            all_the_same(right),
        ];
        return conditions.some(is_true);
    }

    this.switch_players = function () {
        if (this.actual_player == this.player1) {
            this.actual_player = this.player2;
        } else {
            this.actual_player = this.player1;
        }
    }

    this.refresh_board = function () {
        var msg = {
            'type': 'game-data',
            'content': {
                'msg': 'board',
                'room_id': this.room.id,
                'board': this.board,
            }
        };
        this.room.send_to_all(msg);
    }

    this.get_user_list = function () {
        return {
            'type': 'game-data',
            'content': {
                'msg': 'user-list',
                'room_id': this.room.id,
                'guests': this.room.get_guest_list([this.actual_player]),
            }
        };
    }

    this.refresh_all_user_lists = function () {
        var msg = this.get_user_list();
        this.room.send_to_all(msg);
    }

    this.refresh_user_list_for = function (conn) {
        var msg = this.get_user_list();
        send(conn, msg);
    }

    this.maybe_start = function () {
        if (this.room.guests_amount() == 2 && this.room.are_all_ready()) {
            this.start();
        }
    }

    this.start = function () {
        if (this.state != 'init') {
            return;
        }

        this.clean_user_states();
        var players = Object.keys(this.room.guests);
        this.player1 = players[0];
        this.player2 = players[1];
        this.signs[players[0]] = 'X';
        this.signs[players[1]] = 'O';
        this.actual_player = this.player1;
        this.state = 'running';
        this.refresh_all_user_lists();
    }

    this.clean_user_states = function () {
        for (var key in this.room.guests) {
            this.room.guests[key].state = null;
        }
        this.refresh_all_user_lists();
    }

    this.is_guests_list_frozen = function () {
        return this.state == 'running'
    }
}

function all_the_same(arr) {
    for (var i = 1; i < arr.length; i++) {
        if (arr[i] !== arr[0]) {
            return false;
        }
    }
    return true;
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
