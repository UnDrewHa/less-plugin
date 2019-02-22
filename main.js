const less = require('less');
const VariableReplacerPlugin = require('./plugin');
const config = require('./config');
const fs = require('fs');

const usePlugin = true || process.argv.slice(2)[0] === "use-plugin";
const plugins = usePlugin ? [new VariableReplacerPlugin(config)] : [];

const lessFile = fs.readFileSync('./main.less', {encoding: 'utf8'});
const testFileWithManualInsert = fs.readFileSync('./test/file-manual-insert.less', {encoding: 'utf8'});
const testFile = fs.readFileSync('./test/file.less', {encoding: 'utf8'});

console.time("LESS");

less.render(lessFile, {plugins, sourceMap: { sourceMapFileInline: false }})
    .then(result => {
        const filePath = usePlugin ? 'plugin.css' : 'regular.css';
        console.timeEnd("LESS");
        console.log(result.css);

        fs.writeFileSync(filePath, result.css)
    });
