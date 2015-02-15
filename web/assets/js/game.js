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
        } else {
            console.log(data);
        }
        console.log(data);  // FIXME
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
    var ready_button = $('<button>Gotowy</button>');
    root.find('.interface').append(ready_button);
    ready_button.click(function (e) {
        ws.send(JSON.stringify({
            'type': 'game-data',
            'room_id': content.room_id,
            'content': {
                'msg': 'client-ready',
            }
        }));
    })
}
