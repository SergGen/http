const http = require('http');
const fs = require("fs");
const path = require("path");

const host = 'localhost';
const port = 8000;

/**
 * Функция обработки ответа сервера *
 * @param {Object} res - Объект обработки ответа сервера
 * @param {Number} statusCode - Код статуса
 * @param {String} statusMessage - Сообщение статуса
 * @param {String} resData - Текст ответа
 * @param {Object} headers - Объект с заголовками
 */
const serverAnswer = (res, statusCode, statusMessage, resData, headers = {'Content-Type': 'text/plain'}) => {
    res.writeHead(statusCode, statusMessage, headers);
    res.end(resData, 'utf8');
}

const requestListener = (req, res) => {
    switch (req.url) {
        case '/get':
            if(req.method === 'GET'){
                try{
                    let dir = fs.readdirSync(`${path.resolve(process.cwd())}/files`).join(', ');
                    serverAnswer(res, 200, 'OK', dir);
                } catch(err){
                    serverAnswer(res, 500, 'Internal server error', `${JSON.stringify(err)}`,
                        {'Content-Type': 'application/json'});
                }
            } else {
                serverAnswer(res, 405, 'Method Not Allowed', 'HTTP method not allowed');
            }
            break;
        case '/post':
            if(req.method === 'POST'){
                serverAnswer(res, 200, 'OK', 'success');
            } else {
                serverAnswer(res, 405, 'Method Not Allowed', 'HTTP method not allowed');
            }
            break;
        case '/delete':
            if(req.method === 'DELETE'){
                serverAnswer(res, 200, 'OK', 'success');
            } else {
                serverAnswer(res, 405, 'Method Not Allowed', 'HTTP method not allowed');
            }
            break;
        case '/redirect':
            if(req.method === 'GET'){
                serverAnswer(res, 301, 'Moved Permanently', 'redirected',
                    {'Content-Type': 'text/plain', Location: '/redirected'});
            } else {
                serverAnswer(res, 405, 'Method Not Allowed', 'HTTP method not allowed');
            }
            break;
        case '/redirected':
            if(req.method === 'GET'){
                serverAnswer(res, 200, 'OK', 'redirected page');
            } else {
                serverAnswer(res, 405, 'Method Not Allowed', 'HTTP method not allowed');
            }
            break;
        default:
            serverAnswer(res,404, 'Not found', 'Page not found');
    }
}

const server = http.createServer(requestListener);

server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});