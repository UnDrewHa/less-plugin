const less = require('less');
const VariableReplacerPlugin = require('./plugin');
const config = require('./config');
const fs = require('fs');

const usePlugin = true || process.argv.slice(2)[0] === "use-plugin";
const plugins = usePlugin ? [new VariableReplacerPlugin(config)] : [];

const lessFile = fs.readFileSync('./main.less', {encoding: 'utf8'});

console.time("LESS");

less.render(lessFile, {plugins, sourceMap: { sourceMapFileInline: true }})
    .then(result => {
        const filePath = usePlugin ? 'plugin.css' : 'regular.css';
        console.timeEnd("LESS");
        console.log(result.css);

        fs.writeFileSync(filePath, result.css)
    });
