$(function () {
    var ws = new WebSocket("ws://localhost:8001");
    ws.onmessage = function(msg) {
        data = JSON.parse(msg.data);
        if (data.type == 'global-message') {
            $("#chat").append(data.content.name + ": " + data.content.message + "<br>");
        } else {
            console.log(data);
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
