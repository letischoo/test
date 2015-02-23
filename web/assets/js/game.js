var rooms = {};

function send(socket, type, data) {
    return socket.send(JSON.stringify({
        'type': type,
        'content': data,
    }))
}

$(function () {
    var ws = new WebSocket("ws://localhost:8001");
    ws.onmessage = function(msg) {
        data = JSON.parse(msg.data);

        switch (data.type) {
            case 'global-message':
                $("#chat").append(data.content.name + ": " + data.content.message + "<br>");
                break;

            case 'error':
                alert(data.content);
                throw Error(data.content);

            case 'auth-success':
                connect_to_game(ws);
                break;

            case 'joined-room':
                initialize_game(ws, data.content);
                break;

            case 'game-data':
                if (rooms[data.content.room_id]) {
                    rooms[data.content.room_id].handle_game_data(data.content);
                }
                break;

            default:
                console.log(data);
        }
    }

    ws.onopen = function (e) {
        send(ws, 'authentication', {'session_id': getCookie('PHPSESSID')});
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
        send(ws, 'global-message', tekst);
        $("#msg").val("");
    }
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
    send(ws, 'join-room', {'room_id': room_id});
}

function initialize_game(ws, content) {
    var root = $('#gameroot');
    var room_id = content.room_id
    rooms[room_id] = new gametype_game_map[content.gametype](ws, root, room_id)
    rooms[room_id].boot();
}

function NoughtsAndCrosses(conn, root, room_id) {
    this._ready = false;
    this.conn = conn;
    this.room_id = room_id;

    var game = this;

    var ready_button = $('<button>Gotowy</button>');
    root.find('.interface').append(ready_button);
    ready_button.hide();
    this.user_list_container = root.find('.user-list');
    this.canvas = root.find('.canvas');
    this.room_msg = root.find('.messages');
    this.room_msg_interface = root.find('.messages-interface');

    ready_button.click(function (e) {
        send(conn, 'game-data', {'room_id': room_id, 'msg': 'client-ready'});
    });

    this.ready_button = ready_button;

    var retry_button = $('<button>Jeszcze raz</button>').hide();
    root.find('.interface').append(retry_button);
    this.user_list_container = root.find('.user-list');
    this.canvas = root.find('.canvas');

    retry_button.click(function (e) {
        send(conn, 'game-data', {'room_id': room_id, 'msg': 'retry'});
    });

    this.retry_button = retry_button;

    this.room_msg_interface.find('button').click(function (e) {
        var input = $(this).parent().find('input');
        var txt = input.val();
        if (txt) {
            game.send_message(txt);
            input.val('');
        }
    });

    this.fields = [];
    for (var i = 0; i < 3; i++) {
        var row_div = $('<div>');
        var fields_row = [];
        for (var j = 0; j < 3; j++) {
            var bt = $('<button>&nbsp;</button>')
            bt.data('row', i);
            bt.data('column', j);
            bt.click(function (ev) {
                send(conn, 'game-data', {
                    'room_id': room_id,
                    'msg': 'move',
                    'row': $(this).data('row'),
                    'column': $(this).data('column'),
                });
            });
            row_div.append(bt);
            fields_row.push(bt);
        }
        this.canvas.append(row_div);
        this.fields.push(fields_row);
    }

    this.handle_game_data = function (data) {
        switch (data.msg) {
            case 'ready-ack':
                this.ready();
                break;

            case 'user-list':
                this._render_user_list(data);
                break;

            case 'board':
                this._render_board(data);
                break;

            case 'won':
                alert("Wygrałeś :)");
                break;

            case 'lost':
                alert("Przegrałeś :(");
                break;

            case 'draw':
                alert("Remis :O");
                break;

            case 'your-state':
                this.handle_state(data);
                break;

            case 'room-msg':
                this.render_room_msg(data);
                break;

            case 'log':
                this.render_log(data);
                break;

            default:
                console.log(data);
        }
    }

    this.render_log = function (data) {
        this.room_msg.append($(
            '<div class="log">' + data.message + '</div>'
        ));
    }

    this.render_room_msg = function (data) {
        this.room_msg.append($(
            '<div class="msg"><span>' + data.user + ':</span> '
            + data.message + '</div>'
        ));
    }

    this.send_message = function (txt) {
        send(this.conn, 'game-data', {
            'room_id': room_id,
            'msg': 'room-msg',
            'message': txt,
        });
    }

    this.handle_state = function (data) {
        if (data.state == 'waiting') {
            this.ready_button.show();
            this.retry_button.hide();
        } else if (data.state == 'finished') {
            this.retry_button.show();
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
        this._ready = true;
        ready_button.hide();
    }

    this.boot = function () {
        this.refresh_user_list();
        this.get_state();
    }

    this.get_state = function () {
        send(this.conn, 'game-data', {
            'room_id': room_id,
            'msg': 'get-my-state',
        });
    }

    this.refresh_user_list = function () {
        send(this.conn, 'game-data', {
            'room_id': room_id,
            'msg': 'refresh-user-list',
        });
    }

    this._render_user_list = function (data) {
        console.log(data);
        var list = $('<ul>');
        for (var key in data.guests) {
            var state = data.guests[key].state
            var is_active = data.guests[key].active
            var txt = key;
            if (is_active) {
                txt = '<span class="active-user">' + txt + '</span>'
            }
            if (state) {
                txt += ' - ' + state
            }
            list.append($('<li>' + txt + '</li>'));
        }
        this.user_list_container.empty().append(list);
    }
}

var gametype_game_map = {
    'noughsandcrosses': NoughtsAndCrosses,
}
