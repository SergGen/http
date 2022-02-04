'use strict';
const http = require('node:http');
const fs = require("node:fs");
const path = require("node:path");

const HOST = 'localhost';
const PORT = 8000;
const UNIX_EPOCH = 'Thu, 01 Jan 1970 00:00:00 GMT';
const TOKEN_LENGTH = 32;
const LETTER_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const LETTER = LETTER_UPPER + LETTER_LOWER;
const DIGIT = '0123456789';
const LETTER_DIGIT = LETTER + DIGIT;
const GET_METHOD = 'GET';
const POST_METHOD = 'POST';
const DELETE_METHOD = 'DELETE';
const PATCH_METHOD = 'PATCH';
const HOME_URL = '/';
const AUTH_URL = '/auth';
const POST_URL = '/post';
const DELETE_URL = '/delete';
const OK_200 = 'OK_200';
const OK_200_PAGE = 'OK_200_page';
const OK_200_AUTH = 'OK_200_auth';
const BAD_REQUEST_400 = 'badRequest_400';
const UNAUTHORIZED_401 = 'unauthorized_401';
const UNAUTHORIZED_401_KILL_COOKIE = 'unauthorized_401_killCookie';
const NOT_FOUND_404 = 'notFound_404';
const NOT_FOUND_404_GET = 'notFound_404_get';
const METHOD_NOT_ALLOWED_405 = 'methodNotAllowed_405';
const INTERNAL_SERVER_ERROR_500 = 'internalServerError_500';
const APPROVED_METHODS = {
    [HOME_URL] : [GET_METHOD, PATCH_METHOD],
    [AUTH_URL] : [GET_METHOD, POST_METHOD, DELETE_METHOD],
    [POST_URL] : [GET_METHOD, POST_METHOD],
    [DELETE_URL] : [GET_METHOD, DELETE_METHOD]
}
const CORRECT_URLS = [HOME_URL, AUTH_URL, POST_URL, DELETE_URL];
const AUTHORIZED_USERS_DB_FILENAME = 'authorized_users.json';

const user = { id: 123, username: 'testUser', password: 'qwerty' };

let authorizedUsers = {};
/**
 * Генератор случайного токена
 * @returns {string}
 */
const generateToken = () => {
    const base = LETTER_DIGIT.length;
    let token = '';
    for (let i = 0; i < TOKEN_LENGTH; i++) {
        const index = Math.floor(Math.random() * base);
        token += LETTER_DIGIT[index];
    }
    return token;
};

/**
 * Запись на диск актуальной информации с авторизированными пользователями
 */
const updateAuthorizedUsersDB = () => {
    fs.writeFile(path.join(__dirname, AUTHORIZED_USERS_DB_FILENAME), JSON.stringify(authorizedUsers), (err) => {
        if(err) console.log(err, AUTHORIZED_USERS_DB_FILENAME, 'write Err');
    });
}
/**
 * Загрузчик базы данных с авторизированными пользователями при старте сервера
 */
const loadAuthorizedUsersDB = () => {
    let flagUpdateDB = false;
    const filePath = path.join(__dirname, AUTHORIZED_USERS_DB_FILENAME);
    try {
        fs.accessSync(filePath, fs.constants.F_OK | fs.constants.R_OK);
        let readData = fs.readFileSync(filePath, 'utf8');
        authorizedUsers = JSON.parse(readData);
        if(authorizedUsers){
            Object.entries(authorizedUsers).forEach(([key, userProfile]) => {
                if(userProfile['expired'] < Date.now()) {
                    delete authorizedUsers[key];
                    flagUpdateDB = true;
                }
            });
        }
        if(flagUpdateDB) {
            updateAuthorizedUsersDB();
        }
    } catch (err) {
        console.log(err, 'No file authorized_users.json');
    }
}
loadAuthorizedUsersDB();
/**
 * Парсер cookie
 * @param {Object} req - объект запроса
 * @returns {Object} - объект с cookie
 */
const parseCookie = (req) => {
    let cookies = {}
    if (req.headers.cookie) {
        const items = req.headers.cookie.split(';');
        items.forEach(item => {
            const parts = item.split('=');
            const key = parts[0].trim();
            const val = parts[1] || '';
            cookies[key] = val.trim();
        });
    }
    return cookies;
}
/**
 * Возвращает шаблон настроект для ответа
 * @param {string} profileName
 * @param {number} contentLength
 * @param {string} cookieValue
 * @param {string} cookieExp
 * @returns {Object}
 */
