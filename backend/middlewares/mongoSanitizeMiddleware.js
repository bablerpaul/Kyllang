const { sanitize } = require('express-mongo-sanitize');

module.exports = () => {
    return (req, res, next) => {
        if (req.body) sanitize(req.body);
        if (req.params) sanitize(req.params);
        if (req.headers) sanitize(req.headers);
        if (req.query) sanitize(req.query);
        
        next();
    };
};
