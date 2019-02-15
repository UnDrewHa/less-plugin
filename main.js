const less = require('less');
const plugin = require('./plugin');
const fs = require('fs');

const usePlugin = process.argv.slice(2)[0] === "use-plugin";
const plugins = usePlugin ? [plugin] : [];

const lessFile = fs.readFileSync('./main.less', {encoding: 'utf8'});

console.time("LESS");

less.render(lessFile, {plugins})
    .then(result => {
        const filePath = usePlugin ? 'plugin.css' : 'regular.css';
        console.timeEnd("LESS");
        
        fs.writeFileSync(filePath, result.css)
    });