const resProfile = (profileName, contentLength = 0, cookieValue = '', cookieExp = '') => {
    const profile = {
        [OK_200]: {
            statuses: {
                statusCode: 200,
                statusMessage: 'OK'
            },
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': contentLength
            }
        },
        [OK_200_PAGE]: {
            statuses: {
                statusCode: 200,
                statusMessage: 'OK'
            },
            headers: {
                'Content-Type': 'text/html;charset=utf-8'
            }
        },
        [OK_200_AUTH]: {
            statuses: {
                statusCode: 200,
                statusMessage: 'OK'
            },
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': contentLength
            },
            cookies: {
                cookieName: 'userId',
                cookieValue: cookieValue,
                cookieExp: cookieExp,
                cookiePath: '/',
                cookieDomain: HOST,
                httpOnly: '; HttpOnly'
            }
        },
        [BAD_REQUEST_400]: {
            statuses: {
                statusCode: 400,
                statusMessage: 'Bad Request'
            }
        },
        [UNAUTHORIZED_401]: {
            statuses: {
                statusCode: 401,
                statusMessage: 'Unauthorized'
            },
        },
        [UNAUTHORIZED_401_KILL_COOKIE]: {
            statuses: {
                statusCode: 401,
                statusMessage: 'Unauthorized'
            },
            cookies: {
                cookieName: 'userId',
                cookieValue: cookieValue,
                cookieExp: UNIX_EPOCH,
                cookiePath: '/',
                cookieDomain: HOST,
                httpOnly: '; HttpOnly'
            }
        },
        [NOT_FOUND_404]: {
            statuses: {
                statusCode: 404,
                statusMessage: 'Not Found'
            }
        },
        [NOT_FOUND_404_GET]: {
            statuses: {
                statusCode: 404,
                statusMessage: 'Not Found'
            },
            headers: {
                'Content-Type': 'text/html;charset=utf-8',
            }
        },
        [METHOD_NOT_ALLOWED_405]: {
            statuses: {
                statusCode: 405,
                statusMessage: 'Method Not Allowed'
            }
        },
        [INTERNAL_SERVER_ERROR_500]: {
            statuses: {
                statusCode: 500,
                statusMessage: 'Internal Server Error'
            }
        }
    }
    return profile[profileName];
}

/**
 * Функция ответа на запрос
 * @param {Object} res - объект обработчика ответа
 * @param {Object} sendOptions - опции направления ответа
 * @param {Object | null} dataSend - отправляемая информация
 * @param {string} pageName - имя страницы для загрузки
 */
