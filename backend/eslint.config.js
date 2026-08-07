const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                console: "readonly",
                process: "readonly",
                require: "readonly",
                module: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                exports: "readonly",
                Buffer: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                URL: "readonly",
                Blob: "readonly",
                FormData: "readonly",
                fetch: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["error", { "argsIgnorePattern": "^(req|res|next|err|_.*)$" }]
        }
    }
];
