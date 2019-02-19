const lodash = require('lodash');

function VariableReplacerVisitor(less, config) {
    const visitorConfig = config || {};

    this.isPreEvalVisitor = true;

    this._VARIABLE_POSTFIX = visitorConfig.postfix || '-sbbol3';
    this._variables = visitorConfig.variables || {};
    this._newRulesetsByClassName = {};
    this._insideRuleset = false;
    this._rulesetClassName = null;
    this._ruleName = null;
    this._prevRule = null;
    this._less = less;
}

VariableReplacerVisitor.prototype.run = function (rootNode) {
    (new this._less.visitors.Visitor(this)).visit(rootNode);
};

VariableReplacerVisitor.prototype.visitRuleset = function (ruleset) {
    const _this = this;
    this._insideRuleset = !ruleset.root;

    if (_this._prevRule) {
        _this._appendNewRulesets(_this._prevRule);

        _this._newRulesetsByClassName = {};
        _this._rulesetClassName = null;
    }

    this._prevRule = !ruleset.root ? ruleset : null;
};

VariableReplacerVisitor.prototype.visitRulesetOut = function (ruleset) {
    const _this = this;

    if (_this._prevRule) {
        _this._appendNewRulesets(ruleset);
    }

    _this._prevRule = null;
    _this._newRulesetsByClassName = {};
    _this._rulesetClassName = null;
};

VariableReplacerVisitor.prototype.visitMixinCall = function (mixinCall) {
    if (!this._insideRuleset) return;

    const newMixinCall = this._mixinCallValueResolver(mixinCall);

    if (this._rulesetClassName) {
        this._addItemToNewRuleset(mixinCall, newMixinCall, this._rulesetClassName);
    }
};

VariableReplacerVisitor.prototype.visitRule = function (rule) {
    if (!this._insideRuleset || rule.value instanceof this._less.tree.Anonymous) return;

    const _this = this;

    _this._ruleName = rule.name[0].value;
    let value = rule.value;
    const expressionValueArray = lodash.get(value, 'value[0].value');

    if (expressionValueArray) {
        value = new _this._less.tree.Expression(
            expressionValueArray.map(function(item) {
                return _this._getNewValueByNodeType(item);
            })
        );
    }

    if (_this._rulesetClassName) {
        _this._addItemToNewRuleset(rule, value, _this._rulesetClassName);
        _this._rulesetClassName = null;
    }
};

VariableReplacerVisitor.prototype._appendNewRulesets = function (ruleset) {
    const _this = this;
    const placeToInsert = lodash.findIndex(ruleset.rules, function(item) {return item instanceof _this._less.tree.Ruleset});

    Object.keys(_this._newRulesetsByClassName).map(function(className) {
        const newRuleset = new _this._less.tree.Ruleset(_this._getSelectors(className, ruleset.selectors[0].currentFileInfo), _this._newRulesetsByClassName[className]);

        ruleset.rules.splice(placeToInsert || ruleset.rules.length, 0, newRuleset);
    });
};

VariableReplacerVisitor.prototype._addItemToNewRuleset = function (oldContainer, value, className) {
    let rulesetItem = null;
    if (oldContainer instanceof this._less.tree.Rule) {
        rulesetItem = new this._less.tree.Rule(oldContainer.name, value, oldContainer.important, false, 0, oldContainer.currentFileInfo);
    } else if (oldContainer instanceof this._less.tree.mixin.Call) {
        rulesetItem = value;
    }

    if (lodash.isArray(this._newRulesetsByClassName[className])) {
        this._newRulesetsByClassName[className].push(rulesetItem);
    } else {
        this._newRulesetsByClassName[className] = [rulesetItem];
    }
};

VariableReplacerVisitor.prototype._getSelectors = function (className, currentFileInfo) {
    const newClassName = className.indexOf('.') === 0 ? className.slice(1) : className;

    return [
        new this._less.tree.Selector([
            new this._less.tree.Element(new this._less.tree.Combinator(' '), '.' + newClassName, 0, currentFileInfo),
            new this._less.tree.Element(new this._less.tree.Combinator(' '), '&', 0, currentFileInfo)
        ])
    ];
};

VariableReplacerVisitor.prototype._getNewValueByNodeType = function (item) {
    let newValue = null;

    switch(item.type) {
        case 'Variable':
            newValue = this._variableValueResolver(item);
            break;
        case 'Operation':
            newValue = this._operationValueResolver(item);
            break;
        case 'Negative':
            newValue = this._negativeValueResolver(item);
            break;
        case 'Call':
            newValue = this._callValueResolver(item);
            break;
        case 'MixinCall':
            newValue = this._mixinCallValueResolver(item);
            break;
        default:
            newValue = item;
    }

    return newValue;
};

VariableReplacerVisitor.prototype._variableValueResolver = function (variable) {
    if (!this._variables[variable.name] || (this._variables[variable.name] && !this._variables[variable.name]['props'][this._ruleName])) return variable;

    this._rulesetClassName = this._variables[variable.name].className;

    return new this._less.tree.Variable(variable.name + this._VARIABLE_POSTFIX, 0, variable.currentFileInfo);
};

VariableReplacerVisitor.prototype._operationValueResolver = function (operation) {
    const _this = this;

    const operands = operation.operands.map(function(operand) {
        return _this._getNewValueByNodeType(operand);
    });

    return new _this._less.tree.Operation(operation.op, operands);
};

VariableReplacerVisitor.prototype._negativeValueResolver = function (negative) {
    return new this._less.tree.Negative(this._getNewValueByNodeType(negative.value));
};

VariableReplacerVisitor.prototype._callValueResolver = function (call) {
    const _this = this;

    const args = call.args.map(function(arg) {
        return _this._getNewValueByNodeType(arg);
    });

    return new _this._less.tree.Call(call.name, args);
};

VariableReplacerVisitor.prototype._mixinCallValueResolver = function (mixinCall) {
    const _this = this;

    const args = mixinCall.arguments.map(function(item) {
        const exprValue = lodash.get(item, 'value.value');
        if (exprValue) {
            item = {
                ...item,
                value: new _this._less.tree.Expression(
                    exprValue.map(function(item) {
                        return _this._getNewValueByNodeType(item);
                    })
                )
            };
        }

        return item;
    });

    return new _this._less.tree.mixin.Call(mixinCall.selector.elements, args, 0, mixinCall.currentFileInfo);
};

module.exports = VariableReplacerVisitor;
