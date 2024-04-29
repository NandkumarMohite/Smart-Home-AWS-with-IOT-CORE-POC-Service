const Response = {
    success: function (body, statCode = 200) {
        return buildResponse(statCode, body);
    },
    failure: function (body, statCode = 500) {
        return buildResponse(statCode, body);
    },
    httpError: function (statCode, body) {
        return buildResponse(statCode, body);
    },
    httpResponse: function (statCode, body) {
        return buildResponse(statCode, body);
    },
};

function buildResponse(statusCode, body) {
    var ret = {
        statusCode: statusCode,
        headers: {
            'Access-Control-Allow-Origin': "*",
            'Access-Control-Allow-Credentials': true,
            'Strict-Transport-Security':
                'max-age=31536000; includeSubDomains; preload',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Content-Security-Policy': "img-src 'self'",
        },
        body: {},
    };
    ret.body = JSON.stringify(body);
    console.log('ret ', ret);
    return ret;
}

module.exports = Response;
