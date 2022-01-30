const http = require('http');
const fs = require("fs");
const path = require("path");

const host = 'localhost';
const port = 8000;

const requestListener = (req, res) => {

}

const server = http.createServer(requestListener);

server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});