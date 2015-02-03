var ws = new WebSocket("ws://localhost:8001");
ws.onmessage = function(msg) {
    data = JSON.parse(msg.data);
    if (data.type == 'global-message') {
        $("#chat").append(data.content.name + ": " + data.content.message + "<br>");
    } else {
        console.log(data);
    }
}
