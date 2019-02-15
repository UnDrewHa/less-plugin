const lodash = require('lodash');

function VariableReplacerVisitor(less) {
    this.isPreEvalVisitor = true;
    this.valueResolvers = {
        "Variable": this._variableValueResolver.bind(this),
        "Operation": this._operationValueResolver.bind(this),
        "Negative": this._negativeValueResolver.bind(this),
        "Call": this._callValueResolver.bind(this),
        "MixinCall": this._mixinCallValueResolver.bind(this)
    };
    this.SBBOL3_LESS_VARIABLE_POSTFIX = "-s3";
    this.variables = {
        "@width": {
            "className": "rebranding-sizes",
            "props": {"width": 1}
        },
        "@orange": {
            "className": "rebranding-colors",
            "props": {"color": 1, "background": 1}
        }
    };
    this._newRulesetsByClassName = {};
    this._inRule = false;
    this._rulesetClassName = null;
    this._declarationName = null;
    this._less = less;
}

VariableReplacerVisitor.prototype.run = function (rootNode) {
    (new this._less.visitors.Visitor(this)).visit(rootNode);
}

VariableReplacerVisitor.prototype.visitRuleset = function (ruleset) {
    /**
     * Исключаем из скоупа плагина корневой блок объявления и
     * блоки объявления, находящиеся внутри миксинов.
     */
    this._inRule = !ruleset.root && ruleset.parent;
}

VariableReplacerVisitor.prototype.visitRulesetOut = function (ruleset) {
    if (this._inRule) {
        Object.keys(this._newRulesetsByClassName).map(className => {
            ruleset.rules.push(
                new this._less.tree.Ruleset(this._getSelectors(className), this._newRulesetsByClassName[className])
            );
        });
    }

    this._newRulesetsByClassName = {};
    this._inRule = false;
    this._rulesetClassName = null;
},
VariableReplacerVisitor.prototype.visitMixinCall = function (mixinCall) {
    if (!this._inRule) return;

    const newMixinCall = this._mixinCallValueResolver(mixinCall);

    if (this._rulesetClassName) {
        this._addItemToNewRuleset(mixinCall, newMixinCall, this._rulesetClassName);
    }
},
VariableReplacerVisitor.prototype.visitDeclaration = function (declaration) {
    if (!this._inRule || declaration.value instanceof this._less.tree.Anonymous) return;

    this._declarationName = declaration.name[0].value;
    let value = declaration.value;
    const expressionValueArray = lodash.get(value, 'value[0].value');

    if (expressionValueArray) {
        value = new this._less.tree.Value(new this._less.tree.Expression(
            expressionValueArray.map(item => this.valueResolvers[item.type] && this.valueResolvers[item.type](item) || item)
        ));
    }

    if (this._rulesetClassName) {
        this._addItemToNewRuleset(declaration, value, this._rulesetClassName);
        this._rulesetClassName = null;
    }
}

VariableReplacerVisitor.prototype._addItemToNewRuleset = function(oldContainer, value, className) {
    let rulesetItem = null;
    if (oldContainer instanceof this._less.tree.Declaration) {
        rulesetItem = new this._less.tree.Declaration(oldContainer.name, value, oldContainer.important);
    } else if (oldContainer instanceof this._less.tree.mixin.Call) {
        rulesetItem = value;
    }

    if (lodash.isArray(this._newRulesetsByClassName[className])) {
        this._newRulesetsByClassName[className].push(rulesetItem);
    } else {
        this._newRulesetsByClassName[className] = [rulesetItem];
    }
}

VariableReplacerVisitor.prototype._getSelectors = function(className) {
    const newClassName = className.indexOf('.') === 0 ? className.slice(1) : className;

    return [
        new this._less.tree.Selector([
            new this._less.tree.Element(new this._less.tree.Combinator(' '), '.' + newClassName),
            new this._less.tree.Element(new this._less.tree.Combinator(' '), "&")
        ])
    ];
}

VariableReplacerVisitor.prototype._variableValueResolver = function(variable) {
    if (!this.variables[variable.name] || (this.variables[variable.name] && !this.variables[variable.name]['props'][this._declarationName])) return variable;

    this._rulesetClassName = this.variables[variable.name].className;

    return new this._less.tree.Variable(variable.name + this.SBBOL3_LESS_VARIABLE_POSTFIX, this._less.tree.Node.prototype.getIndex(), this._less.tree.Node.prototype.fileInfo());
}

VariableReplacerVisitor.prototype._operationValueResolver = function(operation) {
    const operands = operation.operands.map(operand => this.valueResolvers[operand.type] && this.valueResolvers[operand.type](operand) || operand);

    return new this._less.tree.Operation(operation.op, operands);
}

VariableReplacerVisitor.prototype._negativeValueResolver = function(negative) {
    return new this._less.tree.Negative(this.valueResolvers[negative.value.type] && this.valueResolvers[negative.value.type](negative.value) || negative.value);
}

VariableReplacerVisitor.prototype._callValueResolver = function(call) {
    const args = call.args.map(arg => this.valueResolvers[arg.type] && this.valueResolvers[arg.type](arg) || arg);

    return new this._less.tree.Call(call.name, args);
}

VariableReplacerVisitor.prototype._mixinCallValueResolver = function(mixinCall) {
    const args = mixinCall.arguments.map(item => {
        const exprValue = lodash.get(item, 'value.value');
        if (exprValue) {
            item = {
                ...item,
                value: new this._less.tree.Expression(
                    exprValue.map(item => this.valueResolvers[item.type] && this.valueResolvers[item.type](item) || item)
                )
            };
        }

        return item;
    });
    return new this._less.tree.mixin.Call(mixinCall.selector.elements, args);
}

module.exports = {
    install: function(less, pluginManager) {
        pluginManager.addVisitor(new VariableReplacerVisitor(less));
    }
}
