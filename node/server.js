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

    for (var key in rooms) {
        rooms[key].game.disconnect(conn);
    }
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
            }));
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
    this.state = 'init';

    this.room = room;
    this.guests = {};

    this.player1 = null;
    this.player2 = null;
    this.actual_player = null;
    this.signs = {};

    this.board = [[null, null, null], [null, null, null], [null, null, null]]

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
        this.guests[key].status = 'waiting';
        this.refresh_all_user_lists();
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
            this.guests[conn.username].status = 'ready';
            this.refresh_all_user_lists();
            this.maybe_start();
        } else if (content.msg == 'refresh-user-list') {
            this.refresh_user_list_for(conn);
        } else if (content.msg == 'move') {
            this.handle_move(conn, content);
        } else {
            console.log(content); // DEBUG
        }
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
        if (!(this.board[row][column])) {
            this.board[row][column] = sign;
        }
        this.refresh_board();
        this.maybe_end();
        this.switch_players();
    }

    this.maybe_end = function () {
        var players = [this.player1, this.player2];
        for (var i = 0; i < players.length; i++) {
            var player = players[i];
            var sign = this.signs[player];
            if (this.sign_wins(sign)) {
                this.set_winner(player);
                return;
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

        for (key in this.guests) {
            var guest_conn = this.guests[key];
            for (var i = 0; i < guest_conn.length; i++) {
                guest_conn[i].sendText(JSON.stringify({
                    'type': 'game-data',
                    'content': {
                        'msg': 'draw',
                        'room_id': this.room.id,
                    }
                }));
            }
        }
    }

    this.stop = function () {
        this.state = 'finished';
    }

    this.set_winner = function (player) {
        this.stop();

        for (key in this.guests) {
            var guest_conn = this.guests[key];
            for (var i = 0; i < guest_conn.length; i++) {
                guest_conn[i].sendText(JSON.stringify({
                    'type': 'game-data',
                    'content': {
                        'msg': key == player ? 'won' : 'lost',
                        'room_id': this.room.id,
                    }
                }));
            }
        }
    }

    this.sign_wins = function (sign) {
        if (this.match_columns(sign)
            || this.match_rows(sign)
            || this.match_slants(sign)) {
            return true;
        }
        return false;
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
        if (all_the_same(left) || all_the_same(right)) {
            return true;
        }
        return false;
    }

    this.switch_players = function () {
        if (this.actual_player == this.player1) {
            this.actual_player = this.player2;
        } else {
            this.actual_player = this.player1;
        }
    }

    this.refresh_board = function () {
        for (key in this.guests) {
            var guest_conn = this.guests[key];
            for (var i = 0; i < guest_conn.length; i++) {
                guest_conn[i].sendText(JSON.stringify({
                    'type': 'game-data',
                    'content': {
                        'msg': 'board',
                        'room_id': this.room.id,
                        'board': this.board,
                    }
                }));
            }
        }
    }

    this.refresh_all_user_lists = function () {
        for (key in this.guests) {
            var guest_conn = this.guests[key];
            for (var i = 0; i < guest_conn.length; i++) {
                this.refresh_user_list_for(guest_conn[i]);
            }
        }
    }

    this.refresh_user_list_for = function (conn) {
        conn.sendText(JSON.stringify({
            'type': 'game-data',
            'content': {
                'msg': 'user-list',
                'room_id': this.room.id,
                'guests': this.get_guest_list(),
            }
        }));
    }

    this.get_guest_list = function () {
        var list = {};
        for (var key in this.guests) {
            list[key] = {'status': this.guests[key].status};
        }
        return list;
    }

    this.are_all_ready = function() {
        for (var key in this.guests) {
            if (this.guests[key].status != 'ready') {
                return false;
            }
        }
        return true;
    }

    this.maybe_start = function () {
        if (this.guests_amount() == 2 && this.are_all_ready()) {
            this.start();
        }
    }

    this.start = function () {
        if (this.state != 'init') {
            return;
        }

        this.clean_user_statuses();
        var players = Object.keys(this.guests);
        this.player1 = players[0];
        this.player2 = players[1];
        this.signs[players[0]] = 'X';
        this.signs[players[1]] = 'O';
        this.actual_player = this.player1;
        this.state = 'running';
    }

    this.clean_user_statuses = function () {
        for (var key in this.guests) {
            this.guests[key].status = null;
        }
        this.refresh_all_user_lists();
    }

    this.disconnect = function (conn) {
        if (this.guests[conn.username]) {
            conns = this.guests[conn.username];
            var index = conns.indexOf(conn);
            if (index > -1) {
                conns.splice(index, 1);
            }

            if (conns.length == 0) {
                delete this.guests[conn.username];
                this.refresh_all_user_lists();
            }
        }
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
