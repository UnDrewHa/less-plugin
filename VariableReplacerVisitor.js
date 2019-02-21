const lodash = require('lodash');
const makeFullMap = require('./makeFullMap');
/*
@width: 20px; <------------- Rule

.set-width (@w: 20px) { <--- MixinDefinition start
    width: @w; <------------ Rule
} <------------------------- MixinDefinition end

.bordered { <--------------- Ruleset start
    width: @width; <-------- Rule
    .foo(@width, 900); <---- MixinCall
} <------------------------- Ruleset end

@media (min-width: @w) { <-- Media start
    margin: 10px; <--------- Rule
} <------------------------- Media end

@width; <------------------- Variable
sqrt(@width); <------------- Call(Variable)
10px 20px; <---------------- Anonymous
10px + 20px; <-------------- Operation("+", [Dimension, Dimension])
-@width; <------------------ Negative(Variable)

 */
function VariableReplacerVisitor(less, config) {
    const visitorConfig = config || {};

    /**
     * Флаг, означающий, что данный Visitor работает именно с less кодом до его компиляции в css.
     *
     * @type {boolean}
     */
    this.isPreEvalVisitor = true;

    /**
     * Мапа переменных, подлежащих замене.
     * @private
     */
    this._variables = visitorConfig.variables || {};
    /**
     * Мапа новых блоков объявлений в зависимости от названия класса из конфига.
     * @private
     */
    this._newRulesetsByClassName = {};
    /**
     * Находимся ли мы внутри узла с типом Ruleset.
     * Для редактирования только внутри узла с типом Ruleset.
     *
     * @type {boolean}
     * @private
     */
    this._insideRuleset = false;
    /**
     * Находимся ли мы внутри узла с типом MixinDefinition.
     * Внутри MixinDefinition не должно быть обработки узлов с типом Rule.
     */
    this._insideMixinDefinition = false;
    /**
     * Название класса, для которого собирается новый Ruleset.
     * @private
     */
    this._rulesetClassName = null;
    /**
     * Название свойства, для которого происходит поиск переменной на замену.
     * @private
     */
    this._ruleName = null;
    /**
     * Ссылка на предыдущее объявление.
     * @private
     */
    this._prevRule = null;
    /**
     * Ссылка на экземпляр LESS.
     * @private
     */
    this._less = less;

    this._map = {};
}

/**
 * Метод, начинающий обход дерева.
 *
 * @param rootNode Корневой узел. node_modules/less/lib/less/tree/ruleset.js
 */
VariableReplacerVisitor.prototype.run = function (rootNode) {
    (new this._less.visitors.Visitor(this)).visit(rootNode);
};

/**
 * Начало обхода узла с типом Ruleset.
 *
 * @param ruleset Блок объявления. node_modules/less/lib/less/tree/ruleset.js
 */
VariableReplacerVisitor.prototype.visitRuleset = function (ruleset) {
    const _this = this;
    /**
     * Данный метод срабатывает и для корневого узла, поэтому флаг _insideRuleset вычисляем на
     * основе наличия свойства root, чтобы в дальнейшем обрабатывать узлы типа Rule только внутри узлов Ruleset.
     */
    this._insideRuleset = !ruleset.root;

    if (_this._prevRule) {
        _this._appendNewRulesets(_this._prevRule);

        _this._newRulesetsByClassName = {};
        _this._rulesetClassName = null;
    }

    this._prevRule = !ruleset.root ? ruleset : null;
};

/**
 * Завершение обхода узла с типом Ruleset.
 *
 * @param ruleset Блок объявления. node_modules/less/lib/less/tree/ruleset.js
 */
VariableReplacerVisitor.prototype.visitRulesetOut = function (ruleset) {
    const _this = this;

    if (_this._prevRule) {
        _this._appendNewRulesets(ruleset);
    }

    _this._prevRule = null;
    _this._newRulesetsByClassName = {};
    _this._rulesetClassName = null;
};

