const lodash = require('lodash');
const VariableReplacerVisitor = require('./VariableReplacerVisitor');

function VariableReplacerPlugin(config) {
    if (lodash.isEmpty(config.variables)) return {install: function() {}};

    this.config = config;
}

VariableReplacerPlugin.prototype.install = function (less, pluginManager) {
    pluginManager.addVisitor(new VariableReplacerVisitor(less, this.config));
};

module.exports = VariableReplacerPlugin;
