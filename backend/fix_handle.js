const fs = require('fs');
let code = fs.readFileSync('src/modules/insurance/insuranceRoutes.js', 'utf8');
const replacement = `
const handleUpload = (req, res, next) => {
    const uploader = upload.single('file');
    uploader(req, res, function (err) {
        if (err) {
            return res.status(400).json({ success: false, message: err.message, error: err.message });
        }
        next();
    });
};
`;
if (!code.includes('handleUpload =')) {
    code = code.replace('const requireObjectIdParam', replacement + '\nconst requireObjectIdParam');
    fs.writeFileSync('src/modules/insurance/insuranceRoutes.js', code);
    console.log('Fixed handleUpload');
}