/**
 * Начало обхода узла с типом MixinCall.
 *
 * @param mixinCall Миксин. node_modules/less/lib/less/tree/mixin-call.js
 */
VariableReplacerVisitor.prototype.visitMixinCall = function (mixinCall) {
    return; //TODO: Под вопросом обработка миксинов внутри Ruleset
    if (!this._insideRuleset) return;

    const newMixinCall = this._mixinCallValueResolver(mixinCall);

    if (this._rulesetClassName) {
        this._addItemToNewRuleset(newMixinCall, this._rulesetClassName);
    }
};

/**
 * Начало обхода узла с типом Rule.
 *
 * @param rule Объявление. node_modules/less/lib/less/tree/rule.js
 */
VariableReplacerVisitor.prototype.visitRule = function (rule) {
    if (
        !this._insideRuleset ||
        this._insideMixinDefinition ||
        rule.value instanceof this._less.tree.Anonymous
    ) return;

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

    _this._map = makeFullMap(_this._map);

    const mapLength = Object.keys(_this._map).length;

    if (mapLength < 2 && _this._rulesetClassName) {
        _this._addItemToNewRuleset(
            new this._less.tree.Rule(rule.name, value, rule.important, false, 0, rule.currentFileInfo),
            _this._rulesetClassName
        );
        _this._rulesetClassName = null;
    } else if (mapLength > 1) {
        Object.keys(_this._map).forEach(function(className) {
            let val = new _this._less.tree.Expression(
                expressionValueArray.map(function(item) {
                    return _this._getNewValueByNodeType(item, _this._map[className]);
                })
            );

            _this._addItemToNewRuleset(
                new _this._less.tree.Rule(rule.name, val, rule.important, false, 0, rule.currentFileInfo),
                className
            );
        });
    }

    _this._ruleName = null;
    _this._map = {};
};

/**
 * Добавление нового узла с типом Ruleset.
 *
 * @param ruleset Ruleset, в который добавляется новый Ruleset.
 * @private
 */
VariableReplacerVisitor.prototype._appendNewRulesets = function (ruleset) {
    const _this = this;
    const placeToInsert = lodash.findIndex(ruleset.rules, function(item) {return item instanceof _this._less.tree.Ruleset});

    Object.keys(_this._newRulesetsByClassName).map(function(className) {
        const newRuleset = new _this._less.tree.Ruleset(_this._getSelectors(className, ruleset.selectors[0].currentFileInfo), _this._newRulesetsByClassName[className]);

        ruleset.rules.splice(placeToInsert || ruleset.rules.length, 0, newRuleset);
    });
};

/**
 * Добавление нового элемента в массив с элементами, которые пойдут в новый Ruleset, на основе определенного css-класса.
 *
 * @param item Новый элемент Ruleset.
 * @param className Название css-класса.
 * @private
 */
VariableReplacerVisitor.prototype._addItemToNewRuleset = function (item, className) {
    if (lodash.isArray(this._newRulesetsByClassName[className])) {
        this._newRulesetsByClassName[className].push(item);
    } else {
        this._newRulesetsByClassName[className] = [item];
    }
};

/**
 * Получить селекторы для нового Ruleset.
 *
 * @param className Название css-класса.
 * @param currentFileInfo Информация по исходному файлу, необходимая для формирования source maps.
 * @private
 */
VariableReplacerVisitor.prototype._getSelectors = function (className, currentFileInfo) {
    const newClassName = className.indexOf('.') === 0 ? className.slice(1) : className;

    return [
        new this._less.tree.Selector([
            new this._less.tree.Element(new this._less.tree.Combinator(' '), '.' + newClassName, 0, currentFileInfo),
            new this._less.tree.Element(new this._less.tree.Combinator(' '), '&', 0, currentFileInfo)
        ])
    ];
};

/**
 * Получить новое значение в зависимости от типа узла.
 *
 * @param node Узел.
 * @private
 */
