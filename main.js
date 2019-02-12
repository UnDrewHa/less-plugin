const less = require('less');
const plugin = require('./plugin');
const fs = require('fs');

const lessFile = fs.readFileSync('./main.less', {encoding: 'utf8'});

less.render(lessFile, {
    plugins: [plugin]
}).then(result => console.log(result.css));
