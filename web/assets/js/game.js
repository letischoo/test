var rooms = {};

$(function () {
    var ws = new WebSocket("ws://localhost:8001");
    ws.onmessage = function(msg) {
        data = JSON.parse(msg.data);
        if (data.type == 'global-message') {
            $("#chat").append(data.content.name + ": " + data.content.message + "<br>");
        } else if (data.type == 'error') {
            alert(data.content);
            throw Error(data.content);
        } else if (data.type == 'auth-success') {
            connect_to_game(ws);
        } else if (data.type == 'joined-room') {
            initialize_game(ws, data.content);
        } else if (data.type == 'game-data') {
            if (rooms[data.content.room_id]) {
                rooms[data.content.room_id].handle_game_data(data.content);
            }
        } else {
            console.log(data); // DEBUG
        }
    }

    ws.onopen = function (e) {
        msg(ws, 'authentication', {'session_id': getCookie('PHPSESSID')});
    }

    $("#send").click(function(){
        var tekst = $("#msg").val();
        send_chat_message(ws, tekst);
    });

    $(window).on('beforeunload', function() {
        ws.close();
    });
});

function send_chat_message(ws, tekst) {
    if (tekst.trim()) {
        ws.send(JSON.stringify({'type': 'global-message', 'content': tekst}));
        $("#msg").val("");
    }
}

function msg(ws, type, content) {
    ws.send(JSON.stringify({'type': type, 'content': content}))
}

function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length == 2) {
        return parts.pop().split(";").shift();
    }
}

function connect_to_game(ws) {
    var room_id = $('#gameroot').data('roomid');
    if (room_id) {
        join_room(ws, room_id);
    }
}

function join_room(ws, room_id) {
    ws.send(JSON.stringify({
        'type': 'join-room',
        'content': {
            'room_id': room_id,
        }
    }))
}

function initialize_game(ws, content) {
    var root = $('#gameroot');
    var room_id = content.room_id
    rooms[room_id] = new gametype_game_map[content.gametype](ws, root, room_id)
    rooms[room_id].boot();
}

function NoughtsAndCrosses(conn, root, room_id) {
    this.ready = false;
    this.conn = conn;
    this.room_id = room_id;

    var ready_button = $('<button>Gotowy</button>');
    root.find('.interface').append(ready_button);
    this.user_list_container = root.find('.user-list');
    this.canvas = root.find('.canvas');

    this.fields = [];
    for (var i = 0; i < 3; i++) {
        var row_div = $('<div>');
        var fields_row = [];
        for (var j = 0; j < 3; j++) {
            var bt = $('<button>&nbsp;</button>')
            bt.data('row', i);
            bt.data('column', j);
            bt.click(function (ev) {
                conn.send(JSON.stringify({
                    'type': 'game-data',
                    'content': {
                        'room_id': room_id,
                        'msg': 'move',
                        'row': $(this).data('row'),
                        'column': $(this).data('column'),
                    }
                }))
            });
            row_div.append(bt);
            fields_row.push(bt);
        }
        this.canvas.append(row_div);
        this.fields.push(fields_row);
    }

    ready_button.click(function (e) {
        conn.send(JSON.stringify({
            'type': 'game-data',
            'content': {
                'room_id': room_id,
                'msg': 'client-ready',
            }
        }));
    })

    this.handle_game_data = function (data) {
        if (data.msg == 'ready-ack') {
            this.ready();
        } else if (data.msg == 'user-list') {
            this._render_user_list(data);
        } else if (data.msg == 'board') {
            this._render_board(data);
        } else if (data.msg == 'won') {
            alert("Wygrałeś :)");
        } else if (data.msg == 'lost') {
            alert("Przegrałeś :(");
        } else if (data.msg == 'draw') {
            alert("Remis :O");
        } else {
            console.log(data);  // DEBUG
        }
    }

    this._render_board = function (data) {
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                this.fields[i][j].html(data.board[i][j] || '&nbsp;');
            }
        }
    }

    this.ready = function () {
        this.ready = true;
        ready_button.hide();
    }

    this.boot = function () {
        this.refresh_user_list();
    }

    this.refresh_user_list = function () {
        this.conn.send(JSON.stringify({
            'type': 'game-data',
            'content': {
                'room_id': room_id,
                'msg': 'refresh-user-list',
            }
        }));
    }

    this._render_user_list = function (data) {
        var list = $('<ul>');
        for (var key in data.guests) {
            var status = data.guests[key].status
            var txt = key;
            if (status) {
                txt += ' - ' + status
            }
            list.append($('<li>' + txt + '</li>'));
        }
        this.user_list_container.empty().append(list);
    }
}

var gametype_game_map = {
    'noughsandcrosses': NoughtsAndCrosses,
}
