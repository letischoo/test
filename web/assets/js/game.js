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

    ws.send(JSON.stringify('type': 'authentication', 'content': {'session_id': getCookie('PHPSESSID')}));

    $("#send").click(function(){
        var tekst = $("#msg").val();
        send_message(ws, tekst);
    });
});

function send_message(ws, tekst) {
    if (tekst.trim()) {
        ws.send(JSON.stringify({'type': 'global-message', 'content': tekst}));
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