const sendResponse = (res, sendOptions, dataSend, pageName = '') => {
    res.statusCode = sendOptions.statuses.statusCode;
    res.statusMessage = sendOptions.statuses['statusMsg'];
    if(sendOptions.hasOwnProperty('headers')) {
        Object.entries(sendOptions.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
    }
    if(sendOptions.hasOwnProperty('cookies')) {
        let preparedCookies = `${sendOptions.cookies.cookieName}=${sendOptions.cookies.cookieValue}; ` +
                `expires=${sendOptions.cookies.cookieExp}; ` +
                `Path=${sendOptions.cookies.cookiePath}; ` +
                `Domain=${sendOptions.cookies.cookieDomain}`+
                `${sendOptions.cookies.httpOnly}`;
        res.setHeader('Set-Cookie', preparedCookies);
    }

    if(pageName === '') {
        let preparedData = '';
        if(dataSend !== null) {
            preparedData = dataSend;
        }
        res.end(preparedData);
    } else {
        let pagePath = path.join(__dirname, pageName);
        let readStream = fs.createReadStream(pagePath, 'utf8');
        readStream.pipe(res);
    }
}
/**
 * Обработчик внутренней ошибки сервера.
 * @param {Object} res
 * @param {Object} err
 * @param {string} message
 */
const internalErrHandler = (res, err, message) => {
    console.log(message);
    console.dir(err);
    let sendOptions = resProfile(INTERNAL_SERVER_ERROR_500);
    sendResponse(res, sendOptions, null);
}
/**
 * Сканирует директорию и отправляет клиенту список файлов в ней.
 * @param {Object} res
 */
const scanFolderHandler = (res) => {
    let scanPath = path.join(__dirname, '/files');
    try{
        fs.accessSync(scanPath, fs.constants.F_OK | fs.constants.R_OK);
        let dir = fs.readdirSync(scanPath);
        let dataSend = JSON.stringify(dir);
        let sendOptions = resProfile(OK_200, dataSend.length);
        sendResponse(res, sendOptions, dataSend);
    } catch (err) {
        internalErrHandler(res, err, 'Post');
    }
}

const server = http.createServer((req, res) => {
    let checkUrlStatus = CORRECT_URLS.some(url => url === req.url);
    let cookies = parseCookie(req);
    let userAuthorizedStatus = cookies.hasOwnProperty('userId') && cookies.userId in authorizedUsers;

    if (checkUrlStatus) {
        let checkMethodStatus = APPROVED_METHODS[req.url].some(method => method === req.method);
        if (checkMethodStatus) {
            let data = '';
            req.on('data', chunk => { data += chunk });
            /**
             * Загрузка страницы
             */
            if(req.method === GET_METHOD) {
                try{
                    let sendOptions = resProfile(OK_200_PAGE);
                    sendResponse(res, sendOptions,null, 'index.html');
                } catch(err) {
                    internalErrHandler(res, err, 'Page load');
                }
            }
            /**
             * Обработка записи файлов
             */
            if(req.url === POST_URL && req.method === POST_METHOD) {
                if(userAuthorizedStatus) {
                    req.on('end', () => {
                        let userReceivedData = JSON.parse(data);
                        if(userReceivedData.fileName === '') {
                            let sendOptions = resProfile(BAD_REQUEST_400);
                            sendResponse(res, sendOptions, null);
                        } else {
                            let filePath = path.join(__dirname, 'files/' + userReceivedData.fileName);
                            fs.writeFile(filePath, userReceivedData.content, (err) => {
                                if(err) {
                                    internalErrHandler(res, err, 'Post');
                                } else {
                                    scanFolderHandler(res);
                                }
                            });
                        }
                    });
                } else {
                    let sendOptions = resProfile(UNAUTHORIZED_401);
                    sendResponse(res, sendOptions, null);
                }
            }
            /**
             * Обработка удаления файлов
             */
            if(req.url === DELETE_URL && req.method === DELETE_METHOD) {
                if(userAuthorizedStatus) {
                    req.on('end', () => {
                        console.log('delete!!!');
                        let userReceivedData = JSON.parse(data);
                        if(userReceivedData.fileName === '') {
                            let sendOptions = resProfile(BAD_REQUEST_400);
                            sendResponse(res, sendOptions, null);
                        } else {
                            let filePath = path.join(__dirname, 'files/' + userReceivedData.fileName);
                            fs.unlink(filePath, (err) => {
                                if(err) {
                                    internalErrHandler(res, err, 'Delete');
                                } else {
                                    scanFolderHandler(res);
                                }
                            });
                        }
                    });
                } else {
                    let sendOptions = resProfile(UNAUTHORIZED_401);
                    sendResponse(res, sendOptions, null);
                }
            }

            /**
             * Обновление статуса авторизации при загрузке страницы
             */
            if(req.method === PATCH_METHOD) {
                if(userAuthorizedStatus) {
                    let dataSend = {id: authorizedUsers[cookies['userId']].id};
                    let preparedData = JSON.stringify(dataSend);
                    let sendOptions = resProfile(OK_200, preparedData.length);
                    sendResponse(res, sendOptions, preparedData);
                } else if (cookies.hasOwnProperty('userId') && !(cookies.userId in authorizedUsers)) {
                    console.log('COOKIE KILLED!!!');
                    let sendOptions = resProfile(UNAUTHORIZED_401_KILL_COOKIE, 0, cookies.userId);
                    sendResponse(res, sendOptions, null);
                } else {
                    let sendOptions = resProfile(UNAUTHORIZED_401);
                    sendResponse(res, sendOptions, null);
                }
            }
            /**
             * Обработка инициации авторизации
             */
            if(req.url === AUTH_URL && req.method === POST_METHOD) {

                console.log(req.headers.authorization, req.headers.authorization.slice(5));

                req.on('end', () => {
                    try {
                        let userReceivedData = JSON.parse(data);
                        if (userReceivedData.login.toLowerCase() === user.username.toLowerCase() && userReceivedData.pwd === user.password) {
                            userAuthorizedStatus = true;
                            let userId = generateToken();
                            let dataSend = {id: user.id};
                            let preparedData = JSON.stringify(dataSend);

                            authorizedUsers[userId] = {
                                expire: Date.now() + 2 * 24 * 60 * 60 * 1000,
                                id: user.id,
                                username: user.username,
                                password: user.password
                            };
                            updateAuthorizedUsersDB();
                            let sendOptions = resProfile(OK_200_AUTH,
                                preparedData.length,
                                userId,
                                new Date(authorizedUsers[userId].expire).toUTCString());
                            sendResponse(res, sendOptions, preparedData);
                        } else {
                            let sendOptions = resProfile(BAD_REQUEST_400);
                            sendResponse(res, sendOptions, null);
                        }
                    } catch (err) {
                        internalErrHandler(res, err, 'Auth');
                    }
                });
            }
            /**
             * Обработка выхода
             */
            if(userAuthorizedStatus && req.url === AUTH_URL && req.method === DELETE_METHOD){
                let cookies = parseCookie(req);
                try {
                    delete authorizedUsers[cookies['userId']];
                    updateAuthorizedUsersDB();

                    let sendOptions = resProfile(UNAUTHORIZED_401_KILL_COOKIE);
                    sendResponse(res, sendOptions, null);
                } catch (err) {
                    internalErrHandler(res, err, 'Logout');
                }
            }
        } else {
            let sendOptions = resProfile(METHOD_NOT_ALLOWED_405);
            sendResponse(res, sendOptions,null);
        }
    } else {
        if (req.method === GET_METHOD) {
            let sendOptions = resProfile(NOT_FOUND_404_GET);
            sendResponse(res, sendOptions,null, 'index.html');
        } else {
            let sendOptions = resProfile(NOT_FOUND_404);
            sendResponse(res, sendOptions, null);
        }
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
});