VariableReplacerVisitor.prototype._getNewValueByNodeType = function (node, variablesArray) {
    let newValue = null;

    switch(node.type) {
        case 'Variable':
            newValue = this._variableValueResolver(node, variablesArray);
            break;
        case 'Operation':
            newValue = this._operationValueResolver(node, variablesArray);
            break;
        case 'Negative':
            newValue = this._negativeValueResolver(node, variablesArray);
            break;
        case 'Call':
            newValue = this._callValueResolver(node, variablesArray);
            break;
        case 'MixinCall':
            newValue = this._mixinCallValueResolver(node, variablesArray);
            break;
        default:
            newValue = node;
    }

    return newValue;
};

/**
 * Получить новое значение для узла типа Variable.
 *
 * @param variable Узел типа Variable. node_modules/less/lib/less/tree/variable.js
 * @private
 */
VariableReplacerVisitor.prototype._variableValueResolver = function (variable, variablesArray) {
    const variableConfig = this._variables[variable.name];

    if (
        !variableConfig ||
        (variableConfig && variableConfig.props.indexOf(this._ruleName) === -1) ||
        variablesArray && variablesArray.indexOf(variable.name) === -1
    ) {
        return variable;
    } else if (variablesArray && variablesArray.indexOf(variable.name) > -1) {
        return new this._less.tree.Variable(variableConfig.newVarName, 0, variable.currentFileInfo);
    } else {
        lodash.isArray(this._map[variableConfig.className]) ?
            this._map[variableConfig.className].push(variable.name) :
            this._map[variableConfig.className] = [variable.name];

        this._rulesetClassName = variableConfig.className;

        return new this._less.tree.Variable(variableConfig.newVarName, 0, variable.currentFileInfo);
    }
};

/**
 * Получить новое значение для узла типа Operation.
 *
 * @param operation Узел типа Operation. node_modules/less/lib/less/tree/operation.js
 * @private
 */
VariableReplacerVisitor.prototype._operationValueResolver = function (operation, variablesArray) {
    const _this = this;

    const operands = operation.operands.map(function(operand) {
        return _this._getNewValueByNodeType(operand, variablesArray);
    });

    return new _this._less.tree.Operation(operation.op, operands);
};

/**
 * Получить новое значение для узла типа Negative.
 *
 * @param negative Узел типа Negative. node_modules/less/lib/less/tree/negative.js
 * @private
 */
VariableReplacerVisitor.prototype._negativeValueResolver = function (negative, variablesArray) {
    return new this._less.tree.Negative(this._getNewValueByNodeType(negative.value, variablesArray));
};

/**
 * Получить новое значение для узла типа Call.
 *
 * @param call Узел типа Call. node_modules/less/lib/less/tree/call.js
 * @private
 */
VariableReplacerVisitor.prototype._callValueResolver = function (call, variablesArray) {
    const _this = this;

    const args = call.args.map(function(arg) {
        return _this._getNewValueByNodeType(arg, variablesArray);
    });

    return new _this._less.tree.Call(call.name, args);
};

/**
 * Получить новое значение для узла типа MixinCall.
 *
 * @param mixinCall Узел типа MixinCall. node_modules/less/lib/less/tree/mixin-call.js
 * @private
 */
VariableReplacerVisitor.prototype._mixinCallValueResolver = function (mixinCall, variablesArray) {
    const _this = this;

    const args = mixinCall.arguments.map(function(item) {
        const exprValue = lodash.get(item, 'value.value');
        if (exprValue) {
            item = {
                ...item,
                value: new _this._less.tree.Expression(
                    exprValue.map(function(item) {
                        return _this._getNewValueByNodeType(item, variablesArray);
                    })
                )
            };
        }

        return item;
    });

    return new _this._less.tree.mixin.Call(mixinCall.selector.elements, args, 0, mixinCall.currentFileInfo);
};

function factorial(n) {
    let result = 1;

    while (n){
        result *= n--;
    }

    return result;
}

module.exports = VariableReplacerVisitor;
